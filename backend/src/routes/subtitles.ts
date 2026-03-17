import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);
const router = Router();

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

// Convert Azure's 100-nanosecond tick offset to SRT timestamp string HH:MM:SS,mmm
function ticksToSrtTime(ticks: number): string {
  const ms = Math.floor(ticks / 10_000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

interface TranscriptSegment {
  text: string;
  offset: number;   // 100ns ticks
  duration: number; // 100ns ticks
}

async function transcribeWav(wavPath: string, language: string): Promise<TranscriptSegment[]> {
  if (!AZURE_SPEECH_KEY) throw new Error('Azure Speech service not configured');

  const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
  speechConfig.speechRecognitionLanguage = language;

  const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(wavPath));
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  const segments: TranscriptSegment[] = [];

  recognizer.recognized = (_sender, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text.trim()) {
      segments.push({
        text: e.result.text.trim(),
        offset: e.result.offset,
        duration: e.result.duration,
      });
    }
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.sessionStopped = () => resolve();
    recognizer.canceled = (_sender, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        reject(new Error(e.errorDetails));
      } else {
        resolve();
      }
    };
    recognizer.startContinuousRecognitionAsync(
      () => { /* started */ },
      (err) => reject(new Error(err)),
    );
  });

  recognizer.close();
  return segments;
}

function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = ticksToSrtTime(seg.offset);
      const end = ticksToSrtTime(seg.offset + seg.duration);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join('\n\n');
}

// POST /api/subtitles/generate
// Downloads audio from a YouTube URL via yt-dlp, transcribes with Azure STT,
// and returns a .srt subtitle file.
router.post(
  '/generate',
  body('url').isURL({ require_protocol: true }).withMessage('A valid URL is required'),
  body('language').optional().isString().isLength({ max: 20 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!AZURE_SPEECH_KEY) {
      res.status(500).json({ error: 'Azure Speech service not configured on this server.' });
      return;
    }

    const { url, language = 'zh-CN' } = req.body as { url: string; language?: string };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subtitles-'));
    const audioPath = path.join(tmpDir, 'audio.wav');

    try {
      logger.info({ url, language }, 'Downloading audio via yt-dlp');

      // Download and convert to 16 kHz mono WAV — ideal for Azure STT
      await execFileAsync('yt-dlp', [
        '-x',
        '--audio-format', 'wav',
        '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
        '-o', audioPath,
        url,
      ], { timeout: 300_000 }); // 5 min download limit

      if (!fs.existsSync(audioPath)) {
        res.status(500).json({ error: 'Audio download produced no output file.' });
        return;
      }

      logger.info({ language }, 'Transcribing audio with Azure STT');
      const segments = await transcribeWav(audioPath, language);

      if (segments.length === 0) {
        res.status(404).json({ error: 'No speech could be recognised from the audio. The video may be silent or in an unsupported language.' });
        return;
      }

      const srt = buildSrt(segments);

      // Derive a clean filename from the URL
      const videoId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] ?? 'subtitles';
      const filename = `${videoId}.srt`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(srt);
    } catch (error: any) {
      logger.error({ err: error, url }, 'Subtitle generation failed');

      if (error.code === 127 || /not found|ENOENT/i.test(error.message ?? '')) {
        res.status(500).json({ error: 'yt-dlp is not installed on this server.' });
      } else {
        res.status(500).json({
          error: 'Failed to generate subtitles.',
          details: error.message,
        });
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  },
);

export default router;
