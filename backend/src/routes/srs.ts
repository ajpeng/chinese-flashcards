import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();

// SM-2 algorithm — returns updated scheduling fields
function computeSM2(
  quality: number,       // 0=Again, 2=Hard, 4=Good, 5=Easy
  repetitions: number,
  easeFactor: number,
  interval: number
): {
  newRepetitions: number;
  newEaseFactor: number;
  newInterval: number;
  nextReviewAt: Date;
} {
  let newRepetitions = repetitions;
  let newInterval = interval;

  if (quality < 3) {
    // Failed review: reset sequence
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Successful review
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(newInterval * easeFactor);
    }
    newRepetitions++;
  }

  // Update ease factor, clamped to minimum 1.3
  const newEaseFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  );

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

  return { newRepetitions, newEaseFactor, newInterval, nextReviewAt };
}

// GET /api/srs/decks — deck stats for all HSK levels
router.get('/decks', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    // Count HSK words per level
    const wordCounts = await prisma.word.groupBy({
      by: ['hskLevel'],
      where: { source: 'hsk', hskLevel: { not: null } },
      _count: { id: true },
    });

    // Count user's flashcards for HSK words per level
    const studiedCounts = await prisma.flashcard.findMany({
      where: {
        userId,
        word: { source: 'hsk', hskLevel: { not: null } },
      },
      select: {
        nextReviewAt: true,
        word: { select: { hskLevel: true } },
      },
    });

    const decks = [1, 2, 3, 4, 5, 6].map(level => {
      const wordCount = wordCounts.find(w => w.hskLevel === level)?._count.id ?? 0;
      const levelCards = studiedCounts.filter(c => c.word.hskLevel === level);
      const dueCards = levelCards.filter(c => c.nextReviewAt <= now).length;

      return {
        level,
        totalWords: wordCount,
        studiedCards: levelCards.length,
        dueCards,
      };
    });

    res.json(decks);
  } catch (error) {
    console.error('SRS decks error:', error);
    res.status(500).json({ error: 'Failed to load deck stats' });
  }
});

// GET /api/srs/study/:level — fetch up to 20 cards due for review
router.get(
  '/study/:level',
  requireAuth,
  param('level').isInt({ min: 1, max: 6 }).withMessage('Level must be 1-6'),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const userId = req.user!.userId;
      const level = parseInt(req.params.level, 10);
      const now = new Date();

      const MAX_SESSION = 20;
      const MAX_NEW = 10;

      // All HSK words for this level
      const allWords = await prisma.word.findMany({
        where: { source: 'hsk', hskLevel: level },
        select: { id: true, simplified: true, pinyin: true, english: true, hskLevel: true },
        orderBy: { id: 'asc' },
      });

      // User's existing flashcards for this level
      const existingCards = await prisma.flashcard.findMany({
        where: {
          userId,
          word: { source: 'hsk', hskLevel: level },
        },
        select: {
          id: true,
          wordId: true,
          easeFactor: true,
          interval: true,
          repetitions: true,
          nextReviewAt: true,
        },
        orderBy: { nextReviewAt: 'asc' },
      });

      const cardByWordId = new Map(existingCards.map(c => [c.wordId, c]));

      // Due cards (have a flashcard record, nextReviewAt <= now)
      const dueCards = existingCards
        .filter(c => c.nextReviewAt <= now)
        .map(c => {
          const word = allWords.find(w => w.id === c.wordId)!;
          return {
            flashcardId: c.id,
            wordId: c.wordId,
            simplified: word.simplified,
            pinyin: word.pinyin ?? '',
            english: word.english ?? '',
            hskLevel: level,
            interval: c.interval,
            repetitions: c.repetitions,
            easeFactor: c.easeFactor,
            isNew: false,
          };
        });

      // New cards (no flashcard record yet)
      const newCards = allWords
        .filter(w => !cardByWordId.has(w.id))
        .map(w => ({
          flashcardId: null,
          wordId: w.id,
          simplified: w.simplified,
          pinyin: w.pinyin ?? '',
          english: w.english ?? '',
          hskLevel: level,
          interval: 0,
          repetitions: 0,
          easeFactor: 2.5,
          isNew: true,
        }));

      // Build session: due cards first, then new cards up to limits
      const sessionCards = [
        ...dueCards.slice(0, MAX_SESSION),
        ...newCards.slice(0, Math.min(MAX_NEW, MAX_SESSION - Math.min(dueCards.length, MAX_SESSION))),
      ].slice(0, MAX_SESSION);

      res.json(sessionCards);
    } catch (error) {
      console.error('SRS study error:', error);
      res.status(500).json({ error: 'Failed to load study cards' });
    }
  }
);

// POST /api/srs/review — submit a card review and update SM-2 scheduling
router.post(
  '/review',
  requireAuth,
  [
    body('wordId').isInt({ min: 1 }).withMessage('wordId must be a positive integer'),
    body('quality').isIn([0, 2, 4, 5]).withMessage('quality must be 0, 2, 4, or 5'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const userId = req.user!.userId;
      const { wordId, quality } = req.body as { wordId: number; quality: number };

      // Verify word exists
      const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
      if (!word) {
        res.status(404).json({ error: 'Word not found' });
        return;
      }

      // Fetch existing flashcard if it exists
      const existing = await prisma.flashcard.findUnique({
        where: { userId_wordId: { userId, wordId } },
        select: { easeFactor: true, interval: true, repetitions: true },
      });

      const { easeFactor, interval, repetitions } = existing ?? {
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
      };

      const { newRepetitions, newEaseFactor, newInterval, nextReviewAt } = computeSM2(
        quality,
        repetitions,
        easeFactor,
        interval
      );

      const now = new Date();

      const flashcard = await prisma.flashcard.upsert({
        where: { userId_wordId: { userId, wordId } },
        create: {
          userId,
          wordId,
          easeFactor: newEaseFactor,
          interval: newInterval,
          repetitions: newRepetitions,
          nextReviewAt,
          lastReviewedAt: now,
        },
        update: {
          easeFactor: newEaseFactor,
          interval: newInterval,
          repetitions: newRepetitions,
          nextReviewAt,
          lastReviewedAt: now,
        },
        select: {
          id: true,
          easeFactor: true,
          interval: true,
          repetitions: true,
          nextReviewAt: true,
          lastReviewedAt: true,
        },
      });

      res.json({
        flashcardId: flashcard.id,
        easeFactor: flashcard.easeFactor,
        interval: flashcard.interval,
        repetitions: flashcard.repetitions,
        nextReviewAt: flashcard.nextReviewAt,
        lastReviewedAt: flashcard.lastReviewedAt,
      });
    } catch (error) {
      console.error('SRS review error:', error);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  }
);

export default router;
