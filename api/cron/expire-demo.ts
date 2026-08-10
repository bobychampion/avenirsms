import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from '../_lib/admin.js';
import { Timestamp } from 'firebase-admin/firestore';
import { processDueMessages } from './send-scheduled.js';

// Invoked by Vercel Cron daily at 00:00 UTC (schedule in vercel.json).
// Also processes due Communications Hub scheduled sends — Vercel's Hobby plan
// caps cron jobs at 2, so scheduled comms don't get their own dedicated cron
// and are checked here instead (once daily rather than hourly).
// Secured by CRON_SECRET env var — Vercel sets Authorization: Bearer <secret>.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
