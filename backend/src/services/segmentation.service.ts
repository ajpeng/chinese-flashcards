/**
 * Segmentation service for Chinese text processing
 * Uses nodejieba for word segmentation and dictionary service for enrichment
 */

import * as nodejieba from 'nodejieba';
import { dictionaryService } from './dictionary.service';
import { lookupService } from './lookup.service';
import { SegmentedWord } from '../types/segmentation.types';
import prisma from '../prisma/client';

class SegmentationService {
  private isInitialized = false;

  /**
   * Initialize the segmentation service
   * This should be called once at server startup
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Segmentation service already initialized');
      return;
    }

    console.log('Initializing segmentation service...');

    // Ensure dictionary service is ready
    if (!dictionaryService.isReady()) {
      await dictionaryService.initialize();
    }

    // nodejieba is ready to use immediately
    console.log('✓ Segmentation service initialized successfully');
    this.isInitialized = true;
  }

  /**
   * Segment Chinese text into individual words
   * @param text - Chinese text to segment
   * @returns Array of word strings
   */
  public segmentText(text: string): string[] {
    if (!this.isInitialized) {
      throw new Error('Segmentation service not initialized');
    }

    if (!text || text.trim().length === 0) {
      return [];
    }

    // Use nodejieba to segment the text
    const segments = nodejieba.cut(text);

    return segments;
  }

  public async analyzeText(
    text: string,
    useExternalLookup = false,
    maxExternalLookups = 10
  ): Promise<SegmentedWord[]> {
    if (!this.isInitialized) {
      throw new Error('Segmentation service not initialized');
    }

    if (!text || text.trim().length === 0) {
      return [];
    }

    const segments = this.segmentText(text);
    const analyzedSegments: SegmentedWord[] = [];
    let externalLookupsUsed = 0;

    for (const segment of segments) {
      if (segment.trim().length === 0) {
        analyzedSegments.push({ text: segment });
        continue;
      }

      const wordData = dictionaryService.lookupWordWithLevel(segment);

      if (wordData) {
        const normalizedPinyin = lookupService.normalizePinyin(wordData.pinyin);
        analyzedSegments.push({
          text: segment,
          pinyin: normalizedPinyin,
          english: wordData.english,
          hskLevel: wordData.hskLevel,
          source: 'dictionary',
        });
      } else if (useExternalLookup && externalLookupsUsed < maxExternalLookups) {
        // Check cache first (existing words in database)
        const cachedResult = await lookupService.getCachedLookup(segment);

        if (cachedResult) {
          analyzedSegments.push({
            text: segment,
            pinyin: cachedResult.pinyin,
            english: cachedResult.english,
            source: cachedResult.source,
          });
        } else {
          // Only do external API call if not cached and under limit
          const lookupResult = await lookupService.lookupWord(segment);
          if (lookupResult) {
            analyzedSegments.push({
              text: segment,
              pinyin: lookupResult.pinyin,
              english: lookupResult.english,
              source: lookupResult.source,
            });
            externalLookupsUsed++;

            // Persist as a shared cache row (articleId = null) so all future
            // users benefit from this lookup without hitting the AI again.
            try {
              const existing = await prisma.word.findFirst({
                where: { simplified: segment, articleId: null },
                select: { id: true },
              });
              if (existing) {
                await prisma.word.update({
                  where: { id: existing.id },
                  data: {
                    ...(lookupResult.pinyin  ? { pinyin: lookupResult.pinyin }   : {}),
                    ...(lookupResult.english ? { english: lookupResult.english } : {}),
                    source: 'ai',
                  },
                });
              } else {
                await prisma.word.create({
                  data: {
                    simplified: segment,
                    pinyin: lookupResult.pinyin ?? null,
                    english: lookupResult.english ?? null,
                    source: 'ai',
                    articleId: null,
                  },
                });
              }
            } catch (err) {
              console.error('[Segmentation] Failed to persist shared AI cache for:', segment, err);
            }
          } else {
            analyzedSegments.push({ text: segment });
          }
        }
      } else {
        analyzedSegments.push({ text: segment });
      }
    }

    if (externalLookupsUsed > 0) {
      console.log(`[Segmentation] Used ${externalLookupsUsed} external API lookups`);
    }

    return analyzedSegments;
  }

  /**
   * Check if the segmentation service is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const segmentationService = new SegmentationService();
