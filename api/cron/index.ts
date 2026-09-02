import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  runDailyReminders,
  runExpireDemo,
  runSendScheduled,
  runAttendanceWatch,
} from '../_lib/jobs.js';

// Single cron dispatcher. Vercel's Hobby plan caps this project at 12
// Serverless Functions, so every scheduled job routes through here via
// ?job=<name> instead of costing its own file. Secured by CRON_SECRET — the
// same bearer token Vercel Cron sends and that external schedulers must send.
//
//   /api/cron?job=daily-reminders     (Vercel Cron — vercel.json)
//   /api/cron?job=expire-demo         (Vercel Cron — vercel.json)
//   /api/cron?job=attendance-watch    (external scheduler — GitHub Actions)
//   /api/cron?job=send-scheduled      (manual / diagnostic)

const JOBS: Record<string, (res: VercelResponse) => Promise<unknown>> = {
  'daily-reminders': runDailyReminders,
  'expire-demo': runExpireDemo,
  'send-scheduled': runSendScheduled,
  'attendance-watch': runAttendanceWatch,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const job = String(req.query.job || '');
  const fn = JOBS[job];
  if (!fn) {
    return res.status(400).json({ error: `Unknown job: ${job || '(none)'}`, jobs: Object.keys(JOBS) });
  }

  try {
    return await fn(res);
  } catch (err: any) {
    console.error(`[cron:${job}] Failed:`, err);
    return res.status(500).json({ error: err?.message ?? String(err), code: err?.code ?? 'internal' });
  }
}
