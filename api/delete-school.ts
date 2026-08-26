import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth, getFirestore } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse } from './_lib/auth.js';
import { applyCors } from './_lib/cors.js';

export const maxDuration = 300; // 5 min — school deletion touches 40+ collections

const SCHOOL_SCOPED_COLLECTIONS = [
  'students','guardians','staff','users','classes','subjects','class_subjects',
  'grades','student_skills','attendance','attendance_checkins','timetables',
  'assignments','assignment_submissions','events','notifications',
  'notification_broadcasts','messages','invoices','fee_payments','payments',
  'expenses','exams','exam_seating','question_bank','cbt_exams','cbt_sessions',
  'curriculum_documents','curriculum_items','leave_requests','payroll',
  'hr_policies','onboarding_records','leave_entitlements','pins','promotions',
  'whatsapp_logs','applications','library_books','library_circulation','mail',
  'lifecycle_events','behavioral_records','alumni_profiles','cover_assignments',
  'school_trips','trip_registrations','absence_requests',
];
const FINANCIAL_COLLECTIONS = ['invoices','fee_payments','payments','expenses','platform_invoices'];
const DOCUMENT_COLLECTIONS = ['school_settings','geofences'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const caller = await requireAuth(req);
    if (caller.role !== 'super_admin') throw new AppError('permission-denied', 'Only super admins may delete a school.');

    const { schoolId, preserveFinancial } = req.body ?? {};
    if (!schoolId) throw new AppError('invalid-argument', 'schoolId is required.');

    const db = getFirestore();
    const schoolSnap = await db.doc(`schools/${schoolId}`).get();
    if (!schoolSnap.exists) throw new AppError('not-found', 'School not found.');
    const school = schoolSnap.data()!;
    if (school.status === 'active') throw new AppError('failed-precondition', 'Suspend the school before deleting it.');

    // Delete Firebase Auth accounts
    const usersSnap = await db.collection('users').where('schoolId', '==', schoolId).get();
    const uids = usersSnap.docs.map(d => d.id);
    let authAccountsDeleted = 0;
    for (let i = 0; i < uids.length; i += 1000) {
      const chunk = uids.slice(i, i + 1000);
      if (!chunk.length) continue;
      const result = await getAuth().deleteUsers(chunk);
      authAccountsDeleted += result.successCount;
    }

    // Delete school-scoped collections
    const deletionsByCollection: Record<string, number> = {};
    for (const col of SCHOOL_SCOPED_COLLECTIONS) {
      const snap = await db.collection(col).where('schoolId', '==', schoolId).get();
      if (snap.empty) continue;
      const preserve = !!preserveFinancial && FINANCIAL_COLLECTIONS.includes(col);
      const writer = db.bulkWriter();
      for (const doc of snap.docs) {
        preserve
          ? writer.update(doc.ref, { schoolDeleted: true, deletedAt: new Date(), deletedBy: caller.uid })
          : writer.delete(doc.ref);
      }
      await writer.close();
      deletionsByCollection[col] = snap.size;
    }

    await Promise.all(uids.map(uid => db.doc(`fcm_tokens/${uid}`).delete().catch(() => {})));
    for (const col of DOCUMENT_COLLECTIONS) await db.doc(`${col}/${schoolId}`).delete().catch(() => {});
    await db.doc(`schools/${schoolId}/integrations/google`).delete().catch(() => {});
    const slugSnap = await db.collection('school_slugs').where('schoolId', '==', schoolId).get();
    await Promise.all(slugSnap.docs.map(d => d.ref.delete()));
    await db.doc(`schools/${schoolId}`).delete();

    const logRef = await db.collection('audit_log').add({
      schoolId, schoolName: school.name ?? null,
      actorId: caller.uid, actorEmail: caller.email, actorRole: caller.role,
      action: 'school.delete',
      summary: { deletionsByCollection, authAccountsDeleted, preservedFinancial: !!preserveFinancial },
      createdAt: new Date(),
    });

    return res.status(200).json({ success: true, deletionsByCollection, authAccountsDeleted, auditLogId: logRef.id });
  } catch (err) {
    return errorResponse(res, err);
  }
}
