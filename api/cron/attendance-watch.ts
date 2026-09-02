import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, getMessaging } from '../_lib/admin.js';
import { Timestamp } from 'firebase-admin/firestore';

// ── "Attendance not taken" watch ──────────────────────────────────────────────
//
// If a timetabled lesson has started and no attendance (daily OR subject) has
// been recorded for that class within an admin-configured grace period, every
// school admin gets a notification. Timetable-driven only — no GPS/geofence
// required, so it works for schools that don't use location tracking.
//
// NOT a Vercel Cron: the Hobby plan caps cron jobs at 2 (daily-reminders,
// expire-demo) and only runs them once a day, which is useless for a check that
// must fire minutes after a lesson begins. This endpoint is pinged every
// ~20 min during school hours by an external scheduler
// (.github/workflows/attendance-watch.yml). Secured by CRON_SECRET, same as the
// real crons. Fully idempotent: an `attendance_alerts` marker doc per
// (school, date, class, period) means each lesson alerts at most once, however
// often this runs.

const ALERT_WINDOW_MIN = 90;      // only alert while now ∈ [start + grace, start + grace + this]
const MAX_MARKER_CLEANUP = 300;
const ADMIN_ROLES = ['admin', 'School_admin'];

type Parts = { weekday: string; dateStr: string; minutes: number };

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

function nowInTz(tz: string | undefined): Parts {
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

const safeId = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 400);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    return await run(res);
  } catch (err: any) {
    console.error('[attendanceWatch] Failed:', err);
    return res.status(500).json({ error: err?.message ?? String(err), code: err?.code ?? 'internal' });
  }
}

async function run(res: VercelResponse) {
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
        if (nowMin < dueAt || nowMin > dueAt + ALERT_WINDOW_MIN) continue;
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
        .doc(safeId(`${schoolId}_${dateStr}_${p.className}_${p.slotId || p.startTime}_${p.subject}`));
      if ((await markerRef.get()).exists) continue;

      if (adminUids == null) {
        const uSnap = await db
          .collection('users')
          .where('schoolId', '==', schoolId)
          .where('role', 'in', ADMIN_ROLES)
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
    .limit(MAX_MARKER_CLEANUP)
    .get();
  if (!stale.empty) {
    const batch = db.batch();
    stale.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`[attendanceWatch] schools=${schoolsChecked} alerts=${alertsSent}`);
  return res.status(200).json({ ok: true, schoolsChecked, alertsSent, details });
}
