const express = require('express');
const router = express.Router();
const prisma = require('../db');

/**
 * POST /api/profile/save
 * Upsert friendlyName for a deviceId
 */
router.post('/save', async (req, res) => {
  try {
    const { deviceId, friendlyName } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const nameToSave = (friendlyName || '').trim() || 'Anonymous';

    const profile = await prisma.userProfile.upsert({
      where: { deviceId },
      update: { friendlyName: nameToSave },
      create: { deviceId, friendlyName: nameToSave },
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
