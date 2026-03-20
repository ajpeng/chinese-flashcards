/**
 * External lookup service for missing word data
 * Uses AI to find pinyin and English definitions for Chinese words
 */

import OpenAI from 'openai';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { CircuitBreaker } from '../utils/circuitBreaker';

// Claude 3.5 Haiku pricing via OpenRouter ($/million tokens)
const COST_PER_M_INPUT  = 0.80;
const COST_PER_M_OUTPUT = 4.00;

const MODEL = 'anthropic/claude-3.5-haiku';

interface LookupResult {
  pinyin: string | null;
  english: string | null;
  source: 'ai' | 'manual';
}

interface LookupContext {
  userId?: string;
  articleId?: number;
}

class LookupService {
  private client: OpenAI | null = null;
  private breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

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
        logger.info({ event: 'cache_hit', simplified }, 'Word definition found in cache');
        return {
          pinyin: existingWord.pinyin,
          english: existingWord.english,
          source: (existingWord.source as 'ai' | 'manual') || 'ai',
        };
      }

      return null;
    } catch (error) {
      logger.error({ err: error, simplified }, 'Cache lookup error');
      return null;
    }
  }

  async lookupWord(simplified: string, context: LookupContext = {}): Promise<LookupResult | null> {
    try {
      if (!simplified || simplified.trim().length === 0) {
        return null;
      }

      // Include CJK Extension A (3400–4DBF) and Compatibility Ideographs (F900–FAFF)
      // in addition to the main CJK Unified Ideographs block (4E00–9FFF).
      const isChinese = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(simplified);
      if (!isChinese) {
        return null;
      }

      if (!this.client) {
        logger.info({ simplified }, 'No API key configured, skipping lookup');
        return null;
      }

      // Circuit breaker: fast-fail when the breaker is OPEN
      if (!this.breaker.canCall()) {
        logger.warn({
          event: 'circuit_open',
          simplified,
          failureCount: this.breaker.getFailureCount(),
        }, 'Circuit breaker is OPEN — skipping AI lookup');
        return null;
      }

      const completion = await this.client.chat.completions.create({
        model: MODEL,
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

      // Circuit breaker: record success
      this.breaker.recordSuccess();

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }
      const pinyinMatch = text.match(/pinyin:\s*(.+)/i);
      const englishMatch = text.match(/english:\s*(.+)/i);

      if (!pinyinMatch || !englishMatch) {
        logger.warn({ simplified, response: text }, 'Failed to parse AI response');
        return null;
      }

      const pinyin = this.normalizePinyin(pinyinMatch[1].trim());
      const english = englishMatch[1].trim();

      // Cost estimation
      const tokensIn  = completion.usage?.prompt_tokens     ?? 0;
      const tokensOut = completion.usage?.completion_tokens ?? 0;
      const estimatedCostUsd =
        (tokensIn  / 1_000_000) * COST_PER_M_INPUT +
        (tokensOut / 1_000_000) * COST_PER_M_OUTPUT;

      logger.info({
        event: 'ai_call',
        simplified,
        pinyin,
        english,
        model: MODEL,
        tokensIn,
        tokensOut,
        estimatedCostUsd: +estimatedCostUsd.toFixed(6),
        userId: context.userId,
        articleId: context.articleId,
      }, 'AI word lookup succeeded');

      // Persist usage log for cost tracking
      await prisma.aiUsageLog.create({
        data: {
          userId: context.userId ?? null,
          wordSimplified: simplified,
          tokensIn,
          tokensOut,
          estimatedCostUsd,
          model: MODEL,
          articleId: context.articleId ?? null,
        },
      }).catch((err) => {
        // Non-fatal — don't let logging failure block the main flow
        logger.error({ err, simplified }, 'Failed to write AiUsageLog entry');
      });

      return {
        pinyin,
        english,
        source: 'ai'
      };
    } catch (error) {
      // Circuit breaker: record failure on any error
      this.breaker.recordFailure();
      logger.error({
        err: error,
        simplified,
        circuitState: this.breaker.getState(),
        failureCount: this.breaker.getFailureCount(),
      }, 'AI word lookup failed');
      return null;
    }
  }

  /** True when the circuit breaker is OPEN and AI calls will be fast-failed. */
  isCircuitBreakerOpen(): boolean {
    return this.breaker.getState() === 'OPEN';
  }

  async lookupBatch(words: string[], context: LookupContext = {}): Promise<Map<string, LookupResult>> {
    const results = new Map<string, LookupResult>();

    for (const word of words) {
      const result = await this.lookupWord(word, context);
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
