import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth.js';
import { parseState, validateState, exchangeCodeForTokens, revokeTokens } from '../functions/src/google/googleAuthService.js';
import { storeTokens, getValidAccessToken, clearTokens } from '../functions/src/google/googleTokenService.js';
import { verifyConnection } from '../functions/src/google/googleVerificationService.js';
import { createEvent, updateEvent, deleteEvent } from '../functions/src/google/googleCalendarService.js';
import { createCourse, updateCourse, archiveCourse } from '../functions/src/google/googleClassroomService.js';
import { applyCors } from './_lib/cors.js';

// Handles: connect / disconnect / verify / refresh / calendar.sync / calendar.delete /
// classroom.sync / classroom.archive  (pass ?action=xxx). calendar.* and classroom.*
// were folded in from their own routes to stay under the Vercel Hobby function limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
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

    if (action === 'calendar.sync') {
      const { schoolId, event, googleEventId } = body;
      if (!schoolId || !event?.title || !event?.date) throw new AppError('invalid-argument', 'schoolId, event.title and event.date are required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only school admins can sync calendar events.');
      const intSnap = await db.doc(`schools/${schoolId}/integrations/google`).get();
      if (!intSnap.data()?.connected || !intSnap.data()?.enabledServices?.calendar) throw new AppError('failed-precondition', 'Google Calendar is not connected.');
      const resultId = googleEventId ? (await updateEvent(schoolId, googleEventId, event), googleEventId) : await createEvent(schoolId, event);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorRole: caller.role, action: googleEventId ? 'google.calendar.event_updated' : 'google.calendar.event_created', details: { title: event.title, date: event.date, googleEventId: resultId }, createdAt: new Date() });
      return res.status(200).json({ googleEventId: resultId });
    }

    if (action === 'calendar.delete') {
      const { schoolId, googleEventId } = body;
      if (!schoolId || !googleEventId) throw new AppError('invalid-argument', 'schoolId and googleEventId are required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only school admins can delete calendar events.');
      await deleteEvent(schoolId, googleEventId);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorRole: caller.role, action: 'google.calendar.event_deleted', details: { googleEventId }, createdAt: new Date() });
      return res.status(200).json({ success: true });
    }

    if (action === 'classroom.sync') {
      const { schoolId, cls, googleCourseId } = body;
      if (!schoolId || !cls?.name) throw new AppError('invalid-argument', 'schoolId and cls.name are required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only school admins can sync classroom courses.');
      const intSnap = await db.doc(`schools/${schoolId}/integrations/google`).get();
      if (!intSnap.data()?.connected || !intSnap.data()?.enabledServices?.classroom) throw new AppError('failed-precondition', 'Google Classroom is not connected.');
      const resultId = googleCourseId ? (await updateCourse(schoolId, googleCourseId, cls), googleCourseId) : await createCourse(schoolId, cls);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorRole: caller.role, action: googleCourseId ? 'google.classroom.course_updated' : 'google.classroom.course_created', details: { className: cls.name, googleCourseId: resultId }, createdAt: new Date() });
      return res.status(200).json({ googleCourseId: resultId });
    }

    if (action === 'classroom.archive') {
      const { schoolId, googleCourseId } = body;
      if (!schoolId || !googleCourseId) throw new AppError('invalid-argument', 'schoolId and googleCourseId are required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only school admins can archive classroom courses.');
      await archiveCourse(schoolId, googleCourseId);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorRole: caller.role, action: 'google.classroom.course_archived', details: { googleCourseId }, createdAt: new Date() });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return errorResponse(res, err);
  }
}
