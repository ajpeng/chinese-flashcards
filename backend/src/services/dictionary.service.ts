/**
 * Dictionary service for Chinese word lookups
 * Loads CC-CEDICT and HSK data on initialization and provides fast in-memory lookups
 */

import * as fs from 'fs';
import * as path from 'path';
import { Dictionary, HskWordLevels, DictionaryEntry } from '../types/segmentation.types';

class DictionaryService {
  private dictionary: Dictionary | null = null;
  private hskLevels: HskWordLevels | null = null;
  private isInitialized = false;

  /**
   * Initialize the dictionary service by loading data files
   * This should be called once at server startup
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Dictionary service already initialized');
      return;
    }

    console.log('Initializing dictionary service...');

    const dataDir = path.join(__dirname, '../data');
    const dictionaryPath = path.join(dataDir, 'cedict.json');
    const hskPath = path.join(dataDir, 'hsk-words.json');

    try {
      // Load CC-CEDICT dictionary
      console.log('Loading CC-CEDICT dictionary...');
      const dictionaryData = fs.readFileSync(dictionaryPath, 'utf-8');
      this.dictionary = JSON.parse(dictionaryData);
      console.log(`✓ Loaded ${Object.keys(this.dictionary!).length} dictionary entries`);

      // Load HSK word levels
      console.log('Loading HSK word levels...');
      const hskData = fs.readFileSync(hskPath, 'utf-8');
      this.hskLevels = JSON.parse(hskData);
      console.log(`✓ Loaded ${Object.keys(this.hskLevels!).length} HSK words`);

      this.isInitialized = true;
      console.log('Dictionary service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize dictionary service:', error);
      throw new Error('Dictionary service initialization failed');
    }
  }

  /**
   * Look up a word in the dictionary
   * @param simplified - Simplified Chinese characters
   * @returns Dictionary entry with pinyin and English, or undefined if not found
   */
  public lookupWord(simplified: string): DictionaryEntry | undefined {
    if (!this.isInitialized || !this.dictionary) {
      throw new Error('Dictionary service not initialized');
    }

    return this.dictionary[simplified];
  }

  /**
   * Get the HSK level for a word
   * @param simplified - Simplified Chinese characters
   * @returns HSK level (1-6) or undefined if not in HSK vocabulary
   */
  public getHskLevel(simplified: string): number | undefined {
    if (!this.isInitialized || !this.hskLevels) {
      throw new Error('Dictionary service not initialized');
    }

    return this.hskLevels[simplified];
  }

  /**
   * Look up a word with full metadata (dictionary + HSK level)
   * @param simplified - Simplified Chinese characters
   * @returns Object with pinyin, english, and hskLevel, or null if not found
   */
  public lookupWordWithLevel(simplified: string): {
    pinyin?: string;
    english?: string;
    hskLevel?: number;
  } | null {
    if (!this.isInitialized) {
      throw new Error('Dictionary service not initialized');
    }

    const dictEntry = this.lookupWord(simplified);
    const hskLevel = this.getHskLevel(simplified);

    // Return null if word not found in dictionary
    if (!dictEntry) {
      return null;
    }

    return {
      pinyin: dictEntry.pinyin,
      english: dictEntry.english,
      hskLevel,
    };
  }

  /**
   * Check if the dictionary service is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const dictionaryService = new DictionaryService();
