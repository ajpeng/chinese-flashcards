import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import prisma from '../prisma/client';
import logger from '../utils/logger';

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

interface Segment { text: string; offset: number; duration: number; }

async function transcribeToSrt(filePath: string, language: string): Promise<string> {
  if (!AZURE_SPEECH_KEY) throw new Error('Azure Speech service not configured');

  // Azure STT works best with WAV. For other formats, use a push stream approach.
  const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
  speechConfig.speechRecognitionLanguage = language;

  let audioConfig: sdk.AudioConfig;
  const fileBuffer = fs.readFileSync(filePath);

  if (filePath.endsWith('.wav')) {
    audioConfig = sdk.AudioConfig.fromWavFileInput(fileBuffer);
  } else {
    // Push stream for non-WAV formats
    const pushStream = sdk.AudioInputStream.createPushStream();
    const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
    pushStream.write(arrayBuffer);
    pushStream.close();
    audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  }

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  const segments: Segment[] = [];

  recognizer.recognized = (_sender, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text.trim()) {
      segments.push({ text: e.result.text.trim(), offset: e.result.offset, duration: e.result.duration });
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
    const srt = await transcribeToSrt(filePath, language);
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: 'done', srtContent: srt },
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
// Accepts an audio file + language, creates a SubtitleJob, kicks off background
// transcription, and immediately returns the job ID.
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

  // Create the job record immediately
  const job = await prisma.subtitleJob.create({
    data: { status: 'processing', filename, language },
  });

  logger.info({ jobId: job.id, filename, language }, 'Subtitle job created');

  // Kick off transcription in the background (do not await)
  processJobInBackground(job.id, req.file.path, language).catch(() => {});

  res.status(202).json({ jobId: job.id });
});

// GET /api/subtitles/jobs/:id
// Poll for job status. Returns status + srtContent (when done) or error (when failed).
router.get('/jobs/:id', async (req: Request, res: Response) => {
  const job = await prisma.subtitleJob.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, filename: true, language: true, srtContent: true, error: true, createdAt: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  res.json(job);
});

export default router;
