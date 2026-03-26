import createError from 'http-errors';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import logger from './utils/logger';

import indexRouter from './routes/index';
import usersRouter from './routes/users';
import healthRouter from './routes/health';
import articlesRouter from './routes/articles';
import segmentationRouter from './routes/segmentation';
import authRouter from './routes/auth';
import flashcardsRouter from './routes/flashcards';
import srsRouter from './routes/srs';
import ttsRouter from './routes/tts';
import sttRouter from './routes/stt';
import wordsRouter from './routes/words';
import subtitlesRouter, { reconcileStaleSubtitleJobs } from './routes/subtitles';
import podcastsRouter from './routes/podcasts';
import pool from './db';
import { dictionaryService } from './services/dictionary.service';
import { segmentationService } from './services/segmentation.service';
import { apiRateLimiter } from './middleware/rateLimit';

const app: Application = express();
app.set('trust proxy', 1);

// Initialize services on startup
(async () => {
  try {
    await dictionaryService.initialize();
    await segmentationService.initialize();
    await reconcileStaleSubtitleJobs();
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize services');
    process.exit(1);
  }
})();

// Enable CORS with credentials support for authentication
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true, // Enable cookies
  })
);

// view engine and static assets setup
// Use the project root (process.cwd()) so this works both in dev (ts-node-dev)
// and in the compiled dist/ output.
const PROJECT_ROOT = process.cwd();
app.set('views', path.join(PROJECT_ROOT, 'views'));
app.set('view engine', 'jade');

// Attach a unique request ID to every request for log correlation
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomUUID();
  (req as any).id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Structured HTTP request logging (replaces morgan)
app.use(pinoHttp({ logger }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

app.use('/', indexRouter);
app.use('/users', usersRouter);
// Expose the same users routes under /api/users for API-style endpoints
app.use('/api/users', usersRouter);
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/flashcards', flashcardsRouter);
app.use('/api/srs', srsRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/segmentation', segmentationRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/stt', sttRouter);
app.use('/api/words', wordsRouter);
app.use('/api/subtitles', subtitlesRouter);
app.use('/api/podcasts', podcastsRouter);

// catch 404 and forward to error handler
app.use((req: Request, res: Response, next: NextFunction) => {
  next(createError(404));
});

// error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

app.get('/test-db', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Database connection error');
    res.status(500).send('Database connection error');
  }
});

export default app;
