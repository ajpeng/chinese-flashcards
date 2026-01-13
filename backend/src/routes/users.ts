import { Router, Request, Response, NextFunction } from 'express';
import { addFlashcard, listFlashcards, removeFlashcard } from '../mock/mockFlashcardsStore';

const router = Router();

/* GET users listing. */
router.get('/', (_req: Request, res: Response, _next: NextFunction) => {
  res.send('respond with a resource');
});

// POST /mock/flashcards
// Accepts JSON: { wordId: number }
router.post('/mock/flashcards', (req: Request, res: Response) => {
  const { wordId } = req.body ?? {};
  if (typeof wordId !== 'number' || !Number.isInteger(wordId) || wordId <= 0) {
    return res.status(400).json({ error: 'wordId must be a positive integer' });
  }

  // For now we use a mock user id; in the real system this would come from auth
  const userId = 'mock-user';
  const rec = addFlashcard(userId, wordId);

  // Log to server console for visibility
  // eslint-disable-next-line no-console
  console.log('Mock flashcard added:', rec);

  return res.status(201).json(rec);
});

// DELETE /mock/flashcards - accepts JSON { wordId: number }
router.delete('/mock/flashcards', (req: Request, res: Response) => {
  const { wordId } = req.body ?? {};
  if (typeof wordId !== 'number' || !Number.isInteger(wordId) || wordId <= 0) {
    return res.status(400).json({ error: 'wordId must be a positive integer' });
  }

  const userId = 'mock-user';
  const removed = removeFlashcard(userId, wordId);

  // eslint-disable-next-line no-console
  console.log('Mock flashcard(s) removed:', { userId, wordId, removed });

  return res.json({ removed });
});

// GET /mock/flashcards - list records (for debugging/testing)
router.get('/mock/flashcards', (_req: Request, res: Response) => {
  res.json(listFlashcards());
});

export default router;
