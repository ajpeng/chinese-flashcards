import { Router, Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { processJobInBackground } from '../services/subtitle.service';

const router = Router();

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
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is required for Whisper transcription. Add it to your environment variables.' });
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
