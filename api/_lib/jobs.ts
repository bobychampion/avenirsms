import type { VercelResponse } from '@vercel/node';
import { getFirestore, getMessaging } from './admin.js';
import { sendToRecipients } from '../comms.js';
import { Timestamp } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Shared cron job bodies. These live under api/_lib/ (not a deployable route)
// and are dispatched by api/cron/index.ts via ?job=<name>, because Vercel's
// Hobby plan caps this project at 12 Serverless Functions — one dispatcher
// costs a single slot instead of one per job.
//
// Auth (Bearer CRON_SECRET) is enforced once, in the dispatcher, before any of
// these run. Each function is also wrapped in the dispatcher's try/catch.
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled Communications Hub sends (was api/cron/send-scheduled.ts)
// ═══════════════════════════════════════════════════════════════════════════

export async function processDueMessages(db: FirebaseFirestore.Firestore) {
  const now = Timestamp.now();

  const dueSnap = await db
    .collection('comms_messages')
    .where('status', '==', 'scheduled')
    .where('scheduledFor', '<=', now)
    .get();

  const results: { id: string; status: string; sentCount: number; failedCount: number }[] = [];

  for (const doc of dueSnap.docs) {
    const data = doc.data();
    try {
      const result = await sendToRecipients(db, data.recipients ?? [], data.channels ?? [], data.subject, data.body);
      await doc.ref.update({ status: result.status, failures: result.failures, sentAt: Timestamp.now() });
      results.push({ id: doc.id, status: result.status, sentCount: result.sentCount, failedCount: result.failedCount });
    } catch (e: any) {
      console.error(`[processDueMessages] Message ${doc.id} failed:`, e);
      await doc.ref.update({ status: 'failed', failures: [{ email: '', channel: 'all', error: e?.message ?? 'unknown error' }], sentAt: Timestamp.now() });
      results.push({ id: doc.id, status: 'failed', sentCount: 0, failedCount: data.recipients?.length ?? 0 });
    }
  }

  return results;
}

export async function runSendScheduled(res: VercelResponse) {
  const db = getFirestore();
  const results = await processDueMessages(db);
  console.log(`[send-scheduled] Processed ${results.length} scheduled message(s).`);
  return res.status(200).json({ ok: true, processed: results.length, results });
}

// ═══════════════════════════════════════════════════════════════════════════
// Daily fee + consecutive-absence reminders (was api/cron/daily-reminders.ts)
// ═══════════════════════════════════════════════════════════════════════════

