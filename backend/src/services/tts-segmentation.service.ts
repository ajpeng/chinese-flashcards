import nodejieba from 'nodejieba';

export interface SegmentedWord {
  text: string;
  start: number;
  end: number;
  index: number;
}

/**
 * Segments Chinese text for TTS processing
 * This ensures our UI word segmentation matches what Azure TTS will process
 */
export class TTSSegmentationService {
  /**
   * Segment text using jieba and create word mappings
   */
  static segmentText(text: string): SegmentedWord[] {
    // Use jieba to segment Chinese text
    const segments = nodejieba.cut(text, true);
    
    const words: SegmentedWord[] = [];
    let currentPosition = 0;
    let wordIndex = 0;

    for (const segment of segments) {
      // Skip empty segments
      if (!segment.trim()) {
        currentPosition += segment.length;
        continue;
      }

      // Find the actual position of this segment in the original text
      const segmentStart = text.indexOf(segment, currentPosition);
      
      if (segmentStart !== -1) {
        words.push({
          text: segment,
          start: segmentStart,
          end: segmentStart + segment.length,
          index: wordIndex++
        });
        currentPosition = segmentStart + segment.length;
      }
    }

    return words;
  }

  /**
   * Create a mapping between Azure TTS word boundaries and our segmented words
   */
  static mapTTSBoundaries(
    segmentedWords: SegmentedWord[],
    ttsBoundaries: Array<{ word: string; start: number; duration: number }>
  ): Array<{ segmentIndex: number; start: number; duration: number; word: string }> {
    const mappings: Array<{ segmentIndex: number; start: number; duration: number; word: string }> = [];

    // Create a normalized mapping
    let segmentIndex = 0;
    
    for (const boundary of ttsBoundaries) {
      const boundaryWord = boundary.word.trim();
      
      // Try to find matching segment
      while (segmentIndex < segmentedWords.length) {
        const segment = segmentedWords[segmentIndex];
        
        // Check if this TTS boundary matches our segment
        if (segment.text.includes(boundaryWord) || boundaryWord.includes(segment.text)) {
          mappings.push({
            segmentIndex: segmentIndex,
            start: boundary.start,
            duration: boundary.duration,
            word: segment.text
          });
          segmentIndex++;
          break;
        }
        
        // If no match, check if we need to skip this segment
        segmentIndex++;
      }
    }

    return mappings;
  }

  /**
   * Preprocess text to improve TTS boundary accuracy
   */
  static preprocessForTTS(text: string): string {
    // Add spaces between major punctuation to help Azure TTS
    return text
      .replace(/([。！？；])/g, '$1 ')
      .replace(/([，、：])/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get word at specific time offset
   */
  static getWordAtTime(
    mappings: Array<{ segmentIndex: number; start: number; duration: number; word: string }>,
    currentTime: number
  ): { segmentIndex: number; word: string } | null {
    const currentTimeMs = currentTime * 1000; // Convert seconds to milliseconds
    
    for (const mapping of mappings) {
      if (currentTimeMs >= mapping.start && currentTimeMs <= mapping.start + mapping.duration) {
        return {
          segmentIndex: mapping.segmentIndex,
          word: mapping.word
        };
      }
    }
    
    return null;
  }
}