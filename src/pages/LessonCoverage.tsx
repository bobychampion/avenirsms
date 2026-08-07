import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import { useAuth } from '../components/FirebaseProvider';
import type { LessonCoverage as LessonCoverageRecord, LessonStatus, LessonType } from '../types';
import {
  Loader2, ClipboardList, BarChart3, Plus, Trash2,
  Download, Printer, BookOpen, Users, Link2,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LessonStatus, string> = {
  completed: 'Completed',
  not_completed: 'Not Completed',
  partially_completed: 'Partially Completed',
};

const STATUS_COLORS: Record<LessonStatus, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  not_completed: 'bg-red-100 text-red-700',
  partially_completed: 'bg-amber-100 text-amber-700',
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function exportExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LessonCoverage() {
  const schoolId = useSchoolId();
  const {
    classes, timetablePeriods,
    currentSession, currentTerm, terms,
    getSubjectsForClass,
  } = useSchool();
  const { profile, user } = useAuth();

  const isAdmin = ['admin', 'School_admin', 'super_admin'].includes(profile?.role ?? '');

  const [activeTab, setActiveTab] = useState<'record' | 'log' | 'reports'>('record');
  const [records, setRecords] = useState<LessonCoverageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teachers, setTeachers] = useState<{ uid: string; displayName: string }[]>([]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [fDate, setFDate] = useState(todayStr);
  const [fTerm, setFTerm] = useState('');
  const [fClass, setFClass] = useState('');
  const [fSubject, setFSubject] = useState('');
  const [fPeriod, setFPeriod] = useState('');
  const [fTeacherName, setFTeacherName] = useState('');
  const [fTeacherId, setFTeacherId] = useState('');
  const [fTopic, setFTopic] = useState('');
  const [fStatus, setFStatus] = useState<LessonStatus>('completed');
  const [fType, setFType] = useState<LessonType>('regular');
  const [fRemarks, setFRemarks] = useState('');
  const [fCurriculumItemId, setFCurriculumItemId] = useState('');

  // ── Curriculum items for selected subject (auto-tick on save) ──────────────
  const [curriculumItems, setCurriculumItems] = useState<
    { id: string; topic: string; level: string; term: string }[]
  >([]);

  useEffect(() => {
    if (!schoolId || !fSubject) { setCurriculumItems([]); setFCurriculumItemId(''); return; }
    const q = query(
      collection(db, 'curriculum_items'),
      where('schoolId', '==', schoolId),
      where('subject', '==', fSubject),
      where('completed', '==', false),
    );
    const unsub = onSnapshot(
      q,
      snap => setCurriculumItems(snap.docs.map(d => ({
        id: d.id,
        topic: d.data().topic as string,
        level: d.data().level as string,
        term: d.data().term as string,
      }))),
      err => console.error('[LessonCoverage] curriculum_items listener:', err.code),
    );
    return unsub;
  }, [schoolId, fSubject]);

  // Reset curriculum selection when subject changes
  useEffect(() => { setFCurriculumItemId(''); }, [fSubject]);

  // ── Log filters ─────────────────────────────────────────────────────────────
  const [logTerm, setLogTerm] = useState('');
  const [logClass, setLogClass] = useState('');
  const [logSubject, setLogSubject] = useState('');
  const [logTeacher, setLogTeacher] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logType, setLogType] = useState('');

  // ── Report state ─────────────────────────────────────────────────────────────
  const [reportView, setReportView] = useState<'curriculum' | 'teacher'>('curriculum');
  const [rTerm, setRTerm] = useState('');
  const [rClass, setRClass] = useState('');
  const [teachingWeeks, setTeachingWeeks] = useState(13);
  const [timetableData, setTimetableData] = useState<Record<string, { subject: string }[]> | null>(null);

  // Seed defaults from context once they arrive
  useEffect(() => {
    if (currentTerm && !fTerm) setFTerm(currentTerm);
    if (currentTerm && !logTerm) setLogTerm(currentTerm);
    if (currentTerm && !rTerm) setRTerm(currentTerm);
  }, [currentTerm]);

  // Seed teacher name from own profile
  useEffect(() => {
    if (profile && !fTeacherName) {
      setFTeacherName(profile.displayName ?? '');
      setFTeacherId(profile.uid ?? user?.uid ?? '');
    }
  }, [profile]);

  // ── Subscribe to lesson_coverage for this session ──────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'lesson_coverage'),
      where('schoolId', '==', schoolId),
      where('session', '==', currentSession),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as LessonCoverageRecord)));
        setLoading(false);
      },
      err => console.error('[LessonCoverage] lesson_coverage listener:', err.code, err.message),
    );
    return unsub;
  }, [schoolId, currentSession]);

  // ── Load teachers (admin only) ─────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !isAdmin) return;
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', '==', 'teacher'),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setTeachers(snap.docs.map(d => ({
          uid: d.id,
          displayName: (d.data().displayName || d.data().email || d.id) as string,
        })));
      },
      err => console.error('[LessonCoverage] users/teachers listener:', err.code, err.message),
    );
    return unsub;
  }, [schoolId, isAdmin]);

  // ── Load timetable when report class+term changes ──────────────────────────
  useEffect(() => {
    if (!rClass || !rTerm || !currentSession) { setTimetableData(null); return; }
    const docId = `${rClass}_${rTerm}_${currentSession}`.replace(/[\s/]/g, '_');
    getDoc(doc(db, 'timetables', docId)).then(snap => {
      setTimetableData(snap.exists() ? (snap.data().schedule as Record<string, { subject: string }[]>) : null);
    });
  }, [rClass, rTerm, currentSession]);

  // ── Derived: class names sorted ────────────────────────────────────────────
  const classNames = useMemo(
    () => [...new Set(classes.map(c => c.name))].sort(),
    [classes],
  );

  // ── Derived: subjects for currently-selected form class ───────────────────
  const formSubjects = useMemo(
    () => fClass ? getSubjectsForClass(fClass) : getSubjectsForClass(''),
    [fClass, getSubjectsForClass],
  );

  // ── Derived: period options from school bell schedule ─────────────────────
  const periodOptions = useMemo(() => {
    const lessonSlots = timetablePeriods.filter(p => p.type === 'lesson');
    if (lessonSlots.length > 0) {
      return lessonSlots.map(p => ({
        value: p.label,
        label: `${p.label} (${p.startTime}–${p.endTime})`,
      }));
    }
    return ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6'].map(p => ({
      value: p, label: p,
    }));
  }, [timetablePeriods]);

  // ─── Submit record ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId || !fClass || !fSubject || !fTeacherName) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'lesson_coverage'), {
        schoolId,
        date: fDate,
        session: currentSession,
        term: fTerm || currentTerm,
        className: fClass,
        subject: fSubject,
        period: fPeriod,
        topicCovered: fTopic,
        lessonStatus: fStatus,
        lessonType: fType,
        teacherName: fTeacherName,
        teacherId: fTeacherId,
        remarks: fRemarks,
        recordedBy: user?.uid ?? '',
        recordedAt: serverTimestamp(),
        curriculumItemId: fCurriculumItemId || null,
      } satisfies Omit<LessonCoverageRecord, 'id'>);

      // Auto-tick the linked curriculum item as completed
      if (fCurriculumItemId) {
        await updateDoc(doc(db, 'curriculum_items', fCurriculumItemId), {
          completed: true,
          completedAt: serverTimestamp(),
          completedBy: fTeacherName,
        });
      }

      // Keep class/teacher selected for rapid back-to-back entries; clear lesson-specific fields
      setFSubject('');
      setFPeriod('');
      setFTopic('');
      setFRemarks('');
      setFStatus('completed');
      setFType('regular');
      setFCurriculumItemId('');
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete record ────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!window.confirm('Delete this lesson record?')) return;
    await deleteDoc(doc(db, 'lesson_coverage', id));
  }

  // ─── Filtered log ─────────────────────────────────────────────────────────
  const logRecords = useMemo(() => records
    .filter(r => {
      if (logTerm && r.term !== logTerm) return false;
      if (logClass && r.className !== logClass) return false;
      if (logSubject && r.subject !== logSubject) return false;
      if (logTeacher && !r.teacherName.toLowerCase().includes(logTeacher.toLowerCase())) return false;
      if (logStatus && r.lessonStatus !== logStatus) return false;
      if (logType && r.lessonType !== logType) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
    [records, logTerm, logClass, logSubject, logTeacher, logStatus, logType],
  );

  // ─── Quick stats (log tab header) ─────────────────────────────────────────
  const quickStats = useMemo(() => {
    const t = records.filter(r => !logTerm || r.term === logTerm);
    return {
      total: t.length,
      completed: t.filter(r => r.lessonStatus === 'completed').length,
      partial: t.filter(r => r.lessonStatus === 'partially_completed').length,
      cover: t.filter(r => r.lessonType === 'cover').length,
    };
  }, [records, logTerm]);

  // ─── Curriculum coverage report ───────────────────────────────────────────
  const curriculumReport = useMemo(() => {
    const termRecords = records.filter(r =>
      (!rTerm || r.term === rTerm) && (!rClass || r.className === rClass),
    );

    // Count planned from timetable: weekly occurrences × teaching weeks
    const plannedMap: Record<string, number> = {};
    if (timetableData) {
      Object.keys(timetableData).forEach(day => {
        timetableData[day].forEach(slot => {
          if (slot.subject) {
            plannedMap[slot.subject] = (plannedMap[slot.subject] || 0) + teachingWeeks;
          }
        });
      });
    }

    // Aggregate by subject
    const subjectMap: Record<string, { completed: number; partial: number; notDone: number }> = {};
    termRecords.forEach(r => {
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { completed: 0, partial: 0, notDone: 0 };
      if (r.lessonStatus === 'completed') subjectMap[r.subject].completed++;
      else if (r.lessonStatus === 'partially_completed') subjectMap[r.subject].partial++;
      else subjectMap[r.subject].notDone++;
    });
    // Include planned subjects with no records yet
    Object.keys(plannedMap).forEach(s => {
      if (!subjectMap[s]) subjectMap[s] = { completed: 0, partial: 0, notDone: 0 };
    });

    return Object.entries(subjectMap)
      .map(([subject, s]) => {
        const planned = plannedMap[subject] ?? (s.completed + s.partial + s.notDone);
        const pct = planned > 0 ? Math.min(100, Math.round((s.completed / planned) * 100)) : 0;
        return { subject, planned, completed: s.completed, partial: s.partial, notDone: s.notDone, pct };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [records, rTerm, rClass, timetableData, teachingWeeks]);

  // ─── Teacher summary report ───────────────────────────────────────────────
  const teacherReport = useMemo(() => {
    const termRecords = records.filter(r => !rTerm || r.term === rTerm);
    const map: Record<string, { name: string; regular: number; cover: number }> = {};
    termRecords.forEach(r => {
      const key = r.teacherId || r.teacherName;
      if (!map[key]) map[key] = { name: r.teacherName, regular: 0, cover: 0 };
      if (r.lessonType === 'regular') map[key].regular++;
      else map[key].cover++;
    });
    return Object.values(map).sort((a, b) => (b.regular + b.cover) - (a.regular + a.cover));
  }, [records, rTerm]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Lesson Coverage</h1>
        <p className="text-sm text-slate-500 mt-1">
          Log lessons, track curriculum delivery, and generate inspection-ready reports.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { key: 'record', label: 'Record Lesson', Icon: Plus },
          { key: 'log',    label: 'Coverage Log',  Icon: ClipboardList },
          { key: 'reports',label: 'Reports',        Icon: BarChart3 },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════ RECORD TAB ══════════════════════════════════════ */}
      {activeTab === 'record' && (
        <div className="max-w-2xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-5 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Log a Lesson
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Row 1: Date + Term */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={fDate}
                    onChange={e => setFDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Term</label>
                  <select
                    value={fTerm}
                    onChange={e => setFTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {(terms.length ? terms : ['1st Term', '2nd Term', '3rd Term']).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Class + Subject */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Class *</label>
                  <select
                    value={fClass}
                    onChange={e => { setFClass(e.target.value); setFSubject(''); }}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select class…</option>
                    {classNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Subject *</label>
                  <select
                    value={fSubject}
                    onChange={e => setFSubject(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select subject…</option>
                    {formSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Period + Teacher */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Period</label>
                  <select
                    value={fPeriod}
                    onChange={e => setFPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select period…</option>
                    {periodOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Teacher *</label>
                  {isAdmin && teachers.length > 0 ? (
                    <select
                      value={fTeacherId}
                      onChange={e => {
                        setFTeacherId(e.target.value);
                        setFTeacherName(teachers.find(t => t.uid === e.target.value)?.displayName ?? '');
                      }}
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select teacher…</option>
                      {teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
                    </select>
                  ) : (
                    <input
                      value={fTeacherName}
                      onChange={e => setFTeacherName(e.target.value)}
                      required
                      placeholder="Teacher name"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              </div>

              {/* Topic */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Topic Covered</label>
                <input
                  value={fTopic}
                  onChange={e => setFTopic(e.target.value)}
                  placeholder="e.g. Quadratic equations — factorisation method"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Curriculum link */}
              {fSubject && curriculumItems.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                    Link to curriculum topic (optional — auto-ticks it as covered)
                  </label>
                  <select
                    value={fCurriculumItemId}
                    onChange={e => {
                      setFCurriculumItemId(e.target.value);
                      const item = curriculumItems.find(i => i.id === e.target.value);
                      if (item && !fTopic) setFTopic(item.topic);
                    }}
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50"
                  >
                    <option value="">— No curriculum link —</option>
                    {curriculumItems.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.topic}{i.level ? ` (${i.level})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status + Type side-by-side */}
              <div className="grid grid-cols-2 gap-6 pt-1">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Lesson Status *</p>
                  <div className="space-y-2">
                    {(['completed', 'partially_completed', 'not_completed'] as LessonStatus[]).map(s => (
                      <label key={s} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="fStatus"
                          value={s}
                          checked={fStatus === s}
                          onChange={() => setFStatus(s)}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-slate-700">{STATUS_LABELS[s]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Lesson Type *</p>
                  <div className="space-y-2">
                    {([
                      { v: 'regular', l: 'Regular Lesson' },
                      { v: 'cover',   l: 'Cover / Substitute' },
                    ] as const).map(({ v, l }) => (
                      <label key={v} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="fType"
                          value={v}
                          checked={fType === v}
                          onChange={() => setFType(v)}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-slate-700">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Remarks (optional)</label>
                <textarea
                  value={fRemarks}
                  onChange={e => setFRemarks(e.target.value)}
                  rows={2}
                  placeholder="Any notes about this lesson…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Lesson Record'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════ LOG TAB ═════════════════════════════════════════ */}
      {activeTab === 'log' && (
        <div className="space-y-4">

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Lessons',    value: quickStats.total,     color: 'text-indigo-600' },
              { label: 'Completed',        value: quickStats.completed,  color: 'text-emerald-600' },
              { label: 'Partially Done',   value: quickStats.partial,    color: 'text-amber-600' },
              { label: 'Cover Lessons',    value: quickStats.cover,      color: 'text-purple-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <select value={logTerm} onChange={e => setLogTerm(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Terms</option>
                {terms.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={logClass} onChange={e => setLogClass(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={logSubject} onChange={e => setLogSubject(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Subjects</option>
                {[...new Set(records.map(r => r.subject))].sort().map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                value={logTeacher}
                onChange={e => setLogTeacher(e.target.value)}
                placeholder="Filter by teacher…"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select value={logStatus} onChange={e => setLogStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="partially_completed">Partially Completed</option>
                <option value="not_completed">Not Completed</option>
              </select>
              <select value={logType} onChange={e => setLogType(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Types</option>
                <option value="regular">Regular</option>
                <option value="cover">Cover</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-600">
                {logRecords.length} record{logRecords.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => exportExcel(
                  logRecords.map(r => ({
                    Date:     r.date,
                    Term:     r.term,
                    Class:    r.className,
                    Subject:  r.subject,
                    Period:   r.period,
                    Teacher:  r.teacherName,
                    Topic:    r.topicCovered,
                    Status:   STATUS_LABELS[r.lessonStatus],
                    Type:     r.lessonType === 'regular' ? 'Regular' : 'Cover',
                    Remarks:  r.remarks,
                  })),
                  'lesson_coverage_log',
                )}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Class</th>
                    <th className="px-4 py-3 text-left font-medium">Subject</th>
                    <th className="px-4 py-3 text-left font-medium">Period</th>
                    <th className="px-4 py-3 text-left font-medium">Teacher</th>
                    <th className="px-4 py-3 text-left font-medium">Topic</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    {isAdmin && <th className="px-4 py-3 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logRecords.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 9 : 8} className="px-4 py-14 text-center text-slate-400">
                        No lesson records found for the selected filters.
                      </td>
                    </tr>
                  ) : logRecords.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.className}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.subject}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.period || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.teacherName}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                        {r.topicCovered || '—'}
                        {r.curriculumItemId && <Link2 className="w-3 h-3 text-indigo-400 inline ml-1 flex-shrink-0" title="Linked to curriculum" />}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.lessonStatus]}`}>
                          {STATUS_LABELS[r.lessonStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.lessonType === 'cover' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {r.lessonType === 'cover' ? 'Cover' : 'Regular'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(r.id!)}
                            className="text-slate-300 hover:text-red-500 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ REPORTS TAB ══════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div className="space-y-5">

          {/* Report controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sub-view toggle */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {([
                { key: 'curriculum', label: 'Curriculum Coverage', Icon: BookOpen },
                { key: 'teacher',    label: 'Teacher Summary',     Icon: Users },
              ] as const).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setReportView(key)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    reportView === key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Term filter (both views) */}
            <select
              value={rTerm}
              onChange={e => setRTerm(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Terms</option>
              {terms.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* Class filter (curriculum view) */}
            {reportView === 'curriculum' && (
              <select
                value={rClass}
                onChange={e => setRClass(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {/* Teaching weeks (only shows when a class is selected — enables planned calculation) */}
            {reportView === 'curriculum' && rClass && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 whitespace-nowrap">Teaching weeks:</label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={teachingWeeks}
                  onChange={e => setTeachingWeeks(Number(e.target.value))}
                  className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          {/* ── Curriculum Coverage ── */}
          {reportView === 'curriculum' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden print:shadow-none print:border-0">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800">
                    Curriculum Coverage
                    {rClass && ` — ${rClass}`}
                    {rTerm && ` · ${rTerm}`}
                    {` · ${currentSession}`}
                  </h3>
                  {rClass && !timetableData && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      No timetable found for this class/term — planned counts derived from recorded lessons only.
                    </p>
                  )}
                  {!rClass && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select a class above for timetable-based planned lesson counts.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportExcel(
                      curriculumReport.map(r => ({
                        Subject:               r.subject,
                        'Lessons Planned':     r.planned,
                        'Completed':           r.completed,
                        'Partially Completed': r.partial,
                        'Not Completed':       r.notDone,
                        'Coverage %':          `${r.pct}%`,
                      })),
                      `curriculum_${rClass}_${rTerm}`.replace(/\s/g, '_'),
                    )}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors print:hidden"
                  >
                    <Download className="w-3.5 h-3.5" /> Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors print:hidden"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / PDF
                  </button>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Subject</th>
                    <th className="px-5 py-3 text-right font-medium">Planned</th>
                    <th className="px-5 py-3 text-right font-medium">Completed</th>
                    <th className="px-5 py-3 text-right font-medium">Partial</th>
                    <th className="px-5 py-3 text-right font-medium">Not Done</th>
                    <th className="px-5 py-3 text-left font-medium w-44">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {curriculumReport.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                        No lesson records for the selected period.
                      </td>
                    </tr>
                  ) : curriculumReport.map(r => (
                    <tr key={r.subject} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{r.subject}</td>
                      <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{r.planned}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700 tabular-nums">{r.completed}</td>
                      <td className="px-5 py-3 text-right text-amber-600 tabular-nums">{r.partial}</td>
                      <td className="px-5 py-3 text-right text-red-500 tabular-nums">{r.notDone}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.pct >= 90 ? 'bg-emerald-500' : r.pct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${r.pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-500 w-8 text-right tabular-nums">{r.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {curriculumReport.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                    <tr>
                      <td className="px-5 py-3 text-slate-700">Total</td>
                      <td className="px-5 py-3 text-right text-slate-700 tabular-nums">
                        {curriculumReport.reduce((s, r) => s + r.planned, 0)}
                      </td>
                      <td className="px-5 py-3 text-right text-emerald-700 tabular-nums">
                        {curriculumReport.reduce((s, r) => s + r.completed, 0)}
                      </td>
                      <td className="px-5 py-3 text-right text-amber-600 tabular-nums">
                        {curriculumReport.reduce((s, r) => s + r.partial, 0)}
                      </td>
                      <td className="px-5 py-3 text-right text-red-500 tabular-nums">
                        {curriculumReport.reduce((s, r) => s + r.notDone, 0)}
                      </td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* ── Teacher Summary ── */}
          {reportView === 'teacher' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden print:shadow-none print:border-0">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">
                  Teacher Performance — {rTerm || 'All Terms'} · {currentSession}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportExcel(
                      teacherReport.map(t => ({
                        Teacher:           t.name,
                        'Regular Lessons': t.regular,
                        'Cover Lessons':   t.cover,
                        'Total':           t.regular + t.cover,
                      })),
                      `teacher_summary_${rTerm}`.replace(/\s/g, '_'),
                    )}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors print:hidden"
                  >
                    <Download className="w-3.5 h-3.5" /> Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors print:hidden"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / PDF
                  </button>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Teacher</th>
                    <th className="px-5 py-3 text-right font-medium">Regular</th>
                    <th className="px-5 py-3 text-right font-medium">Cover</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teacherReport.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-14 text-center text-slate-400">
                        No records for the selected period.
                      </td>
                    </tr>
                  ) : teacherReport.map(t => (
                    <tr key={t.name} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{t.name}</td>
                      <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{t.regular}</td>
                      <td className="px-5 py-3 text-right text-purple-600 tabular-nums">{t.cover}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {t.regular + t.cover}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {teacherReport.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                    <tr>
                      <td className="px-5 py-3 text-slate-700">Total</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {teacherReport.reduce((s, t) => s + t.regular, 0)}
                      </td>
                      <td className="px-5 py-3 text-right text-purple-600 tabular-nums">
                        {teacherReport.reduce((s, t) => s + t.cover, 0)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {teacherReport.reduce((s, t) => s + t.regular + t.cover, 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
