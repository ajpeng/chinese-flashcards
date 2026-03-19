import { Router, Request, Response } from 'express';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { body, validationResult } from 'express-validator';
import { TTSSegmentationService } from '../services/tts-segmentation.service';
import { TokenizationService } from '../services/tokenization.service';
import { createHash } from 'crypto';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = Router();

// Azure TTS configuration
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

if (!AZURE_SPEECH_KEY) {
  logger.error('AZURE_SPEECH_KEY environment variable is required');
}

// Tigris (S3-compatible) configuration
// Fly.io sets BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_ENDPOINT_URL_S3 automatically
const S3_BUCKET = process.env.BUCKET_NAME;
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
});

if (!S3_BUCKET) {
  logger.error('BUCKET_NAME environment variable is required');
}

async function uploadAudioToS3(key: string, audioBuffer: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: audioBuffer,
    ContentType: 'audio/wav',
  }));
}

async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn: 3600 });
}

interface WordTiming {
  word: string;
  start: number;
  duration: number;
  audioOffset: number;
}

interface TTSResponse {
  audioUrl: string;
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!AZURE_SPEECH_KEY) {
      res.status(500).json({ error: 'Azure Speech service not configured' });
      return;
    }

    if (!S3_BUCKET) {
      res.status(500).json({ error: 'S3 bucket not configured' });
      return;
    }

    const { text, voice = 'zh-CN-XiaoxiaoNeural', rate = '1.0', words = [] } = req.body;

    logger.info({ textPreview: text.substring(0, 50) }, 'TTS request received');

    // Create cache hash (include words for consistent tokenization)
    const wordsString = JSON.stringify(words);
    const cacheHash = createCacheHash(text + wordsString, voice, rate);

    // Check if cached version exists
    const cachedTTS = await prisma.tTSCache.findUnique({
      where: { textHash: cacheHash }
    });

    if (cachedTTS) {
      logger.info({ event: 'tts_cache_hit' }, 'Cache hit - returning cached TTS audio');

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

      const audioUrl = await getPresignedUrl(cachedTTS.s3Key);

      const response: TTSResponse = {
        audioUrl,
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

    logger.info({ event: 'tts_cache_miss' }, 'Cache miss - generating new TTS audio');

    // Segment text for consistent word boundaries
    const segments = TTSSegmentationService.segmentText(text);
    logger.info({ segmentCount: segments.length }, 'Text segmented');

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

    // Use null audio config - audio data is captured from the result object directly
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined);

    const wordTimings: WordTiming[] = [];

    // Set up word boundary event listener
    synthesizer.wordBoundary = (sender, event) => {
      const audioOffsetMs = event.audioOffset / 10000; // Convert from ticks to milliseconds
      const durationMs = event.duration / 10000; // Convert from ticks to milliseconds

      logger.debug({ text: event.text, audioOffsetMs, durationMs }, 'Word boundary');

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
      const audioBuffer = Buffer.from(result.audioData);

      // Calculate total duration
      const totalDuration = wordTimings.length > 0
        ? Math.max(...wordTimings.map(w => w.start + w.duration))
        : 0;

      // Map TTS boundaries to our segments
      const mappings = TTSSegmentationService.mapTTSBoundaries(segments, wordTimings);

      // Generate precise tokenization
      const tokens = TokenizationService.tokenize(text, words);
      const tokenMappings = TokenizationService.createTokenToSegmentMapping(tokens, segments, mappings);

      logger.info({ wordTimings: wordTimings.length, segments: segments.length, mappings: mappings.length, tokens: tokens.length }, 'TTS synthesis completed');

      // Debug specific problematic text
      if (text.includes('北卡罗莱纳州')) {
        logger.debug({ tokens: tokens.slice(0, 20), segments: segments.slice(0, 10), tokenMappings: tokenMappings.slice(0, 10) }, 'DEBUG: Text contains 北卡罗莱纳州');
      }

      // Upload audio to S3 and cache metadata in DB
      const s3Key = `tts/${cacheHash}.wav`;
      try {
        await uploadAudioToS3(s3Key, audioBuffer);
        await prisma.tTSCache.create({
          data: {
            textHash: cacheHash,
            text,
            voice,
            rate,
            s3Key,
            timings: JSON.parse(JSON.stringify(wordTimings)),
            totalDuration,
            segments: JSON.parse(JSON.stringify(segments)),
            mappings: JSON.parse(JSON.stringify(mappings)),
            lastUsedAt: new Date()
          }
        });
        logger.info({ event: 'tts_cached', s3Key }, 'TTS audio cached to S3');
      } catch (cacheError) {
        logger.error({ err: cacheError }, 'Failed to cache TTS audio');
        // Don't fail the request if caching fails
      }

      const audioUrl = await getPresignedUrl(s3Key);

      const response: TTSResponse = {
        audioUrl,
        timings: wordTimings,
        totalDuration,
        segments,
        mappings,
        tokens,
        tokenMappings
      };

      res.json(response);
    } else {
      logger.error({ errorDetails: result.errorDetails }, 'TTS synthesis failed');
      res.status(500).json({ error: 'Speech synthesis failed: ' + result.errorDetails });
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
    logger.error({ err: error }, 'TTS cache stats error');
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
    logger.error({ err: error }, 'TTS cache cleanup error');
    res.status(500).json({ error: 'Failed to cleanup cache' });
  }
});

// GET /api/tts/health - Check TTS service health
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthCheck = {
      ttsService: 'Azure Speech SDK',
      azureKeyConfigured: !!AZURE_SPEECH_KEY,
      azureRegion: AZURE_SPEECH_REGION,
      tigrisBucketConfigured: !!S3_BUCKET,
      sdkVersion: (sdk.SpeechConfig as any).getVersion ? (sdk.SpeechConfig as any).getVersion() : 'Unknown',
      timestamp: new Date().toISOString()
    };

    res.json(healthCheck);
  } catch (error) {
    logger.error({ err: error }, 'TTS health check error');
    res.status(500).json({
      error: 'TTS health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
