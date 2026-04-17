/**
 * SuperAdminContext — React-only context (no Firestore reads).
 *
 * Allows a super_admin to "enter" any school and view/manage its data
 * without permanently tying their profile to that school.
 *
 * When activeSchoolId is set:
 *  - SchoolProvider uses it as the effective schoolId for subscriptions
 *  - Layout shows a "Viewing: [School Name] [Exit]" banner
 *  - ProtectedRoute allows access to /admin/* routes
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SuperAdminContextType {
  /** The school the super_admin is currently viewing (null = own platform dashboard) */
  activeSchoolId: string | null;
  /** Display name of the active school (empty string when no active school) */
  activeSchoolName: string;
  /** Enter a school context to manage its data */
  enterSchool: (id: string, name: string) => void;
  /** Exit back to the super_admin platform dashboard */
  exitSchool: () => void;
}

const SuperAdminContext = createContext<SuperAdminContextType | undefined>(undefined);

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [activeSchoolName, setActiveSchoolName] = useState('');

  const enterSchool = (id: string, name: string) => {
    setActiveSchoolId(id);
    setActiveSchoolName(name);
  };

  const exitSchool = () => {
    setActiveSchoolId(null);
    setActiveSchoolName('');
  };

  return (
    <SuperAdminContext.Provider value={{ activeSchoolId, activeSchoolName, enterSchool, exitSchool }}>
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminContext);
  if (!ctx) throw new Error('useSuperAdmin must be used within SuperAdminProvider');
  return ctx;
}
