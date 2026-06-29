import { useAuth } from '../components/FirebaseProvider';
import { useImpersonation } from '../components/ImpersonationContext';
import type { UserProfile } from '../types';

/**
 * Returns the profile to use for ROUTING and DASHBOARD-SELECTION decisions
 * only — the impersonated target's profile while a super_admin "View As"
 * session is active, otherwise the real signed-in profile.
 *
 * Never use this for permission or write checks: hasPermission() and any
 * mutation gate must keep using the real profile from useAuth(), since the
 * impersonating super_admin remains the real Firebase Auth identity for
 * every Firestore rule evaluation — only this hook's read/display surface
 * is meant to reflect the target user.
 */
export function useEffectiveProfile(): UserProfile | null {
  const { profile } = useAuth();
  const { impersonatedProfile } = useImpersonation();
  if (impersonatedProfile && profile) {
    return {
      ...profile,
      uid: impersonatedProfile.uid,
      role: impersonatedProfile.role,
      schoolId: impersonatedProfile.schoolId ?? undefined,
      displayName: impersonatedProfile.displayName,
      email: impersonatedProfile.email,
    };
  }
  return profile;
}
