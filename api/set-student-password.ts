import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth, getFirestore } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const caller = await requireAuth(req);
    const { targetUid, newPassword } = req.body ?? {};

    if (!targetUid || !newPassword) throw new AppError('invalid-argument', 'targetUid and newPassword are required.');
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new AppError('invalid-argument', 'Password must be at least 8 characters.');
    }

    const db = getFirestore();
    const targetSnap = await db.doc(`users/${targetUid}`).get();
    const target = targetSnap.data();
    if (!target) throw new AppError('not-found', 'Target user profile not found.');

    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, target.schoolId)) {
      throw new AppError('permission-denied', 'Only admins in the target school may reset this password.');
    }

    await getAuth().updateUser(targetUid, { password: newPassword });
    await db.doc(`users/${targetUid}`).update({ mustChangePassword: true });

    await db.collection('audit_log').add({
      schoolId: target.schoolId ?? null,
      actorId: caller.uid,
      actorEmail: caller.email,
      actorRole: caller.role,
      action: 'password.reset',
      targetUserId: targetUid,
      targetUserEmail: target.email ?? null,
      createdAt: new Date(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return errorResponse(res, err);
  }
}
