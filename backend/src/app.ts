import createError from 'http-errors';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

import indexRouter from './routes/index';
import usersRouter from './routes/users';
import healthRouter from './routes/health';
import articlesRouter from './routes/articles';
import segmentationRouter from './routes/segmentation';
import authRouter from './routes/auth';
import flashcardsRouter from './routes/flashcards';
import ttsRouter from './routes/tts';
import sttRouter from './routes/stt';
import pool from './db';
import { dictionaryService } from './services/dictionary.service';
import { segmentationService } from './services/segmentation.service';
import { apiRateLimiter } from './middleware/rateLimit';

const app: Application = express();
app.set('trust proxy', 1);
app.set('trust proxy', 1);
app.set('trust proxy', 1);

// Initialize services on startup
(async () => {
  try {
    await dictionaryService.initialize();
    await segmentationService.initialize();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize services:', error);
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

app.use(logger('dev'));
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
app.use('/api/articles', articlesRouter);
app.use('/api/segmentation', segmentationRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/stt', sttRouter);

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
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).send('Database connection error');
  }
});

export default app;
