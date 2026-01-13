/**
 * Script to lookup missing word data using AI and save to JSON
 * This allows reviewing AI-generated data before committing to database
 *
 * Usage: npx tsx src/scripts/lookup-missing-words.ts
 */

import 'dotenv/config';
import prisma from '../prisma/client';
import { lookupService } from '../services/lookup.service';
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

async function lookupMissingWords() {
  console.log('Finding words with missing pinyin or English...\n');

  const words = await prisma.word.findMany({
    where: {
      OR: [
        { pinyin: null },
        { english: null },
      ],
    },
    select: {
      id: true,
      simplified: true,
      pinyin: true,
      english: true,
    },
    orderBy: {
      simplified: 'asc',
    },
  });

  console.log(`Found ${words.length} words with missing data\n`);

  const lookupResults: WordLookup[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const progress = `[${i + 1}/${words.length}]`;

    // Skip if both pinyin and english exist
    if (word.pinyin && word.english) {
      continue;
    }

    try {
      console.log(`${progress} Looking up: ${word.simplified}`);
      const result = await lookupService.lookupWord(word.simplified);

      if (result) {
        lookupResults.push({
          id: word.id,
          simplified: word.simplified,
          currentPinyin: word.pinyin,
          currentEnglish: word.english,
          aiPinyin: result.pinyin,
          aiEnglish: result.english,
        });
        console.log(`  ✓ Found: ${result.pinyin} - ${result.english}`);
        successCount++;
      } else {
        console.log(`  ✗ No result returned`);
        failureCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`  ✗ Error:`, error instanceof Error ? error.message : error);
      failureCount++;
    }
  }

  // Save results to JSON file
  const outputDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'word-lookups.json');
  fs.writeFileSync(outputPath, JSON.stringify(lookupResults, null, 2), 'utf-8');

  console.log('\n═══════════════════════════════════════');
  console.log('Lookup complete!');
  console.log(`Successful lookups: ${successCount}`);
  console.log(`Failed lookups: ${failureCount}`);
  console.log(`Results saved to: ${outputPath}`);
  console.log('═══════════════════════════════════════\n');
  console.log('Review the JSON file, then run apply-word-lookups.ts to update the database');

  await prisma.$disconnect();
}

lookupMissingWords()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
