import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Health check — no Firebase import so it can never crash on a bad key. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
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
