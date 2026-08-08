import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse } from './_lib/auth';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const caller = await requireAuth(req);
    const { schoolId, folder, publicId } = req.body ?? {};
    if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');

    // Load school's Cloudinary credentials from Firestore
    const db = getFirestore();
    const settingsSnap = await db.doc(`storage_settings/${schoolId}`).get();
    const settings = settingsSnap.data();

    if (!settings?.provider || settings.provider !== 'cloudinary') {
      throw new AppError('failed-precondition', 'Cloudinary is not configured for this school.');
    }

    const apiSecret: string = settings.credentials?.apiSecret ?? '';
    const apiKey: string = settings.credentials?.apiKey ?? '';
    const cloudName: string = settings.credentials?.cloudName ?? '';

    if (!apiSecret || !apiKey || !cloudName) {
      throw new AppError('failed-precondition', 'Cloudinary credentials incomplete.');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const uploadFolder = folder ?? `avenir/${schoolId}`;

    const paramsToSign: Record<string, string | number> = { timestamp, folder: uploadFolder };
    if (publicId) paramsToSign.public_id = publicId;

    const sortedParams = Object.keys(paramsToSign)
      .sort()
      .map(k => `${k}=${paramsToSign[k]}`)
      .join('&');

    const signature = crypto
      .createHash('sha256')
      .update(sortedParams + apiSecret)
      .digest('hex');

    return res.status(200).json({ signature, timestamp, apiKey, cloudName, folder: uploadFolder });
  } catch (err) {
    return errorResponse(res, err);
  }
}
