import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';
import { requireAuth, AppError, errorResponse, isSuperAdmin, isSchoolAdmin } from './_lib/auth';
import { archiveCourse } from '../functions/src/google/googleClassroomService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    const { schoolId, googleCourseId } = req.body ?? {};
    if (!schoolId || !googleCourseId) throw new AppError('invalid-argument', 'schoolId and googleCourseId are required.');
    if (!isSuperAdmin(caller) && !isSchoolAdmin(caller, schoolId)) {
      throw new AppError('permission-denied', 'Only school admins can archive classroom courses.');
    }
    await archiveCourse(schoolId, googleCourseId);
    const db = getFirestore();
    await db.collection('audit_log').add({
      schoolId, actorId: caller.uid, actorRole: caller.role,
      action: 'google.classroom.course_archived', details: { googleCourseId }, createdAt: new Date(),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return errorResponse(res, err);
  }
}
