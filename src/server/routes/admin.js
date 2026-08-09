const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');

/**
 * Server Admin Control Routes
 * 
 * Features:
 * 1. Heavy rate-limiting defenses against brute-force attacks on PRIVATE_SERVER_KEY
 * 2. 32-character minimum alphanumeric requirement for PRIVATE_SERVER_KEY
 * 3. Server Invite Token generation (1-Time Use vs Forever Tokens)
 * 4. Token listing with device ID & friendly name tracking
 * 5. Emergency Token Revocation / Invalidation
 */

// Heavy rate limiter for admin authentication / login attempts (5 tries per 15 minutes)
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many admin authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for admin management actions (60 req per 15 minutes)
const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many admin requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Validate that PRIVATE_SERVER_KEY is configured and satisfies the 32+ character alphanumeric rule
 */
function isValidAdminKeyConfig() {
  const key = process.env.PRIVATE_SERVER_KEY || '';
  return /^[a-zA-Z0-9]{32,}$/.test(key);
}

/**
 * Generate a deterministic daily session token for admin authentication
 */
function generateAdminAuthToken() {
  const secretKey = process.env.PRIVATE_SERVER_KEY || '';
  const dayBucket = Math.floor(Date.now() / (24 * 3600 * 1000));
  return crypto.createHmac('sha256', secretKey).update(`admin_session_bucket_${dayBucket}`).digest('hex');
}

/**
 * Admin Authentication Middleware
 */
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const xAdminKey = req.headers['x-admin-key'] || '';

  const serverKey = process.env.PRIVATE_SERVER_KEY || '';
  const expectedSessionToken = generateAdminAuthToken();

  let tokenProvided = '';
  if (authHeader.startsWith('Bearer ')) {
    tokenProvided = authHeader.substring(7).trim();
  } else if (xAdminKey) {
    tokenProvided = String(xAdminKey).trim();
  }

  if (!tokenProvided) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication token required.' });
  }

  // Accept either the raw 32+ char key or the valid daily session token
  const isValid = tokenProvided === serverKey || tokenProvided === expectedSessionToken;
  if (!isValid) {
    return res.status(403).json({ error: 'Forbidden: Invalid admin credentials.' });
  }

  next();
}

/**
 * GET /api/admin/config
 * Public endpoint returning server privacy mode
 */
router.get('/config', (req, res) => {
  const isPrivateServer = String(process.env.PRIVATE_SERVER || 'false').toLowerCase() === 'true';
  return res.json({
    success: true,
    isPrivateServer,
  });
});

/**
 * POST /api/admin/login
 * Admin Login Endpoint (Heavily Rate Limited)
 */
router.post('/login', adminAuthLimiter, (req, res) => {
  const { adminKey } = req.body || {};

  const isPrivate = String(process.env.PRIVATE_SERVER || 'false').toLowerCase() === 'true';
  if (!isPrivate) {
    return res.status(400).json({ error: 'Private Server Mode is currently disabled on this server.' });
  }

  if (!isValidAdminKeyConfig()) {
    return res.status(500).json({
      error: 'Server Configuration Error: PRIVATE_SERVER_KEY must be an alphanumeric string of at least 32 characters in .env.',
    });
  }

  const expectedKey = process.env.PRIVATE_SERVER_KEY;
  if (!adminKey || String(adminKey).trim() !== expectedKey) {
    return res.status(403).json({ error: 'Invalid admin key.' });
  }

  const token = generateAdminAuthToken();
  return res.json({
    success: true,
    message: 'Admin authentication successful.',
    token,
  });
});

/**
 * POST /api/admin/tokens/create
 * Generate a new Server Invite Token (1-Time Use or Forever)
 */
router.post('/tokens/create', adminActionLimiter, requireAdminAuth, async (req, res) => {
  try {
    const { type, customToken } = req.body || {};

    if (!type || !['one_time', 'forever'].includes(type)) {
      return res.status(400).json({ error: 'Invalid token type. Must be either "one_time" or "forever".' });
    }

    let tokenCode = customToken ? String(customToken).trim().toUpperCase() : null;
    if (!tokenCode) {
      const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      tokenCode = `SRV-${randomHex}`;
    }

    // Check if token code already exists
    const existing = await prisma.serverToken.findUnique({
      where: { token: tokenCode },
    });

    if (existing) {
      return res.status(400).json({ error: `Server token "${tokenCode}" already exists. Please try another code.` });
    }

    const serverToken = await prisma.serverToken.create({
      data: {
        token: tokenCode,
        type: type,
        isRevoked: false,
        usedCount: 0,
      },
    });

    return res.json({
      success: true,
      token: serverToken,
    });
  } catch (error) {
    console.error('Error creating server token:', error);
    return res.status(500).json({ error: 'Internal server error while creating server token.' });
  }
});

/**
 * GET /api/admin/tokens
 * List all server invite tokens with usage stats and friendly display names
 */
router.get('/tokens', adminActionLimiter, requireAdminAuth, async (req, res) => {
  try {
    const tokens = await prisma.serverToken.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Fetch user profiles to enrich lastUsedBy with friendly names
    const deviceIds = tokens.map((t) => t.lastUsedBy).filter(Boolean);
    const profiles = await prisma.userProfile.findMany({
      where: { deviceId: { in: deviceIds } },
    });

    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.deviceId] = p.friendlyName;
    });

    const enrichedTokens = tokens.map((t) => ({
      ...t,
      lastUsedByFriendlyName: t.lastUsedBy ? (profileMap[t.lastUsedBy] || 'Anonymous') : null,
    }));

    return res.json({
      success: true,
      tokens: enrichedTokens,
    });
  } catch (error) {
    console.error('Error fetching server tokens:', error);
    return res.status(500).json({ error: 'Internal server error while fetching server tokens.' });
  }
});

/**
 * POST /api/admin/tokens/revoke
 * Invalidate / Revoke a Server Invite Token (Emergency Action)
 */
router.post('/tokens/revoke', adminActionLimiter, requireAdminAuth, async (req, res) => {
  try {
    const { tokenId, tokenCode } = req.body || {};

    if (!tokenId && !tokenCode) {
      return res.status(400).json({ error: 'tokenId or tokenCode is required.' });
    }

    const targetToken = tokenId
      ? await prisma.serverToken.findUnique({ where: { id: tokenId } })
      : await prisma.serverToken.findUnique({ where: { token: String(tokenCode).trim().toUpperCase() } });

    if (!targetToken) {
      return res.status(404).json({ error: 'Server token not found.' });
    }

    const updated = await prisma.serverToken.update({
      where: { id: targetToken.id },
      data: { isRevoked: true },
    });

    return res.json({
      success: true,
      message: `Server token "${updated.token}" has been revoked and invalidated.`,
      token: updated,
    });
  } catch (error) {
    console.error('Error revoking server token:', error);
    return res.status(500).json({ error: 'Internal server error while revoking server token.' });
  }
});

module.exports = router;
