import type { IncomingMessage } from 'http';
import { getAuth, getFirestore } from './admin';

export interface CallerContext {
  uid: string;
  role: string;
  schoolId: string | null;
  email: string | null;
}

export class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }

  get httpStatus(): number {
    const map: Record<string, number> = {
      unauthenticated: 401,
      'permission-denied': 403,
      'not-found': 404,
      'invalid-argument': 400,
      'failed-precondition': 400,
      'already-exists': 409,
      'resource-exhausted': 429,
      internal: 500,
    };
    return map[this.code] ?? 500;
  }
}

const CODE_TO_STATUS: Record<string, number> = {
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'invalid-argument': 400,
  'failed-precondition': 400,
  'already-exists': 409,
  'resource-exhausted': 429,
  internal: 500,
};

export function errorResponse(res: any, err: unknown) {
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({ error: err.message, code: err.code });
  }
  // Handle HttpsError from our compat shim (used in storageHandlers.ts)
  if (err instanceof Error && 'code' in err && typeof (err as any).code === 'string') {
    const code = (err as any).code as string;
    const status = CODE_TO_STATUS[code] ?? 500;
    return res.status(status).json({ error: err.message, code });
  }
  console.error('[api]', err);
  return res.status(500).json({ error: 'Internal server error', code: 'internal' });
}

export async function requireAuth(req: IncomingMessage): Promise<CallerContext> {
  const header = (req as any).headers?.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('unauthenticated', 'Sign-in required.');

  const decoded = await getAuth().verifyIdToken(token);
  const db = getFirestore();
  const snap = await db.doc(`users/${decoded.uid}`).get();
  const profile = snap.data();
  if (!profile) throw new AppError('not-found', 'User profile not found.');

  return {
    uid: decoded.uid,
    role: profile.role ?? '',
    schoolId: profile.schoolId ?? null,
    email: profile.email ?? null,
  };
}

export function isSuperAdmin(caller: CallerContext) {
  return caller.role === 'super_admin';
}

export function isSchoolAdmin(caller: CallerContext, schoolId: string) {
  return (
    (caller.role === 'admin' || caller.role === 'School_admin') &&
    caller.schoolId === schoolId
  );
}
