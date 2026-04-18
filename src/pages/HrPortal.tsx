/**
 * HR Portal landing — staff directory, leave queue, onboarding stub.
 *
 * MVP for Phase 3: reuses /admin/staff under the hood for the actual
 * directory, but presents an HR-focused dashboard view here.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { Users, UserPlus, CalendarOff, ClipboardList, ArrowRight } from 'lucide-react';

export default function HrPortal() {
  const { schoolId, schoolName } = useSchool();
  const [stats, setStats] = useState({ totalStaff: 0, pendingLeave: 0 });

  useEffect(() => {
    if (!schoolId) return;
    const sUnsub = onSnapshot(
      query(collection(db, 'staff'), where('schoolId', '==', schoolId)),
      snap => setStats(s => ({ ...s, totalStaff: snap.size })),
      () => {},
    );
    const lUnsub = onSnapshot(
      query(collection(db, 'leave_requests'), where('schoolId', '==', schoolId), where('status', '==', 'pending')),
      snap => setStats(s => ({ ...s, pendingLeave: snap.size })),
      () => {},
    );
    return () => { sUnsub(); lUnsub(); };
  }, [schoolId]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Human Resources</p>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900">HR Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">{schoolName}</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total Staff" value={stats.totalStaff} tone="indigo" />
        <StatCard icon={<CalendarOff className="w-5 h-5" />} label="Pending Leave Requests" value={stats.pendingLeave} tone="amber" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink to="/admin/staff" icon={<Users className="w-5 h-5" />} title="Staff Directory" desc="View, add, deactivate staff records." />
        <QuickLink to="/hr/leave" icon={<CalendarOff className="w-5 h-5" />} title="Leave Requests" desc="Approve or decline staff leave applications." />
        <QuickLink to="/hr/onboarding" icon={<UserPlus className="w-5 h-5" />} title="Onboarding" desc="Track new-hire paperwork and orientation." />
        <QuickLink to="/hr/policies" icon={<ClipboardList className="w-5 h-5" />} title="Policies & Documents" desc="Maintain the staff handbook and policy library." />
      </section>

      <div className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        🚧 Sub-pages (leave queue, onboarding tracker, policy library) ship in a follow-up release.
        For now use the linked admin tools.
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'indigo' | 'amber' }) {
  const colors = tone === 'indigo'
    ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
    : 'bg-amber-50 text-amber-700 border-amber-100';
  return (
    <div className={`rounded-2xl border p-5 ${colors}`}>
      <div className="flex items-center gap-2 opacity-80">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="group block p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">{icon}</div>
        <div className="flex-1">
          <p className="font-bold text-slate-900 text-sm">{title}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
      </div>
      <p className="mt-3 text-xs text-slate-500">{desc}</p>
    </Link>
  );
}
