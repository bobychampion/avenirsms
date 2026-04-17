import React, { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MobileShell } from '../../components/MobileShell';
import { useAuth } from '../../components/FirebaseProvider';
import { Application, Invoice, Notification } from '../../types';
import {
  UserCheck, DollarSign, Bell, Users, ChevronRight,
  Clock, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useSchoolId } from '../../hooks/useSchoolId';

interface Stats {
  pendingApplications: number;
  overdueFeesTotal: number;
  overdueCount: number;
}

const statusColor = (s: string) =>
  s === 'pending' ? 'bg-amber-100 text-amber-700' :
  s === 'reviewing' ? 'bg-blue-100 text-blue-700' :
  s === 'approved' ? 'bg-emerald-100 text-emerald-700' :
  'bg-red-100 text-red-700';

const statusIcon = (s: string) =>
  s === 'pending' ? Clock :
  s === 'approved' ? CheckCircle2 :
  s === 'rejected' ? XCircle :
  AlertCircle;

export default function AdminMobileDashboard() {
  const { profile } = useAuth();
  const schoolId = useSchoolId();
  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', month: 'short', day: 'numeric' });

  const [stats, setStats] = useState<Stats>({ pendingApplications: 0, overdueFeesTotal: 0, overdueCount: 0 });
  const [applications, setApplications] = useState<(Application & { id: string })[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<(Invoice & { id: string })[]>([]);
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([]);

  useEffect(() => {
    if (!schoolId) return;
    const unsubs: (() => void)[] = [];

    // Pending applications
    unsubs.push(onSnapshot(
      query(collection(db, 'applications'), where('schoolId', '==', schoolId!), where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(10)),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Application & { id: string }));
        setApplications(docs);
        setStats(prev => ({ ...prev, pendingApplications: snap.size }));
      }
    ));

    // Overdue invoices
    unsubs.push(onSnapshot(
      query(collection(db, 'invoices'), where('schoolId', '==', schoolId!), where('status', '==', 'overdue'), orderBy('dueDate', 'asc'), limit(5)),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice & { id: string }));
        setOverdueInvoices(docs);
        const total = docs.reduce((sum, inv) => sum + (inv.amount || 0), 0);
        setStats(prev => ({ ...prev, overdueFeesTotal: total, overdueCount: snap.size }));
      }
    ));

    // Recent notifications
    unsubs.push(onSnapshot(
      query(collection(db, 'notifications'), where('schoolId', '==', schoolId!), orderBy('createdAt', 'desc'), limit(5)),
      snap => {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification & { id: string })));
      }
    ));

    return () => unsubs.forEach(u => u());
  }, [schoolId]);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  return (
    <MobileShell role="admin">
      <div className="px-4 pt-5 pb-4 space-y-5">

        {/* ── HERO ── */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200">
          <p className="text-indigo-200 text-xs font-medium">{today}</p>
          <h1 className="text-lg font-bold mt-1 leading-tight">
            {greeting()}, {profile?.displayName?.split(' ')[0] ?? 'Admin'} 👋
          </h1>
          <p className="text-indigo-200 text-xs mt-0.5">Here's what needs your attention today</p>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={UserCheck}
            label="Pending Admissions"
            value={stats.pendingApplications}
            accent="indigo"
            to="/admin/admissions"
          />
          <StatCard
            icon={DollarSign}
            label="Overdue Fees"
            value={`₦${(stats.overdueFeesTotal / 1000).toFixed(0)}k`}
            sublabel={`${stats.overdueCount} invoices`}
            accent="rose"
            to="/admin/finance"
          />
        </div>

        {/* ── PENDING APPLICATIONS ── */}
        {applications.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Pending Applications</h2>
              <Link to="/admin/admissions" className="text-xs text-indigo-600 font-semibold flex items-center gap-0.5">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {applications.slice(0, 5).map(app => {
                const Icon = statusIcon(app.status);
                return (
                  <Link
                    key={app.id}
                    to={`/admin/application/${app.id}`}
                    className="flex items-center gap-3 bg-white rounded-xl p-3.5 shadow-sm border border-slate-100 active:scale-[0.98] transition-transform"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {app.applicantName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{app.applicantName}</p>
                      <p className="text-xs text-slate-500 truncate">{app.classApplyingFor}</p>
                    </div>
                    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1', statusColor(app.status))}>
                      <Icon className="w-3 h-3" />{app.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── OVERDUE FEES ── */}
        {overdueInvoices.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Overdue Fees</h2>
              <Link to="/admin/finance" className="text-xs text-rose-600 font-semibold flex items-center gap-0.5">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {overdueInvoices.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 bg-white rounded-xl p-3.5 shadow-sm border border-rose-50">
                  <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{inv.studentName}</p>
                    <p className="text-xs text-slate-500">{inv.description} · Due {inv.dueDate}</p>
                  </div>
                  <span className="text-sm font-bold text-rose-600">₦{inv.amount?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── RECENT NOTIFICATIONS ── */}
        {notifications.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Recent Alerts</h2>
              <Link to="/admin/notifications" className="text-xs text-indigo-600 font-semibold flex items-center gap-0.5">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {notifications.map(n => (
                <div key={n.id} className="flex items-start gap-3 bg-white rounded-xl p-3.5 shadow-sm border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── QUICK LINKS ── */}
        <section>
          <h2 className="text-sm font-bold text-slate-800 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: '/admin', label: 'Full Dashboard', icon: Users, color: 'bg-indigo-50 text-indigo-700' },
              { to: '/admin/attendance', label: 'Attendance', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
              { to: '/admin/finance', label: 'Finance', icon: DollarSign, color: 'bg-rose-50 text-rose-700' },
              { to: '/admin/notifications', label: 'Send Alert', icon: Bell, color: 'bg-violet-50 text-violet-700' },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={cn('flex items-center gap-2 px-3 py-3 rounded-xl font-semibold text-sm border border-slate-100 bg-white shadow-sm active:scale-95 transition-transform', item.color)}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </section>

      </div>
    </MobileShell>
  );
}

function StatCard({
  icon: Icon, label, value, sublabel, accent, to
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sublabel?: string;
  accent: 'indigo' | 'rose' | 'emerald' | 'amber';
  to: string;
}) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };
  return (
    <Link to={to} className={cn('rounded-2xl p-4 border shadow-sm flex flex-col gap-2 active:scale-95 transition-transform', colors[accent])}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accent === 'indigo' ? 'bg-indigo-100' : accent === 'rose' ? 'bg-rose-100' : accent === 'emerald' ? 'bg-emerald-100' : 'bg-amber-100')}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {sublabel && <p className="text-[10px] text-slate-500">{sublabel}</p>}
        <p className="text-[11px] font-medium text-slate-600 mt-0.5">{label}</p>
      </div>
    </Link>
  );
}
