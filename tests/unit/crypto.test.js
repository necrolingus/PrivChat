const crypto = require('crypto');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

function generateRandomInviteCode() {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INV-${randomHex}`;
}

describe('Unit Tests - Cryptographic Operations & Key Derivation', () => {
  test('SHA-256 Hex Hash function produces 64-character deterministic hex digest', () => {
    const input1 = 'coffee tiger river spark moon shadow';
    const input2 = 'COFFEE TIGER RIVER SPARK MOON SHADOW';
    
    const hash1 = sha256Hex(input1);
    const hash2 = sha256Hex(input2);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2); // Case insensitive normalization
  });

  test('Distinct 6-word channel phrases produce non-colliding SHA-256 hex channel IDs', () => {
    const phraseA = 'coffee tiger river spark moon shadow';
    const phraseB = 'abandon ability able about above absent';

    const hashA = sha256Hex(phraseA);
    const hashB = sha256Hex(phraseB);

    expect(hashA).not.toBe(hashB);
  });

  test('Single-Use Invite Code Generator produces INV- prefixed 10-character code', () => {
    const code1 = generateRandomInviteCode();
    const code2 = generateRandomInviteCode();

    expect(code1).toMatch(/^INV-[A-Z0-9]{6}$/);
    expect(code2).toMatch(/^INV-[A-Z0-9]{6}$/);
    expect(code1).not.toBe(code2);
  });

  test('Mathematical entropy calculation for 12-word seed phrase (132-bit entropy)', () => {
    const dictionarySize = 2048; // BIP-39 dictionary
    const seedLength = 12;
    
    const totalCombinations = Math.pow(dictionarySize, seedLength);
    const bitsOfEntropy = Math.log2(totalCombinations);

    expect(bitsOfEntropy).toBe(132);
    expect(totalCombinations).toBeGreaterThan(1e39);
  });
});
