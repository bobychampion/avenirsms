import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { useAuth } from './FirebaseProvider';
import type { Grade, GradingMode, GradingSystem, CustomGradeScale, Student } from '../types';
import { calculateGrade } from '../types';
import { saveAssessmentChunk, saveAssessmentDefinition } from '../services/assessmentService';
import { AssessmentGrade, AssessmentSession, assessmentCellKey, assessmentDocumentId, defaultAssessmentSessions } from '../utils/assessmentSessions';
import { exportAssessmentGradesCsv } from '../services/dataExport/csvModules';

interface Props {
  schoolId: string | null | undefined;
  className: string;
  classId?: string;
  subject: string;
  session: string;
  term: Grade['term'];
  students: Student[];
  grading: { gradingMode: GradingMode; gradingSystem: GradingSystem; customGradingScale?: CustomGradeScale[]; allowedGrades?: string[]; gradeLabels?: Record<string, string> };
  onChooseFinal: (studentId: string, assessment: AssessmentGrade) => void;
}

export default function AnnualAssessments(props: Props) {
  const { schoolId, className, classId, subject, session, term, students, grading, onChooseFinal } = props;
  const { user } = useAuth();
  const [sessions, setSessions] = useState<AssessmentSession[]>(defaultAssessmentSessions);
  const [grades, setGrades] = useState<Record<string, AssessmentGrade>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AssessmentSession | null>(null);
  const revisions = useRef<Record<string, number>>({});
  const context = assessmentDocumentId(schoolId ?? '', className, subject, session);
  const currentContext = useRef(context);
  currentContext.current = context;

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => { if (dirty.size) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    setGrades({}); setDirty(new Set()); setSessions(defaultAssessmentSessions());
    setEditing(null); setLoading(true); setFailed(false); revisions.current = {};
    if (!schoolId || !className || !subject || !session) { setLoading(false); return; }
    const filters = [where('schoolId', '==', schoolId), where('class', '==', className), where('subject', '==', subject), where('session', '==', session)];
    Promise.all([
      getDocs(query(collection(db, 'grade_assessments'), ...filters)),
      getDocs(query(collection(db, 'assessment_grades'), ...filters)),
    ]).then(([definitions, records]) => {
      if (cancelled) return;
      const all = new Map(defaultAssessmentSessions().map(a => [a.id, a]));
      definitions.docs.forEach(d => { const a = { ...d.data(), id: d.data().assessmentId } as AssessmentSession; all.set(a.id, a); });
      const map: Record<string, AssessmentGrade> = {};
      records.docs.forEach(d => {
        const g = { ...d.data(), id: d.id } as AssessmentGrade;
        const key = assessmentCellKey(g.studentId, g.assessmentId);
        map[key] = g; revisions.current[key] = g.revision ?? 0;
        // Imported assessments include their own metadata, even without a definition document.
        if (!definitions.docs.some(d => d.data().assessmentId === g.assessmentId)) all.set(g.assessmentId, { id: g.assessmentId, name: g.assessmentName, date: g.assessmentDate, term: g.term, order: all.get(g.assessmentId)?.order ?? all.size + 1 });
      });
      setSessions([...all.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));
      setGrades(map); setLoading(false);
    }).catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [context]);

  const emptyGrade = (studentId: string, a: AssessmentSession): AssessmentGrade => ({
    studentId, subject, class: className, classId, session, term: a.term, grade: '', updatedAt: null,
    assessmentId: a.id, assessmentName: a.name, assessmentDate: a.date, gradingMode: grading.gradingMode,
  });
  const change = (studentId: string, a: AssessmentSession, patch: Partial<AssessmentGrade>) => {
    const key = assessmentCellKey(studentId, a.id);
    setGrades(prev => {
      const g = { ...(prev[key] ?? emptyGrade(studentId, a)), ...patch };
      if (grading.gradingMode !== 'single_grade' && ('totalScore' in patch || 'caScore' in patch || 'examScore' in patch)) {
        g.totalScore = grading.gradingMode === 'score_percentage' ? patch.totalScore : (g.caScore === undefined && g.examScore === undefined ? undefined : (g.caScore ?? 0) + (g.examScore ?? 0));
        g.grade = g.totalScore === undefined ? '' : calculateGrade(g.totalScore, grading.gradingSystem, grading.customGradingScale);
      }
      return { ...prev, [key]: g };
    });
    setDirty(prev => new Set(prev).add(key));
  };

  const save = async () => {
    if (!schoolId || !classId || !user || saving || loading || failed) return;
    const entries = [...dirty].filter(key => students.some(s => s.id === grades[key]?.studentId)).map(key => {
      const g = grades[key];
      const a = sessions.find(a => a.id === g.assessmentId)!;
      return { key, grade: { ...g, term: a.term, assessmentName: a.name, assessmentDate: a.date } };
    });
    if (!entries.length) return;
    if (entries.some(({ grade }) => grade.grade && grading.gradingMode === 'single_grade' && !grading.allowedGrades?.includes(grade.grade))) {
      toast.error('Choose a valid grade for this class.'); return;
    }
    setSaving(true);
    try {
      // Small transactions keep rule access and write limits bounded. Only changed cells are saved.
      for (let start = 0; start < entries.length; start += 50) {
        if (currentContext.current !== context) throw new Error('Gradebook selection changed. Reopen the previous selection to check saved assessments.');
        const chunk = entries.slice(start, start + 50);
        const baseline = chunk.map(({ key }) => revisions.current[key] ?? 0);
        const definitions = [...new Set(chunk.map(({ grade }) => grade.assessmentId))].map(id => sessions.find(a => a.id === id)!);
        await saveAssessmentChunk(chunk.map(({ grade }, i) => ({ grade, revision: baseline[i] })), definitions,
          { schoolId, className, classId, subject, session, recordedBy: user.uid, gradingMode: grading.gradingMode });
        if (currentContext.current === context) {
          chunk.forEach(({ key }, i) => { revisions.current[key] = baseline[i] + 1; });
          setDirty(prev => { const next = new Set(prev); chunk.forEach(({ key }) => next.delete(key)); return next; });
        }
      }
      toast.success('Assessments saved.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save assessments.'); }
    finally { setSaving(false); }
  };

  const saveDefinition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !schoolId || !classId || !user || !editing.name.trim() || saving) return;
    setSaving(true);
    const a = { ...editing, name: editing.name.trim() };
    try {
      const savedEntries = Object.entries(grades).filter(([key, g]) => g.assessmentId === a.id && (g.id || revisions.current[key] > 0))
        .map(([key, grade]) => ({ key, grade, revision: revisions.current[key] ?? 0 }));
      await saveAssessmentDefinition(a, savedEntries, { schoolId, className, classId, subject, session, recordedBy: user.uid, gradingMode: grading.gradingMode });
      if (currentContext.current === context) {
        savedEntries.forEach(({ key, revision }) => { revisions.current[key] = revision + 1; });
        setGrades(prev => Object.fromEntries(Object.entries(prev).map(([key, g]) => [key, g.assessmentId === a.id ? { ...g, assessmentName: a.name, assessmentDate: a.date } : g])));
        setSessions(prev => [...prev.filter(item => item.id !== a.id), a].sort((x, y) => x.order - y.order)); setEditing(null);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save assessment details.'); }
    finally { setSaving(false); }
  };

  if (!className || !subject || !session) return null;
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-800">Assessments — {session}</h2>
        <p className="text-xs text-slate-500">Six assessment slots across the year. Choose a grade as the final for {term}, then save the final grades below.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading || saving || failed || !classId} onClick={() => setEditing({ id: crypto.randomUUID(), name: `Grade ${Math.max(...sessions.map(a => a.order)) + 1}`, date: '', term, order: Math.max(...sessions.map(a => a.order)) + 1 })} className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-semibold disabled:opacity-50">+ Add assessment</button>
        <button type="button" disabled={loading || saving || failed} onClick={() => exportAssessmentGradesCsv(Object.values(grades).filter(g => students.some(s => s.id === g.studentId)).map(g => { const a = sessions.find(a => a.id === g.assessmentId)!; return { ...g, term: a.term, assessmentName: a.name, assessmentDate: a.date, studentName: students.find(s => s.id === g.studentId)?.studentName }; }))} className="px-3 py-2 rounded-xl border text-sm">Export assessments CSV</button>
        <button type="button" onClick={save} disabled={!dirty.size || saving || loading || failed || !classId} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save assessments'}</button>
      </div>
    </div>
    {dirty.size > 0 && <p role="status" className="px-4 pb-3 text-xs text-amber-700">Unsaved assessment changes — save before changing class, subject, or year.</p>}
    {loading ? <p className="p-6 text-slate-500">Loading assessments…</p> : failed ? <p role="alert" className="p-6 text-rose-600">Unable to load assessments. Reopen the gradebook to retry.</p> : <div className="overflow-x-auto">
      <table className="w-full text-sm"><thead><tr className="bg-slate-50 border-y border-slate-200">
        <th className="sticky left-0 z-10 bg-slate-50 min-w-[180px] px-4 py-3 text-left">Student</th>
        {sessions.map(a => <th key={a.id} className="min-w-[210px] px-3 py-3 text-left">
          <button type="button" disabled={saving} onClick={() => setEditing(a)} className="font-semibold text-indigo-700" title="Edit assessment details (the term is fixed once saved)">{a.name}</button>
          <p className="text-xs font-normal text-slate-500">{a.term}{a.date ? ` · ${a.date}` : ''}</p>
        </th>)}
      </tr></thead><tbody className="divide-y divide-slate-100">
        {students.map(s => <tr key={s.id}><th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-medium">{s.studentName}</th>
          {sessions.map(a => {
            const g = grades[assessmentCellKey(s.id!, a.id)] ?? emptyGrade(s.id!, a);
            const storedMode = g.gradingMode ?? grading.gradingMode;
            const modeChanged = storedMode !== grading.gradingMode;
            return <td key={a.id} className="px-3 py-3 align-top">
              <fieldset disabled={saving || modeChanged} className="space-y-2">
                {storedMode === 'single_grade' ? <select aria-label={`${s.studentName}, ${a.name}: grade`} value={g.grade} onChange={e => change(s.id!, a, { grade: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2">
                  <option value="">—</option>{g.grade && !grading.allowedGrades?.includes(g.grade) && <option value={g.grade}>{g.grade}</option>}
                  {grading.allowedGrades?.map(value => <option key={value} value={value}>{grading.gradeLabels?.[value] ? `${value} — ${grading.gradeLabels[value]}` : value}</option>)}
                </select> : <div className="flex gap-2">
                  {(storedMode === 'score_percentage' ? ['totalScore'] as const : ['caScore', 'examScore'] as const).map(field => <label key={field} className="text-xs text-slate-500">{field === 'totalScore' ? 'Score /100' : field === 'caScore' ? 'CA /40' : 'Exam /60'}
                    <input aria-label={`${s.studentName}, ${a.name}: ${field}`} type="number" min={0} max={field === 'caScore' ? 40 : field === 'examScore' ? 60 : 100} value={g[field] ?? ''} onChange={e => change(s.id!, a, { [field]: e.target.value === '' ? undefined : Math.min(field === 'caScore' ? 40 : field === 'examScore' ? 60 : 100, Math.max(0, Number(e.target.value))) })} className="w-20 block border rounded-lg p-2" />
                  </label>)}<span className="self-end py-2 font-bold">{g.grade || '—'}</span>
                </div>}
                <input aria-label={`${s.studentName}, ${a.name}: teacher comment`} placeholder="Teacher's comment" value={g.teacherNotes ?? ''} onChange={e => change(s.id!, a, { teacherNotes: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-xs" />
              </fieldset>
              {modeChanged && <p className="text-xs text-amber-700">Saved under an earlier grading mode.</p>}
              <button type="button" disabled={!g.grade || a.term !== term || saving || modeChanged} onClick={() => { onChooseFinal(s.id!, { ...g, term: a.term, assessmentName: a.name, assessmentDate: a.date }); toast.success('Final grade selected. Save final grades below to publish it.'); }} className="mt-2 text-xs font-semibold text-indigo-700 disabled:text-slate-300">Use as final grade</button>
            </td>;
          })}
        </tr>)}
        {!students.length && <tr><td colSpan={sessions.length + 1} className="p-6 text-slate-500">No students enrolled in this subject.</td></tr>}
      </tbody></table>
    </div>}
    {editing && <form onSubmit={saveDefinition} className="p-4 border-t bg-indigo-50 flex flex-wrap gap-3 items-end">
      <label className="text-xs font-semibold">Assessment name<input required maxLength={80} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="block rounded-lg border p-2 bg-white" /></label>
      <label className="text-xs font-semibold">Date<input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} className="block rounded-lg border p-2 bg-white" /></label>
      <label className="text-xs font-semibold">Term<select value={editing.term} disabled={Object.values(grades).some(g => g.assessmentId === editing.id)} onChange={e => setEditing({ ...editing, term: e.target.value as Grade['term'] })} className="block rounded-lg border p-2 bg-white">{['1st Term', '2nd Term', '3rd Term'].map(t => <option key={t}>{t}</option>)}</select></label>
      <button disabled={saving} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm">Save details</button>
      <button type="button" disabled={saving} onClick={() => setEditing(null)} className="px-3 py-2 text-sm">Cancel</button>
    </form>}
  </section>;
}
