/**
 * Module-level mirror of the active "View As" session, kept in sync by
 * ImpersonationContext. Plain async service functions (firestoreService.ts
 * etc.) that live outside the React tree call assertNotImpersonating() as a
 * defense-in-depth backstop before writing.
 *
 * This is NOT the primary control — Firestore rules are intentionally
 * unchanged for the read-only "View As" design, so the real signed-in
 * super_admin identity could still write via the rules' isSuperAdmin()
 * checks. The primary control is disabling write UI while impersonating;
 * this guard only catches writes that go through the shared CRUD helpers.
 */

let active = false;

export function setImpersonationActive(value: boolean) {
  active = value;
}

export function isImpersonationActive(): boolean {
  return active;
}

export class ImpersonationReadOnlyError extends Error {
  constructor() {
    super('This action is disabled while viewing as another user.');
    this.name = 'ImpersonationReadOnlyError';
  }
}

export function assertNotImpersonating() {
  if (active) throw new ImpersonationReadOnlyError();
}
