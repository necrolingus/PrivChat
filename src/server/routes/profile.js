const express = require('express');
const router = express.Router();
const prisma = require('../db');

/**
 * POST /api/profile/save
 * Upsert friendlyName for a deviceId
 */
router.post('/save', async (req, res) => {
  try {
    const { deviceId, friendlyName, serverToken: tokenInput } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const nameToSave = (friendlyName || '').trim() || 'Anonymous';
    const isPrivate = String(process.env.PRIVATE_SERVER || 'false').toLowerCase() === 'true';
    let authorized = false;

    let existingProfile = await prisma.userProfile.findUnique({
      where: { deviceId },
    });

    if (isPrivate) {
      if (existingProfile && existingProfile.authorizedOnServer) {
        authorized = true;
      } else {
        const headerToken = req.headers['x-server-token'];
        const candidateToken = tokenInput || headerToken;

        if (!candidateToken) {
          return res.status(403).json({ error: 'Private Server: Valid server invite token is required to register on this server.' });
        }

        const tokenCode = String(candidateToken).trim().toUpperCase();
        const srvToken = await prisma.serverToken.findUnique({
          where: { token: tokenCode },
        });

        if (!srvToken) {
          return res.status(403).json({ error: 'Private Server: Invalid server invite token.' });
        }

        if (srvToken.isRevoked) {
          return res.status(403).json({ error: 'Private Server: This server invite token has been revoked or invalidated.' });
        }

        if (srvToken.type === 'one_time' && srvToken.usedCount >= 1) {
          return res.status(403).json({ error: 'Private Server: This single-use server invite token has already been consumed.' });
        }

        // Consume / record usage on token
        await prisma.serverToken.update({
          where: { id: srvToken.id },
          data: {
            usedCount: { increment: 1 },
            lastUsedBy: deviceId,
            isRevoked: srvToken.type === 'one_time' ? true : srvToken.isRevoked,
          },
        });

        authorized = true;
      }
    } else {
      authorized = true;
    }

    const profile = await prisma.userProfile.upsert({
      where: { deviceId },
      update: { friendlyName: nameToSave, authorizedOnServer: authorized },
      create: { deviceId, friendlyName: nameToSave, authorizedOnServer: authorized },
    });

    return res.json({ success: true, profile });
  } catch (err) {
    console.error('Save profile error:', err);
    return res.status(500).json({ error: 'Failed to save user profile.' });
  }
});

/**
 * GET /api/profile/:deviceId
 * Retrieve stored friendlyName for a deviceId
 */
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { deviceId },
    });

    if (!profile) {
      return res.json({ deviceId, friendlyName: 'Anonymous' });
    }

    return res.json(profile);
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

module.exports = router;
