import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';
import { segmentationService } from '../services/segmentation.service';
import { enrichmentService } from '../services/enrichment.service';
import { CreateArticleRequest, CreateArticleResponse } from '../types/segmentation.types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { articleCreationRateLimiter } from '../middleware/rateLimit';

const router = Router();

// GET /api/articles - return all articles with their associated words.
router.get('/', optionalAuth, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const articles = await prisma.article.findMany({
      include: { words: true },
      orderBy: { id: 'desc' },
    });

    res.json(articles);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching articles', error);
    res.status(500).json({ error: 'Failed to load articles' });
  }
});

/**
 * GET /api/articles/:id/status
 * Returns whether background AI enrichment is still running for this article.
 *
 * Response: { enriching: boolean }
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid article id' });
    return;
  }
  res.json({ enriching: enrichmentService.isEnriching(id) });
});

/**
 * POST /api/articles - create a new article with automatic word segmentation
 *
 * Phase 1 (synchronous, fast): dictionary-only segmentation → create article + words → 201
 * Phase 2 (async, background): AI lookup for words still missing definitions
 *
 * Request body:
 * {
 *   "title": "Article Title",
 *   "content": "Chinese text content",
 *   "hskLevel": 1 (optional)
 * }
 *
 * Response: Created article with words + enriching flag
 */
router.post(
  '/',
  requireAuth,
  articleCreationRateLimiter,
  async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { title, content, hskLevel } = req.body as CreateArticleRequest;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Missing or invalid "title" field' });
      return;
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Missing or invalid "content" field' });
      return;
    }

    if (hskLevel !== undefined && (hskLevel < 1 || hskLevel > 6)) {
      res.status(400).json({ error: '"hskLevel" must be between 1 and 6' });
      return;
    }

    if (!segmentationService.isReady()) {
      res.status(503).json({ error: 'Segmentation service not ready' });
      return;
    }

    // ── Phase 1: dictionary-only segmentation (fast, no AI) ──────────────────
    // We deliberately skip AI here so the HTTP response is never blocked.
    const segments = await segmentationService.analyzeText(
      content,
      /* useExternalLookup */ false,
      /* maxExternalLookups */ 0
    );

    const result = await prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          title: title.trim(),
          content: content.trim(),
          hskLevel: hskLevel || null,
          userId: req.user?.userId || null,
        },
      });

      const isChinese = (text: string) => /[\u4E00-\u9FFF]/.test(text);

      // Include ALL Chinese segments (even those without a definition yet) so
      // the background enrichment job can update them in place.
      const validSegments = segments.filter(
        (seg) => seg.text.trim().length > 0 && isChinese(seg.text)
      );

      if (validSegments.length > 0) {
        await tx.word.createMany({
          data: validSegments.map((seg) => ({
            simplified: seg.text,
            pinyin: seg.pinyin || null,
            english: seg.english || null,
            hskLevel: seg.hskLevel || null,
            source: seg.source || null,
            articleId: article.id,
          })),
        });
      }

      const articleWithWords = await tx.article.findUnique({
        where: { id: article.id },
        include: { words: true },
      });

      return articleWithWords;
    });

    if (!result) {
      res.status(500).json({ error: 'Failed to create article' });
      return;
    }

    // ── Phase 2: fire-and-forget AI enrichment ────────────────────────────────
    const enableAiLookup = process.env.ENABLE_AI_LOOKUP === 'true';
    const maxLookups = parseInt(process.env.MAX_LOOKUPS_PER_ARTICLE || '10', 10);

    const enriching = enableAiLookup && maxLookups > 0;
    if (enriching) {
      enrichmentService.enqueue(result.id, maxLookups);
    }

    // Respond immediately — don't wait for AI
    const response: CreateArticleResponse & { enriching: boolean } = {
      id: result.id,
      title: result.title,
      content: result.content,
      hskLevel: result.hskLevel,
      enriching,
      words: result.words.map((word) => ({
        id: word.id,
        simplified: word.simplified,
        pinyin: word.pinyin,
        english: word.english,
        hskLevel: word.hskLevel,
      })),
    };

    res.status(201).json(response);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error creating article', error);
    res.status(500).json({ error: 'Failed to create article' });
  }
}
);

export default router;
