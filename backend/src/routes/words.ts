import { Router, Request, Response } from 'express';
import { dictionaryService } from '../services/dictionary.service';
import { lookupService } from '../services/lookup.service';
import prisma from '../prisma/client';

const router = Router();

// GET /api/words/lookup?q=专
// On-demand lookup for any Chinese character or word.
// Resolution order:
//   1. CC-CEDICT in-memory dictionary (instant)
//   2. Existing DB Word records that already have pinyin+english (cached AI results)
//   3. AI lookup via OpenRouter — result is persisted to DB before returning
router.get('/lookup', async (req: Request, res: Response) => {
  const q = req.query.q as string;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  if (!dictionaryService.isReady()) {
    res.status(503).json({ error: 'Dictionary service not ready' });
    return;
  }

  const word = q.trim();

  // 1. CC-CEDICT dictionary
  const dictResult = dictionaryService.lookupWordWithLevel(word);
  if (dictResult) {
    res.json(dictResult);
    return;
  }

  // 2. DB cache — any Word row for this character that already has pinyin+english
  const cached = await lookupService.getCachedLookup(word);
  if (cached) {
    const hskLevel = dictionaryService.getHskLevel?.(word) ?? null;
    res.json({ pinyin: cached.pinyin, english: cached.english, hskLevel });
    return;
  }

  // 3. AI lookup — call OpenRouter and persist result to all matching Word rows
  const aiResult = await lookupService.lookupWord(word);
  if (!aiResult || (!aiResult.pinyin && !aiResult.english)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Persist as a shared, article-independent Word row (articleId = null) so all
  // users benefit from this lookup without hitting the AI again.
  try {
    const existing = await prisma.word.findFirst({
      where: { simplified: word, articleId: null },
      select: { id: true },
    });

    if (existing) {
      // Update the shared row with the AI result
      await prisma.word.update({
        where: { id: existing.id },
        data: {
          ...(aiResult.pinyin  ? { pinyin: aiResult.pinyin }   : {}),
          ...(aiResult.english ? { english: aiResult.english } : {}),
          source: 'ai',
        },
      });
    } else {
      // Create a new shared cache row (no articleId = visible to all users)
      await prisma.word.create({
        data: {
          simplified: word,
          pinyin: aiResult.pinyin ?? null,
          english: aiResult.english ?? null,
          source: 'ai',
          articleId: null,
        },
      });
    }
  } catch (err) {
    // Non-fatal — still return the result even if DB write fails
    console.error('[words/lookup] Failed to persist AI result:', err);
  }

  const hskLevel = dictionaryService.getHskLevel?.(word) ?? null;
  res.json({ pinyin: aiResult.pinyin, english: aiResult.english, hskLevel });
});

export default router;
