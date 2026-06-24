/**
 * AES-256-GCM encrypt/decrypt for third-party storage-provider secrets
 * (e.g. a Cloudinary API secret) before they're persisted to Firestore.
 *
 * Key comes from STORAGE_ENCRYPTION_KEY (functions/.env), a 64-char hex
 * string (32 bytes), matching this project's existing convention of plain
 * process.env vars for Cloud Functions secrets (see GOOGLE_CLIENT_SECRET).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function getKey(): Buffer {
  const hex = process.env.STORAGE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('STORAGE_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string;          // base64
  authTag: string;     // base64
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(enc: EncryptedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(enc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(enc.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
