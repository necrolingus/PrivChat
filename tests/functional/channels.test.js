const request = require('supertest');
const { app } = require('../../src/server/app');
const crypto = require('crypto');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

describe('Functional Tests - Channel Management & User Workflows', () => {
  const ownerDeviceId = 'jest-func-owner-' + Date.now();
  const memberDeviceId = 'jest-func-member-' + Date.now();
  const channelPhrase = 'jest functional test phrase moon shadow';
  const channelId = sha256Hex(channelPhrase);
  beforeAll(() => {
    process.env.PRIVATE_SERVER = 'false';
  });

  test('Functional 1: User A creates a new channel and becomes active owner', async () => {
    const res = await request(app)
      .post('/api/channels/join')
      .send({ channelId, deviceId: ownerDeviceId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('active');
    expect(res.body.isOwner).toBe(true);
  });

  test('Functional 2: Channel owner generates a single-use invite code', async () => {
    const res = await request(app)
      .post('/api/channels/create-invite')
      .send({ channelId, ownerDeviceId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteCode).toMatch(/^INV-[A-Z0-9]{6}$/);

    inviteCode = res.body.inviteCode;
  });

  test('Functional 3: Active channels list returns owner channel', async () => {
    const res = await request(app)
      .get(`/api/channels/my-channels?deviceId=${ownerDeviceId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.channels).toBeDefined();
    expect(res.body.channels.some((c) => c.channelId === channelId && c.isOwner)).toBe(true);
  });

  test('Functional 4: Non-owner joins channel using invite code -> enters pending state', async () => {
    const res = await request(app)
      .post('/api/channels/join')
      .send({ channelId, deviceId: memberDeviceId, inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  test('Functional 5: Owner fetches pending join requests list', async () => {
    const res = await request(app)
      .get(`/api/channels/${channelId}/pending-members?ownerDeviceId=${ownerDeviceId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pendingMembers).toHaveLength(1);
    expect(res.body.pendingMembers[0].deviceId).toBe(memberDeviceId);
  });

  test('Functional 6: Owner approves pending member', async () => {
    const res = await request(app)
      .post('/api/channels/approve-member')
      .send({ channelId, ownerDeviceId, targetDeviceId: memberDeviceId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Functional 7: Approved member reads chat history successfully', async () => {
    const res = await request(app)
      .get(`/api/channels/${channelId}/messages?deviceId=${memberDeviceId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  test('Functional 8: Owner kicks member from channel', async () => {
    const res = await request(app)
      .post('/api/channels/kick')
      .send({ channelId, ownerDeviceId, targetDeviceId: memberDeviceId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Functional 9: Owner performs dashboard emergency closure & deletion', async () => {
    const res = await request(app)
      .post('/api/channels/leave')
      .send({ channelId, deviceId: ownerDeviceId });

    expect(res.status).toBe(200);
    expect(res.body.isOwnerLeave).toBe(true);
  });
});
