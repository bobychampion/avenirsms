/**
 * useSchoolId — single source of truth for the effective schoolId used in
 * all Firestore queries and writes.
 *
 * Returns:
 *  - impersonatedProfile.schoolId (super_admin is in a "View As" session)
 *  - activeSchoolId  (super_admin has entered a school's context)
 *  - profile.schoolId (regular school users)
 *  - null            (super_admin on their own platform dashboard)
 *
 * Every page / hook that builds a Firestore query should call this hook
 * and guard with `if (!schoolId) return;` to prevent loading data when
 * no school context is active.
 */

import { useAuth } from '../components/FirebaseProvider';
import { useSuperAdmin } from '../components/SuperAdminContext';
import { useImpersonation } from '../components/ImpersonationContext';

export function useSchoolId(): string | null {
  const { schoolId: profileSchoolId } = useAuth();
  const { activeSchoolId } = useSuperAdmin();
  const { impersonatedProfile } = useImpersonation();

  // Impersonating a user overrides both the super admin's school-browsing
  // context and their own (null) schoolId.
  return impersonatedProfile?.schoolId ?? activeSchoolId ?? profileSchoolId;
}
