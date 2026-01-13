import { Converter } from 'opencc-js';

// Initialize converters
const simplifiedToTraditional = Converter({ from: 'cn', to: 'hk' }); // Simplified to Traditional
const traditionalToSimplified = Converter({ from: 'hk', to: 'cn' }); // Traditional to Simplified

/**
 * Convert simplified Chinese text to traditional Chinese
 */
export function toTraditional(text: string): string {
  return simplifiedToTraditional(text);
}

/**
 * Convert traditional Chinese text to simplified Chinese
 */
export function toSimplified(text: string): string {
  return traditionalToSimplified(text);
}

/**
 * Convert Chinese text based on target variant
 */
export function convertChineseText(
  text: string, 
  targetVariant: 'simplified' | 'traditional'
): string {
  if (targetVariant === 'traditional') {
    return toTraditional(text);
  } else {
    return toSimplified(text);
  }
}

/**
 * Detect if text is primarily simplified or traditional Chinese
 * This is a simple heuristic based on comparing the original with conversions
 */
export function detectChineseVariant(text: string): 'simplified' | 'traditional' | 'mixed' {
  const traditionalVersion = toTraditional(text);
  const simplifiedVersion = toSimplified(text);
  
  // If converting to traditional changes the text, it was likely simplified
  const hasSimplifiedChars = traditionalVersion !== text;
  
  // If converting to simplified changes the text, it was likely traditional
  const hasTraditionalChars = simplifiedVersion !== text;
  
  if (hasSimplifiedChars && !hasTraditionalChars) {
    return 'simplified';
  } else if (hasTraditionalChars && !hasSimplifiedChars) {
    return 'traditional';
  } else {
    return 'mixed';
  }
}