import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { createEvent, updateEvent, deleteEvent } from '../functions/src/google/googleCalendarService';

// Handles: sync / delete  (pass ?action=xxx)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action as string;
  const body = req.body ?? {};
  try {
    const caller = await requireAuth(req);
    const db = getFirestore();

    if (action === 'sync') {
      const { schoolId, event, googleEventId } = body;
      if (!schoolId || !event?.title || !event?.date) throw new AppError('invalid-argument', 'schoolId, event.title and event.date are required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only school admins can sync calendar events.');
      const intSnap = await db.doc(`schools/${schoolId}/integrations/google`).get();
      if (!intSnap.data()?.connected || !intSnap.data()?.enabledServices?.calendar) throw new AppError('failed-precondition', 'Google Calendar is not connected.');
      const resultId = googleEventId ? (await updateEvent(schoolId, googleEventId, event), googleEventId) : await createEvent(schoolId, event);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorRole: caller.role, action: googleEventId ? 'google.calendar.event_updated' : 'google.calendar.event_created', details: { title: event.title, date: event.date, googleEventId: resultId }, createdAt: new Date() });
      return res.status(200).json({ googleEventId: resultId });
    }

    if (action === 'delete') {
      const { schoolId, googleEventId } = body;
      if (!schoolId || !googleEventId) throw new AppError('invalid-argument', 'schoolId and googleEventId are required.');
      if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) throw new AppError('permission-denied', 'Only school admins can delete calendar events.');
      await deleteEvent(schoolId, googleEventId);
      await db.collection('audit_log').add({ schoolId, actorId: caller.uid, actorRole: caller.role, action: 'google.calendar.event_deleted', details: { googleEventId }, createdAt: new Date() });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return errorResponse(res, err);
  }
}
