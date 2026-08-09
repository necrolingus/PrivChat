const request = require('supertest');
const { app } = require('./src/server/app');
const prisma = require('./src/server/db');
const crypto = require('crypto');
const assert = require('assert');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

function deriveDeviceId(phrase) {
  const hashHex = sha256Hex(phrase + '_device_identity');
  return `${hashHex.substr(0, 8)}-${hashHex.substr(8, 4)}-4${hashHex.substr(13, 3)}-a${hashHex.substr(17, 3)}-${hashHex.substr(20, 12)}`;
}

async function runSuite() {
  console.log('===============================================================');
  console.log('      PRIVCHAT MULTI-USER E2E & SECURITY PENETRATION SUITE     ');
  console.log('===============================================================\n');

  const auditLog = [];

  function log(section, detail) {
    auditLog.push({ section, detail });
    console.log(`[${section}] ${detail}`);
  }

  // --------------------------------------------------------------------------
  // USER 1: ALICE (Channel Owner)
  // --------------------------------------------------------------------------
  log('SETUP', 'Generating Alice identity phrase from server...');
  const aliceGenRes = await request(app).post('/api/generate/identity-phrase');
  const alicePhrase = aliceGenRes.body.phrase;
  const aliceDeviceId = deriveDeviceId(alicePhrase);

  await request(app).post('/api/profile/save').send({ deviceId: aliceDeviceId, friendlyName: 'Alice' });

  log('ALICE', `12-Word Identity Phrase: "${alicePhrase}"`);
  log('ALICE', `Derived Device ID: ${aliceDeviceId}`);
  log('ALICE', `Friendly Display Name: "Alice"`);

  log('SETUP', 'Generating Alice channel phrase from server...');
  const channelGenRes = await request(app).post('/api/generate/channel-phrase');
  const channelPhrase = channelGenRes.body.phrase;
  const channelId = sha256Hex(channelPhrase);

  log('ALICE', `6-Word Channel Key: "${channelPhrase}"`);
  log('ALICE', `Derived Channel ID: ${channelId}`);

  // Alice creates channel with initial OTP
  const initialPin = 'ALICE-PIN-123';
  const aliceJoinRes = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: aliceDeviceId,
  });
  assert.strictEqual(aliceJoinRes.status, 200);
  assert.strictEqual(aliceJoinRes.body.isOwner, true);

  // Register initial OTP
  const createPinRes1 = await request(app).post('/api/channels/create-invite').send({
    channelId,
    ownerDeviceId: aliceDeviceId,
    customPin: initialPin,
  });
  assert.strictEqual(createPinRes1.status, 200);
  log('ALICE', `Created Initial Single-Use PIN: "${createPinRes1.body.inviteCode}"`);

  // Alice creates second OTP
  const createPinRes2 = await request(app).post('/api/channels/create-invite').send({
    channelId,
    ownerDeviceId: aliceDeviceId,
    customPin: 'ALICE-PIN-456',
  });
  assert.strictEqual(createPinRes2.status, 200);
  log('ALICE', `Created Second Single-Use PIN: "${createPinRes2.body.inviteCode}"`);

  // --------------------------------------------------------------------------
  // USER 2: BOB (Member 1)
  // --------------------------------------------------------------------------
  log('SETUP', 'Generating Bob identity phrase from server...');
  const bobGenRes = await request(app).post('/api/generate/identity-phrase');
  const bobPhrase = bobGenRes.body.phrase;
  const bobDeviceId = deriveDeviceId(bobPhrase);
  await request(app).post('/api/profile/save').send({ deviceId: bobDeviceId, friendlyName: 'Bob' });

  log('BOB', `12-Word Identity Phrase: "${bobPhrase}"`);
  log('BOB', `Derived Device ID: ${bobDeviceId}`);

  // Bob joins using initial PIN "ALICE-PIN-123"
  const bobJoinRes = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: bobDeviceId,
    inviteCode: 'ALICE-PIN-123',
  });
  assert.strictEqual(bobJoinRes.status, 200);
  assert.strictEqual(bobJoinRes.body.status, 'pending');
  log('BOB', `Submitted join request with PIN "ALICE-PIN-123" -> Status: PENDING`);

  // Alice approves Bob
  const approveBobRes = await request(app).post('/api/channels/approve-member').send({
    channelId,
    ownerDeviceId: aliceDeviceId,
    targetDeviceId: bobDeviceId,
  });
  assert.strictEqual(approveBobRes.status, 200);
  log('ALICE', `Approved Bob (${bobDeviceId}) -> Status: ACTIVE`);

  // --------------------------------------------------------------------------
  // USER 3: CHARLIE (Member 2)
  // --------------------------------------------------------------------------
  log('SETUP', 'Generating Charlie identity phrase from server...');
  const charlieGenRes = await request(app).post('/api/generate/identity-phrase');
  const charliePhrase = charlieGenRes.body.phrase;
  const charlieDeviceId = deriveDeviceId(charliePhrase);
  await request(app).post('/api/profile/save').send({ deviceId: charlieDeviceId, friendlyName: 'Charlie' });

  log('CHARLIE', `12-Word Identity Phrase: "${charliePhrase}"`);
  log('CHARLIE', `Derived Device ID: ${charlieDeviceId}`);

  // Charlie joins using second PIN "ALICE-PIN-456"
  const charlieJoinRes = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: charlieDeviceId,
    inviteCode: 'ALICE-PIN-456',
  });
  assert.strictEqual(charlieJoinRes.status, 200);
  assert.strictEqual(charlieJoinRes.body.status, 'pending');
  log('CHARLIE', `Submitted join request with PIN "ALICE-PIN-456" -> Status: PENDING`);

  // Alice approves Charlie
  const approveCharlieRes = await request(app).post('/api/channels/approve-member').send({
    channelId,
    ownerDeviceId: aliceDeviceId,
    targetDeviceId: charlieDeviceId,
  });
  assert.strictEqual(approveCharlieRes.status, 200);
  log('ALICE', `Approved Charlie (${charlieDeviceId}) -> Status: ACTIVE`);

  // Verify Active Members
  const membersRes = await request(app).get(`/api/channels/${channelId}/members?deviceId=${aliceDeviceId}`);
  assert.strictEqual(membersRes.status, 200);
  assert.strictEqual(membersRes.body.members.length, 3);
  log('MEMBERS', `Channel has 3 active members: Alice, Bob, Charlie.`);

  // --------------------------------------------------------------------------
  // USER 4: EVE (Attacker - Security Penetration Suite)
  // --------------------------------------------------------------------------
  log('SETUP', 'Generating Eve (Attacker) identity phrase from server...');
  const eveGenRes = await request(app).post('/api/generate/identity-phrase');
  const evePhrase = eveGenRes.body.phrase;
  const eveDeviceId = deriveDeviceId(evePhrase);
  await request(app).post('/api/profile/save').send({ deviceId: eveDeviceId, friendlyName: 'Eve (Attacker)' });

  log('EVE', `12-Word Identity Phrase: "${evePhrase}"`);
  log('EVE', `Derived Device ID: ${eveDeviceId}`);

  // ATTACK 1: Missing PIN
  const attack1 = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: eveDeviceId,
  });
  assert.strictEqual(attack1.status, 400);
  log('SECURITY_PASS', `Attack 1 (Missing PIN) -> 400 Bad Request: "${attack1.body.error}"`);

  // ATTACK 2: OTP Non-Reuse (consumed PIN "ALICE-PIN-123")
  const attack2 = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: eveDeviceId,
    inviteCode: 'ALICE-PIN-123',
  });
  assert.strictEqual(attack2.status, 400);
  assert.ok(attack2.body.error.includes('consumed'));
  log('SECURITY_PASS', `Attack 2 (Reuse consumed OTP "ALICE-PIN-123") -> 400 Bad Request: "${attack2.body.error}"`);

  // ATTACK 3: OTP Non-Reuse under new identity
  const eve2GenRes = await request(app).post('/api/generate/identity-phrase');
  const eve2DeviceId = deriveDeviceId(eve2GenRes.body.phrase);
  const attack3 = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: eve2DeviceId,
    inviteCode: 'ALICE-PIN-456',
  });
  assert.strictEqual(attack3.status, 400);
  assert.ok(attack3.body.error.includes('consumed'));
  log('SECURITY_PASS', `Attack 3 (Reuse consumed OTP under fresh identity) -> 400 Bad Request: "${attack3.body.error}"`);

  // ATTACK 4: Brute Force Invalid PIN
  const attack4 = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: eveDeviceId,
    inviteCode: 'INVALID-PIN-999',
  });
  assert.strictEqual(attack4.status, 400);
  log('SECURITY_PASS', `Attack 4 (Brute Force PIN "INVALID-PIN-999") -> 400 Bad Request: "${attack4.body.error}"`);

  // ATTACK 5: Unauthorized Admin Route Call (/create-invite)
  const attack5 = await request(app).post('/api/channels/create-invite').send({
    channelId,
    ownerDeviceId: eveDeviceId,
    customPin: 'EVE-PIN-FAIL',
  });
  assert.strictEqual(attack5.status, 403);
  log('SECURITY_PASS', `Attack 5 (Unauthorized /create-invite call) -> 403 Forbidden: "${attack5.body.error}"`);

  // ATTACK 6: Unauthorized Kick
  const attack6 = await request(app).post('/api/channels/kick').send({
    channelId,
    ownerDeviceId: eveDeviceId,
    targetDeviceId: bobDeviceId,
  });
  assert.strictEqual(attack6.status, 403);
  log('SECURITY_PASS', `Attack 6 (Unauthorized /kick call) -> 403 Forbidden: "${attack6.body.error}"`);

  // ATTACK 7: Unauthorized Message Fetch
  const attack7 = await request(app).get(`/api/channels/${channelId}/messages?deviceId=${eveDeviceId}`);
  assert.strictEqual(attack7.status, 403);
  log('SECURITY_PASS', `Attack 7 (Unauthorized /messages fetch) -> 403 Access Denied: "${attack7.body.error}"`);

  // ATTACK 8: Reactivate consumed PIN by owner
  const attack8 = await request(app).post('/api/channels/create-invite').send({
    channelId,
    ownerDeviceId: aliceDeviceId,
    customPin: 'ALICE-PIN-123',
  });
  assert.strictEqual(attack8.status, 400);
  assert.ok(attack8.body.error.includes('consumed'));
  log('SECURITY_PASS', `Attack 8 (Owner reactivate consumed PIN) -> 400 Bad Request: "${attack8.body.error}"`);

  // --------------------------------------------------------------------------
  // LIFECYCLE & DISPOSITION TESTING (Kicking, Leaving, Closing)
  // --------------------------------------------------------------------------
  // Alice kicks Charlie
  const kickRes = await request(app).post('/api/channels/kick').send({
    channelId,
    ownerDeviceId: aliceDeviceId,
    targetDeviceId: charlieDeviceId,
  });
  assert.strictEqual(kickRes.status, 200);
  log('ALICE', `Kicked Charlie (${charlieDeviceId}) permanently.`);

  // Verify Charlie cannot fetch messages
  const charlieMsgRes = await request(app).get(`/api/channels/${channelId}/messages?deviceId=${charlieDeviceId}`);
  assert.strictEqual(charlieMsgRes.status, 403);
  log('CHARLIE', `Attempted message fetch after kick -> 403 Forbidden.`);

  // Verify Charlie cannot rejoin
  const charlieRejoinRes = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: charlieDeviceId,
  });
  assert.strictEqual(charlieRejoinRes.status, 403);
  log('CHARLIE', `Attempted rejoin after kick -> 403 Forbidden.`);

  // Bob leaves channel
  const bobLeaveRes = await request(app).post('/api/channels/leave').send({
    channelId,
    deviceId: bobDeviceId,
  });
  assert.strictEqual(bobLeaveRes.status, 200);
  log('BOB', `Bob left channel permanently.`);

  // Verify Bob cannot rejoin
  const bobRejoinRes = await request(app).post('/api/channels/join').send({
    channelId,
    deviceId: bobDeviceId,
  });
  assert.strictEqual(bobRejoinRes.status, 403);
  log('BOB', `Attempted rejoin after leaving -> 403 Forbidden.`);

  // Alice permanently closes channel
  const aliceCloseRes = await request(app).post('/api/channels/leave').send({
    channelId,
    deviceId: aliceDeviceId,
  });
  assert.strictEqual(aliceCloseRes.status, 200);
  assert.strictEqual(aliceCloseRes.body.isOwnerLeave, true);
  log('ALICE', `Alice (Owner) closed channel -> Permanently deleted from database.`);

  // Verify database tables are clean after deletion
  const dbChannelCount = await prisma.channel.count({ where: { channelId } });
  const dbMemberCount = await prisma.channelMember.count({ where: { channelId } });
  const dbInviteCount = await prisma.channelInvite.count({ where: { channelId } });
  assert.strictEqual(dbChannelCount, 0);
  assert.strictEqual(dbMemberCount, 0);
  assert.strictEqual(dbInviteCount, 0);

  log('DATABASE', `Confirmed: Channel, members, and invites completely purged from database.`);

  console.log('\n===============================================================');
  console.log('             ALL E2E & SECURITY PENETRATION TESTS PASSED         ');
  console.log('===============================================================\n');

  await prisma.$disconnect();
  return auditLog;
}

runSuite().catch((err) => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
