const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../db');

// Dedicated rate limiters for security
const channelActionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: 'Too many channel requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const fetchMessagesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // 60 fetches per minute
  message: { error: 'Too many message requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(channelActionLimiter);

/**
 * Fetch all active channels for a given deviceId
 * GET /api/channels/my-channels?deviceId=...
 */
router.get('/my-channels', async (req, res) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId query parameter is required' });
    }

    const memberships = await prisma.channelMember.findMany({
      where: {
        deviceId: String(deviceId),
        status: 'active',
      },
      include: {
        channel: true,
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    const activeChannels = memberships.map((m) => ({
      channelId: m.channelId,
      isOwner: m.channel.ownerDeviceId === String(deviceId),
      joinedAt: m.joinedAt,
      createdAt: m.channel.createdAt,
    }));

    return res.json({ success: true, channels: activeChannels });
  } catch (error) {
    console.error('Error fetching my-channels:', error);
    return res.status(500).json({ error: 'Internal server error while fetching user channels' });
  }
});

/**
 * Create a Single-Use Invite Code or Custom PIN (Channel Owner only)
 * POST /api/channels/create-invite
 */
router.post('/create-invite', async (req, res) => {
  try {
    const { channelId, ownerDeviceId, customPin, inviteCode: requestedCode } = req.body;

    if (!channelId || !ownerDeviceId) {
      return res.status(400).json({ error: 'channelId and ownerDeviceId are required' });
    }

    const channel = await prisma.channel.findUnique({ where: { channelId } });
    if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({ error: 'Unauthorized. Only channel owner can create invite codes.' });
    }

    const crypto = require('crypto');
    const rawPin = customPin || requestedCode || (`INV-${crypto.randomBytes(3).toString('hex')}`);
    const codeToSave = String(rawPin).trim().toUpperCase();

    const existingInvite = await prisma.channelInvite.findUnique({
      where: {
        channelId_inviteCode: {
          channelId,
          inviteCode: codeToSave,
        },
      },
    });

    if (existingInvite && existingInvite.isUsed) {
      return res.status(400).json({ error: 'This One-Time PIN has already been consumed and cannot be reused or reactivated. Please use a different PIN.' });
    }

    const invite = await prisma.channelInvite.upsert({
      where: {
        channelId_inviteCode: {
          channelId,
          inviteCode: codeToSave,
        },
      },
      update: {
        isUsed: false,
        usedBy: null,
      },
      create: {
        channelId,
        inviteCode: codeToSave,
        isUsed: false,
      },
    });

    return res.json({ success: true, inviteCode: invite.inviteCode, createdAt: invite.createdAt });
  } catch (error) {
    console.error('Error creating invite code:', error);
    return res.status(500).json({ error: 'Internal server error while creating invite code' });
  }
});

/**
 * Join or create a channel
 * POST /api/channels/join
 */
router.post('/join', async (req, res) => {
  try {
    const { channelId, deviceId, publicSigningKey, inviteCode } = req.body;

    if (!channelId || !deviceId) {
      return res.status(400).json({ error: 'channelId and deviceId are required' });
    }

    let channel = await prisma.channel.findUnique({
      where: { channelId },
    });

    let isOwner = false;

    if (!channel) {
      // First user to join creates the channel and becomes the owner (always active)
      channel = await prisma.channel.create({
        data: {
          channelId,
          ownerDeviceId: deviceId,
          requiresApproval: true,
          privacyMode: 'restricted',
        },
      });
      isOwner = true;
    } else {
      isOwner = channel.ownerDeviceId === deviceId;
    }

    // Check member status
    const existingMember = await prisma.channelMember.findUnique({
      where: {
        channelId_deviceId: {
          channelId,
          deviceId,
        },
      },
    });

    if (existingMember) {
      if (existingMember.status === 'kicked') {
        return res.status(403).json({ error: 'You have been kicked from this channel and cannot return.' });
      }
      if (existingMember.status === 'left') {
        return res.status(403).json({ error: 'You have left this channel and cannot return.' });
      }
      if (existingMember.status === 'denied') {
        return res.status(403).json({ error: 'Your request to join this channel was denied by the owner.' });
      }
      if (existingMember.status === 'pending') {
        return res.json({
          success: true,
          status: 'pending',
          isOwner: false,
          message: 'Waiting for channel owner approval.',
        });
      }
      // Active member
      return res.json({
        success: true,
        status: 'active',
        channelId: channel.channelId,
        isOwner,
        createdAt: channel.createdAt,
      });
    }

    // Non-owner joining for the first time requires a valid single-use invite code
    if (!isOwner) {
      if (!inviteCode) {
        return res.status(400).json({ error: 'Single-use invite code is required to join this channel. Ask the channel owner for an invite.' });
      }

      const codeToFind = String(inviteCode).trim().toUpperCase();

      const invite = await prisma.channelInvite.findFirst({
        where: {
          channelId: channelId,
          inviteCode: codeToFind,
        },
      });

      if (!invite || invite.isUsed) {
        return res.status(400).json({ error: 'Invalid or already consumed single-use invite code. Please request a new invite code from the channel owner.' });
      }

      // Mark invite code as used by this device
      await prisma.channelInvite.update({
        where: { id: invite.id },
        data: { isUsed: true, usedBy: deviceId },
      });
    }

    // New non-owner member joining
    const initialStatus = isOwner || !channel.requiresApproval ? 'active' : 'pending';

    await prisma.channelMember.create({
      data: {
        channelId,
        deviceId,
        status: initialStatus,
        publicSigningKey: publicSigningKey || null,
      },
    });

    return res.json({
      success: true,
      status: initialStatus,
      channelId: channel.channelId,
      isOwner,
      createdAt: channel.createdAt,
    });
  } catch (error) {
    console.error('Error joining channel:', error);
    return res.status(500).json({ error: 'Internal server error while joining channel' });
  }
});

