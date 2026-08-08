import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { revokeTokens } from '../functions/src/google/googleAuthService';
import { clearTokens } from '../functions/src/google/googleTokenService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const { schoolId } = req.body ?? {};
    if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) {
      throw new AppError('permission-denied', 'Only School Admins can disconnect Google Workspace.');
    }
    const db = getFirestore();
    const snap = await db.doc(`schools/${schoolId}/integrations/google`).get();
    if (!snap.exists) throw new AppError('not-found', 'No Google integration found.');
    const accessToken = snap.data()?.tokens?.accessToken;
    if (accessToken) revokeTokens(accessToken).catch(e => console.error('Revoke failed:', e));
    await db.doc(`schools/${schoolId}/integrations/google`).set({ connected: false, updatedAt: new Date() }, { merge: true });
    await clearTokens(schoolId);
    await db.collection('audit_log').add({
      schoolId, actorId: caller.uid, actorEmail: caller.email, actorRole: caller.role,
      action: 'google.disconnected', details: {}, createdAt: new Date(),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return errorResponse(res, err);
  }
}
