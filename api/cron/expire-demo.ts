import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from '../_lib/admin.js';
import { Timestamp } from 'firebase-admin/firestore';

// Invoked by Vercel Cron every 6 hours (schedule in vercel.json).
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

  if (expiredSnap.empty) {
    console.log('[expireDemoSchools] No expired demo schools found.');
    return res.status(200).json({ ok: true, suspended: 0 });
  }

  const batch = db.batch();
  for (const schoolDoc of expiredSnap.docs) {
    batch.update(schoolDoc.ref, { status: 'suspended', autoSuspendedAt: now, updatedAt: now });
  }
  await batch.commit();

  console.log(`[expireDemoSchools] Auto-suspended ${expiredSnap.size} expired demo school(s).`);
  return res.status(200).json({ ok: true, suspended: expiredSnap.size });
}
