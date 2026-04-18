/**
 * Permission flag system for Phase 4 RBAC.
 *
 * Each permission is a string `<resource>.<action>`. The default set per role
 * lives in DEFAULT_ROLE_PERMISSIONS; per-user grants live in
 * `users/{uid}.permissions[]` and are *additive* — they extend, not replace,
 * the role defaults.
 *
 * Use via the `hasPermission()` helper exported from useAuth() rather than
 * checking strings directly in components, so future changes (e.g. moving to
 * a server-issued JWT claim) only require touching this file.
 */
import type { UserProfile } from '../types';

export type Permission =
  // Finance
  | 'finance.read' | 'finance.write'
  | 'payroll.read' | 'payroll.process'
  | 'expenses.write'
  // Academic
  | 'admissions.review' | 'admissions.create'
  | 'students.read' | 'students.write'
  | 'grades.write' | 'attendance.write'
  | 'exams.create' | 'timetable.write'
  | 'curriculum.write'
  // Staff & HR
  | 'staff.read' | 'staff.manage'
  | 'leave.approve'
  | 'payroll.input'
  // Comms
  | 'notifications.send' | 'messages.send'
  // Library
  | 'library.read' | 'library.write' | 'library.circulate'
  // Settings
  | 'settings.read' | 'settings.write'
  | 'users.manage'
  // Platform
  | 'platform.manage';

export const DEFAULT_ROLE_PERMISSIONS: Record<UserProfile['role'], Permission[]> = {
  super_admin: ['platform.manage'], // super_admin shortcuts every other check
  admin: [
    'finance.read', 'finance.write', 'payroll.read', 'payroll.process', 'expenses.write',
    'admissions.review', 'admissions.create', 'students.read', 'students.write',
    'grades.write', 'attendance.write', 'exams.create', 'timetable.write', 'curriculum.write',
    'staff.read', 'staff.manage', 'leave.approve', 'payroll.input',
    'notifications.send', 'messages.send',
    'library.read', 'library.write', 'library.circulate',
    'settings.read', 'settings.write', 'users.manage',
  ],
  School_admin: [
    'finance.read', 'finance.write', 'payroll.read', 'payroll.process', 'expenses.write',
    'admissions.review', 'admissions.create', 'students.read', 'students.write',
    'grades.write', 'attendance.write', 'exams.create', 'timetable.write', 'curriculum.write',
    'staff.read', 'staff.manage', 'leave.approve', 'payroll.input',
    'notifications.send', 'messages.send',
    'library.read', 'library.write', 'library.circulate',
    'settings.read', 'settings.write', 'users.manage',
  ],
  teacher: [
    'students.read', 'grades.write', 'attendance.write', 'exams.create',
    'curriculum.write', 'messages.send', 'library.read',
  ],
  parent: ['students.read', 'messages.send', 'library.read'],
  student: ['students.read', 'messages.send', 'library.read'],
  applicant: [],
  accountant: [
    'finance.read', 'finance.write', 'payroll.read', 'payroll.process',
    'expenses.write', 'messages.send',
  ],
  hr: [
    'staff.read', 'staff.manage', 'leave.approve', 'payroll.input',
    'messages.send',
  ],
  librarian: [
    'library.read', 'library.write', 'library.circulate', 'messages.send',
  ],
  staff: ['messages.send'],
};

/**
 * Returns true if the profile has a given permission, either via their role
 * defaults or via per-user overrides. Super admin always returns true.
 */
export function hasPermission(profile: UserProfile | null | undefined, perm: Permission): boolean {
  if (!profile) return false;
  if (profile.role === 'super_admin') return true;
  const defaults = DEFAULT_ROLE_PERMISSIONS[profile.role] ?? [];
  if (defaults.includes(perm)) return true;
  return profile.permissions?.includes(perm) ?? false;
}

/**
 * Returns the full effective permission set for a profile (role defaults +
 * per-user grants, deduplicated). Useful for the admin Roles UI.
 */
export function effectivePermissions(profile: UserProfile | null | undefined): Permission[] {
  if (!profile) return [];
  const defaults = DEFAULT_ROLE_PERMISSIONS[profile.role] ?? [];
  const extra = (profile.permissions ?? []) as Permission[];
  return Array.from(new Set([...defaults, ...extra]));
}

/** Permissions that are NOT in the role's defaults — useful for the override UI. */
export function grantablePermissions(role: UserProfile['role']): Permission[] {
  const defaults = new Set(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
  const all: Permission[] = [
    'finance.read', 'finance.write', 'payroll.read', 'payroll.process', 'expenses.write',
    'admissions.review', 'admissions.create', 'students.read', 'students.write',
    'grades.write', 'attendance.write', 'exams.create', 'timetable.write', 'curriculum.write',
    'staff.read', 'staff.manage', 'leave.approve', 'payroll.input',
    'notifications.send', 'messages.send',
    'library.read', 'library.write', 'library.circulate',
    'settings.read', 'settings.write', 'users.manage',
  ];
  return all.filter(p => !defaults.has(p));
}
