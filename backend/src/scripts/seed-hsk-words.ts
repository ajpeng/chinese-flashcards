/**
 * Seed script: insert standalone HSK vocabulary words (not tied to any article)
 * into the Word table for use by the SRS flashcard system.
 *
 * Run with: npm run seed:hsk
 * Safe to run multiple times — skips words that already exist.
 *
 * Each HSK level only contains words NEW to that level — words from lower
 * levels are excluded, even though the source CSVs are cumulative.
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../prisma/client';

interface DictionaryEntry {
  pinyin: string;
  english: string;
}
type Dictionary = Record<string, DictionaryEntry>;

async function main() {
  const dataDir = path.join(__dirname, '../data');

  const dict: Dictionary = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'cedict.json'), 'utf-8')
  );

  // Helper: read all simplified characters from a CSV file
  function readSimplifiedSet(csvPath: string): Set<string> {
    if (!fs.existsSync(csvPath)) return new Set();
    return new Set(
      fs.readFileSync(csvPath, 'utf-8')
        .split(/\r?\n/)
        .slice(1) // skip header row
        .map(l => l.split(',')[1]?.trim())
        .filter((s): s is string => !!s)
    );
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  for (let level = 1; level <= 6; level++) {
    const csvPath = path.join(dataDir, `hsk_${level}.csv`);
    if (!fs.existsSync(csvPath)) {
      console.warn(`Warning: ${csvPath} not found, skipping HSK ${level}`);
      continue;
    }

    // Build set of all words that belong to lower levels (to exclude them)
    const lowerLevelWords = new Set<string>();
    for (let l = 1; l < level; l++) {
      const lowerPath = path.join(dataDir, `hsk_${l}.csv`);
      for (const s of readSimplifiedSet(lowerPath)) lowerLevelWords.add(s);
    }

    const lines = fs.readFileSync(csvPath, 'utf-8').split(/\r?\n/).slice(1); // skip header row

    const words = lines
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const parts = l.split(',');
        const simplified = parts[1]?.trim();
        const csvPinyin = parts.slice(2).join(',').trim(); // rejoin in case pinyin has commas
        if (!simplified) return null;
        // Skip words that belong to a lower HSK level
        if (lowerLevelWords.has(simplified)) return null;

        const dictEntry = dict[simplified];
        return {
          simplified,
          pinyin: dictEntry?.pinyin ?? csvPinyin ?? null,
          english: dictEntry?.english ?? null,
          hskLevel: level,
          source: 'hsk',
          isVerified: true,
          articleId: null,
        };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null);

    let levelInserted = 0;
    let levelSkipped = 0;

    for (const w of words) {
      const existing = await prisma.word.findFirst({
        where: { simplified: w.simplified, hskLevel: level, source: 'hsk' },
        select: { id: true },
      });
      if (existing) {
        levelSkipped++;
        continue;
      }
      await prisma.word.create({ data: w });
      levelInserted++;
    }

    console.log(
      `HSK ${level}: ${words.length} unique words — inserted ${levelInserted}, skipped ${levelSkipped} (already existed)`
    );
    totalInserted += levelInserted;
    totalSkipped += levelSkipped;
  }

  console.log(`\nDone. Total inserted: ${totalInserted}, skipped: ${totalSkipped}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
