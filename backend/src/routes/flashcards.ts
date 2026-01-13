import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();

// All flashcard routes require authentication
router.use(requireAuth);

// POST /api/flashcards - Create a new flashcard (save a word to user's collection)
router.post(
  '/',
  [body('wordId').isInt({ min: 1 }).withMessage('Valid word ID is required')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { wordId } = req.body;
      const userId = req.user.userId;

      // Check if word exists
      const word = await prisma.word.findUnique({
        where: { id: wordId },
      });

      if (!word) {
        res.status(404).json({ error: 'Word not found' });
        return;
      }

      // Check if flashcard already exists
      const existingFlashcard = await prisma.flashcard.findUnique({
        where: {
          userId_wordId: {
            userId,
            wordId,
          },
        },
      });

      if (existingFlashcard) {
        res.status(409).json({ error: 'Flashcard already exists' });
        return;
      }

      // Create flashcard
      const flashcard = await prisma.flashcard.create({
        data: {
          userId,
          wordId,
        },
        include: {
          word: true,
        },
      });

      res.status(201).json(flashcard);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating flashcard', error);
      res.status(500).json({ error: 'Failed to create flashcard' });
    }
  }
);

// GET /api/flashcards - Get all flashcards for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const flashcards = await prisma.flashcard.findMany({
      where: {
        userId: req.user.userId,
      },
      include: {
        word: {
          include: {
            article: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(flashcards);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching flashcards', error);
    res.status(500).json({ error: 'Failed to fetch flashcards' });
  }
});

// DELETE /api/flashcards/:wordId - Remove a flashcard from user's collection
router.delete('/:wordId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const wordId = parseInt(req.params.wordId, 10);
    if (isNaN(wordId)) {
      res.status(400).json({ error: 'Invalid word ID' });
      return;
    }

    const userId = req.user.userId;

    // Check if flashcard exists
    const flashcard = await prisma.flashcard.findUnique({
      where: {
        userId_wordId: {
          userId,
          wordId,
        },
      },
    });

    if (!flashcard) {
      res.status(404).json({ error: 'Flashcard not found' });
      return;
    }

    // Delete flashcard
    await prisma.flashcard.delete({
      where: {
        userId_wordId: {
          userId,
          wordId,
        },
      },
    });

    res.json({ message: 'Flashcard removed successfully' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error deleting flashcard', error);
    res.status(500).json({ error: 'Failed to delete flashcard' });
  }
});

export default router;
