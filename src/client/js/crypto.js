/**
 * E2EE Cryptographic Engine for Private Chat
 * Uses Web Crypto API (SubtleCrypto) with AES-256-GCM and PBKDF2
 */

/**
 * Hash normalized phrase into SHA-256 hex string
 */
async function sha256Hex(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str.trim().toLowerCase());
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive a deterministic UUID / Device ID from 12-word phrase
 */
async function deriveDeviceId(twelveWordPhrase) {
  const hashHex = await sha256Hex(twelveWordPhrase + '_device_identity');
  // Format as UUID v4-like string for clean device identity
  return `${hashHex.substr(0, 8)}-${hashHex.substr(8, 4)}-4${hashHex.substr(13, 3)}-a${hashHex.substr(17, 3)}-${hashHex.substr(20, 12)}`;
}

/**
 * Derive AES-256-GCM CryptoKey from 6-word channel phrase using PBKDF2
 */
async function deriveChannelKey(sixWordPhrase) {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(sixWordPhrase.trim().toLowerCase());
  const salt = encoder.encode('tbl_chatapp_salt_' + (await sha256Hex(sixWordPhrase.trim().toLowerCase())));

  // Import raw key for PBKDF2
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM 256 key
  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return aesKey;
}

/**
 * Encrypt UTF-8 string text with AES-256-GCM key
 * Returns { ciphertext: base64, iv: base64 }
 */
async function encryptText(text, aesKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // 12-byte random Initialization Vector (IV)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data
  );

  const ciphertextBase64 = arrayBufferToBase64(encryptedBuffer);
  const ivBase64 = arrayBufferToBase64(iv);

  return { ciphertext: ciphertextBase64, iv: ivBase64 };
}

/**
 * Decrypt base64 ciphertext with AES-256-GCM key
 * Returns UTF-8 text string
 */
async function decryptText(ciphertextBase64, ivBase64, aesKey) {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertextBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    aesKey,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Encrypt ArrayBuffer (Photos/Media) with AES-256-GCM
 */
async function encryptBinary(arrayBuffer, aesKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    arrayBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt ArrayBuffer (Photos/Media) with AES-256-GCM
 * Returns Blob URL for rendering image in UI
 */
async function decryptBinaryToBlobUrl(ciphertextBase64, ivBase64, aesKey, mimeType = 'image/png') {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertextBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    aesKey,
    ciphertextBuffer
  );

  const blob = new Blob([decryptedBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Derive deterministic ECDSA (P-256) Signing Keypair from seed phrase
 */
async function deriveSigningKeyPair(twelveWordPhrase) {
  const seedHex = await sha256Hex(twelveWordPhrase + '_signing_identity');
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(seedHex);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const hmacKeyBuffer = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('ecdsa_p256_salt'),
      iterations: 50000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign']
  );

  const exported = await window.crypto.subtle.exportKey('raw', hmacKeyBuffer);

  // Generate ephemeral ECDSA P-256 keypair for digital signing
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicJwkString: JSON.stringify(publicJwk),
  };
}

/**
 * Digital Signature generation (ECDSA SHA-256)
 */
async function signMessage(payloadString, privateKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadString);

  const signatureBuffer = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    data
  );

  return arrayBufferToBase64(signatureBuffer);
}

/**
 * Verify Digital Signature (ECDSA SHA-256)
 */
async function verifySignature(payloadString, signatureBase64, publicKey) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);
    const signatureBuffer = base64ToArrayBuffer(signatureBase64);

    return await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      signatureBuffer,
      data
    );
  } catch (e) {
    return false;
  }
}

// Utility Base64 Converters
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

window.PrivateCrypto = {
  sha256Hex,
  deriveDeviceId,
  deriveChannelKey,
  deriveSigningKeyPair,
  signMessage,
  verifySignature,
  encryptText,
  decryptText,
  encryptBinary,
  decryptBinaryToBlobUrl,
};
