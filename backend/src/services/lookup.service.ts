/**
 * External lookup service for missing word data
 * Uses AI to find pinyin and English definitions for Chinese words
 */

import OpenAI from 'openai';
import prisma from '../prisma/client';

interface LookupResult {
  pinyin: string | null;
  english: string | null;
  source: 'ai' | 'manual';
}

class LookupService {
  private client: OpenAI | null = null;

  constructor() {
    if (process.env.OPENROUTER_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    }
  }

  /**
   * Check if a word has already been looked up and cached in the database
   * This prevents redundant API calls for words that already exist
   */
  async getCachedLookup(simplified: string): Promise<LookupResult | null> {
    try {
      // Find any existing word with this simplified form that has pinyin/english
      const existingWord = await prisma.word.findFirst({
        where: {
          simplified,
          AND: [
            { pinyin: { not: null } },
            { english: { not: null } },
          ],
        },
        select: {
          pinyin: true,
          english: true,
          source: true,
        },
      });

      if (existingWord && existingWord.pinyin && existingWord.english) {
        console.log(`[LookupService] ✓ Cache hit: ${simplified}`);
        return {
          pinyin: existingWord.pinyin,
          english: existingWord.english,
          source: (existingWord.source as 'ai' | 'manual') || 'ai',
        };
      }

      return null;
    } catch (error) {
      console.error('[LookupService] Cache lookup error:', error);
      return null;
    }
  }

  async lookupWord(simplified: string): Promise<LookupResult | null> {
    try {
      if (!simplified || simplified.trim().length === 0) {
        return null;
      }

      const isChinese = /[\u4E00-\u9FFF]/.test(simplified);
      if (!isChinese) {
        return null;
      }

      if (!this.client) {
        console.log(`[LookupService] No API key configured, skipping lookup for: ${simplified}`);
        return null;
      }

      const completion = await this.client.chat.completions.create({
        model: 'anthropic/claude-3.5-haiku',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Provide the pinyin (with tone marks, not numbers) and English definition for this Chinese word: ${simplified}

Reply ONLY in this exact format:
pinyin: [pinyin with tone marks]
english: [brief English definition]

If it's a proper name, include that in the definition.`
        }]
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }
      const pinyinMatch = text.match(/pinyin:\s*(.+)/i);
      const englishMatch = text.match(/english:\s*(.+)/i);

      if (!pinyinMatch || !englishMatch) {
        console.log(`[LookupService] Failed to parse response for ${simplified}: ${text}`);
        return null;
      }

      const pinyin = this.normalizePinyin(pinyinMatch[1].trim());
      const english = englishMatch[1].trim();

      console.log(`[LookupService] ✓ Found: ${simplified} = ${pinyin} (${english})`);

      return {
        pinyin,
        english,
        source: 'ai'
      };
    } catch (error) {
      console.error('[LookupService] Error looking up word:', error);
      return null;
    }
  }

  async lookupBatch(words: string[]): Promise<Map<string, LookupResult>> {
    const results = new Map<string, LookupResult>();

    for (const word of words) {
      const result = await this.lookupWord(word);
      if (result) {
        results.set(word, result);
      }
    }

    return results;
  }

  normalizePinyin(pinyin: string | null): string | null {
    if (!pinyin) return null;

    const toneMarks: Record<string, string> = {
      'a1': 'ā', 'a2': 'á', 'a3': 'ǎ', 'a4': 'à',
      'e1': 'ē', 'e2': 'é', 'e3': 'ě', 'e4': 'è',
      'i1': 'ī', 'i2': 'í', 'i3': 'ǐ', 'i4': 'ì',
      'o1': 'ō', 'o2': 'ó', 'o3': 'ǒ', 'o4': 'ò',
      'u1': 'ū', 'u2': 'ú', 'u3': 'ǔ', 'u4': 'ù',
      'v1': 'ǖ', 'v2': 'ǘ', 'v3': 'ǚ', 'v4': 'ǜ',
    };

    if (!/[1-4]/.test(pinyin)) {
      return pinyin.trim();
    }

    let result = pinyin;
    const entries = Object.entries(toneMarks).sort((a, b) => b[0].localeCompare(a[0]));
    for (const [numForm, mark] of entries) {
      result = result.replace(new RegExp(numForm, 'g'), mark);
    }

    return result.trim();
  }
}

export const lookupService = new LookupService();
