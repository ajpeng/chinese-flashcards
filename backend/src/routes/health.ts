import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// Basic health/readiness endpoint
router.get('/', (_req: Request, res: Response, _next: NextFunction) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
  });
});

export default router;
