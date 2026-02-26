/**
 * Background enrichment service
 *
 * After an article is created with dictionary-only word data, this service
 * runs AI lookups for any words still missing definitions. It operates
 * fully asynchronously so the HTTP response is never blocked.
 *
 * Job lifecycle: pending → running → done | failed
 *
 * Cost controls:
 *  - Per-article lookup cap (MAX_LOOKUPS_PER_ARTICLE env var)
 *  - Per-user daily cap (MAX_AI_LOOKUPS_PER_USER_PER_DAY env var)
 */

import prisma from '../prisma/client';
import { lookupService } from './lookup.service';
import logger from '../utils/logger';

const MAX_AI_LOOKUPS_PER_USER_PER_DAY =
  parseInt(process.env.MAX_AI_LOOKUPS_PER_USER_PER_DAY ?? '50', 10);

type JobStatus = 'pending' | 'running' | 'done' | 'failed';

interface EnrichmentJob {
  articleId: number;
  status: JobStatus;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
}

class EnrichmentService {
  /** In-memory map of articleId → job status */
  private jobs = new Map<number, EnrichmentJob>();

  /**
   * Returns true when the article currently has an active enrichment job
   * (status is 'pending' or 'running').
   */
  isEnriching(articleId: number): boolean {
    const job = this.jobs.get(articleId);
    return job !== undefined && (job.status === 'pending' || job.status === 'running');
  }

  getJob(articleId: number): EnrichmentJob | undefined {
    return this.jobs.get(articleId);
  }

  /**
   * Enqueue a background enrichment job for the given article.
   * Returns immediately; the actual work is done asynchronously.
   */
  enqueue(articleId: number, maxLookups: number): void {
    if (this.jobs.has(articleId)) {
      // Already queued or running — don't duplicate
      return;
    }

    const job: EnrichmentJob = { articleId, status: 'pending' };
    this.jobs.set(articleId, job);

    // Use setImmediate so the HTTP response is sent before we start
    setImmediate(() => {
      this.run(job, maxLookups).catch((err) => {
        logger.error({ err, articleId }, 'Unhandled enrichment error');
        job.status = 'failed';
        job.error = String(err);
        job.finishedAt = new Date();
      });
    });
  }

  /**
   * Count how many AI lookups this user has made today (UTC day boundary).
   * Returns 0 for anonymous users (userId = null).
   */
  private async dailyUsageCount(userId: string | null): Promise<number> {
    if (!userId) return 0;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return prisma.aiUsageLog.count({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
    });
  }

  private async run(job: EnrichmentJob, maxLookups: number): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();

    const { articleId } = job;

    // Look up the article's owner for daily-cap enforcement
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { userId: true },
    });
    const userId = article?.userId ?? null;

    // Check per-user daily cap
    const usedToday = await this.dailyUsageCount(userId);
    let remainingBudget = userId
      ? Math.max(0, MAX_AI_LOOKUPS_PER_USER_PER_DAY - usedToday)
      : maxLookups; // anonymous: fall back to per-article limit only

    logger.info({
      articleId,
      userId,
      usedToday,
      remainingBudget,
      maxLookups,
    }, 'Starting AI enrichment');

    if (remainingBudget === 0) {
      logger.warn({
        event: 'daily_cap_reached',
        userId,
        limit: MAX_AI_LOOKUPS_PER_USER_PER_DAY,
        articleId,
      }, 'User has reached daily AI lookup cap — skipping enrichment');
      job.status = 'done';
      job.finishedAt = new Date();
      return;
    }

    try {
      // Fetch all words for this article that are missing a definition
      const missing = await prisma.word.findMany({
        where: {
          articleId,
          OR: [{ english: null }, { pinyin: null }],
          // Only real Chinese words (skip punctuation etc.)
          simplified: { not: '' },
        },
        select: { id: true, simplified: true },
      });

      if (missing.length === 0) {
        logger.info({ articleId }, 'No words need enrichment');
        job.status = 'done';
        job.finishedAt = new Date();
        return;
      }

      logger.info({
        articleId,
        missingCount: missing.length,
        maxLookups,
        remainingBudget,
      }, 'Words queued for enrichment');

      let lookupsUsed = 0;
      const effectiveMax = Math.min(maxLookups, remainingBudget);

      for (const wordRow of missing) {
        if (lookupsUsed >= effectiveMax) break;

        const segment = wordRow.simplified;

        // 1. Check global shared cache first (articleId = null rows or any row with data)
        const cached = await lookupService.getCachedLookup(segment);
        if (cached) {
          await prisma.word.update({
            where: { id: wordRow.id },
            data: {
              ...(cached.pinyin  ? { pinyin: cached.pinyin }   : {}),
              ...(cached.english ? { english: cached.english } : {}),
              source: cached.source,
            },
          });
          continue;
        }

        // 2. AI lookup — pass userId + articleId for cost tracking
        const result = await lookupService.lookupWord(segment, { userId: userId ?? undefined, articleId });
        if (!result) continue;

        lookupsUsed++;

        // Update this article's word row
        await prisma.word.update({
          where: { id: wordRow.id },
          data: {
            ...(result.pinyin  ? { pinyin: result.pinyin }   : {}),
            ...(result.english ? { english: result.english } : {}),
            source: 'ai',
          },
        });

        // Upsert shared cache row (articleId = null) for all future users
        try {
          const existing = await prisma.word.findFirst({
            where: { simplified: segment, articleId: null },
            select: { id: true },
          });
          if (existing) {
            await prisma.word.update({
              where: { id: existing.id },
              data: {
                ...(result.pinyin  ? { pinyin: result.pinyin }   : {}),
                ...(result.english ? { english: result.english } : {}),
                source: 'ai',
              },
            });
          } else {
            await prisma.word.create({
              data: {
                simplified: segment,
                pinyin: result.pinyin ?? null,
                english: result.english ?? null,
                source: 'ai',
                articleId: null,
              },
            });
          }
        } catch (cacheErr) {
          logger.error({ err: cacheErr, simplified: segment }, 'Failed to persist shared cache');
        }
      }

      logger.info({ articleId, lookupsUsed, effectiveMax }, 'Enrichment complete');
      job.status = 'done';
      job.finishedAt = new Date();
    } catch (err) {
      logger.error({ err, articleId }, 'Enrichment job failed');
      job.status = 'failed';
      job.error = String(err);
      job.finishedAt = new Date();
    }
  }
}

export const enrichmentService = new EnrichmentService();
