/**
 * useEffectiveUid — the uid whose data should be loaded, as opposed to
 * `useAuth().user.uid`, which is ALWAYS the real signed-in Firebase Auth
 * identity and deliberately never changes during a super_admin "View As"
 * session (see ImpersonationContext.tsx — request.auth.uid staying real is
 * what lets firestore.rules be the sole enforcement for impersonation).
 *
 * Any query scoped to "the current user" (teacherId == X, staffId == X, etc.)
 * must use this instead of the raw auth uid, or it silently queries the
 * super_admin's own uid while impersonating and returns nothing.
 *
 * Mirrors useSchoolId()'s precedence pattern.
 */

import { useAuth } from '../components/FirebaseProvider';
import { useImpersonation } from '../components/ImpersonationContext';

export function useEffectiveUid(): string | undefined {
  const { user } = useAuth();
  const { impersonatedProfile } = useImpersonation();

  return impersonatedProfile?.uid ?? user?.uid;
}
