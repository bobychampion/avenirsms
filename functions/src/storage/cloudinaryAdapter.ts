/**
 * Server-side Cloudinary REST calls. No cloudinary npm SDK dependency —
 * the Admin API and the signature algorithm are simple enough to call
 * directly with the Node 20 runtime's global fetch + crypto.
 */
import { createHash } from 'crypto';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface CredentialTestResult {
  ok: boolean;
  reason?: 'invalid_api_key' | 'invalid_cloud_name' | 'insufficient_permission' | 'unknown';
  message: string;
}

/**
 * Validates credentials by calling Cloudinary's Admin API `usage` endpoint,
 * which requires a correctly-signed Basic Auth request and read permission
 * on the account — a good proxy for "can this account actually be used."
 */
export async function testCloudinaryCredentials(
  creds: CloudinaryCredentials
): Promise<CredentialTestResult> {
  const { cloudName, apiKey, apiSecret } = creds;
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/usage`;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  } catch {
    return { ok: false, reason: 'invalid_cloud_name', message: 'Could not reach Cloudinary — check the cloud name.' };
  }

  if (res.status === 401) {
    return { ok: false, reason: 'invalid_api_key', message: 'Invalid API key or API secret.' };
  }
  if (res.status === 404) {
    return { ok: false, reason: 'invalid_cloud_name', message: 'No Cloudinary account found with that cloud name.' };
  }
  if (res.status === 403) {
    return { ok: false, reason: 'insufficient_permission', message: 'This API key does not have permission to access account usage data.' };
  }
  if (!res.ok) {
    return { ok: false, reason: 'unknown', message: `Cloudinary returned an unexpected error (HTTP ${res.status}).` };
  }
  return { ok: true, message: 'Cloudinary connected successfully' };
}

export interface SignedUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Generates a Cloudinary upload signature so the browser can upload directly
 * to Cloudinary without ever seeing the API secret. Only the params actually
 * signed here may be sent by the client during the real upload request.
 */
export function generateSignedUploadParams(
  creds: CloudinaryCredentials,
  folder: string
): SignedUploadParams {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(paramsToSign + creds.apiSecret).digest('hex');
  return { cloudName: creds.cloudName, apiKey: creds.apiKey, timestamp, signature, folder };
}

/** Deletes an asset from Cloudinary by public_id, signed server-side. */
export async function deleteCloudinaryAsset(
  creds: CloudinaryCredentials,
  publicId: string
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(paramsToSign + creds.apiSecret).digest('hex');

  const form = new URLSearchParams();
  form.set('public_id', publicId);
  form.set('timestamp', String(timestamp));
  form.set('api_key', creds.apiKey);
  form.set('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/image/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudinary delete failed (HTTP ${res.status}): ${body}`);
  }
}
