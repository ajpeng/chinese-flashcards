/**
 * Pinyin utility functions for converting between tone marks and tone numbers
 */

// Map of vowels with tone marks to their base form + tone number
const TONE_MARKS_TO_NUMBERS: Record<string, string> = {
  // a
  'ā': 'a1', 'á': 'a2', 'ǎ': 'a3', 'à': 'a4',
  // e
  'ē': 'e1', 'é': 'e2', 'ě': 'e3', 'è': 'e4',
  // i
  'ī': 'i1', 'í': 'i2', 'ǐ': 'i3', 'ì': 'i4',
  // o
  'ō': 'o1', 'ó': 'o2', 'ǒ': 'o3', 'ò': 'o4',
  // u
  'ū': 'u1', 'ú': 'u2', 'ǔ': 'u3', 'ù': 'u4',
  // ü
  'ǖ': 'v1', 'ǘ': 'v2', 'ǚ': 'v3', 'ǜ': 'v4',
};

// Map of base vowel + tone number to tone mark
const NUMBERS_TO_TONE_MARKS: Record<string, string> = {
  // a
  'a1': 'ā', 'a2': 'á', 'a3': 'ǎ', 'a4': 'à',
  // e
  'e1': 'ē', 'e2': 'é', 'e3': 'ě', 'e4': 'è',
  // i
  'i1': 'ī', 'i2': 'í', 'i3': 'ǐ', 'i4': 'ì',
  // o
  'o1': 'ō', 'o2': 'ó', 'o3': 'ǒ', 'o4': 'ò',
  // u
  'u1': 'ū', 'u2': 'ú', 'u3': 'ǔ', 'u4': 'ù',
  // v (ü)
  'v1': 'ǖ', 'v2': 'ǘ', 'v3': 'ǚ', 'v4': 'ǜ',
};

/**
 * Convert pinyin with tone marks to tone numbers
 * Example: "nǐ hǎo" → "ni3 hao3"
 */
export function pinyinMarksToNumbers(pinyin: string): string {
  if (!pinyin) return pinyin;

  let result = pinyin;

  // Replace each tone mark character with base + number
  for (const [mark, numForm] of Object.entries(TONE_MARKS_TO_NUMBERS)) {
    result = result.replace(new RegExp(mark, 'g'), numForm);
  }

  return result;
}

/**
 * Convert pinyin with tone numbers to tone marks
 * Example: "ni3 hao3" → "nǐ hǎo", "ruan4 jian4" → "ruàn jiàn"
 *
 * In CEDICT format the tone number comes at the END of the syllable after any
 * trailing consonants (e.g. "ruan4", "zhong1"), so we must apply tone
 * placement rules rather than simply replacing vowel+number directly.
 */
export function pinyinNumbersToMarks(pinyin: string): string {
  if (!pinyin) return pinyin;

  // Match a syllable body (letters + v for ü) followed by a tone number 1–4
  return pinyin.replace(/([a-zuüv]+)([1-4])/gi, (_, syllable: string, tone: string) => {
    const s = syllable.toLowerCase();

    // Standard pinyin tone placement rules:
    // 1. 'a' or 'e' always takes the mark
    if (s.includes('a')) return syllable.replace('a', NUMBERS_TO_TONE_MARKS[`a${tone}`] ?? 'a');
    if (s.includes('e')) return syllable.replace('e', NUMBERS_TO_TONE_MARKS[`e${tone}`] ?? 'e');
    // 2. In 'ou', 'o' takes the mark
    if (s.includes('ou')) return syllable.replace('o', NUMBERS_TO_TONE_MARKS[`o${tone}`] ?? 'o');
    // 3. Otherwise the last vowel takes the mark
    const vowels = 'aeiouüv';
    for (let i = s.length - 1; i >= 0; i--) {
      if (vowels.includes(s[i])) {
        const mark = NUMBERS_TO_TONE_MARKS[`${s[i]}${tone}`];
        if (mark) return syllable.slice(0, i) + mark + syllable.slice(i + 1);
      }
    }
    return syllable;
  });
}

/**
 * Convert pinyin based on style preference
 * Handles mixed input formats by normalizing first
 */
export function convertPinyinStyle(pinyin: string | null | undefined, targetStyle: 'marks' | 'numbers'): string {
  if (!pinyin) return '';

  // Clean up the input - remove any extraneous content
  let cleaned = pinyin.trim();
  
  if (targetStyle === 'numbers') {
    // Convert any tone marks to numbers first, then ensure clean format
    let result = pinyinMarksToNumbers(cleaned);
    // Clean up any duplicate numbers or strange formatting
    result = result.replace(/([aeiouv])([1-4])+([1-4])/g, '$1$3'); // Fix double numbers
    return result;
  } else {
    // Convert to marks
    // First convert any numbers to marks
    if (/[1-4]/.test(cleaned)) {
      cleaned = pinyinNumbersToMarks(cleaned);
    }
    // Then clean up any remaining numbers that might be mixed in
    cleaned = cleaned.replace(/[1-4]/g, '');
    return cleaned;
  }
}
