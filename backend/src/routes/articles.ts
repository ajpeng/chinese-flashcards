import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';

const router = Router();

// GET /api/articles - return all articles with their associated words.
router.get('/', async (_req: Request, res: Response, _next: NextFunction) => {
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

export default router;
