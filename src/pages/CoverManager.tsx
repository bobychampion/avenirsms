/**
 * Cover Manager — assign substitute teachers when a member of staff is absent.
 *
 * Workflow
 * ────────
 * 1. Admin picks a date (defaults to today).
 * 2. "Load Timetable" reads all timetable docs, filters to the chosen day-of-week,
 *    and builds a flat list of every period that has a teacher assigned.
 * 3. Admin marks periods that need cover (teacher absent).
 * 4. For each marked period, admin picks a cover teacher from the staff list.
 * 5. Saves to `cover_assignments` (schoolId-scoped).
 *
 * Data model – `cover_assignments`:
 *   date, dayOfWeek, className, subject, startTime, endTime,
 *   originalTeacherName, coverTeacherId?, coverTeacherName?,
 *   status: 'uncovered' | 'assigned', schoolId, createdAt
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, getDocs, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { Timetable, DAYS_OF_WEEK } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserX, UserCheck, Users, Calendar, Clock, Plus,
  Loader2, Search, ChevronDown, X, RefreshCw, ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface StaffMember { id: string; name: string; role: string; }

interface CoverPeriod {
  // Derived from timetable — never stored
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  originalTeacherName: string;
}

interface CoverAssignment {
  id?: string;
  date: string;
  dayOfWeek: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  originalTeacherName: string;
  coverTeacherId?: string;
  coverTeacherName?: string;
  status: 'uncovered' | 'assigned';
  schoolId: string;
  createdAt?: any;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const todayStr = () => new Date().toISOString().split('T')[0];

export default function CoverManager() {
  const { schoolId } = useSchool();

  const [date, setDate] = useState(todayStr());
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignments, setAssignments] = useState<CoverAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<CoverPeriod[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [coverMap, setCoverMap] = useState<Record<string, string>>({}); // periodKey → staffId
  const [staffSearch, setStaffSearch] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Live listener for today's cover assignments
  useEffect(() => {
    if (!schoolId || !date) return;
    const q = query(
      collection(db, 'cover_assignments'),
      where('schoolId', '==', schoolId),
      where('date', '==', date),
    );
    const unsub = onSnapshot(q, snap => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as CoverAssignment)));
    });
    return unsub;
  }, [schoolId, date]);

  // Load staff and timetables once
  useEffect(() => {
    if (!schoolId) return;
    const loadStatic = async () => {
      const [staffSnap, ttSnap] = await Promise.all([
        getDocs(query(collection(db, 'staff'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'timetables'), where('schoolId', '==', schoolId))),
      ]);
      setStaff(staffSnap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || (d.data() as any).staffName || 'Unknown', role: (d.data() as any).role || 'staff' })));
      setTimetables(ttSnap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));
    };
    loadStatic();
  }, [schoolId]);

  const loadCoverSheet = useCallback(() => {
    const dayIndex = new Date(date + 'T12:00:00').getDay();
    const dayName = DAY_NAMES[dayIndex] as typeof DAYS_OF_WEEK[number];
    if (!DAYS_OF_WEEK.includes(dayName as any)) {
      toast.error('Cover sheets are for Mon–Fri only.');
      setPeriods([]);
      return;
    }

    const flat: CoverPeriod[] = [];
    for (const tt of timetables) {
      const dayPeriods = tt.schedule[dayName] ?? [];
      for (const p of dayPeriods) {
        if (!p.teacher) continue;
        flat.push({
          className: tt.class,
          subject: p.subject,
          startTime: p.startTime,
          endTime: p.endTime,
          originalTeacherName: p.teacher,
        });
      }
    }
    // Sort by startTime
    flat.sort((a, b) => a.startTime.localeCompare(b.startTime));
    setPeriods(flat);
    setSelectedPeriods(new Set());
    setCoverMap({});
    if (flat.length === 0) toast('No timetabled periods with teachers found for this day.', { icon: 'ℹ️' });
  }, [date, timetables]);

  const periodKey = (p: CoverPeriod) => `${p.className}|${p.subject}|${p.startTime}`;

  const toggleSelected = (key: string) => {
    setSelectedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredStaff = (key: string) => {
    const q = (staffSearch[key] || '').toLowerCase();
    return staff.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  };

  const handleSaveCover = async () => {
    if (!schoolId) return;
    const dayIndex = new Date(date + 'T12:00:00').getDay();
    const dayName = DAY_NAMES[dayIndex];
    setSaving(true);
    let saved = 0;
    try {
      for (const key of selectedPeriods) {
        const period = periods.find(p => periodKey(p) === key);
        if (!period) continue;
        const coverId = coverMap[key];
        const coverStaff = coverId ? staff.find(s => s.id === coverId) : undefined;

        // Check if an assignment already exists for this slot
        const existing = assignments.find(a =>
          a.className === period.className &&
          a.subject === period.subject &&
          a.startTime === period.startTime
        );

        if (existing?.id) {
          await updateDoc(doc(db, 'cover_assignments', existing.id), {
            coverTeacherId: coverId ?? null,
            coverTeacherName: coverStaff?.name ?? null,
            status: coverId ? 'assigned' : 'uncovered',
          });
        } else {
          await addDoc(collection(db, 'cover_assignments'), {
            date,
            dayOfWeek: dayName,
            className: period.className,
            subject: period.subject,
            startTime: period.startTime,
            endTime: period.endTime,
            originalTeacherName: period.originalTeacherName,
            coverTeacherId: coverId ?? null,
            coverTeacherName: coverStaff?.name ?? null,
            status: coverId ? 'assigned' : 'uncovered',
            schoolId,
            createdAt: serverTimestamp(),
          } as Omit<CoverAssignment, 'id'>);
        }
        saved++;
      }
      toast.success(`Cover sheet saved — ${saved} period${saved !== 1 ? 's' : ''} recorded.`);
      setSelectedPeriods(new Set());
    } catch (e) {
      toast.error('Failed to save cover assignments.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'cover_assignments', id));
      toast.success('Assignment removed.');
    } catch {
      toast.error('Failed to remove.');
    }
  };

  const dayIndex = new Date(date + 'T12:00:00').getDay();
  const isWeekend = dayIndex === 0 || dayIndex === 6;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Administration</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Cover Manager</h1>
        <p className="text-xs text-slate-400 mt-0.5">Assign substitute teachers for absent staff</p>
      </div>

      {/* Date + load */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cover Date</label>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setPeriods([]); }}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {isWeekend && <p className="text-xs text-amber-600 mt-1">Note: selected date is a weekend.</p>}
        </div>
        <button
          onClick={loadCoverSheet}
          disabled={timetables.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Load Timetable
        </button>
      </div>

      {/* Timetable periods (mark as needing cover) */}
      {periods.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">
              Timetabled Periods — {DAY_NAMES[dayIndex]}
              <span className="ml-2 text-xs font-medium text-slate-400">({periods.length} periods)</span>
            </h2>
            <p className="text-xs text-slate-400">Tick periods that need cover, then assign a substitute.</p>
          </div>
          <div className="space-y-2">
            {periods.map(p => {
              const key = periodKey(p);
              const checked = selectedPeriods.has(key);
              const existingAssignment = assignments.find(a =>
                a.className === p.className && a.subject === p.subject && a.startTime === p.startTime
              );
              return (
                <motion.div
                  key={key}
                  layout
                  className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${
                    checked ? 'border-amber-300 bg-amber-50/50' :
                    existingAssignment?.status === 'assigned' ? 'border-emerald-200' :
                    existingAssignment?.status === 'uncovered' ? 'border-rose-200' :
                    'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(key)}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{p.className}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded-full">{p.subject}</span>
                        {existingAssignment?.status === 'assigned' && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                            Covered by {existingAssignment.coverTeacherName}
                          </span>
                        )}
                        {existingAssignment?.status === 'uncovered' && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                            Uncovered
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> {p.startTime} – {p.endTime}
                        <span className="text-slate-300">·</span>
                        <UserX className="w-3 h-3 text-rose-400" /> {p.originalTeacherName}
                      </p>
                    </div>
                    {existingAssignment?.id && (
                      <button
                        onClick={() => handleRemove(existingAssignment.id!)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Cover teacher picker (shown when period is checked) */}
                  <AnimatePresence>
                    {checked && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-amber-200">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">
                            Assign Cover Teacher (optional)
                          </label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              placeholder="Search staff name…"
                              value={staffSearch[key] || ''}
                              onChange={e => setStaffSearch(prev => ({ ...prev, [key]: e.target.value }))}
                              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          {(staffSearch[key] || coverMap[key]) && (
                            <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-sm max-h-36 overflow-y-auto">
                              {coverMap[key] && !staffSearch[key] ? (
                                <div className="px-3 py-2 flex items-center justify-between">
                                  <span className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                                    <UserCheck className="w-4 h-4" />
                                    {staff.find(s => s.id === coverMap[key])?.name}
                                  </span>
                                  <button onClick={() => setCoverMap(prev => { const n = { ...prev }; delete n[key]; return n; })} className="text-xs text-slate-400 hover:text-rose-600">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : filteredStaff(key).map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => { setCoverMap(prev => ({ ...prev, [key]: s.id })); setStaffSearch(prev => ({ ...prev, [key]: '' })); }}
                                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm text-slate-700 transition-colors flex items-center gap-2"
                                >
                                  <Users className="w-3.5 h-3.5 text-slate-400" /> {s.name}
                                  <span className="text-[10px] text-slate-400 ml-auto capitalize">{s.role}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {selectedPeriods.size > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleSaveCover}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                Save {selectedPeriods.size} Cover Assignment{selectedPeriods.size !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cover Board — today's saved assignments */}
      {assignments.length > 0 && (
        <div>
          <h2 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-indigo-600" />
            Cover Board — {date}
            <span className="text-xs font-medium text-slate-400">({assignments.length} periods)</span>
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Class</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Absent Teacher</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Cover</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...assignments].sort((a, b) => a.startTime.localeCompare(b.startTime)).map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 text-xs">{a.startTime} – {a.endTime}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{a.className}</td>
                    <td className="px-4 py-3 text-slate-600">{a.subject}</td>
                    <td className="px-4 py-3 text-slate-500 flex items-center gap-1">
                      <UserX className="w-3.5 h-3.5 text-rose-400 shrink-0" /> {a.originalTeacherName}
                    </td>
                    <td className="px-4 py-3">
                      {a.coverTeacherName
                        ? <span className="flex items-center gap-1 text-emerald-700 font-medium"><UserCheck className="w-3.5 h-3.5" />{a.coverTeacherName}</span>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                        a.status === 'assigned'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => handleRemove(a.id!)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {periods.length === 0 && assignments.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Select a date and click "Load Timetable" to begin.</p>
        </div>
      )}
    </div>
  );
}
