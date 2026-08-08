import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { getValidAccessToken } from '../functions/src/google/googleTokenService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const { schoolId } = req.body ?? {};
    if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) {
      throw new AppError('permission-denied', 'Only School Admins can refresh Google tokens.');
    }
    await getValidAccessToken(schoolId);
    const db = getFirestore();
    const snap = await db.doc(`schools/${schoolId}/integrations/google`).get();
    const expiresAt = snap.data()?.tokens?.expiresAt;
    await db.collection('audit_log').add({
      schoolId, actorId: caller.uid, actorEmail: caller.email, actorRole: caller.role,
      action: 'google.token_refreshed', details: {}, createdAt: new Date(),
    });
    return res.status(200).json({ success: true, expiresAt });
  } catch (err) {
    return errorResponse(res, err);
  }
}
