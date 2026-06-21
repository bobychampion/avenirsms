import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { Timetable, TimetablePeriod, DAYS_OF_WEEK, UserProfile } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, X, Save, AlertTriangle, CheckCircle, Coffee, Settings } from 'lucide-react';
import { useClassSelectOptions, useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { slotColumnHeaders } from '../utils/timetableSchedule';
import {
  detectTimetableConflicts,
  findPeriodForSlot,
  upsertPeriodForSlot,
} from '../utils/timetableSchedule';

export default function TimetableManagement() {
  const schoolId = useSchoolId();
  const classSelectOptions = useClassSelectOptions();
  const { subjects, timetablePeriods, currentSession, terms, getSubjectsForClass } = useSchool();

  const columns = useMemo(() => slotColumnHeaders(timetablePeriods), [timetablePeriods]);

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<string>('1st Term');
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [editTarget, setEditTarget] = useState<{ day: string; slotId: string } | null>(null);
  const [periodForm, setPeriodForm] = useState({ subject: '', teacher: '' });
  const [inlineConflict, setInlineConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(query(collection(db, 'timetables'), where('schoolId', '==', schoolId!)), snap => {
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));
    });
    const unsubT = onSnapshot(query(collection(db, 'users'), where('schoolId', '==', schoolId!), where('role', '==', 'teacher')), snap => {
      setTeachers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });
    return () => { unsub(); unsubT(); };
  }, [schoolId]);

  useEffect(() => {
    const existing = timetables.find(t => t.class === selectedClass && t.term === selectedTerm && t.session === currentSession);
    if (existing) {
      setTimetable(existing);
    } else {
      setTimetable({
        class: selectedClass,
        term: selectedTerm as Timetable['term'],
        session: currentSession,
        schedule: { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] },
        updatedAt: null,
      });
    }
  }, [timetables, selectedClass, selectedTerm, currentSession]);

  useEffect(() => {
    if (!timetable || !editTarget || !periodForm.teacher) {
      setInlineConflict(null);
      return;
    }
    const slot = columns.find(s => s.id === editTarget.slotId);
    if (!slot) return;

    const conflict = (timetable.schedule[editTarget.day as keyof typeof timetable.schedule] || []).find(
      p =>
        p.teacher === periodForm.teacher &&
        p.startTime === slot.startTime &&
        p.slotId !== editTarget.slotId
    );
    if (conflict) {
      setInlineConflict(
        `${periodForm.teacher} is already assigned to ${conflict.subject} at ${slot.startTime} on ${editTarget.day}`
      );
    } else {
      setInlineConflict(null);
    }
  }, [periodForm.teacher, editTarget, timetable, columns]);

  useEffect(() => {
    if (timetable) {
      setConflicts(detectTimetableConflicts(timetable.schedule, DAYS_OF_WEEK));
    }
  }, [timetable]);

  const openEditModal = (day: string, slotId: string) => {
    const slot = columns.find(s => s.id === slotId);
    if (!slot || slot.type === 'break' || !timetable) return;

    const existing = findPeriodForSlot(
      timetable.schedule[day as keyof typeof timetable.schedule] || [],
      slot,
      columns
    );

    setPeriodForm({
      subject: existing?.subject || subjects[0] || '',
      teacher: existing?.teacher || '',
    });
    setEditTarget({ day, slotId });
    setInlineConflict(null);
  };

  const savePeriod = () => {
    if (!timetable || !editTarget) return;
    const slot = columns.find(s => s.id === editTarget.slotId);
    if (!slot || slot.type === 'break') return;

    const dayKey = editTarget.day as keyof typeof timetable.schedule;
    const dayPeriods = timetable.schedule[dayKey] || [];
    const updatedDay = upsertPeriodForSlot(
      dayPeriods,
      slot,
      periodForm.subject.trim()
        ? { subject: periodForm.subject, teacher: periodForm.teacher || undefined }
        : null,
      columns
    );

    const updated: Timetable = {
      ...timetable,
      schedule: { ...timetable.schedule, [dayKey]: updatedDay },
    };
    setTimetable(updated);
    setEditTarget(null);
  };

  const clearPeriod = (day: string, slotId: string) => {
    if (!timetable) return;
    const slot = columns.find(s => s.id === slotId);
    if (!slot) return;

    const dayKey = day as keyof typeof timetable.schedule;
    const updatedDay = upsertPeriodForSlot(
      timetable.schedule[dayKey] || [],
      slot,
      null,
      columns
    );
    setTimetable({ ...timetable, schedule: { ...timetable.schedule, [dayKey]: updatedDay } });
  };

  const saveTimetable = async () => {
    if (!timetable) return;
    setSaving(true);
    const docId = `${selectedClass}_${selectedTerm}_${currentSession}`.replace(/[\s/]/g, '_');
    await setDoc(doc(db, 'timetables', docId), { ...timetable, updatedAt: serverTimestamp(), schoolId: schoolId ?? undefined })
      .catch(e => handleFirestoreError(e, OperationType.WRITE, 'timetables'));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const SUBJECT_COLORS = [
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-cyan-100 text-cyan-700 border-cyan-200',
  ];
  const subjectColorMap: Record<string, string> = {};
  let colorIdx = 0;
  timetable && DAYS_OF_WEEK.forEach(day =>
    (timetable.schedule[day] || []).forEach(p => {
      if (!subjectColorMap[p.subject]) subjectColorMap[p.subject] = SUBJECT_COLORS[colorIdx++ % SUBJECT_COLORS.length];
    })
  );

  const editSlot = editTarget ? columns.find(s => s.id === editTarget.slotId) : null;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-600" />
          Timetable Management
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Build weekly class schedules — {columns.filter(s => s.type === 'lesson').length} lesson columns from school settings.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              <option value="">Select class…</option>
              {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              {terms.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="text-xs text-slate-400 font-mono bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
            Session: {currentSession}
          </div>
          <Link
            to="/admin/settings?tab=timetable"
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-2 rounded-lg hover:bg-indigo-50"
          >
            <Settings className="w-3.5 h-3.5" /> Edit periods
          </Link>
          <button onClick={saveTimetable} disabled={saving || conflicts.length > 0 || !selectedClass}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm disabled:opacity-60 ml-auto">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Timetable'}
          </button>
        </div>

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

      {!selectedClass ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400 text-sm">
          Select a class to view and edit its timetable.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full" style={{ minWidth: `${Math.max(800, 120 + columns.length * 130)}px` }}>
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide w-28 sticky left-0 bg-slate-900 z-10">Day</th>
                {columns.map(slot => (
                  <th
                    key={slot.id}
                    className={`px-2 py-3 text-center text-xs font-bold uppercase tracking-wide min-w-[110px] ${
                      slot.type === 'break' ? 'bg-slate-700' : ''
                    }`}
                  >
                    <div>{slot.label}</div>
                    <div className="text-[10px] font-normal text-slate-300 normal-case mt-0.5">
                      {slot.startTime}–{slot.endTime}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timetable && DAYS_OF_WEEK.map(day => {
                const dayPeriods = timetable.schedule[day] || [];
                return (
                  <tr key={day} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 sticky left-0 bg-white z-10">
                      <span className="text-sm font-bold text-slate-700">{day}</span>
                    </td>
                    {columns.map(slot => {
                      if (slot.type === 'break') {
                        return (
                          <td key={slot.id} className="px-2 py-2 text-center bg-amber-50/60">
                            <div className="flex flex-col items-center justify-center h-14 rounded-xl border border-amber-100 text-amber-600">
                              <Coffee className="w-4 h-4 mb-0.5 opacity-70" />
                              <span className="text-[10px] font-semibold">{slot.label}</span>
                            </div>
                          </td>
                        );
                      }

                      const period = findPeriodForSlot(dayPeriods, slot, columns);
                      return (
                        <td key={slot.id} className="px-2 py-2 text-center">
                          {period ? (
                            <button
                              type="button"
                              onClick={() => openEditModal(day, slot.id)}
                              className={`relative group w-full rounded-xl border px-2 py-2 text-xs text-left ${subjectColorMap[period.subject] || SUBJECT_COLORS[0]}`}
                            >
                              <p className="font-bold truncate">{period.subject}</p>
                              {period.teacher && <p className="text-[10px] opacity-60 truncate">{period.teacher}</p>}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={e => { e.stopPropagation(); clearPeriod(day, slot.id); }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); clearPeriod(day, slot.id); } }}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                ×
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEditModal(day, slot.id)}
                              className="w-full h-14 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-slate-300 hover:text-indigo-400 text-lg"
                            >
                              +
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Period Modal */}
      <AnimatePresence>
        {editTarget && editSlot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setEditTarget(null); }}
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-bold text-slate-900">{editSlot.label} — {editTarget.day}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{editSlot.startTime}–{editSlot.endTime}</p>
                </div>
                <button onClick={() => setEditTarget(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                  <select
                    value={periodForm.subject}
                    onChange={e => setPeriodForm(p => ({ ...p, subject: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                  >
                    {(selectedClass ? getSubjectsForClass(selectedClass) : subjects).map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Teacher (optional)</label>
                  <select
                    value={periodForm.teacher}
                    onChange={e => setPeriodForm(p => ({ ...p, teacher: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                  >
                    <option value="">Unassigned</option>
                    {teachers.map(t => <option key={t.uid} value={t.displayName}>{t.displayName}</option>)}
                  </select>
                  {inlineConflict && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {inlineConflict}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancel
                </button>
                <button
                  onClick={savePeriod}
                  disabled={!periodForm.subject.trim()}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
