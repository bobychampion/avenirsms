import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { X, GraduationCap, Sparkles, Clock3, MapPin, Users, CalendarDays } from 'lucide-react';
import { db } from '../firebase';
import { useSchool } from './SchoolContext';
import type { SpecialLesson, Student, UserProfile } from '../types';
import { DAYS_OF_WEEK, WEEKEND_DAYS } from '../types';
import { activityFormError, activitySchedule, CLUB_SUGGESTIONS } from '../utils/schoolActivities';
import { assertNotImpersonating } from '../utils/impersonationGuard';
import toast from 'react-hot-toast';

export default function ActivityEditor({ schoolId, activity, teachers, students, onClose, onSaved }: {
  schoolId: string; activity?: SpecialLesson; teachers: UserProfile[]; students: Student[];
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const { currentSession, currentTerm, terms } = useSchool();
  const [form, setForm] = useState(() => ({
    activityType: activity?.activityType ?? 'lesson' as 'lesson' | 'club', name: activity?.name ?? '', description: activity?.description ?? '',
    subject: activity?.subject ?? '', location: activity?.location ?? '', teacherIds: activity?.teacherIds ?? [],
    enrolledStudentIds: activity?.enrolledStudentIds ?? [], academicSession: activity?.academicSession ?? currentSession,
    term: activity?.term ?? currentTerm, startDate: activity?.startDate ?? '', endDate: activity?.endDate ?? '',
    startTime: activity?.startTime ?? '', endTime: activity?.endTime ?? '', days: activity?.days ?? [], status: activity?.status ?? 'active',
  }));
  const initial = useRef(JSON.stringify(form));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const dismiss = () => { if (!saving && (JSON.stringify(form) === initial.current || confirm('Discard unsaved activity changes?'))) onClose(); };
  closeRef.current = dismiss;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? []);
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  const toggle = (field: 'teacherIds' | 'enrolledStudentIds' | 'days', id: string) => setForm(prev => ({ ...prev, [field]: prev[field].includes(id) ? prev[field].filter(x => x !== id) : [...prev[field], id] }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = activityFormError(form, activity?.time);
    if (validation) { setError(validation); return; }
    setSaving(true); setError('');
    try {
      assertNotImpersonating();
      const data = { ...form, name: form.name.trim(), schoolId,
        teacherNames: form.teacherIds.map(id => teachers.find(t => t.uid === id)?.displayName ?? activity?.teacherNames?.[activity.teacherIds.indexOf(id)] ?? 'Teacher'),
        time: form.startTime && form.endTime ? `${form.startTime}–${form.endTime}` : activity?.time ?? '', updatedAt: serverTimestamp() };
      let id = activity?.id;
      if (id) await updateDoc(doc(db, 'special_lessons', id), data);
      else id = (await addDoc(collection(db, 'special_lessons'), { ...data, createdAt: serverTimestamp() })).id;
      toast.success('School activity saved.'); onSaved(id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save activity.'); }
    finally { setSaving(false); }
  };
  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500';
  const label = 'block text-xs font-semibold text-slate-500 mb-2';
  const preview = { ...form, schoolId, teacherNames: [], time: activity?.time ?? '' } as SpecialLesson;
  return <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="activity-editor-title" className="bg-white w-full max-w-5xl h-full sm:h-auto sm:max-h-[94vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
      <header className="p-5 sm:px-8 border-b flex items-center justify-between gap-4"><div><p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">School Activities</p><h2 id="activity-editor-title" className="text-xl font-bold mt-1">{activity ? 'Edit activity' : 'Create an activity'}</h2></div><button type="button" aria-label="Close activity editor" onClick={dismiss} className="p-2 rounded-full hover:bg-slate-100"><X size={20} /></button></header>
      <form onSubmit={save} className="flex flex-col min-h-0 flex-1">
        <fieldset disabled={saving} className="min-h-0 min-w-0 w-full overflow-y-auto flex-1 grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 p-5 sm:p-8 space-y-7">
            <section><h3 className="font-semibold mb-3">1. Activity type</h3><div className="grid sm:grid-cols-2 gap-3">{(['lesson', 'club'] as const).map(type => {
              const Icon = type === 'club' ? Sparkles : GraduationCap;
              return <button key={type} type="button" aria-pressed={form.activityType === type} onClick={() => setForm(prev => ({ ...prev, activityType: type }))} className={`text-left p-4 border-2 rounded-2xl ${form.activityType === type ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-300'}`}><Icon size={21} className="text-indigo-600 mb-2" /><span className="font-semibold block">{type === 'club' ? 'After-school club' : 'Special lesson'}</span><span className="text-xs text-slate-500">{type === 'club' ? 'Explore interests and learn together' : 'Coaching, revision and extra teaching'}</span></button>;
            })}</div></section>
            <section className="space-y-4"><h3 className="font-semibold">2. Details</h3>
              {form.activityType === 'club' && <div><p className={label}>Start with an idea, or enter your own title</p><div className="flex flex-wrap gap-2">{CLUB_SUGGESTIONS.map(name => <button type="button" key={name} onClick={() => setForm(prev => ({ ...prev, name: `${name} Club` }))} className="border rounded-full px-3 py-1.5 text-xs hover:bg-indigo-50 hover:border-indigo-400">{name}</button>)}</div></div>}
              <label className={label}>Activity title<input required value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} className={`${field} mt-2`} placeholder={form.activityType === 'club' ? 'e.g. Junior Chess Club' : 'e.g. Year 11 Maths Revision'} /></label>
              {form.activityType === 'lesson' && <label className={label}>Subject (optional)<input className={field} value={form.subject} onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))} /></label>}
              <label className={label}>Description<textarea className={field} rows={3} value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="What will students learn or take part in?" /></label>
              <label className={label}>Location<input className={field} value={form.location} onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))} placeholder="e.g. Music room, sports hall" /></label>
            </section>
            <section><h3 className="font-semibold mb-3">3. Leaders</h3><div className="flex flex-wrap gap-2">{teachers.map(t => <button type="button" key={t.uid} aria-pressed={form.teacherIds.includes(t.uid)} onClick={() => toggle('teacherIds', t.uid)} className={`rounded-xl px-3 py-2 border text-sm ${form.teacherIds.includes(t.uid) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200'}`}>{t.displayName || t.email}</button>)}</div>{!teachers.length && <p className="text-sm text-amber-700">Create a teacher account before assigning an activity leader.</p>}</section>
            <section className="space-y-4"><h3 className="font-semibold">4. Schedule</h3><div className="grid sm:grid-cols-2 gap-4">
              <label className={label}>School year<input required className={field} value={form.academicSession} onChange={e => setForm(prev => ({ ...prev, academicSession: e.target.value }))} /></label>
              <label className={label}>Term<select className={field} value={form.term} onChange={e => setForm(prev => ({ ...prev, term: e.target.value }))}>{[...new Set([form.term, ...terms])].map(term => <option key={term}>{term}</option>)}</select></label>
              <label className={label}>Start date<input type="date" className={field} value={form.startDate} onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))} /></label>
              <label className={label}>End date<input type="date" min={form.startDate} className={field} value={form.endDate} onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))} /></label>
              <label className={label}>Start time<input type="time" className={field} value={form.startTime} onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))} /></label>
              <label className={label}>End time<input type="time" className={field} value={form.endTime} onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))} /></label>
            </div>{activity?.time && !form.startTime && <p className="text-xs text-slate-500">Existing schedule: {activity.time}. Choose start and end times to update it.</p>}
              <div><p className={label}>Weekly meeting days (optional)</p><div className="flex flex-wrap gap-2">{[...DAYS_OF_WEEK, ...WEEKEND_DAYS].map(day => <button type="button" key={day} aria-pressed={form.days.includes(day)} onClick={() => toggle('days', day)} className={`px-3 py-2 rounded-xl text-xs border ${form.days.includes(day) ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>{day.slice(0, 3)}</button>)}</div><p className="text-xs text-slate-400 mt-2">You can adjust dates and times for individual meetings.</p></div>
            </section>
            <section><h3 className="font-semibold mb-3">5. Students <span className="font-normal text-sm text-slate-400">{form.enrolledStudentIds.length} selected</span></h3><input aria-label="Search activity students" className={field} placeholder="Search name or main class" value={search} onChange={e => setSearch(e.target.value)} /><div className="mt-3 max-h-52 overflow-y-auto border rounded-xl divide-y">{students.filter(s => `${s.studentName} ${s.currentClass}`.toLowerCase().includes(search.toLowerCase())).map(s => <label key={s.id} className="flex items-center gap-3 p-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={form.enrolledStudentIds.includes(s.id!)} onChange={() => toggle('enrolledStudentIds', s.id!)} /><span>{s.studentName}</span><span className="ml-auto text-xs text-slate-500">{s.currentClass}</span></label>)}</div><p className="text-xs text-slate-500 mt-2">Students can join from any class and take part in multiple activities.</p></section>
            <label className={label}>Status<select className={field} value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as SpecialLesson['status'] }))}><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed / archived</option></select></label>
          </div>
          <aside className="bg-slate-50 p-6 lg:border-l space-y-5"><div className="lg:sticky lg:top-6 space-y-5"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Activity preview</p><div className="bg-white border rounded-2xl p-5 space-y-4"><Sparkles className="text-indigo-600" /><h3 className="font-bold text-lg">{form.name || 'Your activity title'}</h3><p className="text-xs text-indigo-600">{form.activityType === 'club' ? 'After-school club' : 'Special lesson'}</p><p className="text-sm text-slate-500">{form.description || 'A place for students to learn, practise and discover.'}</p><p className="text-sm flex gap-2"><Clock3 size={17} className="shrink-0" />{activitySchedule(preview)}</p><p className="text-sm flex gap-2"><Users size={17} />{form.enrolledStudentIds.length} students · {form.teacherIds.length} leaders</p><p className="text-sm flex gap-2"><CalendarDays size={17} />{form.academicSession} · {form.term}</p></div><p className="text-xs text-slate-500">After saving, plan individual meetings and take attendance in the activity workspace.</p></div></aside>
        </fieldset>
        <footer className="border-t p-4 sm:px-8 flex items-center justify-between gap-3 bg-white">{error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : <p className="text-xs text-slate-500 hidden sm:block">All students keep their main class.</p>}<div className="flex gap-2 ml-auto"><button type="button" disabled={saving} onClick={dismiss} className="px-4 py-2.5 rounded-xl border">Cancel</button><button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save activity'}</button></div></footer>
      </form>
    </div>
  </div>;
}
