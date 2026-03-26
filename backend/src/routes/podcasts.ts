import { Router, Request, Response } from 'express';
import Parser from 'rss-parser';
import https from 'https';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/auth';
import { processJobInBackground, translateSrtToEnglish } from '../services/subtitle.service';

const router = Router();
router.use(requireAuth);

const rssParser = new Parser({
  customFields: {
    feed: ['itunes:author', 'itunes:image'],
    item: [['itunes:duration', 'itunesDuration'], ['itunes:summary', 'itunesSummary']],
  },
});

// Download a remote URL to a temp file, returning the temp file path.
function downloadToTempFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `podcast_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    const file = fs.createWriteStream(tmpPath);
    const proto = url.startsWith('https') ? https : http;

    const req = proto.get(url, { timeout: 600_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(tmpPath);
        // Follow redirect
        downloadToTempFile(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlinkSync(tmpPath);
        reject(new Error(`HTTP ${res.statusCode} downloading audio`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(tmpPath)));
    });

    req.on('error', (err) => {
      try { fs.unlinkSync(tmpPath); } catch {}
      reject(err);
    });
    req.setTimeout(600_000, () => {
      req.destroy();
      try { fs.unlinkSync(tmpPath); } catch {}
      reject(new Error('Audio download timed out'));
    });
  });
}

// Parse iTunes duration string "HH:MM:SS" or "MM:SS" or plain seconds → seconds
function parseItunesDuration(dur: string | number | undefined): number | null {
  if (!dur) return null;
  if (typeof dur === 'number') return dur;
  const parts = String(dur).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  const secs = parseInt(dur, 10);
  return isNaN(secs) ? null : secs;
}

// POST /api/podcasts — add (or refresh) a podcast feed
router.post('/', async (req: Request, res: Response) => {
  const { rssUrl } = req.body as { rssUrl?: string };
  if (!rssUrl || typeof rssUrl !== 'string') {
    res.status(400).json({ error: 'rssUrl is required' });
    return;
  }

  let feed: Awaited<ReturnType<typeof rssParser.parseURL>>;
  try {
    feed = await rssParser.parseURL(rssUrl.trim());
  } catch (err: any) {
    logger.warn({ err, rssUrl }, 'Failed to parse RSS feed');
    res.status(422).json({ error: `Could not fetch or parse the RSS feed: ${err.message}` });
    return;
  }

  const userId = req.user!.userId;

  const podcast = await prisma.podcast.upsert({
    where: { userId_rssUrl: { userId, rssUrl: rssUrl.trim() } },
    create: {
      userId,
      rssUrl: rssUrl.trim(),
      title: feed.title || 'Untitled Podcast',
      description: feed.description ?? null,
      imageUrl: (feed as any).image?.url ?? (feed as any)['itunes:image']?.['$']?.href ?? null,
      author: (feed as any)['itunes:author'] ?? (feed as any).author ?? null,
    },
    update: {
      title: feed.title || 'Untitled Podcast',
      description: feed.description ?? null,
      imageUrl: (feed as any).image?.url ?? (feed as any)['itunes:image']?.['$']?.href ?? null,
      author: (feed as any)['itunes:author'] ?? (feed as any).author ?? null,
    },
  });

  // Upsert episodes
  for (const item of feed.items ?? []) {
    const guid = item.guid || item.link || item.title || '';
    const audioUrl = item.enclosure?.url || '';
    if (!guid || !audioUrl) continue;

    await prisma.podcastEpisode.upsert({
      where: { podcastId_guid: { podcastId: podcast.id, guid } },
      create: {
        podcastId: podcast.id,
        guid,
        title: item.title || 'Untitled Episode',
        description: item.contentSnippet ?? (item as any).itunesSummary ?? null,
        audioUrl,
        publishedAt: item.isoDate ? new Date(item.isoDate) : null,
        durationSecs: parseItunesDuration((item as any).itunesDuration),
      },
      update: {
        title: item.title || 'Untitled Episode',
        audioUrl,
        publishedAt: item.isoDate ? new Date(item.isoDate) : null,
        durationSecs: parseItunesDuration((item as any).itunesDuration),
      },
    });
  }

  const result = await prisma.podcast.findUnique({
    where: { id: podcast.id },
    include: { episodes: { orderBy: { publishedAt: 'desc' } } },
  });

  res.status(201).json(result);
});

// GET /api/podcasts — list all podcasts for the current user
router.get('/', async (req: Request, res: Response) => {
  const podcasts = await prisma.podcast.findMany({
    where: { userId: req.user!.userId },
    include: { episodes: { orderBy: { publishedAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(podcasts);
});

// DELETE /api/podcasts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const podcast = await prisma.podcast.findUnique({ where: { id: req.params.id } });
  if (!podcast || podcast.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Podcast not found' });
    return;
  }
  await prisma.podcast.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// GET /api/podcasts/:podcastId/episodes/:episodeId
router.get('/:podcastId/episodes/:episodeId', async (req: Request, res: Response) => {
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: req.params.episodeId },
    include: { podcast: true, subtitleJob: true },
  });

  if (!episode || episode.podcast.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  res.json({
    ...episode,
    zhSrtContent: episode.subtitleJob?.srtContent ?? null,
  });
});

// POST /api/podcasts/:podcastId/episodes/:episodeId/subtitles — trigger dual-subtitle generation
router.post('/:podcastId/episodes/:episodeId/subtitles', async (req: Request, res: Response) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is required for Whisper transcription. Add it to your environment variables.' });
    return;
  }

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: req.params.episodeId },
    include: { podcast: true },
  });

  if (!episode || episode.podcast.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  if (
    episode.subtitleStatus === 'done' ||
    episode.subtitleStatus === 'processing_zh' ||
    episode.subtitleStatus === 'processing_en'
  ) {
    res.status(409).json({
      error: episode.subtitleStatus === 'done'
        ? 'Subtitles already generated'
        : 'Subtitle generation already in progress',
    });
    return;
  }

  // ── Shared cache check ─────────────────────────────────────────────────────
  // If another user has already generated subtitles for the same audio URL,
  // copy them directly — no Whisper call needed.
  const shared = await prisma.sharedEpisodeSubtitle.findUnique({
    where: { audioUrl: episode.audioUrl },
  });

  if (shared?.status === 'done' && shared.zhSrtContent && shared.enSrtContent) {
    logger.info({ episodeId: episode.id, audioUrl: episode.audioUrl }, 'Subtitle cache hit — copying shared subtitles');

    // Create a SubtitleJob row so the existing GET endpoints can read zhSrtContent via the join
    const cachedJob = await prisma.subtitleJob.create({
      data: {
        status: 'done',
        filename: episode.title,
        language: 'zh-CN',
        srtContent: shared.zhSrtContent,
        progressPct: 100,
      },
    });

    await prisma.podcastEpisode.update({
      where: { id: episode.id },
      data: {
        zhSubtitleJobId: cachedJob.id,
        enSrtContent: shared.enSrtContent,
        subtitleStatus: 'done',
        subtitleError: null,
      },
    });

    res.status(200).json({ subtitleStatus: 'done' });
    return;
  }

  // ── Normal generation pipeline ─────────────────────────────────────────────
  const job = await prisma.subtitleJob.create({
    data: { status: 'processing', filename: episode.title, language: 'zh-CN' },
  });

  await prisma.podcastEpisode.update({
    where: { id: episode.id },
    data: { zhSubtitleJobId: job.id, subtitleStatus: 'processing_zh', subtitleError: null },
  });

  res.status(202).json({ subtitleStatus: 'processing_zh' });

  // Background: download audio → transcribe → translate
  (async () => {
    let tmpPath: string | null = null;
    try {
      // Mark as in-progress in shared cache to signal other concurrent requests
      await prisma.sharedEpisodeSubtitle.upsert({
        where: { audioUrl: episode.audioUrl },
        create: { audioUrl: episode.audioUrl, status: 'processing' },
        update: { status: 'processing', error: null },
      });

      logger.info({ episodeId: episode.id, jobId: job.id }, 'Downloading podcast audio');
      tmpPath = await downloadToTempFile(episode.audioUrl);

      // Run Whisper transcription (updates SubtitleJob in DB)
      await processJobInBackground(job.id, tmpPath, 'zh-CN');
      tmpPath = null; // processJobInBackground deletes the file

      // Check if transcription succeeded
      const updatedJob = await prisma.subtitleJob.findUnique({ where: { id: job.id } });
      if (!updatedJob || updatedJob.status !== 'done' || !updatedJob.srtContent) {
        const errMsg = updatedJob?.error ?? 'Transcription failed';
        await prisma.podcastEpisode.update({
          where: { id: episode.id },
          data: { subtitleStatus: 'failed', subtitleError: errMsg },
        });
        await prisma.sharedEpisodeSubtitle.upsert({
          where: { audioUrl: episode.audioUrl },
          create: { audioUrl: episode.audioUrl, status: 'failed', error: errMsg },
          update: { status: 'failed', error: errMsg },
        });
        return;
      }

      // Translate Chinese SRT to English
      await prisma.podcastEpisode.update({
        where: { id: episode.id },
        data: { subtitleStatus: 'processing_en' },
      });

      logger.info({ episodeId: episode.id }, 'Translating subtitles to English');
      const enSrt = await translateSrtToEnglish(updatedJob.srtContent);

      await prisma.podcastEpisode.update({
        where: { id: episode.id },
        data: { enSrtContent: enSrt, subtitleStatus: 'done' },
      });

      // Persist to shared cache so future users get instant results
      await prisma.sharedEpisodeSubtitle.upsert({
        where: { audioUrl: episode.audioUrl },
        create: {
          audioUrl: episode.audioUrl,
          zhSrtContent: updatedJob.srtContent,
          enSrtContent: enSrt,
          status: 'done',
        },
        update: {
          zhSrtContent: updatedJob.srtContent,
          enSrtContent: enSrt,
          status: 'done',
          error: null,
        },
      });

      logger.info({ episodeId: episode.id }, 'Podcast subtitles complete');
    } catch (err: any) {
      logger.error({ episodeId: episode.id, err }, 'Podcast subtitle pipeline failed');
      if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
      const errMsg = err.message ?? 'Unknown error';
      await prisma.podcastEpisode.update({
        where: { id: episode.id },
        data: { subtitleStatus: 'failed', subtitleError: errMsg },
      });
      await prisma.sharedEpisodeSubtitle.upsert({
        where: { audioUrl: episode.audioUrl },
        create: { audioUrl: episode.audioUrl, status: 'failed', error: errMsg },
        update: { status: 'failed', error: errMsg },
      });
    }
  })();
});

// GET /api/podcasts/:podcastId/episodes/:episodeId/subtitles/status — poll status
router.get('/:podcastId/episodes/:episodeId/subtitles/status', async (req: Request, res: Response) => {
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: req.params.episodeId },
    include: { podcast: true, subtitleJob: true },
  });

  if (!episode || episode.podcast.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  res.json({
    subtitleStatus: episode.subtitleStatus,
    subtitleError: episode.subtitleError,
    progressPct: episode.subtitleJob?.progressPct ?? 0,
    zhSrtContent: episode.subtitleStatus === 'done' ? (episode.subtitleJob?.srtContent ?? null) : null,
    enSrtContent: episode.subtitleStatus === 'done' ? episode.enSrtContent : null,
  });
});

export default router;
