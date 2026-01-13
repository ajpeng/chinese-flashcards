import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';
import { segmentationService } from '../services/segmentation.service';
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
 * POST /api/articles - create a new article with automatic word segmentation
 *
 * Request body:
 * {
 *   "title": "Article Title",
 *   "content": "Chinese text content",
 *   "hskLevel": 1 (optional)
 * }
 *
 * Response: Created article with words
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

    // Read AI lookup settings from environment
    const enableAiLookup = process.env.ENABLE_AI_LOOKUP === 'true';
    const maxLookups = parseInt(process.env.MAX_LOOKUPS_PER_ARTICLE || '10', 10);

    const segments = await segmentationService.analyzeText(
      content,
      enableAiLookup,
      maxLookups
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

    const response: CreateArticleResponse = {
      id: result.id,
      title: result.title,
      content: result.content,
      hskLevel: result.hskLevel,
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
