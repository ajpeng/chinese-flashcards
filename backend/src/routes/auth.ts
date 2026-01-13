import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimit';

const router = Router();

// POST /api/auth/signup - Create a new user account
router.post(
  '/signup',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isString().trim().notEmpty().withMessage('Password is required'),
    body('name').optional().isString().trim(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { email, password, name } = req.body;

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        res.status(400).json({ error: passwordValidation.message });
        return;
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name || null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          pinyinStyle: true,
          fontSize: true,
          speechRate: true,
          voiceName: true,
          createdAt: true,
        },
      });

      // Generate tokens
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.status(201).json({
        user,
        accessToken,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating user', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// POST /api/auth/login - Login with email and password
router.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { email, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      // Verify password
      const isPasswordValid = await comparePassword(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      // Generate tokens
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          pinyinStyle: user.pinyinStyle,
          fontSize: user.fontSize,
          speechRate: user.speechRate,
          createdAt: user.createdAt,
        },
        accessToken,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error logging in', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  }
);

// POST /api/auth/logout - Clear refresh token cookie
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me - Get current user info
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        pinyinStyle: true,
        fontSize: true,
        speechRate: true,
        voiceName: true,
        textVariant: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching user', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/refresh - Get new access token using refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token provided' });
      return;
    }

    // Verify refresh token and get new access token
    const { verifyToken } = await import('../utils/jwt');
    const payload = verifyToken(refreshToken);

    const accessToken = generateAccessToken({ userId: payload.userId, email: payload.email });

    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : 'Invalid refresh token' });
  }
});

// PATCH /api/auth/settings - Update user settings
router.patch(
  '/settings',
  requireAuth,
  [
    body('pinyinStyle').optional().isIn(['marks', 'numbers']).withMessage('pinyinStyle must be "marks" or "numbers"'),
    body('fontSize').optional().isIn(['small', 'medium', 'large', 'xlarge']).withMessage('fontSize must be "small", "medium", "large", or "xlarge"'),
    body('speechRate').optional().isFloat({ min: 0.5, max: 2.0 }).toFloat().withMessage('Invalid speech rate value'),
    body('voiceName').optional({ nullable: true }).isString().trim(),
    body('textVariant').optional().isIn(['simplified', 'traditional']).withMessage('textVariant must be "simplified" or "traditional"'),
    body('name').optional({ nullable: true }).isString().trim(),
  ],
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const updates: { pinyinStyle?: string; fontSize?: string; name?: string, speechRate?: number, voiceName?: string, textVariant?: string } = {};
      if (req.body.pinyinStyle !== undefined) {
        updates.pinyinStyle = req.body.pinyinStyle;
      }
      if (req.body.fontSize !== undefined) {
        updates.fontSize = req.body.fontSize;
      }
      if (req.body.speechRate !== undefined) {
        updates.speechRate = req.body.speechRate;
      }
      if (req.body.voiceName !== undefined) {
        updates.voiceName = req.body.voiceName;
      }
      if (req.body.textVariant !== undefined) {
        updates.textVariant = req.body.textVariant;
      }
      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }

      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: updates,
        select: {
          id: true,
          email: true,
          name: true,
          pinyinStyle: true,
          fontSize: true,
          speechRate: true,
          voiceName: true,
          textVariant: true,
          createdAt: true,
        },
      });

      res.json(user);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating settings', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

export default router;
