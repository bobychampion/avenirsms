import type { UserProfile } from '../types';

/** Where to send a signed-in user (matches Home / ProtectedRoute intent). */
export function getPostAuthHomePath(isAdmin: boolean, profile: UserProfile | null): string {
  if (profile?.role === 'super_admin') return '/super-admin';
  if (isAdmin) return '/admin';
  if (profile?.role === 'teacher') return '/teacher';
  if (profile?.role === 'parent') return '/parent';
  return '/apply';
}
