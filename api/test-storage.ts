import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, errorResponse } from './_lib/auth';
import { testStorageConnectionHandler } from '../functions/src/storage/storageHandlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const result = await testStorageConnectionHandler(caller.uid, req.body ?? {});
    return res.status(200).json(result);
  } catch (err) {
    return errorResponse(res, err);
  }
}
