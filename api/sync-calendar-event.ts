import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { createEvent, updateEvent } from '../functions/src/google/googleCalendarService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const { schoolId, event, googleEventId } = req.body ?? {};
    if (!schoolId || !event?.title || !event?.date) {
      throw new AppError('invalid-argument', 'schoolId, event.title and event.date are required.');
    }
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) {
      throw new AppError('permission-denied', 'Only school admins can sync calendar events.');
    }
    const db = getFirestore();
    const intSnap = await db.doc(`schools/${schoolId}/integrations/google`).get();
    if (!intSnap.data()?.connected || !intSnap.data()?.enabledServices?.calendar) {
      throw new AppError('failed-precondition', 'Google Calendar is not connected.');
    }
    const resultId = googleEventId ? (await updateEvent(schoolId, googleEventId, event), googleEventId) : await createEvent(schoolId, event);
    await db.collection('audit_log').add({
      schoolId, actorId: caller.uid, actorRole: caller.role,
      action: googleEventId ? 'google.calendar.event_updated' : 'google.calendar.event_created',
      details: { title: event.title, date: event.date, googleEventId: resultId }, createdAt: new Date(),
    });
    return res.status(200).json({ googleEventId: resultId });
  } catch (err) {
    return errorResponse(res, err);
  }
}
