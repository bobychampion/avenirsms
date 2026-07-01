/**
 * HrStaffAttendance — admin/HR view of all staff clock-in/out events.
 * Shows a daily roster: every staff member's in/out timeline, total hours, and status.
 */
import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSchool } from '../../components/SchoolContext';
import { TeacherCheckIn } from '../../types';
import {
  Users, LogIn, LogOut, Clock, MapPin, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Calendar,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(ev: TeacherCheckIn): string {
  const d = ev.timestamp?.toDate?.();
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function totalMinutes(events: TeacherCheckIn[]): number {
  let total = 0;
  let openIn: number | null = null;
  for (const ev of events) {
    const ms = ev.timestamp?.toMillis?.() ?? null;
    if (!ms) continue;
    if (ev.type === 'check_in') { openIn = ms; }
    else if (ev.type === 'check_out' && openIn !== null) { total += ms - openIn; openIn = null; }
  }
  if (openIn !== null) total += Date.now() - openIn;
  return Math.max(0, Math.round(total / 60000));
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m < 10 ? '0' : ''}${m}m` : `${m}m`;
}

function isoToday(): string {
  return new Date().toISOString().split('T')[0];
}

function offsetDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Staff row ─────────────────────────────────────────────────────────────────

interface StaffRow {
  staffId: string;
  staffName: string;
  staffRole: string;
  events: TeacherCheckIn[];
}

function StatusPill({ events, date }: { events: TeacherCheckIn[]; date: string }) {
  const isToday = date === isoToday();
  if (events.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">
        <XCircle className="w-3 h-3" /> Absent
      </span>
    );
  }
  const lastEvent = events[events.length - 1];
  const currentlyIn = lastEvent.type === 'check_in';
  const anySpoofed = events.some(e => e.spoofDetected);

  if (anySpoofed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3 h-3" /> Flagged
      </span>
    );
  }
  if (currentlyIn && isToday) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> On Campus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700">
      <CheckCircle2 className="w-3 h-3" /> Present
    </span>
  );
}

function StaffAttendanceRow({ row, date }: { row: StaffRow; date: string }) {
  const [expanded, setExpanded] = useState(false);
  const min = totalMinutes(row.events);
  const checkIns = row.events.filter(e => e.type === 'check_in').length;

  return (
    <div className="border-b border-slate-100 last:border-0">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
          {(row.staffName || '?')[0].toUpperCase()}
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{row.staffName}</p>
          <p className="text-xs text-slate-400 capitalize">{row.staffRole?.replace('_', ' ')}</p>
        </div>

        {/* Status */}
        <StatusPill events={row.events} date={date} />

        {/* Times summary */}
        {row.events.length > 0 && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 shrink-0">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <LogIn className="w-3 h-3" />
              {fmtTime(row.events.find(e => e.type === 'check_in')!)}
            </span>
            {row.events.find(e => e.type === 'check_out') && (
              <span className="flex items-center gap-1 text-rose-600 font-medium">
                <LogOut className="w-3 h-3" />
                {fmtTime([...row.events].reverse().find(e => e.type === 'check_out')!)}
              </span>
            )}
          </div>
        )}

        {/* Duration */}
        {min > 0 && (
          <span className="hidden md:flex items-center gap-1 text-xs font-bold text-slate-600 shrink-0">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {fmtDuration(min)}
          </span>
        )}

        {/* Chevron */}
        <span className={cn('text-slate-300 transition-transform shrink-0', expanded && 'rotate-180')}>
          <ChevronLeft className="w-4 h-4 -rotate-90" />
        </span>
      </button>

      {/* Expanded: full event timeline */}
      {expanded && (
        <div className="px-5 pb-4">
          {row.events.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No events recorded for this date.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {row.events.map((ev, i) => (
                <div key={ev.id ?? i} className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border',
                  ev.type === 'check_in'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200',
                  ev.spoofDetected && 'border-amber-300 bg-amber-50 text-amber-800',
                )}>
                  {ev.type === 'check_in' ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                  <span>{ev.type === 'check_in' ? 'In' : 'Out'}</span>
                  <span className="font-bold">{fmtTime(ev)}</span>
                  {ev.autoDetected && (
                    <span title="Auto-detected by GPS" className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  )}
                  {ev.spoofDetected && <AlertTriangle className="w-3 h-3 text-amber-600" title="Flagged — unusual location" />}
                </div>
              ))}
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <Clock className="w-3.5 h-3.5" />
                {fmtDuration(min)} on campus · {checkIns} visit{checkIns !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HrStaffAttendance() {
  const { schoolId, schoolName } = useSchool();
  const [date, setDate] = useState<string>(isoToday());
  const [events, setEvents] = useState<TeacherCheckIn[]>([]);
  const [staffUsers, setStaffUsers] = useState<{ uid: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');

  // Subscribe to all staff users for this school
  useEffect(() => {
    if (!schoolId) return;
    const staffRoles = ['teacher', 'admin', 'School_admin', 'hr', 'accountant', 'librarian'];
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', 'in', staffRoles),
    );
    const unsub = onSnapshot(q, snap => {
      setStaffUsers(snap.docs.map(d => ({
        uid: d.id,
        name: (d.data().displayName || d.data().email || 'Unknown') as string,
        role: (d.data().role || 'staff') as string,
      })));
    });
    return () => unsub();
  }, [schoolId]);

  // Subscribe to attendance events for the selected date
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    const q = query(
      collection(db, 'attendance_checkins'),
      where('schoolId', '==', schoolId),
      where('date', '==', date),
      orderBy('timestamp', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherCheckIn)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [schoolId, date]);

  // Build per-staff rows — merge users list with their events
  const eventsByStaff = events.reduce<Record<string, TeacherCheckIn[]>>((acc, ev) => {
    const id = ev.staffId || ev.teacherId;
    if (!acc[id]) acc[id] = [];
    acc[id].push(ev);
    return acc;
  }, {});

  // All staff (from users collection), filtered by role if selected
  const filteredStaff = staffUsers.filter(s => !roleFilter || s.role === roleFilter);

  const rows: StaffRow[] = filteredStaff.map(s => ({
    staffId: s.uid,
    staffName: s.name,
    staffRole: s.role,
    events: (eventsByStaff[s.uid] ?? []).sort((a, b) =>
      (a.timestamp?.toMillis?.() ?? 0) - (b.timestamp?.toMillis?.() ?? 0)
    ),
  }));

  // Summary stats
  const present = rows.filter(r => r.events.length > 0).length;
  const absent = rows.length - present;
  const flagged = rows.filter(r => r.events.some(e => e.spoofDetected)).length;
  const onCampusNow = rows.filter(r => r.events[r.events.length - 1]?.type === 'check_in').length;
  const isToday = date === isoToday();

  const ROLES = [
    { value: '', label: 'All Roles' },
    { value: 'teacher', label: 'Teachers' },
    { value: 'admin', label: 'Admin' },
    { value: 'School_admin', label: 'School Admin' },
    { value: 'hr', label: 'HR' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'librarian', label: 'Librarian' },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Human Resources</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-indigo-600" /> Staff Attendance Roster
        </h1>
        <p className="mt-1 text-sm text-slate-500">{schoolName}</p>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <button
          onClick={() => setDate(d => offsetDate(d, -1))}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span className="font-bold text-slate-900">{fmtDate(date)}</span>
          {isToday && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-full">Today</span>
          )}
        </div>
        <button
          onClick={() => setDate(d => offsetDate(d, 1))}
          disabled={date >= isoToday()}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <input
          type="date"
          value={date}
          max={isoToday()}
          onChange={e => e.target.value && setDate(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Staff', value: rows.length, color: 'bg-slate-50 border-slate-200 text-slate-700' },
          { label: 'Present', value: present, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'Absent', value: absent, color: 'bg-rose-50 border-rose-200 text-rose-700' },
          isToday
            ? { label: 'On Campus Now', value: onCampusNow, color: 'bg-indigo-50 border-indigo-200 text-indigo-700' }
            : { label: 'Flagged', value: flagged, color: 'bg-amber-50 border-amber-200 text-amber-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 ${s.color}`}>
            <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
            <p className="text-3xl font-extrabold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => setRoleFilter(r.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                roleFilter === r.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 ml-auto">
          {filteredStaff.length} staff · click a row to see full timeline
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Auto-detected by GPS</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> Location flagged</span>
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> Manual clock-in</span>
      </div>

      {/* Roster table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Staff</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide hidden sm:block">Status · First In · Last Out · Total</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading attendance…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No staff found for this filter.</p>
          </div>
        ) : (
          <div>
            {/* Present first, then absent */}
            {[...rows]
              .sort((a, b) => {
                if (a.events.length > 0 && b.events.length === 0) return -1;
                if (a.events.length === 0 && b.events.length > 0) return 1;
                return a.staffName.localeCompare(b.staffName);
              })
              .map(row => (
                <StaffAttendanceRow key={row.staffId} row={row} date={date as string} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
