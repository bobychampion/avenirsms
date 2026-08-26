import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors.js';

/** Health check — no Firebase import so it can never crash on a bad key. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  const pk = process.env.FIREBASE_PRIVATE_KEY ?? '';
  const pkStatus = pk.length === 0
    ? 'NOT SET'
    : pk.startsWith('-----BEGIN PRIVATE KEY-----')
      ? 'OK'
      : `WRONG FORMAT — starts with: ${pk.slice(0, 30)}`;

  res.status(200).json({
    ok: true,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'NOT SET',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? 'NOT SET',
    FIREBASE_PRIVATE_KEY: pkStatus,
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'SET' : 'NOT SET',
    CRON_SECRET: process.env.CRON_SECRET ? 'SET' : 'NOT SET',
  });
}
