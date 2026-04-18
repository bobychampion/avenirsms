import type { UserProfile } from '../types';

/** Where to send a signed-in user (matches Home / ProtectedRoute intent). */
export function getPostAuthHomePath(isAdmin: boolean, profile: UserProfile | null): string {
  const role = profile?.role;
  if (role === 'super_admin') return '/super-admin';
  if (isAdmin) return '/admin';
  if (role === 'teacher') return '/teacher';
  if (role === 'parent') return '/parent';
  if (role === 'student') return '/student';
  if (role === 'accountant') return '/accountant';
  if (role === 'hr') return '/hr';
  if (role === 'librarian') return '/library';
  if (role === 'staff') return '/home';
  return '/apply';
}
