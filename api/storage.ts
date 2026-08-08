import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, errorResponse, AppError } from './_lib/auth';
import {
  testStorageConnectionHandler,
  connectStorageProviderHandler,
  disconnectStorageProviderHandler,
  deleteStorageFileHandler,
  verifyStorageConnectionHandler,
} from '../functions/src/storage/storageHandlers';

// Handles: test / connect / disconnect / delete-file / verify  (pass ?action=xxx)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action as string;
  try {
    const caller = await requireAuth(req);
    const body = req.body ?? {};

    if (action === 'test') return res.status(200).json(await testStorageConnectionHandler(caller.uid, body));
    if (action === 'connect') return res.status(200).json(await connectStorageProviderHandler(caller.uid, body));
    if (action === 'disconnect') return res.status(200).json(await disconnectStorageProviderHandler(caller.uid, body));
    if (action === 'delete-file') return res.status(200).json(await deleteStorageFileHandler(caller.uid, body));
    if (action === 'verify') return res.status(200).json(await verifyStorageConnectionHandler(caller.uid, body));

    throw new AppError('invalid-argument', `Unknown action: ${action}`);
  } catch (err) {
    return errorResponse(res, err);
  }
}
