import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useImpersonation } from './ImpersonationContext';

/** Persistent "Viewing as ..." banner shown in every layout while a super_admin View As session is active. */
export function ImpersonationBanner() {
  const { isImpersonating, impersonatedProfile, expiresAt, endImpersonation } = useImpersonation();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isImpersonating) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isImpersonating]);

  if (!isImpersonating || !impersonatedProfile) return null;

  const msLeft = Math.max(0, (expiresAt ?? 0) - now);
  const mm = String(Math.floor(msLeft / 60000)).padStart(2, '0');
  const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="bg-rose-600 text-white text-sm font-semibold px-4 py-2 flex items-center gap-3">
      <ShieldAlert className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        Viewing as <strong>{impersonatedProfile.displayName || impersonatedProfile.email}</strong>{' '}
        ({impersonatedProfile.role.replace('_', ' ')}) — read-only · expires in {mm}:{ss}
      </span>
      <button
        onClick={() => endImpersonation('manual')}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
      >
        Exit View As
      </button>
    </div>
  );
}
