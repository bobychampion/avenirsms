import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { parseState, validateState, exchangeCodeForTokens, revokeTokens } from '../functions/src/google/googleAuthService';
import { storeTokens, getValidAccessToken, clearTokens } from '../functions/src/google/googleTokenService';
import { verifyConnection } from '../functions/src/google/googleVerificationService';

// Handles: connect / disconnect / verify / refresh  (pass ?action=xxx)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action as string;
  const body = req.body ?? {};
  try {
    const caller = await requireAuth(req);
    const db = getFirestore();

    if (action === 'connect') {
      const { code, state, redirectUri } = body;
      if (!code || !state || !redirectUri) throw new AppError('invalid-argument', 'code, state, and redirectUri are required.');
      let oauthState: any;
      try { oauthState = parseState(state); } catch { throw new AppError('invalid-argument', 'Invalid OAuth state.'); }
      if (!validateState(oauthState)) throw new AppError('invalid-argument', 'OAuth state expired. Please try again.');
      const { schoolId } = oauthState;
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only School Admins can connect Google Workspace.');
      const tokens = await exchangeCodeForTokens(code, redirectUri);
      const now = new Date();
      await storeTokens(schoolId, {
        accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
        expiresAt: { toMillis: () => Date.now() + tokens.expiresIn * 1000 } as any,
        scopes: tokens.scopes,
      });
      const adminEmail = caller.email ?? '';
      const workspaceDomain = adminEmail.includes('@') ? adminEmail.split('@')[1] : '';
      await db.doc(`schools/${schoolId}/integrations/google`).set(
        { connected: true, connectedAt: now, connectedBy: caller.uid, adminEmail, workspaceDomain, updatedAt: now },
        { merge: true }
      );
      verifyConnection(schoolId).catch(e => console.error('Initial verification failed:', e));
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorEmail: caller.email, actorRole: caller.role, action: 'google.connected', details: { adminEmail, workspaceDomain, scopes: tokens.scopes }, createdAt: now });
      return res.status(200).json({ success: true, integration: { connected: true, connectedAt: now, adminEmail, workspaceDomain } });
    }

    if (action === 'disconnect') {
      const { schoolId } = body;
      if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only School Admins can disconnect Google Workspace.');
      const snap = await db.doc(`schools/${schoolId}/integrations/google`).get();
      if (!snap.exists) throw new AppError('not-found', 'No Google integration found.');
      const accessToken = snap.data()?.tokens?.accessToken;
      if (accessToken) revokeTokens(accessToken).catch(e => console.error('Revoke failed:', e));
      await db.doc(`schools/${schoolId}/integrations/google`).set({ connected: false, updatedAt: new Date() }, { merge: true });
      await clearTokens(schoolId);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorEmail: caller.email, actorRole: caller.role, action: 'google.disconnected', details: {}, createdAt: new Date() });
      return res.status(200).json({ success: true });
    }

    if (action === 'verify') {
      const { schoolId } = body;
      if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only School Admins can verify Google connection.');
      const results = await verifyConnection(schoolId);
      return res.status(200).json(results);
    }

    if (action === 'refresh') {
      const { schoolId } = body;
      if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only School Admins can refresh Google tokens.');
      await getValidAccessToken(schoolId);
      const snap = await db.doc(`schools/${schoolId}/integrations/google`).get();
      const expiresAt = snap.data()?.tokens?.expiresAt;
      return res.status(200).json({ success: true, expiresAt });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return errorResponse(res, err);
  }
}
