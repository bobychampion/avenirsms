/**
 * Super-admin email guard
 * ─────────────────────────────────────────────────────────────────────────────
 * These are platform-owner emails that are hardcoded as super_admin bootstraps.
 * They MUST NOT be reused as parents, teachers, students, or any school-scoped
 * role — doing so causes Firestore permission conflicts because the `userProfile()`
 * helper in security rules reads the `role` field, and a single Firebase Auth UID
 * cannot hold two different role profiles simultaneously.
 */

export const SUPER_ADMIN_EMAILS: readonly string[] = [
  'jabpa87@gmail.com',
  'bobychampion87@gmail.com',
];

/**
 * Returns true if the given email is reserved for super-admin use only.
 * Comparison is case-insensitive.
 */
export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Throws a user-friendly Error if the email is a super-admin reserved address.
 * Use this as an early guard before any Firebase Auth createUser / setDoc calls.
 */
export function assertNotSuperAdminEmail(email: string, context = 'account'): void {
  if (isSuperAdminEmail(email)) {
    throw new Error(
      `"${email.trim().toLowerCase()}" is a platform super-admin address and cannot be ` +
      `used as a ${context}. Please use a different email address.`
    );
  }
}
