interface Word {
  id: number;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number;
}

interface Token {
  text: string;
  word?: Word;
  index: number; // Position in token array
}

interface TokenMapping {
  tokenIndex: number;
  segmentIndex: number;
  text: string;
  start: number;
  end: number;
}

/**
 * Backend tokenization service that exactly matches frontend logic
 * This ensures accurate text highlighting by providing precise token-to-segment mapping
 */
export class TokenizationService {
  /**
   * Build lookup map from words array - matches frontend buildLookup function
   */
  private static buildLookup(words: Word[]) {
    const map = new Map<string, Word>();
    let maxLen = 1;
    for (const w of words) {
      map.set(w.simplified, w);
      maxLen = Math.max(maxLen, w.simplified.length);
    }
    return { map, maxLen };
  }

  /**
   * Tokenize content exactly like frontend - matches frontend tokenize function
   */
  static tokenize(content: string, words: Word[]): Token[] {
    if (!content) return [];
    const { map, maxLen } = this.buildLookup(words || []);
    const tokens: Token[] = [];
    const isHan = (ch: string) => /[\u4E00-\u9FFF]/.test(ch); // basic CJK check
    let i = 0;
    let tokenIndex = 0;

    while (i < content.length) {
      const ch = content[i];

      if (!isHan(ch)) {
        let j = i + 1;
        while (j < content.length && !isHan(content[j])) j++;
        tokens.push({ 
          text: content.slice(i, j),
          index: tokenIndex++
        });
        i = j;
        continue;
      }

      let matched: Word | undefined;
      let matchedLen = 0;
      for (let len = Math.min(maxLen, content.length - i); len > 0; len--) {
        const sub = content.substr(i, len);
        const w = map.get(sub);
        if (w) { 
          matched = w; 
          matchedLen = len; 
          break; 
        }
      }

      if (matched) {
        tokens.push({ 
          text: content.substr(i, matchedLen), 
          word: matched,
          index: tokenIndex++
        });
        i += matchedLen;
      } else {
        tokens.push({ 
          text: ch,
          index: tokenIndex++
        });
        i++;
      }
    }

    return tokens;
  }

  /**
   * Create precise mapping between tokens and TTS segments
   */
  static createTokenToSegmentMapping(
    tokens: Token[],
    ttsSegments: Array<{ text: string; start: number; end: number; index: number }>,
    ttsMappings: Array<{ segmentIndex: number; start: number; duration: number; word: string }>
  ): TokenMapping[] {
    const mappings: TokenMapping[] = [];
    const usedTtsMappings = new Set<number>(); // Track used TTS mappings
    
    // First pass: direct matches
    for (let i = 0; i < ttsMappings.length; i++) {
      const ttsMapping = ttsMappings[i];
      const ttsWord = ttsMapping.word.trim();
      
      // Find exact matching token
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
        const token = tokens[tokenIndex];
        
        if (token.text === ttsWord) {
          mappings.push({
            tokenIndex,
            segmentIndex: ttsMapping.segmentIndex,
            text: token.text,
            start: ttsMapping.start,
            end: ttsMapping.start + ttsMapping.duration
          });
          usedTtsMappings.add(i);
          break;
        }
      }
    }
    
    // Second pass: handle compound tokens by collecting consecutive TTS words
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const token = tokens[tokenIndex];
      
      // Skip if already mapped
      if (mappings.some(m => m.tokenIndex === tokenIndex)) {
        continue;
      }
      
      // Try to find TTS words that together form this token
      const tokenText = token.text;
      let collectedWords: typeof ttsMappings = [];
      let textSoFar = '';
      let foundCompleteMatch = false;
      
      // Look for consecutive TTS words that build up to this token
      for (let i = 0; i < ttsMappings.length; i++) {
        if (usedTtsMappings.has(i)) continue;
        
        const ttsMapping = ttsMappings[i];
        const ttsWord = ttsMapping.word.trim();
        
        // Check if this TTS word is part of the token
        if (tokenText.includes(ttsWord) && tokenText.startsWith(textSoFar + ttsWord)) {
          collectedWords.push(ttsMapping);
          textSoFar += ttsWord;
          usedTtsMappings.add(i);
          
          // If we've built the complete token, create mapping
          if (textSoFar === tokenText) {
            const startTime = collectedWords[0].start;
            const endTime = collectedWords[collectedWords.length - 1].start + 
                          collectedWords[collectedWords.length - 1].duration;
            
            mappings.push({
              tokenIndex,
              segmentIndex: collectedWords[0].segmentIndex,
              text: token.text,
              start: startTime,
              end: endTime
            });
            foundCompleteMatch = true;
            break;
          }
        } else if (collectedWords.length > 0) {
          // Reset if we can't continue building this token
          // Mark collected words as unused again
          collectedWords.forEach((_, idx) => {
            const originalIndex = ttsMappings.findIndex(m => m === collectedWords[idx]);
            if (originalIndex !== -1) usedTtsMappings.delete(originalIndex);
          });
          collectedWords = [];
          textSoFar = '';
        }
      }
      
