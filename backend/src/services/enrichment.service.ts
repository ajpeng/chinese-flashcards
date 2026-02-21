/**
 * Background enrichment service
 *
 * After an article is created with dictionary-only word data, this service
 * runs AI lookups for any words still missing definitions. It operates
 * fully asynchronously so the HTTP response is never blocked.
 *
 * Job lifecycle: pending → running → done | failed
 */

import prisma from '../prisma/client';
import { lookupService } from './lookup.service';

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
        console.error('[Enrichment] Unhandled error for article', articleId, err);
        job.status = 'failed';
        job.error = String(err);
        job.finishedAt = new Date();
      });
    });
  }

  private async run(job: EnrichmentJob, maxLookups: number): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();

    const { articleId } = job;
    console.log(`[Enrichment] Starting AI enrichment for article ${articleId}`);

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
        console.log(`[Enrichment] Article ${articleId}: no words need enrichment`);
        job.status = 'done';
        job.finishedAt = new Date();
        return;
      }

      console.log(`[Enrichment] Article ${articleId}: ${missing.length} words need enrichment (max ${maxLookups})`);

      let lookupsUsed = 0;

      for (const wordRow of missing) {
        if (lookupsUsed >= maxLookups) break;

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

        // 2. AI lookup
        const result = await lookupService.lookupWord(segment);
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
          console.error('[Enrichment] Failed to persist shared cache for:', segment, cacheErr);
        }
      }

      console.log(`[Enrichment] Article ${articleId}: done (${lookupsUsed} AI lookups used)`);
      job.status = 'done';
      job.finishedAt = new Date();
    } catch (err) {
      console.error(`[Enrichment] Failed for article ${articleId}:`, err);
      job.status = 'failed';
      job.error = String(err);
      job.finishedAt = new Date();
    }
  }
}

export const enrichmentService = new EnrichmentService();
