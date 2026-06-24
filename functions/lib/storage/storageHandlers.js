"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testStorageConnectionHandler = testStorageConnectionHandler;
exports.connectStorageProviderHandler = connectStorageProviderHandler;
exports.disconnectStorageProviderHandler = disconnectStorageProviderHandler;
exports.getUploadSignatureHandler = getUploadSignatureHandler;
exports.verifyStorageConnectionHandler = verifyStorageConnectionHandler;
exports.deleteStorageFileHandler = deleteStorageFileHandler;
/**
 * Storage-provider connection handlers (Cloudinary today; the adapter
 * pattern in cloudinaryAdapter.ts is provider-specific, but these handlers'
 * shape — test, connect, disconnect, get-upload-signature — is what a
 * future Firebase Storage / S3 / Supabase provider would also need).
 *
 * Auth pattern matches setStudentPassword / Google Workspace handlers:
 * fetch the caller's users/{uid} doc, require super_admin OR
 * (admin/School_admin scoped to the target schoolId).
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const cloudinaryAdapter_1 = require("./cloudinaryAdapter");
const secretCrypto_1 = require("./secretCrypto");
async function requireSchoolAdmin(authUid, schoolId) {
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile missing.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId && actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only admins of this school may manage its storage connection.');
    }
    return actor;
}
async function testStorageConnectionHandler(authUid, data) {
    const { schoolId, provider, cloudName, apiKey, apiSecret } = data ?? {};
    if (!schoolId || !provider || !cloudName || !apiKey || !apiSecret) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId, provider, cloudName, apiKey and apiSecret are required.');
    }
    if (provider !== 'cloudinary') {
        throw new https_1.HttpsError('invalid-argument', `Unsupported provider: ${provider}`);
    }
    await requireSchoolAdmin(authUid, schoolId);
    const result = await (0, cloudinaryAdapter_1.testCloudinaryCredentials)({ cloudName, apiKey, apiSecret });
    return { ok: result.ok, message: result.message };
}
async function connectStorageProviderHandler(authUid, data) {
    const { schoolId, provider, cloudName, apiKey, apiSecret } = data ?? {};
    if (!schoolId || !provider || !cloudName || !apiKey || !apiSecret) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId, provider, cloudName, apiKey and apiSecret are required.');
    }
    if (provider !== 'cloudinary') {
        throw new https_1.HttpsError('invalid-argument', `Unsupported provider: ${provider}`);
    }
    const actor = await requireSchoolAdmin(authUid, schoolId);
    // Always re-validate server-side before persisting — never trust a client-side "it worked".
    const test = await (0, cloudinaryAdapter_1.testCloudinaryCredentials)({ cloudName, apiKey, apiSecret });
    if (!test.ok) {
        return { ok: false, message: test.message };
    }
    const db = (0, firestore_1.getFirestore)();
    const encrypted = (0, secretCrypto_1.encryptSecret)(apiSecret);
    const now = new Date();
    await db.doc(`storage_settings/${schoolId}`).set({
        schoolId,
        provider,
        cloudName,
        apiKey,
        status: 'connected',
        connectedAt: now,
        connectedBy: authUid,
        updatedAt: now,
    });
    await db.doc(`storage_secrets/${schoolId}`).set({
        apiSecretEncrypted: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedAt: now,
    });
    await db.collection('audit_log').add({
        schoolId,
        actorId: authUid,
        actorEmail: actor.email ?? null,
        actorRole: actor.role ?? null,
        action: 'storage.connected',
        targetProvider: provider,
        createdAt: now,
    });
    return { ok: true, message: 'Cloudinary connected successfully' };
}
async function disconnectStorageProviderHandler(authUid, data) {
    const { schoolId } = data ?? {};
    if (!schoolId)
        throw new https_1.HttpsError('invalid-argument', 'schoolId is required.');
    const actor = await requireSchoolAdmin(authUid, schoolId);
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    await db.doc(`storage_settings/${schoolId}`).set({ status: 'disconnected', updatedAt: now }, { merge: true });
    await db.doc(`storage_secrets/${schoolId}`).delete();
    await db.collection('audit_log').add({
        schoolId,
        actorId: authUid,
        actorEmail: actor.email ?? null,
        actorRole: actor.role ?? null,
        action: 'storage.disconnected',
        createdAt: now,
    });
    return { ok: true };
}
async function getDecryptedCredentials(schoolId) {
    const db = (0, firestore_1.getFirestore)();
    const settingsSnap = await db.doc(`storage_settings/${schoolId}`).get();
    const settings = settingsSnap.data();
    if (!settings || settings.status !== 'connected' || settings.provider !== 'cloudinary') {
        throw new https_1.HttpsError('failed-precondition', 'This school has not connected a storage provider yet.');
    }
    const secretSnap = await db.doc(`storage_secrets/${schoolId}`).get();
    const secretData = secretSnap.data();
    if (!secretData)
        throw new https_1.HttpsError('failed-precondition', 'Storage credentials are missing. Please reconnect.');
    const apiSecret = (0, secretCrypto_1.decryptSecret)({
        ciphertext: secretData.apiSecretEncrypted,
        iv: secretData.iv,
        authTag: secretData.authTag,
    });
    return { cloudName: settings.cloudName, apiKey: settings.apiKey, apiSecret };
}
async function getUploadSignatureHandler(authUid, data) {
    const { schoolId, folder } = data ?? {};
    if (!schoolId || !folder)
        throw new https_1.HttpsError('invalid-argument', 'schoolId and folder are required.');
    // Any authenticated member of the school may upload (teacher uploading a student
    // photo, parent uploading a document, etc.) — not admin-only, unlike connect/disconnect.
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile missing.');
    if (actor.role !== 'super_admin' && actor.schoolId !== schoolId) {
        throw new https_1.HttpsError('permission-denied', 'You do not belong to this school.');
    }
    const creds = await getDecryptedCredentials(schoolId);
    const sanitizedFolder = `schools/${schoolId}/${folder}`.replace(/[^a-zA-Z0-9/_-]/g, '');
    return (0, cloudinaryAdapter_1.generateSignedUploadParams)(creds, sanitizedFolder);
}
/** Re-tests the already-stored credentials for a school (no secret resent from the client). */
async function verifyStorageConnectionHandler(authUid, data) {
    const { schoolId } = data ?? {};
    if (!schoolId)
        throw new https_1.HttpsError('invalid-argument', 'schoolId is required.');
    await requireSchoolAdmin(authUid, schoolId);
    const creds = await getDecryptedCredentials(schoolId);
    const result = await (0, cloudinaryAdapter_1.testCloudinaryCredentials)(creds);
    return { ok: result.ok, message: result.message };
}
async function deleteStorageFileHandler(authUid, data) {
    const { schoolId, publicId } = data ?? {};
    if (!schoolId || !publicId)
        throw new https_1.HttpsError('invalid-argument', 'schoolId and publicId are required.');
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile missing.');
    if (actor.role !== 'super_admin' && actor.schoolId !== schoolId) {
        throw new https_1.HttpsError('permission-denied', 'You do not belong to this school.');
    }
    // publicId is always namespaced schools/{schoolId}/... by getUploadSignatureHandler,
    // so this also guards against deleting another school's asset by a forged id.
    if (!publicId.startsWith(`schools/${schoolId}/`)) {
        throw new https_1.HttpsError('permission-denied', 'This file does not belong to your school.');
    }
    const creds = await getDecryptedCredentials(schoolId);
    await (0, cloudinaryAdapter_1.deleteCloudinaryAsset)(creds, publicId);
    return { ok: true };
}
//# sourceMappingURL=storageHandlers.js.map