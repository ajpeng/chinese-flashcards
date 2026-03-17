import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { dictionaryService } from '../services/dictionary.service';
import { lookupService } from '../services/lookup.service';
import prisma from '../prisma/client';
import logger from '../utils/logger';

// Raw pg pool for queries unsupported by Prisma's driver-adapter $queryRaw.
// In production we verify the RDS server cert against the AWS CA bundle that
// is bundled into the Docker image, rather than skipping verification entirely.
function buildSslConfig() {
  if (process.env.NODE_ENV !== 'production') return false;
  const caPath = path.join(process.cwd(), 'rds-ca-bundle.pem');
  if (fs.existsSync(caPath)) {
    return { ca: fs.readFileSync(caPath).toString() };
  }
  // Fallback: still encrypt but skip cert verification (better than plaintext)
  logger.warn('rds-ca-bundle.pem not found, falling back to rejectUnauthorized:false');
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
});

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
    logger.error({ err }, 'Failed to persist AI result');
  }

  const hskLevel = dictionaryService.getHskLevel?.(word) ?? null;
  res.json({ pinyin: aiResult.pinyin, english: aiResult.english, hskLevel });
});

// GET /api/words/detail?q=学习
// Returns rich word data for the word detail page:
//   - pinyin, english, hskLevel for the word itself
//   - related words: other HSK words that share any character with the queried word
//   - example sentences: article sentences containing the word
router.get('/detail', async (req: Request, res: Response) => {
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

  // ── 1. Base word info ──────────────────────────────────────────────────────
  let pinyin: string | null = null;
  let english: string | null = null;
  let hskLevel: number | null = null;

  const dictResult = dictionaryService.lookupWordWithLevel(word);
  if (dictResult) {
    pinyin = dictResult.pinyin ?? null;
    english = dictResult.english ?? null;
    hskLevel = dictResult.hskLevel ?? null;
  } else {
    // Fall back to DB cache
    const cached = await lookupService.getCachedLookup(word);
    if (cached) {
      pinyin = cached.pinyin;
      english = cached.english;
      hskLevel = dictionaryService.getHskLevel?.(word) ?? null;
    }
  }

  // ── 2. Related words ───────────────────────────────────────────────────────
  // Find HSK words in the dictionary that share at least one character with
  // the queried word, excluding the word itself. Limit to 20 results.
  const chars = word.split('');
  const relatedMap = new Map<string, { pinyin: string; english: string; hskLevel: number }>();

  for (const char of chars) {
    // Only look up single Han characters (avoid punctuation)
    if (!/[\u4E00-\u9FFF]/.test(char)) continue;

    // Ask the dictionary service for the raw dictionary object via lookupWord
    // We iterate words that contain this char by checking the hsk level index.
    // Since we don't have an inverted index, we use the hskLevels object which
    // only holds real HSK vocabulary — much smaller than full CEDICT (5k vs 120k).
    // We access the internal hskLevels via getHskLevel per candidate.
    // Strategy: get all HSK words from DB (source='hsk') that contain the char.
    const hskWords = await prisma.word.findMany({
      where: {
        simplified: { contains: char },
        hskLevel: { not: null },
        articleId: null,
      },
      select: { simplified: true, pinyin: true, english: true, hskLevel: true },
      take: 60,
    });

    for (const w of hskWords) {
      if (w.simplified === word) continue;
      if (!w.pinyin || !w.english || !w.hskLevel) continue;
      if (!relatedMap.has(w.simplified)) {
        relatedMap.set(w.simplified, {
          pinyin: w.pinyin,
          english: w.english,
          hskLevel: w.hskLevel,
        });
      }
    }
  }

  // Also look up related words directly from cedict for the individual chars,
  // using the dictionary service (fast, in-memory). Grab single-char compounds.
  for (const char of chars) {
    if (!/[\u4E00-\u9FFF]/.test(char)) continue;
    const charEntry = dictionaryService.lookupWord(char);
    const charHsk = dictionaryService.getHskLevel?.(char);
    if (charEntry && charHsk && char !== word && !relatedMap.has(char)) {
      relatedMap.set(char, {
        pinyin: charEntry.pinyin,
        english: charEntry.english,
        hskLevel: charHsk,
      });
    }
  }

  const related = Array.from(relatedMap.entries())
    .map(([simplified, data]) => ({ simplified, ...data }))
    .sort((a, b) => a.hskLevel - b.hskLevel)
    .slice(0, 20);

  // ── 3. Example sentences ───────────────────────────────────────────────────
  const { rows: exampleRows } = await pool.query<{
    simplified: string; pinyin: string; english: string;
  }>(
    `SELECT simplified, pinyin, english FROM "ExampleSentence"
     WHERE simplified LIKE $1 OR traditional LIKE $1
     LIMIT 5`,
    [`%${word}%`]
  );

  const sentences = exampleRows.map(r => ({
    sentence: r.simplified,
    pinyin: r.pinyin,
    english: r.english,
  }));

  res.json({ word, pinyin, english, hskLevel, related, sentences });
});

export default router;
