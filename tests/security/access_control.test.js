const request = require('supertest');
const { app } = require('../../src/server/app');
const prisma = require('../../src/server/db');
const crypto = require('crypto');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

describe('Security & Penetration Tests - Access Control & Attack Mitigation', () => {
  const ownerDeviceId = 'jest-sec-owner-' + Date.now();
  const memberDeviceId = 'jest-sec-member-' + Date.now();
  const attackerDeviceId = 'jest-sec-attacker-' + Date.now();
  const channelPhrase = 'jest security phrase ' + Date.now() + ' shadow';
  const channelId = sha256Hex(channelPhrase);
  let inviteCode = '';

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Security 1: Owner creates channel and generates single-use invite code', async () => {
    const res1 = await request(app)
      .post('/api/channels/join')
      .send({ channelId, deviceId: ownerDeviceId });
    expect(res1.status).toBe(200);
    expect(res1.body.isOwner).toBe(true);

    const res2 = await request(app)
      .post('/api/channels/create-invite')
      .send({ channelId, ownerDeviceId });
    expect(res2.status).toBe(200);
    expect(res2.body.inviteCode).toBeDefined();

    inviteCode = res2.body.inviteCode;
  });

  test('Security 2: Attacker joining WITHOUT single-use invite code returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/channels/join')
      .send({ channelId, deviceId: attackerDeviceId });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('invite code is required');
  });

  test('Security 3: Member joins WITH valid invite code -> consumes code', async () => {
    const res = await request(app)
      .post('/api/channels/join')
      .send({ channelId, deviceId: memberDeviceId, inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  test('Security 4: Attacker attempting to RE-USE consumed invite code returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/channels/join')
      .send({ channelId, deviceId: attackerDeviceId, inviteCode });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('consumed');
  });

  test('Security 5: Pending member attempting to read chat history returns 403 Forbidden', async () => {
    const res = await request(app)
      .get(`/api/channels/${channelId}/messages?deviceId=${memberDeviceId}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('Security 6: Non-owner calling admin endpoint (/create-invite) returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/channels/create-invite')
      .send({ channelId, ownerDeviceId: attackerDeviceId });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Unauthorized');
  });

  test('Security 7: Kicked member attempting to query messages returns 403 Forbidden', async () => {
    // Owner approves member first
    await request(app)
      .post('/api/channels/approve-member')
      .send({ channelId, ownerDeviceId, targetDeviceId: memberDeviceId });

    // Owner kicks member
    await request(app)
      .post('/api/channels/kick')
      .send({ channelId, ownerDeviceId, targetDeviceId: memberDeviceId });

    // Kicked member attempts to read messages
    const res = await request(app)
      .get(`/api/channels/${channelId}/messages?deviceId=${memberDeviceId}`);

    expect(res.status).toBe(403);
  });

  test('Security 8: Non-existent channel message fetch returns 403 Access Denied', async () => {
    const res = await request(app)
      .get(`/api/channels/non_existent_channel_id/messages?deviceId=${attackerDeviceId}`);

    expect(res.status).toBe(403);
  });

  test('Security 9: Custom owner PIN creation and case-insensitive join (tester123)', async () => {
    const customChannelPhrase = 'lumber once gossip flame torch brief';
    const customChannelId = sha256Hex(customChannelPhrase);
    const customOwnerDevice = 'owner-custom-pin-' + Date.now();
    const customMemberDevice = 'member-custom-pin-' + Date.now();

    await prisma.channel.deleteMany({ where: { channelId: customChannelId } });

    const createRes = await request(app)
      .post('/api/channels/join')
      .send({ channelId: customChannelId, deviceId: customOwnerDevice });
    expect(createRes.status).toBe(200);

    const pinRes = await request(app)
      .post('/api/channels/create-invite')
      .send({ channelId: customChannelId, ownerDeviceId: customOwnerDevice, customPin: 'tester123' });
    expect(pinRes.status).toBe(200);
    expect(pinRes.body.inviteCode).toBe('TESTER123');

    const joinRes = await request(app)
      .post('/api/channels/join')
      .send({ channelId: customChannelId, deviceId: customMemberDevice, inviteCode: 'tester123' });
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.status).toBe('pending');
  });

  test('Security 10: Server Profile Save & Fetch and Re-Activation Prevention on Consumed OTP', async () => {
    const testDevice = 'device-profile-' + Date.now();

    // 1. Save Profile
    const saveRes = await request(app)
      .post('/api/profile/save')
      .send({ deviceId: testDevice, friendlyName: 'Alice In Wonderland' });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    // 2. Fetch Profile
    const getRes = await request(app)
      .get(`/api/profile/${testDevice}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.friendlyName).toBe('Alice In Wonderland');

    // 3. Verify owner attempting to reactivate consumed OTP fails with 400
    const reactivateRes = await request(app)
      .post('/api/channels/create-invite')
      .send({ channelId, ownerDeviceId, customPin: inviteCode });
    expect(reactivateRes.status).toBe(400);
    expect(reactivateRes.body.error).toContain('consumed');
  });
});
