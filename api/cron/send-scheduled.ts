import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from '../_lib/admin.js';
import { sendToRecipients } from '../comms.js';
import { Timestamp } from 'firebase-admin/firestore';

// Invoked by Vercel Cron hourly (schedule in vercel.json). Hourly rather than
// more frequent because Vercel's Hobby plan has historically restricted cron
// cadence — verify actual firing behavior after deploy; a Pro plan allows finer
// granularity if sub-hour scheduling precision turns out to matter.
// Secured by CRON_SECRET env var — Vercel sets Authorization: Bearer <secret>.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getFirestore();
    const now = Timestamp.now();

    const dueSnap = await db
      .collection('comms_messages')
      .where('status', '==', 'scheduled')
      .where('scheduledFor', '<=', now)
      .get();

    if (dueSnap.empty) {
      return res.status(200).json({ ok: true, processed: 0 });
    }

    const results: { id: string; status: string; sentCount: number; failedCount: number }[] = [];

    for (const doc of dueSnap.docs) {
      const data = doc.data();
      try {
        const result = await sendToRecipients(db, data.recipients ?? [], data.channels ?? [], data.subject, data.body);
        await doc.ref.update({ status: result.status, failures: result.failures, sentAt: Timestamp.now() });
        results.push({ id: doc.id, status: result.status, sentCount: result.sentCount, failedCount: result.failedCount });
      } catch (e: any) {
        console.error(`[send-scheduled] Message ${doc.id} failed:`, e);
        await doc.ref.update({ status: 'failed', failures: [{ email: '', channel: 'all', error: e?.message ?? 'unknown error' }], sentAt: Timestamp.now() });
        results.push({ id: doc.id, status: 'failed', sentCount: 0, failedCount: data.recipients?.length ?? 0 });
      }
    }

    console.log(`[send-scheduled] Processed ${results.length} scheduled message(s).`);
    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err: any) {
    console.error('[send-scheduled] Failed:', err);
    return res.status(500).json({ error: err?.message ?? String(err), code: err?.code ?? 'internal' });
  }
}
