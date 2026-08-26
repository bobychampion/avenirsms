import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Reflects the caller's own Origin back as Access-Control-Allow-Origin. Safe here because every
 * endpoint enforces its own authorization via a Firebase ID token (requireAuth), not via the
 * browser's same-origin policy — and this is a multi-tenant app where a school's frontend can be
 * served from its own custom domain (see school_domains / DomainSchoolContext) while the API
 * lives on a fixed Vercel domain, so there's no single frontend origin to allow-list instead.
 *
 * Without this, any caller whose page origin differs from the API's own origin gets a browser
 * CORS failure ("Failed to fetch") on every request — the preflight OPTIONS request has no
 * Access-Control-Allow-Origin header to satisfy, so the browser blocks the real request before
 * it's ever sent.
 *
 * Call this first in every handler: `if (applyCors(req, res)) return;` — it returns true when
 * the request was a CORS preflight (OPTIONS) that's already been fully handled.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
