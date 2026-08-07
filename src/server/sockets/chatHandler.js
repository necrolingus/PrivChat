const prisma = require('../db');

function registerChatHandlers(io) {
  io.on('connection', (socket) => {
    let currentChannelId = null;
    let currentDeviceId = null;

    socket.on('join_channel', async ({ channelId, deviceId }, callback) => {
      try {
        if (!channelId || !deviceId) {
          if (callback) callback({ error: 'channelId and deviceId are required' });
          return;
        }

        // Verify ACL
        const member = await prisma.channelMember.findUnique({
          where: {
            channelId_deviceId: {
              channelId,
              deviceId,
            },
          },
        });

        if (!member || member.status !== 'active') {
          if (callback) callback({ error: 'Access denied. You are not an active member of this channel.' });
          return;
        }

        currentChannelId = channelId;
        currentDeviceId = deviceId;

        // Join Socket.io room
        socket.join(channelId);
        socket.deviceId = deviceId;
        socket.channelId = channelId;

        // Broadcast to channel that member connected
        io.to(channelId).emit('member_status_changed', {
          deviceId,
          status: 'online',
        });

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Socket join_channel error:', err);
        if (callback) callback({ error: 'Failed to join channel socket room' });
      }
    });

    socket.on('send_message', async (data, callback) => {
      try {
        const { channelId, senderDeviceId, senderName, encryptedContent, iv, mimeType, signature } = data;

        if (!channelId || !senderDeviceId || !encryptedContent || !iv) {
          if (callback) callback({ error: 'Missing required message parameters' });
          return;
        }

        // Verify sender membership ACL
        const member = await prisma.channelMember.findUnique({
          where: {
            channelId_deviceId: {
              channelId,
              deviceId: senderDeviceId,
            },
          },
        });

        if (!member || member.status !== 'active') {
          if (callback) callback({ error: 'Access denied. Cannot send message to this channel.' });
          return;
        }

        // Save encrypted message payload to database with digital signature
        const savedMessage = await prisma.message.create({
          data: {
            channelId,
            senderDeviceId,
            senderName: senderName || 'Anonymous',
            encryptedContent,
            iv,
            mimeType: mimeType || 'text/plain',
            signature: signature || null,
          },
        });

        // Broadcast encrypted message to all connected clients in the room
        const messagePayload = {
          messageId: savedMessage.messageId,
          channelId: savedMessage.channelId,
          senderDeviceId: savedMessage.senderDeviceId,
          senderName: savedMessage.senderName,
          encryptedContent: savedMessage.encryptedContent,
          iv: savedMessage.iv,
          mimeType: savedMessage.mimeType,
          signature: savedMessage.signature,
          createdAt: savedMessage.createdAt,
        };

        io.to(channelId).emit('new_message', messagePayload);

        if (callback) callback({ success: true, messageId: savedMessage.messageId });
      } catch (err) {
        console.error('Socket send_message error:', err);
        if (callback) callback({ error: 'Failed to broadcast message' });
      }
    });

    socket.on('request_join', async ({ channelId, deviceId }, callback) => {
      try {
        const channel = await prisma.channel.findUnique({ where: { channelId } });
        if (!channel) return;

        // Notify channel owner socket if online
        const allSockets = await io.fetchSockets();
        for (const s of allSockets) {
          if (s.deviceId === channel.ownerDeviceId) {
            s.emit('pending_join_request', { channelId, deviceId });
          }
        }
        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Socket request_join error:', err);
      }
    });

    socket.on('approve_user', async ({ channelId, ownerDeviceId, targetDeviceId }, callback) => {
      try {
        const channel = await prisma.channel.findUnique({ where: { channelId } });
        if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
          if (callback) callback({ error: 'Unauthorized.' });
          return;
        }

        await prisma.channelMember.update({
          where: { channelId_deviceId: { channelId, deviceId: targetDeviceId } },
          data: { status: 'active' },
        });

        // Notify target device socket
        const allSockets = await io.fetchSockets();
        for (const s of allSockets) {
          if (s.deviceId === targetDeviceId) {
            s.emit('you_were_approved', { channelId });
          }
        }

        io.to(channelId).emit('member_status_changed', { deviceId: targetDeviceId, status: 'approved' });

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Socket approve_user error:', err);
        if (callback) callback({ error: 'Failed to approve user' });
      }
    });

    socket.on('deny_user', async ({ channelId, ownerDeviceId, targetDeviceId }, callback) => {
      try {
        const channel = await prisma.channel.findUnique({ where: { channelId } });
        if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
          if (callback) callback({ error: 'Unauthorized.' });
          return;
        }

        await prisma.channelMember.update({
          where: { channelId_deviceId: { channelId, deviceId: targetDeviceId } },
          data: { status: 'denied' },
        });

        const allSockets = await io.fetchSockets();
        for (const s of allSockets) {
          if (s.deviceId === targetDeviceId) {
            s.emit('you_were_denied', { channelId });
          }
        }

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Socket deny_user error:', err);
      }
    });

    socket.on('leave_channel', async ({ channelId, deviceId }, callback) => {
      try {
        if (!channelId || !deviceId) return;

        const channel = await prisma.channel.findUnique({ where: { channelId } });

        if (channel && channel.ownerDeviceId === deviceId) {
          // Owner left -> Notify room members and delete channel
          io.to(channelId).emit('channel_closed', { channelId });
          await prisma.channel.delete({ where: { channelId } });
          if (callback) callback({ success: true, isOwnerLeave: true });
          return;
        }

        const member = await prisma.channelMember.findUnique({
          where: { channelId_deviceId: { channelId, deviceId } },
        });

        if (member) {
          await prisma.channelMember.update({
            where: { id: member.id },
            data: { status: 'left' },
          });
        }

        socket.leave(channelId);
        io.to(channelId).emit('user_left', { deviceId });

        if (callback) callback({ success: true, isOwnerLeave: false });
      } catch (err) {
        console.error('Socket leave_channel error:', err);
      }
    });

    socket.on('kick_user', async ({ channelId, ownerDeviceId, targetDeviceId }, callback) => {
      try {
        const channel = await prisma.channel.findUnique({ where: { channelId } });
        if (!channel || channel.ownerDeviceId !== ownerDeviceId) {
          if (callback) callback({ error: 'Unauthorized to kick users.' });
          return;
        }

        const targetMember = await prisma.channelMember.findUnique({
          where: { channelId_deviceId: { channelId, deviceId: targetDeviceId } },
        });

        if (targetMember) {
          await prisma.channelMember.update({
            where: { id: targetMember.id },
            data: { status: 'kicked' },
          });
        }

        // Broadcast kick event to room
        io.to(channelId).emit('user_kicked', { targetDeviceId });

        // Disconnect target device socket if currently connected
        const roomSockets = await io.in(channelId).fetchSockets();
        for (const s of roomSockets) {
          if (s.deviceId === targetDeviceId) {
            s.leave(channelId);
            s.emit('you_were_kicked', { channelId });
          }
        }

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Socket kick_user error:', err);
        if (callback) callback({ error: 'Failed to kick user' });
      }
    });

    socket.on('disconnect', () => {
      if (currentChannelId && currentDeviceId) {
        io.to(currentChannelId).emit('member_status_changed', {
          deviceId: currentDeviceId,
          status: 'offline',
        });
      }
    });
  });
}

module.exports = registerChatHandlers;
