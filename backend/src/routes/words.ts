import { Router, Request, Response } from 'express';
import { dictionaryService } from '../services/dictionary.service';

const router = Router();

// GET /api/words/lookup?q=专
// On-demand dictionary lookup for any Chinese character or word
router.get('/lookup', (req: Request, res: Response) => {
  const q = req.query.q as string;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  if (!dictionaryService.isReady()) {
    res.status(503).json({ error: 'Dictionary service not ready' });
    return;
  }

  const result = dictionaryService.lookupWordWithLevel(q.trim());
  if (!result) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(result);
});

export default router;
