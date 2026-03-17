import { Router, Request, Response } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Whisper hard limit is 25 MB. Target 23 MB chunks to stay safely under.
const CHUNK_SIZE_BYTES = 23 * 1024 * 1024;

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/flac', 'audio/ogg', 'video/mp4', 'audio/x-m4a'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Get total audio duration in seconds via ffprobe
async function getAudioDurationSecs(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { timeout: 30_000 });
    const secs = parseFloat(stdout.trim());
    return isNaN(secs) ? 0 : secs;
  } catch {
    return 0;
  }
}

// Parse SRT timestamp "HH:MM:SS,mmm" → total milliseconds
function srtToMs(ts: string): number {
  const [hms, ms] = ts.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3_600_000 + m * 60_000 + s * 1_000 + Number(ms);
}

// Total milliseconds → SRT timestamp "HH:MM:SS,mmm"
function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Shift all timestamps in an SRT string by offsetMs and renumber blocks from startIndex
function shiftSrt(srt: string, offsetMs: number, startIndex: number): { shifted: string; count: number } {
  const blocks = srt.trim().split(/\n\n+/);
  let idx = startIndex;
  const parts: string[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const tsLineIdx = lines.findIndex(l => l.includes(' --> '));
    if (tsLineIdx === -1) continue;

    const [start, end] = lines[tsLineIdx].split(' --> ');
    const newStart = msToSrt(srtToMs(start.trim()) + offsetMs);
    const newEnd   = msToSrt(srtToMs(end.trim())   + offsetMs);
    const textLines = lines.slice(tsLineIdx + 1).join('\n');

    parts.push(`${idx++}\n${newStart} --> ${newEnd}\n${textLines}`);
  }

  return { shifted: parts.join('\n\n'), count: idx - startIndex };
}

async function transcribeToSrt(filePath: string, language: string, jobId: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const totalSecs = await getAudioDurationSecs(filePath);
  if (totalSecs > 0) {
    await prisma.subtitleJob.update({ where: { id: jobId }, data: { durationMs: Math.round(totalSecs * 1_000) } });
  }

  // Build chunk file paths. We re-encode to MP3 at 64 kbps (~0.48 MB/min) so a
  // 23 MB chunk holds ~48 minutes — most uploads need only a single chunk.
  const chunkPaths: string[] = [];

  const fileStat = fs.statSync(filePath);

  if (fileStat.size <= CHUNK_SIZE_BYTES) {
    // Single chunk — convert to compact MP3
    const mp3Path = filePath + '_chunk000.mp3';
    await execFileAsync('ffmpeg', [
      '-y', '-i', filePath,
      '-ar', '16000', '-ac', '1', '-b:a', '64k',
      mp3Path,
    ], { timeout: 300_000 });
    chunkPaths.push(mp3Path);
  } else {
    // Split into time-based segments of ~45 min each
    const segmentSecs = Math.floor((CHUNK_SIZE_BYTES * 8) / 64_000);
    const segmentPattern = filePath + '_chunk%03d.mp3';
    await execFileAsync('ffmpeg', [
      '-y', '-i', filePath,
      '-ar', '16000', '-ac', '1', '-b:a', '64k',
      '-f', 'segment', '-segment_time', String(segmentSecs),
      '-reset_timestamps', '1',
      segmentPattern,
    ], { timeout: 600_000 });

    for (let i = 0; ; i++) {
      const p = filePath + `_chunk${String(i).padStart(3, '0')}.mp3`;
      if (!fs.existsSync(p)) break;
      chunkPaths.push(p);
    }
  }

  if (chunkPaths.length === 0) throw new Error('Audio conversion produced no output chunks.');

  const totalChunks = chunkPaths.length;
  const secsPerChunk = totalSecs > 0 ? totalSecs / totalChunks : 0;
  logger.info({ jobId, totalChunks }, 'Starting Whisper transcription');

  const srtParts: string[] = [];
  let globalIndex = 1;

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = chunkPaths[i];
    try {
      const fileStream = fs.createReadStream(chunkPath);
      // Cast required because the SDK types expect a specific File shape
      const srtText: string = await (openai.audio.transcriptions.create as Function)({
        file: Object.assign(fileStream, { name: path.basename(chunkPath) }),
        model: 'whisper-1',
        language: language.split('-')[0], // Whisper uses ISO-639-1: 'zh', 'en', 'ja', 'ko'
        response_format: 'srt',
        temperature: 0,
      });

      const offsetMs = Math.round(i * secsPerChunk * 1_000);
      const { shifted, count } = shiftSrt(srtText, offsetMs, globalIndex);
      globalIndex += count;
      if (shifted) srtParts.push(shifted);

      // Progress: each completed chunk advances proportionally, capped at 99 until fully done
      const pct = Math.min(99, Math.round(((i + 1) / totalChunks) * 100));
      await prisma.subtitleJob.update({ where: { id: jobId }, data: { progressPct: pct } });
    } finally {
      try { fs.unlinkSync(chunkPath); } catch { /* ignore */ }
    }
  }

  if (srtParts.length === 0) throw new Error('No speech recognised — check the audio has clear speech in the selected language.');

  return srtParts.join('\n\n');
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

// On startup: mark any jobs that were left in "processing" as failed
// (the upload file is gone after a restart, so they can never complete)
export async function reconcileStaleSubtitleJobs(): Promise<void> {
  try {
    const { count } = await prisma.subtitleJob.updateMany({
      where: { status: 'processing' },
      data: { status: 'failed', error: 'Server restarted while job was processing. Please re-upload the file.' },
    });
    if (count > 0) {
      logger.warn({ count }, 'Marked stale subtitle jobs as failed on startup');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to reconcile stale subtitle jobs');
  }
}

// POST /api/subtitles/upload
router.post('/upload', upload.single('audio'), async (req: Request, res: Response) => {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OpenAI API key not configured on this server.' });
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
