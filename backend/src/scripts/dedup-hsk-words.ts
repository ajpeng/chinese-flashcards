/**
 * Dedup script: remove HSK words that appear in multiple levels, keeping only
 * the lowest-level copy. The HSK CSVs are cumulative, so without dedup, a word
 * from HSK 1 will also appear seeded into HSK 2, 3, 4, 5, 6.
 *
 * Run with: npm run dedup:hsk
 * Safe to run multiple times — idempotent.
 */

import prisma from '../prisma/client';

async function main() {
  // Find all HSK words that have duplicates across levels (same simplified, multiple hskLevels)
  // For each such word, delete the higher-level copies and keep only the lowest level.

  const allWords = await prisma.word.findMany({
    where: { source: 'hsk', hskLevel: { not: null } },
    select: { id: true, simplified: true, hskLevel: true },
    orderBy: [{ simplified: 'asc' }, { hskLevel: 'asc' }],
  });

  // Group by simplified character
  const bySimplified = new Map<string, Array<{ id: number; hskLevel: number }>>();
  for (const w of allWords) {
    if (!w.hskLevel) continue;
    const existing = bySimplified.get(w.simplified) ?? [];
    existing.push({ id: w.id, hskLevel: w.hskLevel });
    bySimplified.set(w.simplified, existing);
  }

  // Collect IDs to delete: everything except the lowest-level entry
  const toDelete: number[] = [];
  for (const [simplified, entries] of bySimplified) {
    if (entries.length <= 1) continue;
    // Sort by hskLevel ascending, keep first (lowest), delete the rest
    entries.sort((a, b) => a.hskLevel - b.hskLevel);
    const [keep, ...remove] = entries;
    console.log(
      `  ${simplified}: keeping HSK ${keep.hskLevel}, removing HSK ${remove.map(e => e.hskLevel).join(', ')}`
    );
    toDelete.push(...remove.map(e => e.id));
  }

  if (toDelete.length === 0) {
    console.log('No duplicate HSK words found — database is clean.');
    return;
  }

  console.log(`\nDeleting ${toDelete.length} duplicate HSK word entries...`);

  // Delete associated flashcards first (foreign key constraint)
  const deletedFlashcards = await prisma.flashcard.deleteMany({
    where: { wordId: { in: toDelete } },
  });
  console.log(`  Deleted ${deletedFlashcards.count} associated flashcard records.`);

  // Now delete the duplicate words
  const deletedWords = await prisma.word.deleteMany({
    where: { id: { in: toDelete } },
  });
  console.log(`  Deleted ${deletedWords.count} duplicate Word records.`);
  console.log('\nDedup complete.');
}

main()
  .catch(e => {
    console.error('Dedup error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
