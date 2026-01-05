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
import pool from './db';

const app: Application = express();

// Enable CORS for all routes in development.
// You can restrict this to a specific origin, e.g.
// app.use(cors({ origin: 'http://localhost:5173' }))
app.use(cors());

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

app.use('/', indexRouter);
app.use('/users', usersRouter);
// Expose the same users routes under /api/users for API-style endpoints
app.use('/api/users', usersRouter);
app.use('/health', healthRouter);
app.use('/api/articles', articlesRouter);

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
