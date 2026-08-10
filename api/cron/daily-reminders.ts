import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, getMessaging } from '../_lib/admin.js';
import { Timestamp } from 'firebase-admin/firestore';

// Invoked by Vercel Cron at 06:00 UTC daily (schedule in vercel.json).
// Secured by CRON_SECRET env var — Vercel sets Authorization: Bearer <secret>.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    return await run(res);
  } catch (err: any) {
    console.error('[dailyReminders] Failed:', err);
    return res.status(500).json({ error: err?.message ?? String(err), code: err?.code ?? 'internal' });
  }
}

async function run(res: VercelResponse) {
  const db = getFirestore();
  const messaging = getMessaging();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  console.log(`[dailyReminders] Running for date: ${todayStr}`);

  // ── FCM helper ──────────────────────────────────────────────────────────────
  async function sendFcm(token: string, title: string, body: string, data?: Record<string, string>) {
    try {
      await messaging.send({ token, notification: { title, body }, data: data ?? {} });
    } catch (err: any) {
      console.warn('FCM send failed for token', token.slice(-6), ':', err.code ?? err.message);
    }
  }

  // ── FEE REMINDERS ───────────────────────────────────────────────────────────
  const invoiceSnap = await db
    .collection('invoices')
    .where('status', 'in', ['unpaid', 'partial'])
    .where('dueDate', '<=', todayStr)
    .get();

  console.log(`[dailyReminders] Found ${invoiceSnap.size} overdue invoices`);
  let feeRemindersSent = 0;

  for (const invoiceDoc of invoiceSnap.docs) {
    const invoice = invoiceDoc.data();
    const { schoolId, studentId, studentName, amount, dueDate } = invoice;
    if (!schoolId || !studentId) continue;
    try {
      const studentDoc = await db.doc(`students/${studentId}`).get();
      const student = studentDoc.data();
      if (!student?.guardianUserId) continue;

      const tokenDoc = await db.doc(`fcm_tokens/${student.guardianUserId}`).get();
      const token = tokenDoc.data()?.token;
      if (!token) continue;

      const overdueDays = Math.round((today.getTime() - new Date(dueDate).getTime()) / 86400000);
      const title = overdueDays > 0 ? '⚠️ Fee Overdue' : '💳 Fee Due Today';
      const body = `${studentName ?? 'Your child'}'s school fee of ₦${(amount ?? 0).toLocaleString()} is ${overdueDays > 0 ? `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue` : 'due today'}.`;

      await sendFcm(token, title, body, { type: 'fee_due', invoiceId: invoiceDoc.id, schoolId });
      await db.collection('notifications').add({
        recipientId: student.guardianUserId, title, body, type: 'fee_due', read: false, schoolId, createdAt: Timestamp.now(),
      });
      feeRemindersSent++;
    } catch (err: any) {
      console.error(`[dailyReminders] Error processing invoice ${invoiceDoc.id}:`, err.message);
    }
  }

  console.log(`[dailyReminders] Fee reminders sent: ${feeRemindersSent}`);

  // ── CONSECUTIVE ABSENCE ALERTS ──────────────────────────────────────────────
  const schoolDays: string[] = [];
  const cursor = new Date(today);
  while (schoolDays.length < 3) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) schoolDays.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() - 1);
  }

  const attSnap = await db
    .collection('attendance')
    .where('date', 'in', schoolDays)
    .where('status', '==', 'absent')
    .get();

  const absentByStudent: Record<string, Set<string>> = {};
  for (const d of attSnap.docs) {
    const { studentId, date } = d.data();
    if (!studentId || !date) continue;
    if (!absentByStudent[studentId]) absentByStudent[studentId] = new Set();
    absentByStudent[studentId].add(date);
  }

  const consecutivelyAbsent = Object.entries(absentByStudent)
    .filter(([, dates]) => schoolDays.every(d => dates.has(d)))
    .map(([studentId]) => studentId);

  console.log(`[dailyReminders] Students absent 3+ consecutive days: ${consecutivelyAbsent.length}`);
  let absenceAlertsSent = 0;

  for (const studentId of consecutivelyAbsent) {
    try {
      const absenceReqSnap = await db
        .collection('absence_requests')
        .where('studentId', '==', studentId)
        .where('status', '==', 'approved')
        .where('startDate', '<=', todayStr)
        .where('endDate', '>=', todayStr)
        .limit(1)
        .get();
      if (!absenceReqSnap.empty) continue;

      const studentDoc = await db.doc(`students/${studentId}`).get();
      const student = studentDoc.data();
      if (!student?.guardianUserId) continue;

      const tokenDoc = await db.doc(`fcm_tokens/${student.guardianUserId}`).get();
      const token = tokenDoc.data()?.token;
      if (!token) continue;

      const title = '📋 Absence Alert';
      const body = `${student.studentName ?? 'Your child'} has been absent for 3 consecutive school days. Please contact the school.`;

      await sendFcm(token, title, body, { type: 'attendance', studentId, schoolId: student.schoolId ?? '' });
      await db.collection('notifications').add({
        recipientId: student.guardianUserId, title, body, type: 'attendance', read: false,
        schoolId: student.schoolId ?? '', createdAt: Timestamp.now(),
      });
      absenceAlertsSent++;
    } catch (err: any) {
      console.error(`[dailyReminders] Error processing absence for student ${studentId}:`, err.message);
    }
  }

  console.log(`[dailyReminders] Absence alerts sent: ${absenceAlertsSent}`);
  console.log(`[dailyReminders] Complete. Fee: ${feeRemindersSent}, Absence: ${absenceAlertsSent}`);

  return res.status(200).json({ ok: true, feeRemindersSent, absenceAlertsSent });
}
