/**
 * Script to apply word lookups from JSON to database
 * Run this after reviewing the word-lookups.json file
 *
 * Usage: npx tsx src/scripts/apply-word-lookups.ts
 */

import 'dotenv/config';
import prisma from '../prisma/client';
import * as fs from 'fs';
import * as path from 'path';

interface WordLookup {
  id: number;
  simplified: string;
  currentPinyin: string | null;
  currentEnglish: string | null;
  aiPinyin: string | null;
  aiEnglish: string | null;
}

async function applyWordLookups() {
  const inputPath = path.join(__dirname, '../../data/word-lookups.json');

  if (!fs.existsSync(inputPath)) {
    console.error('Error: word-lookups.json not found!');
    console.error('Please run lookup-missing-words.ts first');
    process.exit(1);
  }

  const lookups: WordLookup[] = JSON.parse(
    fs.readFileSync(inputPath, 'utf-8')
  );

  console.log(`Found ${lookups.length} word lookups to apply\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const lookup of lookups) {
    try {
      const updates: {
        pinyin?: string | null;
        english?: string | null;
        source?: string;
      } = {};

      // Only update if current value is missing and AI found a value
      if (!lookup.currentPinyin && lookup.aiPinyin) {
        updates.pinyin = lookup.aiPinyin;
      }
      if (!lookup.currentEnglish && lookup.aiEnglish) {
        updates.english = lookup.aiEnglish;
      }

      if (Object.keys(updates).length > 0) {
        updates.source = 'ai';

        await prisma.word.update({
          where: { id: lookup.id },
          data: updates,
        });

        console.log(`✓ Updated #${lookup.id}: ${lookup.simplified}`);
        if (updates.pinyin) console.log(`  Pinyin: ${updates.pinyin}`);
        if (updates.english) console.log(`  English: ${updates.english}`);
        updatedCount++;
      } else {
        skippedCount++;
      }

    } catch (error) {
      console.error(`✗ Error updating word #${lookup.id}:`, error);
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Update complete!');
  console.log(`Updated: ${updatedCount} words`);
  console.log(`Skipped: ${skippedCount} words`);
  console.log('═══════════════════════════════════════');

  await prisma.$disconnect();
}

applyWordLookups()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
