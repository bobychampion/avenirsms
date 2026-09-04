import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, addDoc, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { Timetable, TimetablePeriod, TimetableTemplate, UserProfile } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, X, Save, AlertTriangle, CheckCircle, Coffee, Settings, Copy, ClipboardPaste, LayoutTemplate, Files } from 'lucide-react';
import toast from 'react-hot-toast';
import { useClassSelectOptions, useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { useAuth } from '../components/FirebaseProvider';
import { slotColumnHeaders } from '../utils/timetableSchedule';
import {
  detectTimetableConflicts,
  detectCrossClassConflicts,
  findPeriodForSlot,
  upsertPeriodForSlot,
  copyDayPeriods,
  pasteDayIntoSchedule,
  pastePeriodIntoDay,
  applyTemplateToSchedule,
} from '../utils/timetableSchedule';

export default function TimetableManagement() {
  const schoolId = useSchoolId();
  const { profile } = useAuth();
  const classSelectOptions = useClassSelectOptions();
  const { subjects, timetablePeriods, currentSession, terms, getSubjectsForClass, schoolDays } = useSchool();

  const columns = useMemo(() => slotColumnHeaders(timetablePeriods), [timetablePeriods]);

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [templates, setTemplates] = useState<TimetableTemplate[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<string>('1st Term');
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [editTarget, setEditTarget] = useState<{ day: string; slotId: string } | null>(null);
  const [periodForm, setPeriodForm] = useState({ subject: '', teacher: '' });
  const [inlineConflict, setInlineConflict] = useState<string | null>(null);

  // Copy/paste clipboard — same-session convenience only, never persisted.
  const [clipboardCell, setClipboardCell] = useState<TimetablePeriod | null>(null);
  const [clipboardDay, setClipboardDay] = useState<{ day: string; periods: TimetablePeriod[] } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number;
    target: { kind: 'cell'; day: string; slotId: string } | { kind: 'day'; day: string };
  } | null>(null);

  // Templates
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Duplicate to class
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTargetClasses, setDuplicateTargetClasses] = useState<string[]>([]);
  const [duplicateTerm, setDuplicateTerm] = useState(selectedTerm);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(query(collection(db, 'timetables'), where('schoolId', '==', schoolId!)), snap => {
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));
    });
    const unsubT = onSnapshot(query(collection(db, 'users'), where('schoolId', '==', schoolId!), where('role', '==', 'teacher')), snap => {
      setTeachers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });
    const unsubTpl = onSnapshot(query(collection(db, 'timetable_templates'), where('schoolId', '==', schoolId!)), snap => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimetableTemplate)));
    });
    return () => { unsub(); unsubT(); unsubTpl(); };
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
      setConflicts(detectTimetableConflicts(timetable.schedule, schoolDays));
    }
  }, [timetable, schoolDays]);

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

  // ─── Context menu (right-click copy/paste) ───────────────────────────────

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const openCellContextMenu = (e: React.MouseEvent, day: string, slotId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'cell', day, slotId } });
  };

  const openDayContextMenu = (e: React.MouseEvent, day: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'day', day } });
  };

  const handleCopyCell = (day: string, slotId: string) => {
    if (!timetable) return;
    const slot = columns.find(s => s.id === slotId);
    if (!slot) return;
    const period = findPeriodForSlot(timetable.schedule[day as keyof Timetable['schedule']] || [], slot, columns);
    if (period) setClipboardCell(period);
  };

  const handlePasteCell = (day: string, slotId: string) => {
    if (!timetable || !clipboardCell) return;
    const slot = columns.find(s => s.id === slotId);
    if (!slot || slot.type === 'break') return;
    const dayKey = day as keyof Timetable['schedule'];
    const updatedDay = pastePeriodIntoDay(timetable.schedule[dayKey] || [], slot, clipboardCell, columns);
    setTimetable({ ...timetable, schedule: { ...timetable.schedule, [dayKey]: updatedDay } });
  };

  const handleCopyDay = (day: string) => {
    if (!timetable) return;
    const periods = timetable.schedule[day as keyof Timetable['schedule']] || [];
    setClipboardDay({ day, periods });
    toast.success(`Copied ${day}'s ${periods.length} period${periods.length === 1 ? '' : 's'}`);
  };

  const handlePasteDay = (targetDay: string) => {
    if (!timetable || !clipboardDay) return;
    const remapped = copyDayPeriods(clipboardDay.periods, columns, columns);
    setTimetable({
      ...timetable,
      schedule: pasteDayIntoSchedule(timetable.schedule, targetDay as keyof Timetable['schedule'], remapped),
    });
  };

  // ─── Templates ────────────────────────────────────────────────────────────

  const saveAsTemplate = async () => {
    if (!timetable || !templateNameInput.trim() || !schoolId) return;
    setSavingTemplate(true);
    try {
      await addDoc(collection(db, 'timetable_templates'), {
        schoolId,
        name: templateNameInput.trim(),
        schedule: timetable.schedule,
        createdAt: serverTimestamp(),
        createdBy: profile?.uid ?? '',
      });
      toast.success('Template saved.');
      setShowSaveTemplateModal(false);
      setTemplateNameInput('');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'timetable_templates');
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = (template: TimetableTemplate) => {
    if (!timetable) return;
    const hasExisting = (Object.values(timetable.schedule) as TimetablePeriod[][]).some(arr => arr.length > 0);
    if (hasExisting && !window.confirm('This will replace your current unsaved timetable — continue?')) {
      return;
    }
    setTimetable({ ...timetable, schedule: applyTemplateToSchedule(template.schedule, schoolDays) });
    setShowTemplatePicker(false);
  };

  // ─── Duplicate to class ───────────────────────────────────────────────────

  const duplicateWarnings = useMemo(() => {
    if (!timetable || duplicateTargetClasses.length === 0) return [];
    const remapped = Object.fromEntries(
      schoolDays.map(day => [day, copyDayPeriods(timetable.schedule[day as keyof Timetable['schedule']] || [], columns, columns)])
    ) as Timetable['schedule'];
    return duplicateTargetClasses.flatMap(targetClass =>
      detectCrossClassConflicts(remapped, schoolDays, targetClass, duplicateTerm, currentSession, timetables)
    );
  }, [timetable, duplicateTargetClasses, duplicateTerm, currentSession, timetables, schoolDays, columns]);

  const confirmDuplicate = async () => {
    if (!timetable || duplicateTargetClasses.length === 0 || !schoolId) return;
    setDuplicating(true);
    try {
      const remapped = Object.fromEntries(
        schoolDays.map(day => [day, copyDayPeriods(timetable.schedule[day as keyof Timetable['schedule']] || [], columns, columns)])
      ) as Timetable['schedule'];
      await Promise.all(duplicateTargetClasses.map(targetClass => {
        const docId = `${targetClass}_${duplicateTerm}_${currentSession}`.replace(/[\s/]/g, '_');
        return setDoc(doc(db, 'timetables', docId), {
          class: targetClass,
          term: duplicateTerm,
          session: currentSession,
          schedule: remapped,
          updatedAt: serverTimestamp(),
          schoolId,
        });
      }));
      toast.success(`Duplicated to ${duplicateTargetClasses.length} class${duplicateTargetClasses.length === 1 ? '' : 'es'}.`);
      setShowDuplicateModal(false);
      setDuplicateTargetClasses([]);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'timetables');
    } finally {
      setDuplicating(false);
    }
  };

  const saveTimetable = async () => {
    if (!timetable || !selectedClass) return;
    setSaving(true);
    try {
      const docId = `${selectedClass}_${selectedTerm}_${currentSession}`.replace(/[\s/]/g, '_');
      // Rebuild each period with only defined fields — Firestore rejects `undefined`
      // field values anywhere in the document (e.g. a period with no teacher assigned).
      const cleanSchedule = Object.fromEntries(
        Object.entries(timetable.schedule).map(([day, periods]) => [
          day,
          (periods as TimetablePeriod[]).map(p => {
            const c: TimetablePeriod = { subject: p.subject, startTime: p.startTime, endTime: p.endTime };
            if (p.slotId) c.slotId = p.slotId;
            if (p.teacher) c.teacher = p.teacher;
            return c;
          }),
        ])
      ) as Timetable['schedule'];
      const payload: Record<string, unknown> = {
        ...timetable,
        schedule: cleanSchedule,
        updatedAt: serverTimestamp(),
      };
      if (schoolId) payload.schoolId = schoolId;
      await setDoc(doc(db, 'timetables', docId), payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      toast.error('Could not save the timetable — please try again.');
      handleFirestoreError(e, OperationType.WRITE, 'timetables');
    } finally {
      setSaving(false);
    }
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
  timetable && schoolDays.forEach(day =>
    (timetable.schedule[day as keyof Timetable['schedule']] || []).forEach(p => {
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

          <button onClick={() => setShowTemplatePicker(true)} disabled={!selectedClass}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 ml-auto">
            <LayoutTemplate className="w-3.5 h-3.5" /> Start from Template
          </button>
          <button
            onClick={() => setShowSaveTemplateModal(true)}
            disabled={!timetable || !(Object.values(timetable.schedule) as TimetablePeriod[][]).some(arr => arr.length > 0)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" /> Save as Template
          </button>
          <button
            onClick={() => { setDuplicateTerm(selectedTerm); setShowDuplicateModal(true); }}
            disabled={!timetable || !(Object.values(timetable.schedule) as TimetablePeriod[][]).some(arr => arr.length > 0)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <Files className="w-3.5 h-3.5" /> Duplicate to Class…
          </button>

          <button onClick={saveTimetable} disabled={saving || conflicts.length > 0 || !selectedClass}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm disabled:opacity-60">
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
              {timetable && schoolDays.map(day => {
                const dayPeriods = timetable.schedule[day as keyof Timetable['schedule']] || [];
                return (
                  <tr key={day} className="hover:bg-slate-50 transition-colors">
                    <td
                      className="px-5 py-3 sticky left-0 bg-white z-10 group"
                      onContextMenu={e => openDayContextMenu(e, day)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-700">{day}</span>
                        <button
                          type="button"
                          title="Copy this day's periods"
                          onClick={() => handleCopyDay(day)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {clipboardDay && (
                          <button
                            type="button"
                            title={`Paste ${clipboardDay.day}'s periods here`}
                            onClick={() => handlePasteDay(day)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                          >
                            <ClipboardPaste className="w-3 h-3" />
                          </button>
                        )}
                      </div>
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
                        <td key={slot.id} className="px-2 py-2 text-center" onContextMenu={e => openCellContextMenu(e, day, slot.id)}>
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

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 min-w-[160px] text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.target.kind === 'cell' && (() => {
            const { day, slotId } = contextMenu.target;
            const slot = columns.find(s => s.id === slotId);
            const hasPeriod = !!(timetable && slot && findPeriodForSlot(timetable.schedule[day as keyof Timetable['schedule']] || [], slot, columns));
            return (
              <>
                <button
                  type="button"
                  disabled={!hasPeriod}
                  onClick={() => { handleCopyCell(day, slotId); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy Cell
                </button>
                <button
                  type="button"
                  disabled={!clipboardCell}
                  onClick={() => { handlePasteCell(day, slotId); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste Cell
                </button>
              </>
            );
          })()}
          {contextMenu.target.kind === 'day' && (
            <>
              <button
                type="button"
                onClick={() => { handleCopyDay(contextMenu.target.day); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Day
              </button>
              <button
                type="button"
                disabled={!clipboardDay}
                onClick={() => { handlePasteDay(contextMenu.target.day); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste Day
              </button>
            </>
          )}
        </div>
      )}

      {/* Save as Template Modal */}
      <AnimatePresence>
        {showSaveTemplateModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowSaveTemplateModal(false); }}
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900">Save as Template</h2>
                <button onClick={() => setShowSaveTemplateModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Template Name</label>
              <input
                autoFocus
                value={templateNameInput}
                onChange={e => setTemplateNameInput(e.target.value)}
                placeholder="e.g. Standard Secondary Week"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowSaveTemplateModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancel
                </button>
                <button
                  onClick={saveAsTemplate}
                  disabled={!templateNameInput.trim() || savingTemplate}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50"
                >
                  {savingTemplate ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start from Template Modal */}
      <AnimatePresence>
        {showTemplatePicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowTemplatePicker(false); }}
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900">Start from Template</h2>
                <button onClick={() => setShowTemplatePicker(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {templates.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No templates saved yet — build a timetable, then "Save as Template" to reuse it here.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {templates.map(t => {
                    const scheduleArrays = Object.values(t.schedule) as TimetablePeriod[][];
                    const periodCount = scheduleArrays.flat().length;
                    const dayCount = scheduleArrays.filter(arr => arr.length > 0).length;
                    return (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                      >
                        <p className="font-bold text-sm text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{periodCount} periods across {dayCount} days</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate to Class Modal */}
      <AnimatePresence>
        {showDuplicateModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowDuplicateModal(false); }}
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900">Duplicate to Class…</h2>
                <button onClick={() => setShowDuplicateModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Copying <span className="font-semibold text-slate-700">{selectedClass}</span>'s timetable ({currentSession}).
                This will overwrite each selected class's existing timetable for that term, if any.
              </p>

              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Term</label>
              <select
                value={duplicateTerm}
                onChange={e => setDuplicateTerm(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm mb-4"
              >
                {terms.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Target Classes</label>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2">
                {classSelectOptions.filter(o => o.value !== selectedClass).map(o => (
                  <label key={o.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={duplicateTargetClasses.includes(o.value)}
                      onChange={e => setDuplicateTargetClasses(prev =>
                        e.target.checked ? [...prev, o.value] : prev.filter(c => c !== o.value)
                      )}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {o.label}
                  </label>
                ))}
              </div>

              {duplicateWarnings.length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Possible Teacher Conflicts</p>
                  </div>
                  {duplicateWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700 ml-6">{w}</p>)}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowDuplicateModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancel
                </button>
                <button
                  onClick={confirmDuplicate}
                  disabled={duplicateTargetClasses.length === 0 || duplicating}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50"
                >
                  {duplicating ? 'Duplicating…' : `Duplicate to ${duplicateTargetClasses.length || ''} Class${duplicateTargetClasses.length === 1 ? '' : 'es'}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
