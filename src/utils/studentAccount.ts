/**
 * Synthetic school-email account provisioning for newly admitted students.
 *
 * Some children are too young to have a personal email. Schools can still
 * give them a login by minting a synthetic address like
 * `{studentId}@students.{slug}.local` — it's not a deliverable mailbox, just
 * a Firebase Auth identifier the child uses to sign in. The class-gate
 * (`studentAccountMinClass` in school_settings) decides who gets one.
 *
 * All communication still flows through the in-app `messages` collection
 * and the Student Portal, so no real inbox is needed.
 */
import type { SchoolSettings } from '../pages/SchoolSettings';

/**
 * Returns true when a student entering `studentClass` should have a synthetic
 * login auto-provisioned, based on the school's configured minimum.
 *
 * Comparison uses ordinal position in `classLadder` (typically SCHOOL_CLASSES
 * from types.ts or the school's custom `schoolLevels`). If the configured
 * minimum or the student's class is missing from the ladder, the check fails
 * closed (no auto-provision).
 */
export function shouldProvisionStudentAccount(
  studentClass: string | undefined,
  settings: Pick<SchoolSettings, 'studentAccountMinClass'>,
  classLadder: string[],
): boolean {
  const minClass = settings.studentAccountMinClass;
  if (!minClass || !studentClass) return false;
  const minIdx = classLadder.indexOf(minClass);
  const curIdx = classLadder.indexOf(studentClass);
  if (minIdx < 0 || curIdx < 0) return false;
  return curIdx >= minIdx;
}

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
