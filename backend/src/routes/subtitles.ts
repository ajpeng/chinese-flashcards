import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

const router = Router();

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/flac', 'audio/ogg', 'video/mp4'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Convert Azure 100ns ticks → SRT timestamp HH:MM:SS,mmm
function ticksToSrt(ticks: number): string {
  const ms = Math.floor(ticks / 10_000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Get total audio duration in ms via ffprobe
async function getAudioDurationMs(wavPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      wavPath,
    ], { timeout: 30_000 });
    const secs = parseFloat(stdout.trim());
    return isNaN(secs) ? 0 : Math.round(secs * 1_000);
  } catch {
    return 0;
  }
}

interface Segment { text: string; offset: number; duration: number; }

async function transcribeToSrt(filePath: string, language: string, jobId: string): Promise<string> {
  if (!AZURE_SPEECH_KEY) throw new Error('Azure Speech service not configured');

  // Convert to 16 kHz mono WAV — required for Azure STT
  const wavPath = filePath + '_converted.wav';
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', filePath,
      '-ar', '16000', '-ac', '1', '-f', 'wav',
      wavPath,
    ], { timeout: 300_000 });
  } catch (err: any) {
    throw new Error(`Audio conversion failed: ${err.message}`);
  }

  // Get total duration so we can track progress percentage
  const durationMs = await getAudioDurationMs(wavPath);
  if (durationMs > 0) {
    await prisma.subtitleJob.update({ where: { id: jobId }, data: { durationMs } });
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
  speechConfig.speechRecognitionLanguage = language;

  let audioConfig: sdk.AudioConfig;
  try {
    audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(wavPath));
  } finally {
    try { fs.unlinkSync(wavPath); } catch { /* ignore */ }
  }

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  const segments: Segment[] = [];
  let lastWrittenPct = 0;

  recognizer.recognized = (_sender, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text.trim()) {
      segments.push({ text: e.result.text.trim(), offset: e.result.offset, duration: e.result.duration });

      // Write progress to DB whenever it moves by ≥5%, capped at 99 until fully done
      if (durationMs > 0) {
        const offsetMs = Math.floor(e.result.offset / 10_000);
        const pct = Math.min(99, Math.round((offsetMs / durationMs) * 100));
        if (pct >= lastWrittenPct + 5) {
          lastWrittenPct = pct;
          prisma.subtitleJob.update({ where: { id: jobId }, data: { progressPct: pct } }).catch(() => {});
        }
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.sessionStopped = () => resolve();
    recognizer.canceled = (_sender, e) => {
      if (e.reason === sdk.CancellationReason.Error) reject(new Error(e.errorDetails));
      else resolve();
    };
    recognizer.startContinuousRecognitionAsync(() => {}, (err) => reject(new Error(err)));
  });

  recognizer.close();

  if (segments.length === 0) throw new Error('No speech recognised — check the audio has clear speech in the selected language.');

  return segments
    .map((seg, i) => `${i + 1}\n${ticksToSrt(seg.offset)} --> ${ticksToSrt(seg.offset + seg.duration)}\n${seg.text}`)
    .join('\n\n');
}

// Run transcription in the background, updating the job record when done/failed.
async function processJobInBackground(jobId: string, filePath: string, language: string): Promise<void> {
  try {
    const srt = await transcribeToSrt(filePath, language, jobId);
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: 'done', srtContent: srt, progressPct: 100 },
    });
    logger.info({ jobId }, 'Subtitle job completed');
  } catch (err: any) {
    logger.error({ jobId, err }, 'Subtitle job failed');
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: err.message ?? 'Unknown error' },
    });
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

// POST /api/subtitles/upload
router.post('/upload', upload.single('audio'), async (req: Request, res: Response) => {
  if (!AZURE_SPEECH_KEY) {
    res.status(500).json({ error: 'Azure Speech service not configured on this server.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided.' });
    return;
  }

  const language = (req.body.language as string) || 'zh-CN';
  const filename = req.file.originalname || 'audio';

  const job = await prisma.subtitleJob.create({
    data: { status: 'processing', filename, language },
  });

  logger.info({ jobId: job.id, filename, language }, 'Subtitle job created');
  processJobInBackground(job.id, req.file.path, language).catch(() => {});

  res.status(202).json({ jobId: job.id });
});

// GET /api/subtitles/jobs/:id
router.get('/jobs/:id', async (req: Request, res: Response) => {
  const job = await prisma.subtitleJob.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, filename: true, language: true, srtContent: true, error: true, durationMs: true, progressPct: true, createdAt: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  res.json(job);
});

export default router;
