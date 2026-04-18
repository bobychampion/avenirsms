"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStudentPassword = void 0;
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
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
exports.setStudentPassword = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { targetUid, newPassword } = data ?? {};
    if (!targetUid || !newPassword) {
        throw new https_1.HttpsError('invalid-argument', 'targetUid and newPassword are required.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    const db = (0, firestore_1.getFirestore)();
    const [actorSnap, targetSnap] = await Promise.all([
        db.doc(`users/${auth.uid}`).get(),
        db.doc(`users/${targetUid}`).get(),
    ]);
    const actor = actorSnap.data();
    const target = targetSnap.data();
    if (!actor || !target)
        throw new https_1.HttpsError('not-found', 'User profile missing.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId && actor.schoolId === target.schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only admins in the target school may reset this password.');
    }
    await (0, auth_1.getAuth)().updateUser(targetUid, { password: newPassword });
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
//# sourceMappingURL=index.js.map