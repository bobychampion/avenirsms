/**
 * Admin-only Cloud Functions for AvenirSMS.
 *
 * Currently exposes a single callable: `setStudentPassword`. This exists
 * because synthetic student logins use non-deliverable emails
 * (e.g. `stu-001@students.slug.local`), so Firebase's self-service
 * password-reset email flow doesn't work for them. An admin in the same
 * school triggers this function to mint a new temp password, which the
 * student then changes on first sign-in via `mustChangePassword`.
 *
 * Deploy:
 *   cd functions && npm install && npm run deploy
 *
 * Security: caller must be authenticated and hold `admin`, `School_admin`,
 * or `super_admin` role in the target user's school. Enforced server-side.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

interface SetStudentPasswordPayload {
  targetUid: string;
  newPassword: string;
}

export const setStudentPassword = onCall<SetStudentPasswordPayload>(async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const { targetUid, newPassword } = data ?? ({} as SetStudentPasswordPayload);
  if (!targetUid || !newPassword) {
    throw new HttpsError('invalid-argument', 'targetUid and newPassword are required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  const db = getFirestore();
  const [actorSnap, targetSnap] = await Promise.all([
    db.doc(`users/${auth.uid}`).get(),
    db.doc(`users/${targetUid}`).get(),
  ]);
  const actor = actorSnap.data();
  const target = targetSnap.data();
  if (!actor || !target) throw new HttpsError('not-found', 'User profile missing.');

  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId && actor.schoolId === target.schoolId;
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError('permission-denied', 'Only admins in the target school may reset this password.');
  }

  await getAuth().updateUser(targetUid, { password: newPassword });
  await db.doc(`users/${targetUid}`).update({ mustChangePassword: true });

  await db.collection('audit_log').add({
    schoolId: target.schoolId ?? null,
    actorId: auth.uid,
    actorEmail: actor.email ?? null,
    actorRole: actor.role ?? null,
    action: 'password.reset',
    targetUserId: targetUid,
    targetUserEmail: target.email ?? null,
    createdAt: new Date(),
  });

  return { ok: true };
});
