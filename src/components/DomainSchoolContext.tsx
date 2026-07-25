import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface DomainSchoolContextValue {
  /** schoolId resolved from the current hostname via school_domains/{hostname}, or null if this isn't a school's custom domain. */
  domainSchoolId: string | null;
  domainSchoolLoading: boolean;
}

const DomainSchoolContext = createContext<DomainSchoolContextValue>({
  domainSchoolId: null,
  domainSchoolLoading: false,
});

export function useDomainSchool() {
  return useContext(DomainSchoolContext);
}

// These never map to a single school — skip the lookup so every normal
// platform visit doesn't pay for a Firestore round trip on boot.
function isPlatformHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com')
  );
}

export function DomainSchoolProvider({ children }: { children: React.ReactNode }) {
  const [domainSchoolId, setDomainSchoolId] = useState<string | null>(null);
  const [domainSchoolLoading, setDomainSchoolLoading] = useState(true);

  useEffect(() => {
    const hostname = window.location.hostname;
    if (isPlatformHostname(hostname)) {
      setDomainSchoolLoading(false);
      return;
    }
    getDoc(doc(db, 'school_domains', hostname))
      .then(snap => {
        if (snap.exists()) {
          const schoolId = snap.data().schoolId as string | undefined;
          if (schoolId) setDomainSchoolId(schoolId);
        }
      })
      .catch(() => {})
      .finally(() => setDomainSchoolLoading(false));
  }, []);

  return (
    <DomainSchoolContext.Provider value={{ domainSchoolId, domainSchoolLoading }}>
      {children}
    </DomainSchoolContext.Provider>
  );
}
