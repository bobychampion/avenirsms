import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { verifyConnection } from '../functions/src/google/googleVerificationService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const { schoolId } = req.body ?? {};
    if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) {
      throw new AppError('permission-denied', 'Only School Admins can verify Google connection.');
    }
    const results = await verifyConnection(schoolId);
    return res.status(200).json(results);
  } catch (err) {
    return errorResponse(res, err);
  }
}