/**
 * Fetch pending join requests for channel owner
 * GET /api/channels/:channelId/pending-members?ownerDeviceId=...
 */
router.get('/:channelId/pending-members', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { ownerDeviceId } = req.query;

    const channel = await prisma.channel.findUnique({ where: { channelId } });
    if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({ error: 'Unauthorized. Only channel owner can view pending join requests.' });
    }

    const pendingMembers = await prisma.channelMember.findMany({
      where: { channelId, status: 'pending' },
      select: { deviceId: true, joinedAt: true, publicSigningKey: true },
    });

    return res.json({ success: true, pendingMembers });
  } catch (error) {
    console.error('Error fetching pending members:', error);
    return res.status(500).json({ error: 'Failed to fetch pending join requests' });
  }
});

/**
 * Approve member join request (Owner action)
 * POST /api/channels/approve-member
 */
router.post('/approve-member', async (req, res) => {
  try {
    const { channelId, ownerDeviceId, targetDeviceId } = req.body;

    const channel = await prisma.channel.findUnique({ where: { channelId } });
    if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({ error: 'Unauthorized. Only owner can approve members.' });
    }

    const member = await prisma.channelMember.findUnique({
      where: { channelId_deviceId: { channelId, deviceId: targetDeviceId } },
    });

    if (!member) {
      return res.status(444).json({ error: 'Target member not found.' });
    }

    await prisma.channelMember.update({
      where: { id: member.id },
      data: { status: 'active' },
    });

    return res.json({ success: true, message: 'Member approved successfully.' });
  } catch (error) {
    console.error('Error approving member:', error);
    return res.status(500).json({ error: 'Internal server error while approving member' });
  }
});

/**
 * Deny member join request (Owner action)
 * POST /api/channels/deny-member
 */
router.post('/deny-member', async (req, res) => {
  try {
    const { channelId, ownerDeviceId, targetDeviceId } = req.body;

    const channel = await prisma.channel.findUnique({ where: { channelId } });
    if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({ error: 'Unauthorized. Only owner can deny members.' });
    }

    const member = await prisma.channelMember.findUnique({
      where: { channelId_deviceId: { channelId, deviceId: targetDeviceId } },
    });

    if (member) {
      await prisma.channelMember.update({
        where: { id: member.id },
        data: { status: 'denied' },
      });
    }

    return res.json({ success: true, message: 'Member request denied.' });
  } catch (error) {
    console.error('Error denying member:', error);
    return res.status(500).json({ error: 'Internal server error while denying member' });
  }
});

/**
 * Fetch historical messages for active member
 * GET /api/channels/:channelId/messages?deviceId=...
 */
