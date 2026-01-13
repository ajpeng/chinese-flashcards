/**
 * Preprocessing script to convert CC-CEDICT text format to JSON
 * Run with: npx ts-node src/scripts/process-cedict.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface DictionaryEntry {
  pinyin: string;
  english: string;
}

interface Dictionary {
  [simplified: string]: DictionaryEntry;
}

function processCedict() {
  const inputPath = path.join(__dirname, '../data/cedict.txt');
  const outputPath = path.join(__dirname, '../data/cedict.json');

  console.log('Reading CC-CEDICT file...');
  const content = fs.readFileSync(inputPath, 'utf-8');
  // Handle both Unix (\n) and Windows (\r\n) line endings
  const lines = content.split(/\r?\n/);

  const dictionary: Dictionary = {};
  let entryCount = 0;

  console.log('Processing entries...');
  let matchedLines = 0;
  let unmatchedLines = 0;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }

    // CC-CEDICT format: Traditional Simplified [pin1 yin1] /english1/english2/
    // Example: 你好 你好 [ni3 hao3] /Hello!/Hi!/How are you?/
    const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);

    if (match) {
      matchedLines++;
      const [, , simplified, pinyin, englishRaw] = match;

      // Split multiple definitions and take the first 3 (to keep data size manageable)
      const definitions = englishRaw.split('/').filter(Boolean).slice(0, 3);
      const english = definitions.join('; ');

      // Only store if we don't already have this simplified form
      // (CC-CEDICT can have multiple entries for same character with different meanings)
      if (!dictionary[simplified]) {
        dictionary[simplified] = {
          pinyin,
          english,
        };
        entryCount++;
      }
    } else {
      unmatchedLines++;
      if (unmatchedLines <= 5) {
        console.log('Unmatched line:', line.substring(0, 100));
      }
    }
  }

  console.log(`Total matched lines: ${matchedLines}, unmatched: ${unmatchedLines}`);

  console.log(`Processed ${entryCount} dictionary entries`);
  console.log('Writing JSON file...');

  fs.writeFileSync(outputPath, JSON.stringify(dictionary, null, 2), 'utf-8');

  console.log(`✓ Dictionary saved to ${outputPath}`);
  console.log(`  Size: ${Object.keys(dictionary).length} entries`);
}

// Run the processor
processCedict();
