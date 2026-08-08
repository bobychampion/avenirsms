import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { createCourse, updateCourse } from '../functions/src/google/googleClassroomService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const { schoolId, cls, googleCourseId } = req.body ?? {};
    if (!schoolId || !cls?.name) throw new AppError('invalid-argument', 'schoolId and cls.name are required.');
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) {
      throw new AppError('permission-denied', 'Only school admins can sync classroom courses.');
    }
    const db = getFirestore();
    const intSnap = await db.doc(`schools/${schoolId}/integrations/google`).get();
    if (!intSnap.data()?.connected || !intSnap.data()?.enabledServices?.classroom) {
      throw new AppError('failed-precondition', 'Google Classroom is not connected.');
    }
    const resultId = googleCourseId ? (await updateCourse(schoolId, googleCourseId, cls), googleCourseId) : await createCourse(schoolId, cls);
    await db.collection('audit_log').add({
      schoolId, actorId: caller.uid, actorRole: caller.role,
      action: googleCourseId ? 'google.classroom.course_updated' : 'google.classroom.course_created',
      details: { className: cls.name, googleCourseId: resultId }, createdAt: new Date(),
    });
    return res.status(200).json({ googleCourseId: resultId });
  } catch (err) {
    return errorResponse(res, err);
  }
}
