import { Router, Request, Response } from 'express';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { body, validationResult } from 'express-validator';
import { TTSSegmentationService } from '../services/tts-segmentation.service';
import { TokenizationService } from '../services/tokenization.service';
import { createHash } from 'crypto';
import prisma from '../prisma/client';

const router = Router();

// Azure TTS configuration
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

if (!AZURE_SPEECH_KEY) {
  console.error('AZURE_SPEECH_KEY environment variable is required');
}

interface WordTiming {
  word: string;
  start: number;
  duration: number;
  audioOffset: number;
}

interface TTSResponse {
  audioData: string;
  timings: WordTiming[];
  totalDuration: number;
  segments: Array<{ text: string; start: number; end: number; index: number }>;
  mappings: Array<{ segmentIndex: number; start: number; duration: number; word: string }>;
  tokens: Array<{ text: string; word?: any; index: number }>;
  tokenMappings: Array<{ tokenIndex: number; segmentIndex: number; text: string; start: number; end: number }>;
}

// Helper function to create cache hash
function createCacheHash(text: string, voice: string, rate: string): string {
  const key = `${text}|${voice}|${rate}`;
  return createHash('sha256').update(key).digest('hex');
}

// POST /api/tts - Generate speech with word-level timing
router.post(
  '/',
  [
    body('text').isString().trim().notEmpty().withMessage('Text is required'),
    body('voice').optional().isString().trim(),
    body('rate').optional().isFloat({ min: 0.5, max: 2.0 }).withMessage('Rate must be between 0.5 and 2.0'),
    body('words').optional().isArray().withMessage('Words must be an array'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!AZURE_SPEECH_KEY) {
        res.status(500).json({ error: 'Azure Speech service not configured' });
        return;
      }

      const { text, voice = 'zh-CN-XiaoxiaoNeural', rate = '1.0', words = [] } = req.body;

      console.log('TTS request for text:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

      // Create cache hash (include words for consistent tokenization)
      const wordsString = JSON.stringify(words);
      const cacheHash = createCacheHash(text + wordsString, voice, rate);
      
      // Check if cached version exists
      let cachedTTS = await prisma.tTSCache.findUnique({
        where: { textHash: cacheHash }
      });

      if (cachedTTS) {
        console.log('Cache hit! Returning cached TTS audio');
        
        // Update last used timestamp
        await prisma.tTSCache.update({
          where: { id: cachedTTS.id },
          data: { lastUsedAt: new Date() }
        });

        // Regenerate tokenization for cached response (in case words changed)
        const tokens = TokenizationService.tokenize(text, words);
        const segments = JSON.parse(JSON.stringify(cachedTTS.segments)) as Array<{ text: string; start: number; end: number; index: number }>;
        const mappings = JSON.parse(JSON.stringify(cachedTTS.mappings)) as Array<{ segmentIndex: number; start: number; duration: number; word: string }>;
        const tokenMappings = TokenizationService.createTokenToSegmentMapping(tokens, segments, mappings);

        // Return cached response
        const response: TTSResponse = {
          audioData: cachedTTS.audioData,
          timings: JSON.parse(JSON.stringify(cachedTTS.timings)) as WordTiming[],
          totalDuration: cachedTTS.totalDuration,
          segments,
          mappings,
          tokens,
          tokenMappings
        };
        res.json(response);
        return;
      }

      console.log('Cache miss. Generating new TTS audio');

      // Segment text for consistent word boundaries
      const segments = TTSSegmentationService.segmentText(text);
      console.log('Segmented into', segments.length, 'words');

      // Preprocess text for better TTS boundaries
      const processedText = TTSSegmentationService.preprocessForTTS(text);

      // Create speech config
      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      speechConfig.speechSynthesisVoiceName = voice;

      // Create SSML with rate adjustment
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
          <voice name="${voice}">
            <prosody rate="${rate}">${processedText}</prosody>
          </voice>
        </speak>
      `;

      // Use pull audio output stream to capture audio data
      const pullStreamConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, pullStreamConfig);

      const wordTimings: WordTiming[] = [];

      // Set up word boundary event listener
      synthesizer.wordBoundary = (sender, event) => {
        const audioOffsetMs = event.audioOffset / 10000; // Convert from ticks to milliseconds
        const durationMs = event.duration / 10000; // Convert from ticks to milliseconds
        
        console.log(`Word boundary: ${event.text} at ${audioOffsetMs}ms, duration: ${durationMs}ms`);
        
        wordTimings.push({
          word: event.text,
          start: audioOffsetMs,
          duration: durationMs,
          audioOffset: event.audioOffset
        });
      };

      // Synthesize speech and capture audio
      const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            resolve(result);
          },
          (error) => {
            reject(new Error(error));
          }
        );
      });

      // Clean up
      synthesizer.close();

      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        // Convert audio buffer to base64
        const audioData = Buffer.from(result.audioData).toString('base64');
        
        // Calculate total duration
        const totalDuration = wordTimings.length > 0 
          ? Math.max(...wordTimings.map(w => w.start + w.duration))
          : 0;

        // Map TTS boundaries to our segments
        const mappings = TTSSegmentationService.mapTTSBoundaries(segments, wordTimings);

        // Generate precise tokenization
        const tokens = TokenizationService.tokenize(text, words);
        const tokenMappings = TokenizationService.createTokenToSegmentMapping(tokens, segments, mappings);

        console.log(`TTS completed. ${wordTimings.length} boundaries, ${segments.length} segments, ${mappings.length} mappings, ${tokens.length} tokens`);
        
        // Debug specific problematic text
        if (text.includes('北卡罗莱纳州')) {
          console.log('DEBUG: Text contains 北卡罗莱纳州');
          console.log('Tokens:', tokens.slice(0, 20).map(t => ({ text: t.text, index: t.index })));
          console.log('Segments:', segments.slice(0, 10));
          console.log('Token mappings:', tokenMappings.slice(0, 10));
        }

        // Cache the generated TTS
        try {
          await prisma.tTSCache.create({
            data: {
              textHash: cacheHash,
              text,
              voice,
              rate,
              audioData,
              timings: JSON.parse(JSON.stringify(wordTimings)),
              totalDuration,
              segments: JSON.parse(JSON.stringify(segments)),
              mappings: JSON.parse(JSON.stringify(mappings)),
              lastUsedAt: new Date()
            }
          });
          console.log('TTS audio cached successfully');
        } catch (cacheError) {
          console.error('Failed to cache TTS audio:', cacheError);
          // Don't fail the request if caching fails
        }

        const response: TTSResponse = {
          audioData,
          timings: wordTimings,
          totalDuration,
          segments,
          mappings,
          tokens,
          tokenMappings
        };

        res.json(response);
      } else {
        console.error('TTS synthesis failed:', result.errorDetails);
        res.status(500).json({ error: 'Speech synthesis failed: ' + result.errorDetails });
      }
    } catch (error) {
      console.error('TTS error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'TTS generation failed' });
    }
  }
);

// GET /api/tts/cache/stats - Get cache statistics (admin route)
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const totalEntries = await prisma.tTSCache.count();
    const oldestEntry = await prisma.tTSCache.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });
    const newestEntry = await prisma.tTSCache.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });
    
    res.json({
      totalEntries,
      oldestEntry: oldestEntry?.createdAt,
      newestEntry: newestEntry?.createdAt
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// DELETE /api/tts/cache/cleanup - Clean up old cache entries (admin route)
router.delete('/cache/cleanup', async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deletedEntries = await prisma.tTSCache.deleteMany({
      where: {
        lastUsedAt: {
          lt: thirtyDaysAgo
        }
      }
    });
    
    res.json({ 
      message: `Cleaned up ${deletedEntries.count} cache entries older than 30 days` 
    });
  } catch (error) {
    console.error('Cache cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup cache' });
  }
});

export default router;