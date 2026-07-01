import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSchoolId } from '../hooks/useSchoolId';
import { Clock, Zap, AlertTriangle } from 'lucide-react';

interface DemoInfo {
  status: string;
  subscriptionExpiresAt?: any;
}

/**
 * Shown inside the admin layout when the school has status='demo'.
 * Displays days remaining and links to the conversion page.
 * One-time getDoc on mount — no live listener needed for a banner.
 */
export default function DemoBanner() {
  const schoolId = useSchoolId();
  const [demo, setDemo] = useState<DemoInfo | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, 'schools', schoolId)).then(snap => {
      if (snap.exists() && snap.data().status === 'demo') {
        setDemo({ status: 'demo', subscriptionExpiresAt: snap.data().subscriptionExpiresAt });
      }
    }).catch(() => {/* non-fatal */});
  }, [schoolId]);

  if (!demo) return null;

  const expiresDate: Date | null = demo.subscriptionExpiresAt?.toDate?.() ?? null;
  const daysLeft = expiresDate
    ? Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const isExpired = daysLeft !== null && daysLeft <= 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2;

  if (isExpired) {
    return (
      <div className="bg-rose-600 text-white text-sm font-semibold px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">Your 7-day demo has expired. Convert to a full account to keep your data and access.</span>
        <Link to="/admin/convert-demo" className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
          <Zap className="w-3.5 h-3.5" /> Convert Now
        </Link>
      </div>
    );
  }

  return (
    <div className={`text-sm font-semibold px-4 py-2 flex items-center gap-3 ${isUrgent ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
      <Clock className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {daysLeft !== null
          ? <>Demo account — <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong> remaining. Convert to keep your school data permanently.</>
          : <>This is a demo account. Convert to a full account to keep your data.</>
        }
      </span>
      <Link to="/admin/convert-demo" className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
        <Zap className="w-3.5 h-3.5" /> Convert to Full Account
      </Link>
    </div>
  );
}
