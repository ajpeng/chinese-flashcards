/**
 * Migration script to normalize all pinyin to tone marks format
 * and backfill missing pinyin/english data using external lookup
 *
 * Usage: npx tsx src/scripts/normalize-pinyin.ts
 */

import 'dotenv/config';
import prisma from '../prisma/client';
import { lookupService } from '../services/lookup.service';

async function normalizePinyin() {
  console.log('Starting pinyin normalization and data backfill...');

  const words = await prisma.word.findMany({
    select: {
      id: true,
      simplified: true,
      pinyin: true,
      english: true,
      source: true,
    },
  });

  console.log(`Found ${words.length} words to process`);

  let normalizedCount = 0;
  let backfilledCount = 0;
  let errorCount = 0;
  let unchangedCount = 0;

  for (const word of words) {
    try {
      let needsUpdate = false;
      const updates: {
        pinyin?: string | null;
        english?: string | null;
        source?: string;
      } = {};

      if (word.pinyin) {
        const normalized = lookupService.normalizePinyin(word.pinyin);
        if (normalized !== word.pinyin) {
          updates.pinyin = normalized;
          needsUpdate = true;
          normalizedCount++;
        }
      }

      // Uncomment to enable AI lookup for missing data
      if (!word.pinyin || !word.english) {
        console.log(`  Attempting lookup for: ${word.simplified}`);
        const lookupResult = await lookupService.lookupWord(word.simplified);

        if (lookupResult) {
          if (!word.pinyin && lookupResult.pinyin) {
            updates.pinyin = lookupResult.pinyin;
            needsUpdate = true;
            backfilledCount++;
          }
          if (!word.english && lookupResult.english) {
            updates.english = lookupResult.english;
            needsUpdate = true;
            backfilledCount++;
          }
          if (!word.source) {
            updates.source = lookupResult.source;
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        await prisma.word.update({
          where: { id: word.id },
          data: updates,
        });

        console.log(`✓ Updated word #${word.id}: ${word.simplified} (${word.pinyin} → ${updates.pinyin || 'unchanged'})`);
      } else {
        unchangedCount++;
      }

    } catch (error) {
      errorCount++;
      console.error(`✗ Error processing word #${word.id}:`, error);
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Normalization complete!');
  console.log(`Normalized pinyin: ${normalizedCount} words`);
  console.log(`Backfilled missing data: ${backfilledCount} fields`);
  console.log(`Unchanged: ${unchangedCount} words`);
  console.log(`Errors: ${errorCount} words`);
  console.log('═══════════════════════════════════════');

  await prisma.$disconnect();
}

normalizePinyin()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
