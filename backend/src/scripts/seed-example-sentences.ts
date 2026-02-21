/**
 * Seed script: load the krmanik/Chinese-Example-Sentences dataset
 * (src/data/example-sentences.tsv) into the ExampleSentence table.
 *
 * Source: https://github.com/krmanik/Chinese-Example-Sentences
 * License: CC BY 2.0 FR (derived from Tatoeba)
 *
 * TSV columns: id, simplified, traditional, pinyin, english
 *
 * Run with: npm run seed:examples
 * Safe to run multiple times — skips rows that already exist.
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../prisma/client';

const TSV_PATH = path.join(__dirname, '../data/example-sentences.tsv');
const BATCH_SIZE = 500;

async function main() {
  if (!fs.existsSync(TSV_PATH)) {
    console.error(`TSV file not found at ${TSV_PATH}`);
    process.exit(1);
  }

  // Check if already seeded
  const existing = await prisma.exampleSentence.count();
  if (existing > 0) {
    console.log(`ExampleSentence table already has ${existing} rows — skipping seed.`);
    console.log('To reseed, truncate the table first: DELETE FROM "ExampleSentence";');
    return;
  }

  const raw = fs.readFileSync(TSV_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  console.log(`Parsing ${lines.length} lines from TSV…`);

  const rows: {
    id: number;
    simplified: string;
    traditional: string;
    pinyin: string;
    english: string;
  }[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 5) continue;

    const id = parseInt(parts[0], 10);
    const simplified = parts[1]?.trim();
    const traditional = parts[2]?.trim();
    const pinyin = parts[3]?.trim();
    const english = parts[4]?.trim();

    if (!id || !simplified || !pinyin || !english) continue;

    rows.push({ id, simplified, traditional: traditional ?? simplified, pinyin, english });
  }

  console.log(`Parsed ${rows.length} valid rows. Inserting in batches of ${BATCH_SIZE}…`);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.exampleSentence.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted} / ${rows.length}`);
  }

  console.log(`\nDone. Inserted ${inserted} example sentences.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
