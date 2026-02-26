/**
 * Structured logger using Pino.
 *
 * In development, logs are pretty-printed to stdout.
 * In production, logs are emitted as newline-delimited JSON (Docker-friendly).
 *
 * Usage:
 *   import logger from '../utils/logger';
 *   logger.info({ userId, articleId }, 'Article created');
 *   logger.error({ err, requestId }, 'Database write failed');
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export default logger;