router.get('/:channelId/messages', fetchMessagesLimiter, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { deviceId } = req.query;

    if (!channelId || !deviceId) {
      return res.status(400).json({ error: 'channelId and deviceId query parameter are required' });
    }

    // Verify membership ACL
    const member = await prisma.channelMember.findUnique({
      where: {
        channelId_deviceId: {
          channelId,
          deviceId: String(deviceId),
        },
      },
    });

    if (!member || member.status !== 'active') {
      return res.status(403).json({ error: 'Access denied. You are not an active member of this channel.' });
    }

    const messages = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      select: {
        messageId: true,
        channelId: true,
        senderDeviceId: true,
        senderName: true,
        encryptedContent: true,
        iv: true,
        mimeType: true,
        createdAt: true,
      },
    });

    return res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Internal server error while fetching messages' });
  }
});

/**
 * Fetch active channel members
 * GET /api/channels/:channelId/members?deviceId=...
 */
router.get('/:channelId/members', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { deviceId } = req.query;

    if (!channelId || !deviceId) {
      return res.status(400).json({ error: 'channelId and deviceId query parameter are required' });
    }

    const member = await prisma.channelMember.findUnique({
      where: {
        channelId_deviceId: {
          channelId,
          deviceId: String(deviceId),
        },
      },
    });

    if (!member || member.status !== 'active') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const channel = await prisma.channel.findUnique({
      where: { channelId },
    });

    const activeMembers = await prisma.channelMember.findMany({
      where: {
        channelId,
        status: 'active',
      },
      select: {
        deviceId: true,
        joinedAt: true,
      },
    });

    // Enrich members with friendly names from profiles
    const deviceIds = activeMembers.map((m) => m.deviceId);
    const profiles = await prisma.userProfile.findMany({
      where: { deviceId: { in: deviceIds } },
      select: { deviceId: true, friendlyName: true },
    });
    const profileMap = {};
    profiles.forEach((p) => { profileMap[p.deviceId] = p.friendlyName; });

    const enrichedMembers = activeMembers.map((m) => ({
      deviceId: m.deviceId,
      joinedAt: m.joinedAt,
      friendlyName: profileMap[m.deviceId] || 'Anonymous',
    }));

    return res.json({
      success: true,
      ownerDeviceId: channel.ownerDeviceId,
      members: enrichedMembers,
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return res.status(500).json({ error: 'Internal server error while fetching members' });
  }
});

/**
 * User leaves channel
 * POST /api/channels/leave
 */
router.post('/leave', async (req, res) => {
  try {
    const { channelId, deviceId } = req.body;

    if (!channelId || !deviceId) {
      return res.status(400).json({ error: 'channelId and deviceId are required' });
    }

    const channel = await prisma.channel.findUnique({
      where: { channelId },
    });

    if (channel && channel.ownerDeviceId === deviceId) {
      // Owner is leaving -> Delete entire channel and all member/message records
      await prisma.channel.delete({
        where: { channelId },
      });
      return res.json({ success: true, isOwnerLeave: true, message: 'Channel closed and permanently deleted by owner.' });
    }

    const member = await prisma.channelMember.findUnique({
      where: {
        channelId_deviceId: {
          channelId,
          deviceId,
        },
      },
    });

    if (member) {
      await prisma.channelMember.update({
        where: { id: member.id },
        data: { status: 'left' },
      });
    }

    return res.json({ success: true, isOwnerLeave: false, message: 'You have left the channel permanently.' });
  } catch (error) {
    console.error('Error leaving channel:', error);
    return res.status(500).json({ error: 'Internal server error while leaving channel' });
  }
});

/**
 * Channel owner kicks a user
 * POST /api/channels/kick
 */
router.post('/kick', async (req, res) => {
  try {
    const { channelId, ownerDeviceId, targetDeviceId } = req.body;

    if (!channelId || !ownerDeviceId || !targetDeviceId) {
      return res.status(400).json({ error: 'channelId, ownerDeviceId, and targetDeviceId are required' });
    }

    const channel = await prisma.channel.findUnique({
      where: { channelId },
    });

    if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({ error: 'Unauthorized. Only the channel owner can kick users.' });
    }

    if (ownerDeviceId === targetDeviceId) {
      return res.status(400).json({ error: 'Channel owner cannot kick themselves. Leave channel instead.' });
    }

    const targetMember = await prisma.channelMember.findUnique({
      where: {
        channelId_deviceId: {
          channelId,
          deviceId: targetDeviceId,
        },
      },
    });

    if (targetMember) {
      await prisma.channelMember.update({
        where: { id: targetMember.id },
        data: { status: 'kicked' },
      });
    }

    return res.json({ success: true, message: 'User kicked successfully.' });
  } catch (error) {
    console.error('Error kicking user:', error);
    return res.status(500).json({ error: 'Internal server error while kicking user' });
  }
});

module.exports = router;
