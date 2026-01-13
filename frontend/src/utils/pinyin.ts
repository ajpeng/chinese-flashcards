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
 * Example: "ni3 hao3" → "nǐ hǎo"
 */
export function pinyinNumbersToMarks(pinyin: string): string {
  if (!pinyin) return pinyin;

  let result = pinyin;

  // Replace base vowel + number with tone mark
  // Process in reverse order (v4, v3, v2, v1, etc.) to avoid partial replacements
  const entries = Object.entries(NUMBERS_TO_TONE_MARKS).sort((a, b) => b[0].localeCompare(a[0]));

  for (const [numForm, mark] of entries) {
    result = result.replace(new RegExp(numForm, 'g'), mark);
  }

  return result;
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