export async function runDailyReminders(res: VercelResponse) {
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

// ═══════════════════════════════════════════════════════════════════════════
// Auto-suspend expired demo schools + process due comms (was api/cron/expire-demo.ts)
// ═══════════════════════════════════════════════════════════════════════════

export async function runExpireDemo(res: VercelResponse) {
  const db = getFirestore();
  const now = Timestamp.now();

  const expiredSnap = await db
    .collection('schools')
    .where('status', '==', 'demo')
    .where('subscriptionExpiresAt', '<=', now)
    .get();

  let suspended = 0;
  if (!expiredSnap.empty) {
    const batch = db.batch();
    for (const schoolDoc of expiredSnap.docs) {
      batch.update(schoolDoc.ref, { status: 'suspended', autoSuspendedAt: now, updatedAt: now });
    }
    await batch.commit();
    suspended = expiredSnap.size;
    console.log(`[expireDemoSchools] Auto-suspended ${suspended} expired demo school(s).`);
  } else {
    console.log('[expireDemoSchools] No expired demo schools found.');
  }

  let messagesProcessed = 0;
  try {
    const results = await processDueMessages(db);
    messagesProcessed = results.length;
  } catch (e) {
    console.error('[expireDemoSchools] processDueMessages failed:', e);
  }

  return res.status(200).json({ ok: true, suspended, messagesProcessed });
}

// ═══════════════════════════════════════════════════════════════════════════
// "Attendance not taken" watch (timetable-driven, no geofence)
// ═══════════════════════════════════════════════════════════════════════════
//
// If a timetabled lesson has started and no attendance (daily OR subject) has
// been recorded for that class within an admin-configured grace period, every
// school admin gets a notification + FCM push. Idempotent: an
// `attendance_alerts` marker doc per (school, date, class, period) means each
// lesson alerts at most once, however often this runs. Meant to be pinged
// every ~20 min during school hours by an external scheduler
// (.github/workflows/attendance-watch.yml).

const ATT_ALERT_WINDOW_MIN = 90;   // alert only while now ∈ [start + grace, start + grace + this]
const ATT_MARKER_CLEANUP = 300;
const ATT_ADMIN_ROLES = ['admin', 'School_admin'];

function fmtParts(timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
}

function nowInTz(tz: string | undefined): { weekday: string; dateStr: string; minutes: number } {
  let parts: Record<string, string>;
  try {
    parts = fmtParts(tz || 'UTC');
  } catch {
    parts = fmtParts('UTC');
  }
  let hour = parseInt(parts.hour, 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0; // some ICU builds emit "24" for midnight
  return {
    weekday: parts.weekday,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + parseInt(parts.minute, 10),
  };
}

function parseHHMM(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const attSafeId = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 400);

export async function runAttendanceWatch(res: VercelResponse) {
  const db = getFirestore();
  const messaging = getMessaging();

  const settingsSnap = await db
    .collection('school_settings')
    .where('attendanceAlertsEnabled', '==', true)
    .get();

  let schoolsChecked = 0;
  let alertsSent = 0;
  const details: Array<{ schoolId: string; class: string; subject: string; startTime: string }> = [];

  for (const settingsDoc of settingsSnap.docs) {
    const schoolId = settingsDoc.id;
    const s = settingsDoc.data();
    const grace = Math.max(0, Math.min(180, Number(s.attendanceAlertGraceMinutes ?? 15)));
    const { weekday, dateStr, minutes: nowMin } = nowInTz(s.timezone);
    schoolsChecked++;

    // Single-field query (no composite index); session/term filtered in memory.
    const ttSnap = await db.collection('timetables').where('schoolId', '==', schoolId).get();
    const session = s.currentSession;
    const term = s.currentTerm ?? '1st Term';
    const timetables = ttSnap.docs
      .map(d => d.data())
      .filter(t => (!session || t.session === session) && (!term || t.term === term));
    if (timetables.length === 0) continue;

    // Lessons whose grace window is currently open.
    type Pending = { className: string; subject: string; teacher?: string; startTime: string; slotId?: string };
    const pending: Pending[] = [];
    for (const t of timetables) {
      const periods = (t.schedule?.[weekday] ?? []) as Array<Record<string, any>>;
      for (const p of periods) {
        const startMin = parseHHMM(p.startTime);
        if (startMin == null) continue;
        const dueAt = startMin + grace;
        if (nowMin < dueAt || nowMin > dueAt + ATT_ALERT_WINDOW_MIN) continue;
        pending.push({
          className: t.class,
          subject: p.subject ?? '',
          teacher: p.teacher,
          startTime: p.startTime,
          slotId: p.slotId,
        });
      }
    }
    if (pending.length === 0) continue;

    // A lesson is "covered" if EITHER a daily register OR a subject-attendance
    // row exists for it today — works for daily_only, subject_only and both.
    const [dailySnap, subjSnap] = await Promise.all([
      db.collection('attendance')
        .where('schoolId', '==', schoolId)
        .where('date', '==', dateStr)
        .select('class')
        .get(),
      db.collection('subjectAttendance')
        .where('schoolId', '==', schoolId)
        .where('attendanceDate', '==', dateStr)
        .select('className', 'subjectName')
        .get(),
    ]);
    const dailyClasses = new Set<string>(dailySnap.docs.map(d => d.data().class).filter(Boolean));
    const subjectPairs = new Set<string>(
      subjSnap.docs.map(d => `${d.data().className}|${d.data().subjectName}`),
    );

    let adminUids: string[] | null = null;

    for (const p of pending) {
      const covered =
        dailyClasses.has(p.className) || subjectPairs.has(`${p.className}|${p.subject}`);
      if (covered) continue;

      const markerRef = db
        .collection('attendance_alerts')
        .doc(attSafeId(`${schoolId}_${dateStr}_${p.className}_${p.slotId || p.startTime}_${p.subject}`));
      if ((await markerRef.get()).exists) continue;

      if (adminUids == null) {
        const uSnap = await db
          .collection('users')
          .where('schoolId', '==', schoolId)
          .where('role', 'in', ATT_ADMIN_ROLES)
          .get();
        adminUids = uSnap.docs.map(d => d.id);
      }

      const markerData = {
        schoolId,
        className: p.className,
        subject: p.subject,
        date: dateStr,
        startTime: p.startTime,
        createdAt: Timestamp.now(),
      };

      if (adminUids.length === 0) {
        // No admins to tell — still drop a marker so we don't re-scan this lesson all day.
        await markerRef.set({ ...markerData, note: 'no admins' });
        continue;
      }

      const subjLabel = p.subject ? ` · ${p.subject}` : '';
      const who = p.teacher ? ` (${p.teacher})` : '';
      const title = '📋 Attendance not taken';
      const body = `No attendance recorded for ${p.className}${subjLabel}${who}. Lesson started ${p.startTime}; ${grace} min grace has passed.`;

      const batch = db.batch();
      for (const uid of adminUids) {
        batch.set(db.collection('notifications').doc(), {
          recipientId: uid,
          schoolId,
          title,
          body,
          type: 'attendance',
          read: false,
          createdAt: Timestamp.now(),
        });
      }
      await batch.commit();

      await Promise.all(
        adminUids.map(async uid => {
          try {
            const tokenDoc = await db.doc(`fcm_tokens/${uid}`).get();
            const token = tokenDoc.data()?.token;
            if (!token) return;
            await messaging.send({
              token,
              notification: { title, body },
              data: { type: 'attendance', schoolId },
            });
          } catch (e: any) {
            console.warn('[attendanceWatch] FCM failed for', uid.slice(-6), ':', e.code ?? e.message);
          }
        }),
      );

      await markerRef.set(markerData);
      alertsSent++;
      details.push({ schoolId, class: p.className, subject: p.subject, startTime: p.startTime });
    }
  }

  // Housekeeping: markers older than 3 days are dead weight.
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().split('T')[0];
  const stale = await db
    .collection('attendance_alerts')
    .where('date', '<', cutoff)
    .limit(ATT_MARKER_CLEANUP)
    .get();
  if (!stale.empty) {
    const batch = db.batch();
    stale.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`[attendanceWatch] schools=${schoolsChecked} alerts=${alertsSent}`);
  return res.status(200).json({ ok: true, schoolsChecked, alertsSent, details });
}
