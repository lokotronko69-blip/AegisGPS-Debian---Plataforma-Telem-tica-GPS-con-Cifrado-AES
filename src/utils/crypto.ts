/**
 * Cryptographic utility functions for AES-256 encryption, decryption,
 * key generation and telemetry integrity verification.
 */

// Convert ArrayBuffer to Hex string
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex string to Uint8Array
export function hexToBuffer(hexString: string): Uint8Array {
  const cleanHex = hexString.replace(/\s+/g, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Hex string must have an even length');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Generate random 256-bit AES key in Hex (64 chars)
export function generateAes256KeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bufferToHex(bytes);
}

// Generate random 96-bit (12 byte) IV for AES-GCM or 128-bit (16 byte) IV for AES-CBC
export function generateRandomIv(bytesLength = 12): string {
  const iv = new Uint8Array(bytesLength);
  crypto.getRandomValues(iv);
  return bufferToHex(iv);
}

/**
 * Encrypt a JSON or string payload using AES-256-GCM via Web Crypto API.
 * Returns { ciphertextHex, ivHex, authTagHex }
 */
export async function encryptAes256Gcm(
  plaintext: string,
  keyHex: string,
  customIvHex?: string
): Promise<{ ciphertextHex: string; ivHex: string; authTagHex: string }> {
  const keyBytes = hexToBuffer(keyHex);
  const ivBytes = customIvHex ? hexToBuffer(customIvHex) : crypto.getRandomValues(new Uint8Array(12));
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Web Crypto AES-GCM appends the 16-byte auth tag at the end of the ciphertext
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as ArrayBuffer,
      tagLength: 128,
    },
    cryptoKey,
    data
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  // Split ciphertext and tag
  const tagLengthBytes = 16;
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - tagLengthBytes);
  const authTagBytes = encryptedBytes.slice(encryptedBytes.length - tagLengthBytes);

  return {
    ciphertextHex: bufferToHex(ciphertextBytes),
    ivHex: bufferToHex(ivBytes),
    authTagHex: bufferToHex(authTagBytes),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext using Web Crypto API.
 */
export async function decryptAes256Gcm(
  ciphertextHex: string,
  ivHex: string,
  authTagHex: string,
  keyHex: string
): Promise<string> {
  const keyBytes = hexToBuffer(keyHex);
  const ivBytes = hexToBuffer(ivHex);
  const ciphertextBytes = hexToBuffer(ciphertextHex);
  const tagBytes = hexToBuffer(authTagHex);

  // Concatenate ciphertext and auth tag for Web Crypto
  const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
  combined.set(ciphertextBytes, 0);
  combined.set(tagBytes, ciphertextBytes.length);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as ArrayBuffer,
      tagLength: 128,
    },
    cryptoKey,
    combined as unknown as ArrayBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Calculates standard NMEA checksum for a sentence (e.g. $GPRMC...)
 */
export function calculateNmeaChecksum(sentence: string): string {
  let str = sentence;
  if (str.startsWith('$')) str = str.substring(1);
  const starIndex = str.indexOf('*');
  if (starIndex !== -1) str = str.substring(0, starIndex);

  let checksum = 0;
  for (let i = 0; i < str.length; i++) {
    checksum ^= str.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}
