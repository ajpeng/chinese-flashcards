import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Patreon OAuth 2.0
// ---------------------------------------------------------------------------

// GET /api/auth/patreon – redirect user to Patreon authorisation page
router.get('/patreon', (_req: Request, res: Response) => {
  const clientId = process.env.PATREON_CLIENT_ID;
  const redirectUri = process.env.PATREON_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).json({ error: 'Patreon OAuth is not configured on the server.' });
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'identity identity[email]',
  });

  res.redirect(`https://www.patreon.com/oauth2/authorize?${params.toString()}`);
});

// GET /api/auth/patreon/callback – Patreon redirects back here with ?code=…
router.get('/patreon/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const basePath = process.env.FRONTEND_BASE_PATH || '/chinese-flashcards';
  const frontendBase = `${frontendUrl}${basePath}`;

  if (!code) {
    res.redirect(`${frontendBase}?error=patreon_oauth_missing_code`);
    return;
  }

  try {
    const clientId = process.env.PATREON_CLIENT_ID!;
    const clientSecret = process.env.PATREON_CLIENT_SECRET!;
    const redirectUri = process.env.PATREON_REDIRECT_URI!;

    // Exchange authorisation code for tokens
    const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Patreon token exchange failed:', errBody);
      res.redirect(`${frontendBase}?error=patreon_token_exchange_failed`);
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string };

    // Fetch the Patreon user identity
    const identityRes = await fetch(
      'https://www.patreon.com/api/oauth2/v2/identity?fields%5Buser%5D=email,full_name,image_url',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!identityRes.ok) {
      res.redirect(`${frontendBase}?error=patreon_identity_failed`);
      return;
    }

    const identity = await identityRes.json() as {
      data: { id: string; attributes: { email: string; full_name: string } };
    };

    const patreonId = identity.data.id;
    const email = identity.data.attributes.email;
    const name = identity.data.attributes.full_name || null;

    // Upsert user – find by patreonId or email, create if new
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { patreonId },
          { email },
        ],
      },
    });

    if (user) {
      // Update patreonId if not set yet (user existed via email before)
      if (!user.patreonId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { patreonId, name: user.name || name },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name,
          patreonId,
          passwordHash: '', // not used for OAuth users
        },
      });
    }

    // Issue our own JWT and redirect to frontend with token in query param
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Send the access token to the frontend via URL query param.
    // The frontend AuthContext detects ?token= on mount and stores it.
    res.redirect(`${frontendBase}/?token=${encodeURIComponent(accessToken)}`);
  } catch (error) {
    console.error('Patreon OAuth callback error:', error);
    res.redirect(`${frontendBase}?error=patreon_oauth_error`);
  }
});

// ---------------------------------------------------------------------------
// Shared endpoints (logout, me, refresh, settings)
// ---------------------------------------------------------------------------

// POST /api/auth/logout – clear refresh token cookie
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me – get current user info
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
    console.error('Error fetching user', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/refresh – get new access token using refresh token cookie
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token provided' });
      return;
    }

    const { verifyToken } = await import('../utils/jwt');
    const payload = verifyToken(refreshToken);

    const accessToken = generateAccessToken({ userId: payload.userId, email: payload.email });

    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : 'Invalid refresh token' });
  }
});

// PATCH /api/auth/settings – update user settings
router.patch(
  '/settings',
  requireAuth,
  [
    body('pinyinStyle').optional().isIn(['marks', 'numbers']),
    body('fontSize').optional().isIn(['small', 'medium', 'large', 'xlarge']),
    body('speechRate').optional().isFloat({ min: 0.5, max: 2.0 }).toFloat(),
    body('voiceName').optional({ nullable: true }).isString().trim(),
    body('textVariant').optional().isIn(['simplified', 'traditional']),
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

      const updates: Record<string, unknown> = {};
      const fields = ['pinyinStyle', 'fontSize', 'speechRate', 'voiceName', 'textVariant', 'name'] as const;
      for (const field of fields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
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
      console.error('Error updating settings', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

// GET /api/auth/dev-login – instant login for local development only
router.get('/dev-login', async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }

  try {
    const user = await prisma.user.upsert({
      where: { email: 'dev@localhost' },
      create: { email: 'dev@localhost', name: 'Dev User', passwordHash: '' },
      update: {},
    });

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (error) {
    console.error('Dev login error:', error);
    res.status(500).json({ error: 'Dev login failed' });
  }
});

export default router;
