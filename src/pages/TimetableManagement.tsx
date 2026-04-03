import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Timetable, TimetablePeriod, DAYS_OF_WEEK, SUBJECTS, UserProfile, CURRENT_SESSION } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Plus, X, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSchool } from '../components/SchoolContext';

const TIMES = ['07:00', '07:40', '08:20', '09:00', '09:40', '10:20', '11:00', '11:40', '12:20', '13:00', '14:00', '14:40', '15:20'];

export default function TimetableManagement() {
  const { classNames } = useSchool();
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [session] = useState(CURRENT_SESSION);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isAddModal, setIsAddModal] = useState(false);
  const [addTarget, setAddTarget] = useState<{ day: string } | null>(null);
  const [periodForm, setPeriodForm] = useState<TimetablePeriod>({ subject: SUBJECTS[0], startTime: '08:00', endTime: '09:00', teacher: '' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'timetables'), snap => {
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));
    });
    const unsubT = onSnapshot(query(collection(db, 'users')), snap => {
      setTeachers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)).filter(u => u.role === 'teacher'));
    });
    return () => { unsub(); unsubT(); };
  }, []);

  // Load timetable for selected class+term+session
  useEffect(() => {
    const existing = timetables.find(t => t.class === selectedClass && t.term === selectedTerm && t.session === session);
    if (existing) {
      setTimetable(existing);
    } else {
      setTimetable({
        class: selectedClass, term: selectedTerm, session,
        schedule: { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] },
        updatedAt: null,
      });
    }
  }, [timetables, selectedClass, selectedTerm, session]);

  const detectConflicts = (tt: Timetable): string[] => {
    const teacherSlots: Record<string, string[]> = {};
    const issues: string[] = [];
    DAYS_OF_WEEK.forEach(day => {
      (tt.schedule[day] || []).forEach(period => {
        if (!period.teacher) return;
        const key = `${period.teacher}|${day}|${period.startTime}`;
        if (!teacherSlots[key]) teacherSlots[key] = [];
        teacherSlots[key].push(period.subject);
        if (teacherSlots[key].length > 1) {
          issues.push(`${period.teacher} has a conflict on ${day} at ${period.startTime}`);
        }
      });
    });
    return [...new Set(issues)];
  };

  const addPeriod = () => {
    if (!timetable || !addTarget) return;
    const updated: Timetable = {
      ...timetable,
      schedule: {
        ...timetable.schedule,
        [addTarget.day]: [...(timetable.schedule[addTarget.day as keyof typeof timetable.schedule] || []), { ...periodForm }],
      },
    };
    const c = detectConflicts(updated);
    setConflicts(c);
    setTimetable(updated);
    setIsAddModal(false);
    setPeriodForm({ subject: SUBJECTS[0], startTime: '08:00', endTime: '09:00', teacher: '' });
  };

  const removePeriod = (day: string, idx: number) => {
    if (!timetable) return;
    const updated: Timetable = {
      ...timetable,
      schedule: {
        ...timetable.schedule,
        [day]: (timetable.schedule[day as keyof typeof timetable.schedule] || []).filter((_, i) => i !== idx),
      },
    };
    setConflicts(detectConflicts(updated));
    setTimetable(updated);
  };

  const saveTimetable = async () => {
    if (!timetable) return;
    setSaving(true);
    const docId = `${selectedClass}_${selectedTerm}_${session}`.replace(/[\s/]/g, '_');
    await setDoc(doc(db, 'timetables', docId), { ...timetable, updatedAt: serverTimestamp() }).catch(e => handleFirestoreError(e, OperationType.WRITE, 'timetables'));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const SUBJECT_COLORS = ['bg-indigo-100 text-indigo-700 border-indigo-200', 'bg-emerald-100 text-emerald-700 border-emerald-200', 'bg-amber-100 text-amber-700 border-amber-200', 'bg-rose-100 text-rose-700 border-rose-200', 'bg-purple-100 text-purple-700 border-purple-200', 'bg-cyan-100 text-cyan-700 border-cyan-200'];
  const subjectColorMap: Record<string, string> = {};
  let colorIdx = 0;
  timetable && DAYS_OF_WEEK.forEach(day => (timetable.schedule[day] || []).forEach(p => { if (!subjectColorMap[p.subject]) subjectColorMap[p.subject] = SUBJECT_COLORS[colorIdx++ % SUBJECT_COLORS.length]; }));

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-600" />
          Timetable Management
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Build weekly class schedules with automatic teacher conflict detection.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              {classNames.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              <option>1st Term</option><option>2nd Term</option><option>3rd Term</option>
            </select>
          </div>
          <button onClick={saveTimetable} disabled={saving || conflicts.length > 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm disabled:opacity-60 ml-auto">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Timetable'}
          </button>
        </div>

        {/* Conflict warnings */}
        {conflicts.length > 0 && (
          <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-200">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <p className="text-xs font-bold text-rose-700 uppercase tracking-wide">Scheduling Conflicts</p>
            </div>
            {conflicts.map((c, i) => <p key={i} className="text-xs text-rose-600 ml-6">{c}</p>)}
          </div>
        )}
      </div>

      {/* Timetable Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide w-28">Day</th>
              {['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6'].map(p => (
                <th key={p} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide">{p}</th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide">Add</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {timetable && DAYS_OF_WEEK.map(day => {
              const periods = timetable.schedule[day] || [];
              const cells = [...periods, ...Array(Math.max(0, 6 - periods.length)).fill(null)].slice(0, 6);
              return (
                <tr key={day} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-sm font-bold text-slate-700">{day}</span>
                  </td>
                  {cells.map((period, idx) => (
                    <td key={idx} className="px-2 py-2 text-center">
                      {period ? (
                        <div className={`relative group rounded-xl border px-2 py-2 text-xs ${subjectColorMap[period.subject] || SUBJECT_COLORS[0]}`}>
                          <p className="font-bold truncate">{period.subject}</p>
                          <p className="text-[10px] opacity-70">{period.startTime}–{period.endTime}</p>
                          {period.teacher && <p className="text-[10px] opacity-60 truncate">{period.teacher}</p>}
                          <button onClick={() => removePeriod(day, idx)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="h-12 rounded-xl border border-dashed border-slate-200 bg-slate-50/50" />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => { setAddTarget({ day }); setIsAddModal(true); }}
                      className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center justify-center mx-auto">
                      <Plus className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Period Modal */}
      <AnimatePresence>
        {isAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setIsAddModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900">Add Period — {addTarget?.day}</h2>
                <button onClick={() => setIsAddModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                  <select value={periodForm.subject} onChange={e => setPeriodForm(p => ({ ...p, subject: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Start Time</label>
                    <select value={periodForm.startTime} onChange={e => setPeriodForm(p => ({ ...p, startTime: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      {TIMES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">End Time</label>
                    <select value={periodForm.endTime} onChange={e => setPeriodForm(p => ({ ...p, endTime: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      {TIMES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Teacher (optional)</label>
                  <select value={periodForm.teacher || ''} onChange={e => setPeriodForm(p => ({ ...p, teacher: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                    <option value="">Unassigned</option>
                    {teachers.map(t => <option key={t.uid} value={t.displayName}>{t.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsAddModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={addPeriod} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Add Period</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
