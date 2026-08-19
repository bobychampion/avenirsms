import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth, getFirestore } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth.js';

/**
 * Parent account administration. Actions (?action=…, default 'set-password'):
 *   set-password   — set a parent's password directly (targetUid, newPassword)
 *   update-profile — correct a parent's name and/or login email
 *                    (targetUid, displayName?, newEmail?)
 *
 * Both live on one route because changing a login credential needs the Admin
 * SDK, and Vercel's Hobby plan caps how many functions this project can deploy.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.query.action as string) || 'set-password';

  try {
    const caller = await requireAuth(req);
    const { targetUid } = req.body ?? {};
    if (!targetUid) throw new AppError('invalid-argument', 'targetUid is required.');

    const db = getFirestore();
    const targetSnap = await db.doc(`users/${targetUid}`).get();
    const target = targetSnap.data();
    if (!target) throw new AppError('not-found', 'Target user profile not found.');

    if (target.role !== 'parent') {
      throw new AppError('failed-precondition', 'This endpoint only manages parent accounts.');
    }
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, target.schoolId)) {
      throw new AppError('permission-denied', "Only admins in the target parent's school may manage this account.");
    }

    if (action === 'set-password') {
      const { newPassword } = req.body ?? {};
      if (!newPassword) throw new AppError('invalid-argument', 'newPassword is required.');
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new AppError('invalid-argument', 'Password must be at least 8 characters.');
      }

      await getAuth().updateUser(targetUid, { password: newPassword });
      await db.doc(`users/${targetUid}`).update({ mustChangePassword: true });

      await db.collection('audit_log').add({
        schoolId: target.schoolId ?? null,
        actorId: caller.uid,
        actorEmail: caller.email,
        actorRole: caller.role,
        action: 'parent_password.reset',
        targetUserId: targetUid,
        targetUserEmail: target.email ?? null,
        createdAt: new Date(),
      });

      return res.status(200).json({ ok: true });
    }

    if (action === 'update-profile') {
      const { displayName, newEmail } = req.body ?? {};
      const nextName = typeof displayName === 'string' ? displayName.trim() : undefined;
      const nextEmail = typeof newEmail === 'string' ? newEmail.trim().toLowerCase() : undefined;
      if (!nextName && !nextEmail) {
        throw new AppError('invalid-argument', 'Provide displayName and/or newEmail.');
      }
      if (nextEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
        throw new AppError('invalid-argument', 'That email address is not valid.');
      }

      const previousEmail = (target.email ?? '').toLowerCase();

      // Update the Auth credential first — if the address is already taken by
      // another login this throws, and we must not leave Firestore ahead of it.
      if (nextEmail && nextEmail !== previousEmail) {
        try {
          await getAuth().updateUser(targetUid, { email: nextEmail });
        } catch (e: any) {
          if (e?.code === 'auth/email-already-exists') {
            throw new AppError('already-exists', 'Another account already uses that email address.');
          }
          throw e;
        }
      }
      if (nextName) {
        await getAuth().updateUser(targetUid, { displayName: nextName }).catch(() => {/* non-fatal */});
      }

      const profileUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (nextName) profileUpdate.displayName = nextName;
      if (nextEmail) profileUpdate.email = nextEmail;
      await db.doc(`users/${targetUid}`).update(profileUpdate);

      // Cascade the address onto linked student records. Guardians are matched
      // by uid OR by email, so leaving a stale guardianEmail behind would keep
      // a broken half-link around (and would silently re-link the OLD address
      // if it were ever reused by someone else).
      let cascaded = 0;
      if (nextEmail && previousEmail && nextEmail !== previousEmail && target.schoolId) {
        for (const field of ['guardianEmail', 'guardian2Email']) {
          const snap = await db.collection('students')
            .where('schoolId', '==', target.schoolId)
            .where(field, '==', previousEmail)
            .get();
          if (snap.empty) continue;
          const batch = db.batch();
          snap.docs.forEach(d => batch.update(d.ref, { [field]: nextEmail }));
          await batch.commit();
          cascaded += snap.size;
        }
      }

      await db.collection('audit_log').add({
        schoolId: target.schoolId ?? null,
        actorId: caller.uid,
        actorEmail: caller.email,
        actorRole: caller.role,
        action: 'parent_profile.updated',
        targetUserId: targetUid,
        targetUserEmail: previousEmail || null,
        details: { displayName: nextName ?? null, newEmail: nextEmail ?? null, studentsUpdated: cascaded },
        createdAt: new Date(),
      });

      return res.status(200).json({ ok: true, studentsUpdated: cascaded });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return errorResponse(res, err);
  }
}
