import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from '../_lib/admin.js';
import { sendToRecipients } from '../comms.js';
import { Timestamp } from 'firebase-admin/firestore';

// Not a registered Vercel Cron — Hobby plan caps cron jobs at 2, and this
// project already uses both (daily-reminders, expire-demo). processDueMessages
// is instead called from expire-demo.ts's daily run, so scheduled sends are
// checked once a day rather than hourly. This file stays deployable on its
// own (POST with CRON_SECRET) for manual testing/triggering.
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

// Secured by CRON_SECRET env var, same as the registered crons — invoke manually
// for testing: POST with Authorization: Bearer <CRON_SECRET>.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getFirestore();
    const results = await processDueMessages(db);
    console.log(`[send-scheduled] Processed ${results.length} scheduled message(s).`);
    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err: any) {
    console.error('[send-scheduled] Failed:', err);
    return res.status(500).json({ error: err?.message ?? String(err), code: err?.code ?? 'internal' });
  }
}
