/**
 * Type definitions for Chinese text segmentation and dictionary lookup
 */

/**
 * A single word segment with its linguistic metadata
 */
export interface SegmentedWord {
  /** The simplified Chinese text of the word */
  text: string;

  /** Pinyin pronunciation (e.g., "nǐ hǎo") */
  pinyin?: string;

  /** English definition(s) */
  english?: string;

  /** HSK level (1-6), if the word is in HSK vocabulary */
  hskLevel?: number;

  /** Source of the data: dictionary, ai, or manual */
  source?: 'dictionary' | 'ai' | 'manual';
}

/**
 * Dictionary entry from CC-CEDICT
 */
export interface DictionaryEntry {
  /** Pinyin pronunciation */
  pinyin: string;

  /** English definition(s) */
  english: string;
}

/**
 * Complete dictionary mapping simplified characters to definitions
 */
export interface Dictionary {
  [simplified: string]: DictionaryEntry;
}

/**
 * HSK word level mapping
 */
export interface HskWordLevels {
  [simplified: string]: number;
}

/**
 * Request body for text analysis endpoint
 */
export interface AnalyzeTextRequest {
  /** Chinese text to segment and analyze */
  text: string;
}

/**
 * Response from text analysis endpoint
 */
export interface AnalyzeTextResponse {
  /** Array of segmented words with metadata */
  segments: SegmentedWord[];
}

/**
 * Request body for creating a new article from segmented text
 */
export interface CreateArticleRequest {
  /** Article title */
  title: string;

  /** Raw Chinese text content */
  content: string;

  /** Optional HSK level for the article (1-6) */
  hskLevel?: number;
}

/**
 * Response from article creation endpoint
 */
export interface CreateArticleResponse {
  /** Created article ID */
  id: number;

  /** Article title */
  title: string;

  /** Article content */
  content: string;

  /** Article HSK level */
  hskLevel: number | null;

  /** Array of words associated with the article */
  words: Array<{
    id: number;
    simplified: string;
    pinyin: string | null;
    english: string | null;
    hskLevel: number | null;
  }>;
}
