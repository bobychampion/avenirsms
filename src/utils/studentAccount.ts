/**
 * Synthetic school-email account provisioning for newly admitted students.
 *
 * Firebase Auth requires an email address — students don't have real emails,
 * so we mint a synthetic one internally (e.g. `stu-001@students.greenfield.local`).
 * Students never see this address. They sign in with their Student ID + password only.
 * The synthetic email is stored on the student doc and in the `student_logins` index.
 */
import type { SchoolSettings } from '../pages/SchoolSettings';

/** Normalise an arbitrary string to a safe DNS-ish slug. */
function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'school';
}

/**
 * Build the synthetic login address. Uses the school's `urlSlug` when set,
 * otherwise falls back to a slugified `schoolName`. Example:
 *   `stu-2026-001@students.greenfield.local`
 */
export function buildStudentLoginEmail(
  studentId: string,
  settings: Pick<SchoolSettings, 'urlSlug' | 'schoolName'>,
): string {
  const slug = slugify(settings.urlSlug || settings.schoolName);
  const local = studentId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${local}@students.${slug}.local`;
}

/**
 * Generate a memorable temporary password. Not high-entropy — the student is
 * forced to change it on first login (via `mustChangePassword`).
 */
export function generateStudentTempPassword(studentId: string): string {
  const year = new Date().getFullYear();
  const digits = (studentId.match(/\d+/g)?.join('') ?? '').slice(-4).padStart(4, '0');
  return `Student@${digits}${year}`;
}

/**
 * Write (or overwrite) the student_logins index entry for a given student.
 * Doc ID = "{schoolId}_{studentId_uppercased}".
 * This is the only document the login page reads — publicly readable,
 * contains no sensitive data beyond the synthetic loginEmail.
 */
export async function upsertStudentLoginIndex(
  db: import('firebase/firestore').Firestore,
  schoolId: string,
  studentId: string,
  loginEmail: string,
): Promise<void> {
  const { doc, setDoc } = await import('firebase/firestore');
  const entryId = `${schoolId}_${studentId.trim().toUpperCase()}`;
  await setDoc(
    doc(db, 'student_logins', entryId),
    { schoolId, studentId: studentId.trim().toUpperCase(), loginEmail },
    { merge: true }
  );
}
