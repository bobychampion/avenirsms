import React, { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MobileShell } from '../../components/MobileShell';
import { useAuth } from '../../components/FirebaseProvider';
import { Student, Attendance, Invoice, Notification } from '../../types';
import { CheckCircle2, XCircle, Clock, DollarSign, Bell, ChevronRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { format, subDays } from 'date-fns';

const ATT_COLOR: Record<string, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-rose-500',
  late: 'bg-amber-400',
};

const ATT_ICON: Record<string, React.ElementType> = {
  present: CheckCircle2,
  absent: XCircle,
  late: Clock,
};

export default function ParentMobileHome() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<(Student & { id: string })[]>([]);
  const [selectedChild, setSelectedChild] = useState<(Student & { id: string }) | null>(null);
  const [weekAttendance, setWeekAttendance] = useState<Record<string, Attendance>>({});
  const [pendingBalance, setPendingBalance] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([]);

  // 7-day window
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return format(d, 'yyyy-MM-dd');
  });

  // Load linked children
  useEffect(() => {
    if (!profile?.linkedStudentIds?.length) {
      // Fallback: load by guardianUserId
      const unsub = onSnapshot(
        query(collection(db, 'students'), where('guardianUserId', '==', profile?.uid ?? '')),
        snap => {
          const kids = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student & { id: string }));
          setChildren(kids);
          if (kids.length > 0 && !selectedChild) setSelectedChild(kids[0]);
        }
      );
      return () => unsub();
    }

    const unsub = onSnapshot(
      query(collection(db, 'students'), where('__name__', 'in', profile.linkedStudentIds.slice(0, 10))),
      snap => {
        const kids = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student & { id: string }));
        setChildren(kids);
        if (kids.length > 0 && !selectedChild) setSelectedChild(kids[0]);
      }
    );
    return () => unsub();
  }, [profile?.uid]);

  // Load attendance for selected child (last 7 days)
  useEffect(() => {
    if (!selectedChild) return;
    const studentId = selectedChild.studentId || selectedChild.id;
    const unsub = onSnapshot(
      query(
        collection(db, 'attendance'),
        where('studentId', '==', studentId),
        where('date', '>=', weekDays[0]),
        where('date', '<=', weekDays[6])
      ),
      snap => {
        const map: Record<string, Attendance> = {};
        snap.docs.forEach(d => {
          const data = d.data() as Attendance;
          map[data.date] = data;
        });
        setWeekAttendance(map);
      }
    );
    return () => unsub();
  }, [selectedChild?.id]);

  // Load pending invoices for selected child
  useEffect(() => {
    if (!selectedChild) return;
    const studentId = selectedChild.studentId || selectedChild.id;
    const unsub = onSnapshot(
      query(collection(db, 'invoices'), where('studentId', '==', studentId), where('status', 'in', ['pending', 'overdue'])),
      snap => {
        const total = snap.docs.reduce((sum, d) => sum + ((d.data() as Invoice).amount || 0), 0);
        setPendingBalance(total);
        setPendingCount(snap.size);
      }
    );
    return () => unsub();
  }, [selectedChild?.id]);

  // Load announcements
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'notifications'), where('type', '==', 'general'), orderBy('createdAt', 'desc'), limit(5)),
      snap => {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification & { id: string })));
      }
    );
    return () => unsub();
  }, []);

  const presentDays = Object.values(weekAttendance).filter(a => a.status === 'present').length;
  const absentDays = Object.values(weekAttendance).filter(a => a.status === 'absent').length;

  return (
    <MobileShell role="parent">
      <div className="px-4 pt-5 pb-4 space-y-5">

        {/* ── HERO ── */}
        <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-sky-200">
          <p className="text-sky-200 text-xs font-medium">
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="text-lg font-bold mt-1">
            Welcome, {profile?.displayName?.split(' ')[0] ?? 'Parent'} 👋
          </h1>
          <p className="text-sky-200 text-xs mt-0.5">Here's your child's activity summary</p>
        </div>

        {/* ── CHILD SELECTOR ── */}
        {children.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95',
                  selectedChild?.id === child.id
                    ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-200'
                    : 'bg-white text-slate-600 border-slate-200'
                )}
              >
                <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-xs font-bold">
                  {child.studentName?.[0]?.toUpperCase()}
                </div>
                {child.studentName?.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {selectedChild && (
          <>
            {/* ── CHILD INFO CARD ── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {selectedChild.studentName?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900">{selectedChild.studentName}</p>
                <p className="text-xs text-slate-500">{selectedChild.currentClass}</p>
              </div>
              <div className="ml-auto flex gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-emerald-600">{presentDays}</p>
                  <p className="text-[10px] text-slate-500">Present</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-rose-500">{absentDays}</p>
                  <p className="text-[10px] text-slate-500">Absent</p>
                </div>
              </div>
            </div>

            {/* ── 7-DAY ATTENDANCE STRIP ── */}
            <section>
              <h2 className="text-sm font-bold text-slate-800 mb-3">This Week's Attendance</h2>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex justify-between">
                  {weekDays.map(dayISO => {
                    const record = weekAttendance[dayISO];
                    const dayLabel = format(new Date(dayISO + 'T12:00:00'), 'EEE');
                    const dayNum = format(new Date(dayISO + 'T12:00:00'), 'd');
                    const isToday = dayISO === format(new Date(), 'yyyy-MM-dd');
                    const Icon = record ? ATT_ICON[record.status] : null;
                    return (
                      <div key={dayISO} className="flex flex-col items-center gap-1">
                        <span className={cn('text-[10px] font-semibold', isToday ? 'text-sky-600' : 'text-slate-400')}>
                          {dayLabel}
                        </span>
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center',
                          record ? ATT_COLOR[record.status] : 'bg-slate-100',
                          isToday && !record ? 'border-2 border-sky-300' : ''
                        )}>
                          {Icon ? (
                            <Icon className="w-4 h-4 text-white" />
                          ) : (
                            <span className={cn('text-xs font-semibold', isToday ? 'text-sky-600' : 'text-slate-400')}>
                              {dayNum}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {record ? record.status.charAt(0).toUpperCase() : '–'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ── FEE BALANCE ── */}
            <section>
              <h2 className="text-sm font-bold text-slate-800 mb-3">Fee Balance</h2>
              <div className={cn(
                'rounded-2xl p-4 shadow-sm border flex items-center gap-3',
                pendingBalance > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'
              )}>
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  pendingBalance > 0 ? 'bg-rose-100' : 'bg-emerald-100'
                )}>
                  <DollarSign className={cn('w-5 h-5', pendingBalance > 0 ? 'text-rose-600' : 'text-emerald-600')} />
                </div>
                <div className="flex-1">
                  <p className={cn('text-xl font-bold', pendingBalance > 0 ? 'text-rose-700' : 'text-emerald-700')}>
                    {pendingBalance > 0 ? `₦${pendingBalance.toLocaleString()}` : 'All Clear'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pendingBalance > 0 ? `${pendingCount} outstanding invoice${pendingCount > 1 ? 's' : ''}` : 'No outstanding fees'}
                  </p>
                </div>
                <Link to="/parent" className="text-xs text-sky-600 font-semibold flex items-center gap-0.5">
                  Details <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </section>
          </>
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {notifications.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-slate-800 mb-3">School Announcements</h2>
            <div className="space-y-2">
              {notifications.map(n => (
                <div key={n.id} className="flex items-start gap-3 bg-white rounded-xl p-3.5 shadow-sm border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── GO TO FULL PORTAL ── */}
        <Link
          to="/parent"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-sm shadow-md shadow-sky-200 active:scale-95 transition-transform"
        >
          <BookOpen className="w-4 h-4" />
          Open Full Parent Portal
        </Link>

      </div>
    </MobileShell>
  );
}