      // If no complete match found, clean up any partial collections
      if (!foundCompleteMatch && collectedWords.length > 0) {
        // Mark collected words as unused since we're skipping this token
        collectedWords.forEach((_, idx) => {
          const originalIndex = ttsMappings.findIndex(m => m === collectedWords[idx]);
          if (originalIndex !== -1) usedTtsMappings.delete(originalIndex);
        });
        
        console.log(`Skipping token "${tokenText}" at index ${tokenIndex} - no complete timing match found`);
        // Continue to next token without creating a mapping for this one
        continue;
      }
    }
    
    // Sort mappings by start time to ensure proper order
    mappings.sort((a, b) => a.start - b.start);
    
    // Fill gaps in mappings by creating estimated mappings for unmapped tokens
    // Only create estimated mappings if we have some successful mappings to base estimates on
    const mappedTokens = new Set(mappings.map(m => m.tokenIndex));
    const totalDuration = ttsMappings.length > 0 ? 
      Math.max(...ttsMappings.map(m => m.start + m.duration)) : 0;
    
    // Only proceed with gap filling if we have at least some successful mappings
    if (mappings.length > 0) {
      // Sort existing mappings to find gaps
      const sortedMappings = [...mappings].sort((a, b) => a.tokenIndex - b.tokenIndex);
      
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
        if (!mappedTokens.has(tokenIndex)) {
          // Check if this token should be skipped entirely (e.g., punctuation)
          const token = tokens[tokenIndex];
          const isPunctuation = /^[，。！？；：""''（）【】、\s.,!?;:"'()\[\]\s]+$/.test(token.text.trim());
          
          if (isPunctuation) {
            // For punctuation, create a minimal duration mapping
            let prevMapping = sortedMappings.filter(m => m.tokenIndex < tokenIndex).pop();
            let nextMapping = sortedMappings.find(m => m.tokenIndex > tokenIndex);
            
            let estimatedStart: number;
            if (prevMapping) {
              estimatedStart = prevMapping.end;
            } else if (nextMapping) {
              estimatedStart = Math.max(0, nextMapping.start - 50); // 50ms before next
            } else {
              estimatedStart = 0;
            }
            
            mappings.push({
              tokenIndex,
              segmentIndex: -1,
              text: token.text,
              start: estimatedStart,
              end: estimatedStart + 50 // Short duration for punctuation
            });
            continue;
          }
          
          // Find neighboring mapped tokens for better estimation
          let prevMapping = sortedMappings.filter(m => m.tokenIndex < tokenIndex).pop();
          let nextMapping = sortedMappings.find(m => m.tokenIndex > tokenIndex);
          
          let estimatedStart: number;
          let estimatedDuration: number;
          
          if (prevMapping && nextMapping) {
            // Interpolate between neighboring mappings
            const gap = nextMapping.tokenIndex - prevMapping.tokenIndex;
            const position = tokenIndex - prevMapping.tokenIndex;
            const progress = position / gap;
            
            const timeGap = nextMapping.start - prevMapping.end;
            estimatedStart = prevMapping.end + progress * timeGap;
            estimatedDuration = timeGap / gap;
          } else if (prevMapping) {
            // Extrapolate from previous mapping - use similar duration
            const avgDuration = Math.min(500, totalDuration / tokens.length); // Cap at 500ms
            estimatedStart = prevMapping.end;
            estimatedDuration = avgDuration;
          } else if (nextMapping) {
            // Extrapolate to next mapping
            const avgDuration = Math.min(500, totalDuration / tokens.length);
            estimatedStart = Math.max(0, nextMapping.start - avgDuration);
            estimatedDuration = avgDuration;
          } else {
            // Fallback to uniform distribution
            const avgDuration = totalDuration / tokens.length;
            const tokenProgress = tokenIndex / tokens.length;
            estimatedStart = tokenProgress * totalDuration;
            estimatedDuration = avgDuration;
          }
          
          mappings.push({
            tokenIndex,
            segmentIndex: -1, // Mark as estimated
            text: token.text,
            start: estimatedStart,
            end: estimatedStart + estimatedDuration
          });
        }
      }
    } else {
      // If no mappings at all, create basic uniform distribution
      console.warn('No successful timing mappings found - using uniform time distribution');
      const avgDuration = totalDuration > 0 ? totalDuration / tokens.length : 500;
      
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
        mappings.push({
          tokenIndex,
          segmentIndex: -1,
          text: tokens[tokenIndex].text,
          start: tokenIndex * avgDuration,
          end: (tokenIndex + 1) * avgDuration
        });
      }
    }
    
    // Re-sort after adding estimated mappings
    mappings.sort((a, b) => a.start - b.start);
    
    // Debug logging for troubleshooting
    console.log(`Created ${mappings.length} token mappings for ${tokens.length} tokens`);
    const unmappedCount = mappings.filter(m => m.segmentIndex === -1).length;
    if (unmappedCount > 0) {
      console.log(`Warning: ${unmappedCount} tokens had to be estimated (no direct TTS mapping)`);
    }

    return mappings;
  }

  /**
   * Get token index at specific time during audio playback
   */
  static getTokenAtTime(
    mappings: TokenMapping[],
    currentTimeMs: number
  ): number {
    for (const mapping of mappings) {
      if (currentTimeMs >= mapping.start && currentTimeMs <= mapping.end) {
        return mapping.tokenIndex;
      }
    }
    
    return -1; // No token found for this time
  }
}