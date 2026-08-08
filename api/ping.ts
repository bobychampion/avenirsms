import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin';

/** Health check — tests Firebase Admin init + Firestore reachability. */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const db = getFirestore();
    // Lightweight read: just try to get a non-existent doc — confirms credentials work
    await db.doc('_ping/test').get();
    return res.status(200).json({ ok: true, project: process.env.FIREBASE_PROJECT_ID ?? 'unknown' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message ?? String(err) });
  }
}
