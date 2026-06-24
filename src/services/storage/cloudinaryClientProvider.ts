import { UploadResult } from '../../types';
import { StorageProviderAdapter, UploadOptions } from './StorageProviderAdapter';

interface UploadSignatureResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

async function callFunction<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const fns = getFunctions();
  const fn = httpsCallable<TReq, TRes>(fns, name);
  const result = await fn(data);
  return result.data;
}

/**
 * Cloudinary implementation of StorageProviderAdapter. Uploads go directly
 * from the browser to Cloudinary — the API secret never reaches the client.
 * A short-lived signature is fetched from getUploadSignature first.
 */
export const cloudinaryClientProvider: StorageProviderAdapter = {
  async upload({ schoolId, file, folder }: UploadOptions): Promise<UploadResult> {
    const sig = await callFunction<{ schoolId: string; folder: string }, UploadSignatureResponse>(
      'getUploadSignature',
      { schoolId, folder }
    );

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('signature', sig.signature);
    form.append('folder', sig.folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Cloudinary upload failed (HTTP ${res.status}): ${body}`);
    }
    const json = await res.json();
    return {
      url: json.secure_url,
      publicId: json.public_id,
      type: json.resource_type,
      uploadedAt: new Date().toISOString(),
    };
  },

  async delete(schoolId: string, publicId: string): Promise<void> {
    await callFunction<{ schoolId: string; publicId: string }, { ok: boolean }>(
      'deleteStorageFile',
      { schoolId, publicId }
    );
  },

  getUrl(publicId: string): string {
    // Cloudinary public IDs already resolve via the secure_url returned at upload time;
    // callers that only have a publicId (no cloudName) should prefer the stored secure_url.
    return publicId;
  },
};
