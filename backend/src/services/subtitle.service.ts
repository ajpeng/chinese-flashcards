import OpenAI from 'openai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

// Whisper hard limit is 25 MB. Target 20 MB to stay safely under — MP3 encoding
// adds ~8–10% overhead over the nominal bitrate, so 23 MB target can exceed 25 MB.
const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

// Get total audio duration in seconds via ffprobe
export async function getAudioDurationSecs(filePath: string): Promise<number> {
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
export function srtToMs(ts: string): number {
  const [hms, ms] = ts.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3_600_000 + m * 60_000 + s * 1_000 + Number(ms);
}

// Total milliseconds → SRT timestamp "HH:MM:SS,mmm"
export function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Shift all timestamps in an SRT string by offsetMs and renumber blocks from startIndex
export function shiftSrt(srt: string, offsetMs: number, startIndex: number): { shifted: string; count: number } {
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

export async function transcribeToSrt(filePath: string, language: string, jobId: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for Whisper audio transcription (OpenRouter does not support audio)');

  const openai = new OpenAI({ apiKey });

  const totalSecs = await getAudioDurationSecs(filePath);
  if (totalSecs > 0) {
    await prisma.subtitleJob.update({ where: { id: jobId }, data: { durationMs: Math.round(totalSecs * 1_000) } });
  }

  const chunkPaths: string[] = [];
  const fileStat = fs.statSync(filePath);

  if (fileStat.size <= CHUNK_SIZE_BYTES) {
    const mp3Path = filePath + '_chunk000.mp3';
    await execFileAsync('ffmpeg', [
      '-y', '-i', filePath,
      '-ar', '16000', '-ac', '1', '-b:a', '64k',
      mp3Path,
    ], { timeout: 300_000 });
    chunkPaths.push(mp3Path);
  } else {
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
      const srtText: string = await (openai.audio.transcriptions.create as Function)({
        file: Object.assign(fileStream, { name: path.basename(chunkPath) }),
        model: 'whisper-1',
        language: language.split('-')[0],
        response_format: 'srt',
        temperature: 0,
      });

      const offsetMs = Math.round(i * secsPerChunk * 1_000);
      const { shifted, count } = shiftSrt(srtText, offsetMs, globalIndex);
      globalIndex += count;
      if (shifted) srtParts.push(shifted);

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
export async function processJobInBackground(jobId: string, filePath: string, language: string): Promise<void> {
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

// Translate a Chinese SRT string to English using OpenRouter (or OpenAI as fallback)
export async function translateSrtToEnglish(zhSrt: string): Promise<string> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openrouterKey && !openaiKey) throw new Error('No AI API key configured (OPENROUTER_API_KEY or OPENAI_API_KEY)');

  const client = openrouterKey
    ? new OpenAI({ apiKey: openrouterKey, baseURL: 'https://openrouter.ai/api/v1' })
    : new OpenAI({ apiKey: openaiKey! });

  const response = await client.chat.completions.create({
    model: openrouterKey ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a professional subtitle translator. Translate the Chinese SRT subtitle file to English. ' +
          'Preserve ALL numeric indices and ALL timing lines exactly as-is. ' +
          'Only translate the text lines. Keep each translation concise to fit on screen.',
      },
      { role: 'user', content: zhSrt },
    ],
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content ?? '';
}
