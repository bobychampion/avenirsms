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
import { HttpsError } from '../compat/httpsError.js';
import { getFirestore } from 'firebase-admin/firestore';
import {
  testCloudinaryCredentials,
  generateSignedUploadParams,
  deleteCloudinaryAsset,
  CloudinaryCredentials,
} from './cloudinaryAdapter.js';
import { encryptSecret, decryptSecret } from './secretCrypto.js';

async function requireSchoolAdmin(authUid: string, schoolId: string) {
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  if (!actor) throw new HttpsError('not-found', 'User profile missing.');

  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId && actor.schoolId === schoolId;
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError('permission-denied', 'Only admins of this school may manage its storage connection.');
  }
  return actor;
}

export interface TestStorageConnectionRequest {
  schoolId: string;
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}
export interface TestStorageConnectionResponse {
  ok: boolean;
  message: string;
}

export async function testStorageConnectionHandler(
  authUid: string,
  data: TestStorageConnectionRequest
): Promise<TestStorageConnectionResponse> {
  const { schoolId, provider, cloudName, apiKey, apiSecret } = data ?? ({} as TestStorageConnectionRequest);
  if (!schoolId || !provider || !cloudName || !apiKey || !apiSecret) {
    throw new HttpsError('invalid-argument', 'schoolId, provider, cloudName, apiKey and apiSecret are required.');
  }
  if (provider !== 'cloudinary') {
    throw new HttpsError('invalid-argument', `Unsupported provider: ${provider}`);
  }
  await requireSchoolAdmin(authUid, schoolId);

  const result = await testCloudinaryCredentials({ cloudName, apiKey, apiSecret });
  return { ok: result.ok, message: result.message };
}

export interface ConnectStorageProviderRequest extends TestStorageConnectionRequest {}
export interface ConnectStorageProviderResponse {
  ok: boolean;
  message: string;
}

export async function connectStorageProviderHandler(
  authUid: string,
  data: ConnectStorageProviderRequest
): Promise<ConnectStorageProviderResponse> {
  const { schoolId, provider, cloudName, apiKey, apiSecret } = data ?? ({} as ConnectStorageProviderRequest);
  if (!schoolId || !provider || !cloudName || !apiKey || !apiSecret) {
    throw new HttpsError('invalid-argument', 'schoolId, provider, cloudName, apiKey and apiSecret are required.');
  }
  if (provider !== 'cloudinary') {
    throw new HttpsError('invalid-argument', `Unsupported provider: ${provider}`);
  }
  const actor = await requireSchoolAdmin(authUid, schoolId);

  // Always re-validate server-side before persisting — never trust a client-side "it worked".
  const test = await testCloudinaryCredentials({ cloudName, apiKey, apiSecret });
  if (!test.ok) {
    return { ok: false, message: test.message };
  }

  const db = getFirestore();
  const encrypted = encryptSecret(apiSecret);
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

export interface DisconnectStorageProviderRequest {
  schoolId: string;
}

export async function disconnectStorageProviderHandler(
  authUid: string,
  data: DisconnectStorageProviderRequest
): Promise<{ ok: true }> {
  const { schoolId } = data ?? ({} as DisconnectStorageProviderRequest);
  if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId is required.');
  const actor = await requireSchoolAdmin(authUid, schoolId);

  const db = getFirestore();
  const now = new Date();
  await db.doc(`storage_settings/${schoolId}`).set(
    { status: 'disconnected', updatedAt: now },
    { merge: true }
  );
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

async function getDecryptedCredentials(schoolId: string): Promise<CloudinaryCredentials> {
  const db = getFirestore();
  const settingsSnap = await db.doc(`storage_settings/${schoolId}`).get();
  const settings = settingsSnap.data();
  if (!settings || settings.status !== 'connected' || settings.provider !== 'cloudinary') {
    throw new HttpsError('failed-precondition', 'This school has not connected a storage provider yet.');
  }
  const secretSnap = await db.doc(`storage_secrets/${schoolId}`).get();
  const secretData = secretSnap.data();
  if (!secretData) throw new HttpsError('failed-precondition', 'Storage credentials are missing. Please reconnect.');

  const apiSecret = decryptSecret({
    ciphertext: secretData.apiSecretEncrypted,
    iv: secretData.iv,
    authTag: secretData.authTag,
  });
  return { cloudName: settings.cloudName, apiKey: settings.apiKey, apiSecret };
}

export interface GetUploadSignatureRequest {
  schoolId: string;
  folder: string; // e.g. 'students', 'documents', 'logos'
}
export interface GetUploadSignatureResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export async function getUploadSignatureHandler(
  authUid: string,
  data: GetUploadSignatureRequest
): Promise<GetUploadSignatureResponse> {
  const { schoolId, folder } = data ?? ({} as GetUploadSignatureRequest);
  if (!schoolId || !folder) throw new HttpsError('invalid-argument', 'schoolId and folder are required.');
  // Any authenticated member of the school may upload (teacher uploading a student
  // photo, parent uploading a document, etc.) — not admin-only, unlike connect/disconnect.
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  if (!actor) throw new HttpsError('not-found', 'User profile missing.');
  if (actor.role !== 'super_admin' && actor.schoolId !== schoolId) {
    throw new HttpsError('permission-denied', 'You do not belong to this school.');
  }

  const creds = await getDecryptedCredentials(schoolId);
  const sanitizedFolder = `schools/${schoolId}/${folder}`.replace(/[^a-zA-Z0-9/_-]/g, '');

  return generateSignedUploadParams(creds, sanitizedFolder);
}

export interface VerifyStorageConnectionRequest {
  schoolId: string;
}

/** Re-tests the already-stored credentials for a school (no secret resent from the client). */
export async function verifyStorageConnectionHandler(
  authUid: string,
  data: VerifyStorageConnectionRequest
): Promise<TestStorageConnectionResponse> {
  const { schoolId } = data ?? ({} as VerifyStorageConnectionRequest);
  if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId is required.');
  await requireSchoolAdmin(authUid, schoolId);

  const creds = await getDecryptedCredentials(schoolId);
  const result = await testCloudinaryCredentials(creds);
  return { ok: result.ok, message: result.message };
}

export interface DeleteStorageFileRequest {
  schoolId: string;
  publicId: string;
}

export async function deleteStorageFileHandler(
  authUid: string,
  data: DeleteStorageFileRequest
): Promise<{ ok: true }> {
  const { schoolId, publicId } = data ?? ({} as DeleteStorageFileRequest);
  if (!schoolId || !publicId) throw new HttpsError('invalid-argument', 'schoolId and publicId are required.');
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  if (!actor) throw new HttpsError('not-found', 'User profile missing.');
  if (actor.role !== 'super_admin' && actor.schoolId !== schoolId) {
    throw new HttpsError('permission-denied', 'You do not belong to this school.');
  }
  // publicId is always namespaced schools/{schoolId}/... by getUploadSignatureHandler,
  // so this also guards against deleting another school's asset by a forged id.
  if (!publicId.startsWith(`schools/${schoolId}/`)) {
    throw new HttpsError('permission-denied', 'This file does not belong to your school.');
  }

  const creds = await getDecryptedCredentials(schoolId);
  await deleteCloudinaryAsset(creds, publicId);
  return { ok: true };
}
