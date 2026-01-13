/**
 * Preprocessing script to convert HSK CSV files to a single JSON mapping
 * Run with: npx ts-node src/scripts/process-hsk.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface HskWordLevels {
  [simplified: string]: number;
}

function processHskLevels() {
  const dataDir = path.join(__dirname, '../data');
  const outputPath = path.join(dataDir, 'hsk-words.json');

  const hskLevels: HskWordLevels = {};
  let totalWords = 0;

  console.log('Processing HSK word lists...\n');

  // Process HSK levels 1-6
  for (let level = 1; level <= 6; level++) {
    const inputPath = path.join(dataDir, `hsk_${level}.csv`);

    if (!fs.existsSync(inputPath)) {
      console.warn(`Warning: ${inputPath} not found, skipping...`);
      continue;
    }

    const content = fs.readFileSync(inputPath, 'utf-8');
    const lines = content.split(/\r?\n/);

    let levelCount = 0;

    // Skip header row (first line)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSV format: n,character,pinyin
      const parts = line.split(',');
      if (parts.length >= 2) {
        const simplified = parts[1];

        // Only add if this word hasn't been seen in a lower level
        // (some words appear in multiple levels, we want the lowest level)
        if (!hskLevels[simplified]) {
          hskLevels[simplified] = level;
          levelCount++;
          totalWords++;
        }
      }
    }

    console.log(`HSK Level ${level}: ${levelCount} words`);
  }

  console.log(`\nTotal unique words: ${totalWords}`);
  console.log('Writing JSON file...');

  fs.writeFileSync(outputPath, JSON.stringify(hskLevels, null, 2), 'utf-8');

  console.log(`✓ HSK word levels saved to ${outputPath}`);
  console.log(`  Size: ${Object.keys(hskLevels).length} entries`);

  // Show some sample entries
  console.log('\nSample entries:');
  const sampleWords = ['你好', '学习', '中文', '爱', '八', '爸爸'];
  for (const word of sampleWords) {
    if (hskLevels[word]) {
      console.log(`  ${word}: HSK ${hskLevels[word]}`);
    }
  }
}

// Run the processor
processHskLevels();
