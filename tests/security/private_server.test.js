const request = require('supertest');
const { app } = require('../../src/server/app');
const prisma = require('../../src/server/db');
const crypto = require('crypto');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

function deriveDeviceId(phrase) {
  const hashHex = sha256Hex(phrase + '_device_identity');
  return `${hashHex.substr(0, 8)}-${hashHex.substr(8, 4)}-4${hashHex.substr(13, 3)}-a${hashHex.substr(17, 3)}-${hashHex.substr(20, 12)}`;
}

describe('Security & Penetration Tests - Private Server Mode & Admin Control Center', () => {
  const valid32Key = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6'; // Exactly 32 chars alphanumeric
  const invalidShortKey = 'ShortAdminKey123';
  let adminToken = '';
  let oneTimeServerToken = '';
  let foreverServerToken = '';

  beforeAll(async () => {
    process.env.PRIVATE_SERVER = 'true';
    process.env.PRIVATE_SERVER_KEY = valid32Key;
    await prisma.serverToken.deleteMany({});
  });

  afterAll(async () => {
    process.env.PRIVATE_SERVER = 'false';
    await prisma.$disconnect();
  });

  test('Private Server 1: GET /api/admin/config returns isPrivateServer = true', async () => {
    const res = await request(app).get('/api/admin/config');
    expect(res.status).toBe(200);
    expect(res.body.isPrivateServer).toBe(true);
  });

  test('Private Server 2: Login fails when PRIVATE_SERVER_KEY is under 32 characters', async () => {
    process.env.PRIVATE_SERVER_KEY = invalidShortKey;

    const res = await request(app)
      .post('/api/admin/login')
      .send({ adminKey: invalidShortKey });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('at least 32 characters');

    // Reset valid key
    process.env.PRIVATE_SERVER_KEY = valid32Key;
  });

  test('Private Server 3: Admin Login succeeds with valid 32+ character key', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ adminKey: valid32Key });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();

    adminToken = res.body.token;
  });

  test('Private Server 4: Admin creates 1-Time Use Server Invite Token', async () => {
    const res = await request(app)
      .post('/api/admin/tokens/create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'one_time', customToken: 'SRV-TEST-ONETIME' });

    expect(res.status).toBe(200);
    expect(res.body.token.token).toBe('SRV-TEST-ONETIME');
    expect(res.body.token.type).toBe('one_time');

    oneTimeServerToken = res.body.token.token;
  });

  test('Private Server 5: Admin creates Forever Server Invite Token', async () => {
    const res = await request(app)
      .post('/api/admin/tokens/create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'forever', customToken: 'SRV-TEST-FOREVER' });

    expect(res.status).toBe(200);
    expect(res.body.token.token).toBe('SRV-TEST-FOREVER');
    expect(res.body.token.type).toBe('forever');

    foreverServerToken = res.body.token.token;
  });

  test('Private Server 5.1: Token verification endpoint rejects invalid token', async () => {
    const res = await request(app)
      .post('/api/generate/verify-server-token')
      .send({ serverToken: 'SRV-INVALID-GUESS' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Invalid server invite token');
  });

  test('Private Server 5.2: Token verification endpoint accepts valid token', async () => {
    const res = await request(app)
      .post('/api/generate/verify-server-token')
      .send({ serverToken: foreverServerToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isPrivateServer).toBe(true);
  });

  test('Private Server 6: Identity generation rejected without server token when PRIVATE_SERVER=true', async () => {
    const res = await request(app)
      .post('/api/generate/identity-phrase')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Private Server');
  });

  test('Private Server 7: Identity generation succeeds WITH valid Server Invite Token', async () => {
    const res = await request(app)
      .post('/api/generate/identity-phrase')
      .send({ serverToken: foreverServerToken });

    expect(res.status).toBe(200);
    expect(res.body.phrase).toBeDefined();
  });

  test('Private Server 8: User registers & consumes 1-Time Server Token', async () => {
    const genRes = await request(app)
      .post('/api/generate/identity-phrase')
      .send({ serverToken: oneTimeServerToken });
    expect(genRes.status).toBe(200);

    const devId = deriveDeviceId(genRes.body.phrase);

    const saveRes = await request(app)
      .post('/api/profile/save')
      .send({ deviceId: devId, friendlyName: 'PrivateUser1', serverToken: oneTimeServerToken });

    expect(saveRes.status).toBe(200);

    // Verify 1-Time token is now consumed/revoked
    const reuseRes = await request(app)
      .post('/api/generate/identity-phrase')
      .send({ serverToken: oneTimeServerToken });

    expect(reuseRes.status).toBe(403);
    expect(reuseRes.body.error).toMatch(/consumed|revoked/);
  });

  test('Private Server 9: Admin lists all tokens with usage stats', async () => {
    const res = await request(app)
      .get('/api/admin/tokens')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tokens).toBeDefined();
    expect(res.body.tokens.length).toBeGreaterThanOrEqual(2);
  });

  test('Private Server 10: Admin revokes Forever Token -> Immediately blocks access', async () => {
    // Revoke forever token
    const revokeRes = await request(app)
      .post('/api/admin/tokens/revoke')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tokenCode: foreverServerToken });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);

    // Attempt usage with revoked token
    const useRes = await request(app)
      .post('/api/generate/identity-phrase')
      .send({ serverToken: foreverServerToken });

    expect(useRes.status).toBe(403);
    expect(useRes.body.error).toContain('revoked');
  });
});
