"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
/**
 * AES-256-GCM encrypt/decrypt for third-party storage-provider secrets
 * (e.g. a Cloudinary API secret) before they're persisted to Firestore.
 *
 * Key comes from STORAGE_ENCRYPTION_KEY (functions/.env), a 64-char hex
 * string (32 bytes), matching this project's existing convention of plain
 * process.env vars for Cloud Functions secrets (see GOOGLE_CLIENT_SECRET).
 */
const crypto_1 = require("crypto");
function getKey() {
    const hex = process.env.STORAGE_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('STORAGE_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes).');
    }
    return Buffer.from(hex, 'hex');
}
function encryptSecret(plaintext) {
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    };
}
function decryptSecret(enc) {
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', getKey(), Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.authTag, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(enc.ciphertext, 'base64')),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}
//# sourceMappingURL=secretCrypto.js.map