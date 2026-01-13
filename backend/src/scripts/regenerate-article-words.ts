/**
 * Migration script to regenerate words for all existing articles
 * Run this after updating the word filtering logic to include all Chinese characters
 *
 * Usage: npx tsx src/scripts/regenerate-article-words.ts
 */

import 'dotenv/config';
import prisma from '../prisma/client';
import { segmentationService } from '../services/segmentation.service';

async function regenerateArticleWords() {
  console.log('Starting article word regeneration...');

  console.log('Initializing segmentation service...');
  await segmentationService.initialize();
  console.log('Segmentation service ready!');

  const articles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      content: true,
    },
  });

  console.log(`Found ${articles.length} articles to process`);

  let successCount = 0;
  let errorCount = 0;

  for (const article of articles) {
    try {
      console.log(`\nProcessing article #${article.id}: "${article.title}"`);

      const segments = await segmentationService.analyzeText(article.content);

      const isChinese = (text: string) => /[\u4E00-\u9FFF]/.test(text);
      const validSegments = segments.filter(
        (seg) => seg.text.trim().length > 0 && isChinese(seg.text)
      );

      console.log(`  Found ${validSegments.length} Chinese word segments`);

      await prisma.$transaction(async (tx) => {
        const deleteResult = await tx.word.deleteMany({
          where: { articleId: article.id },
        });

        console.log(`  Deleted ${deleteResult.count} old words`);

        if (validSegments.length > 0) {
          await tx.word.createMany({
            data: validSegments.map((seg) => ({
              simplified: seg.text,
              pinyin: seg.pinyin || null,
              english: seg.english || null,
              hskLevel: seg.hskLevel || null,
              source: seg.source || null,
              articleId: article.id,
            })),
          });

          console.log(`  Created ${validSegments.length} new words`);
        }
      });

      successCount++;
      console.log(`  ✓ Article #${article.id} regenerated successfully`);

    } catch (error) {
      errorCount++;
      console.error(`  ✗ Error processing article #${article.id}:`, error);
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Migration complete!');
  console.log(`Success: ${successCount} articles`);
  console.log(`Errors: ${errorCount} articles`);
  console.log('═══════════════════════════════════════');

  await prisma.$disconnect();
}

regenerateArticleWords()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
