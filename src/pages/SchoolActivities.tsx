import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { Plus, Sparkles, GraduationCap, Users, ArrowUpRight } from 'lucide-react';
import { db } from '../firebase';
import { useSchoolId } from '../hooks/useSchoolId';
import type { SpecialLesson, Student, UserProfile } from '../types';
import { activitySchedule, activityTypeLabel } from '../utils/schoolActivities';
import ActivityEditor from '../components/ActivityEditor';
import ActivityWorkspace from '../components/ActivityWorkspace';

export default function SchoolActivities() {
  const schoolId = useSchoolId();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('activity');
  const [activities, setActivities] = useState<SpecialLesson[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [ready, setReady] = useState({ activities: false, teachers: false, students: false });
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<SpecialLesson | 'new' | null>(null);
  const [filter, setFilter] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  useEffect(() => {
    setActivities([]); setTeachers([]); setStudents([]); setError(''); setEditor(null);
    setReady({ activities: false, teachers: false, students: false });
    if (!schoolId) return;
    let cancelled = false;
    const fail = () => { if (!cancelled) setError('Unable to load school activities. Reload the page to try again.'); };
    const stopActivities = onSnapshot(query(collection(db, 'special_lessons'), where('schoolId', '==', schoolId)), snap => {
      if (!cancelled) { setActivities(snap.docs.map(d => ({ ...d.data(), id: d.id } as SpecialLesson)).sort((a, b) => a.name.localeCompare(b.name))); setReady(prev => ({ ...prev, activities: true })); }
    }, fail);
    const stopTeachers = onSnapshot(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'teacher')), snap => {
      if (!cancelled) { setTeachers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile))); setReady(prev => ({ ...prev, teachers: true })); }
    }, fail);
    const stopStudents = onSnapshot(query(collection(db, 'students'), where('schoolId', '==', schoolId)), snap => {
      if (!cancelled) { setStudents(snap.docs.map(d => ({ ...d.data(), id: d.id } as Student)).filter(s => s.admissionStatus !== 'withdrawn').sort((a, b) => a.studentName.localeCompare(b.studentName))); setReady(prev => ({ ...prev, students: true })); }
    }, fail);
    return () => { cancelled = true; stopActivities(); stopTeachers(); stopStudents(); };
  }, [schoolId]);
  const loaded = Object.values(ready).every(Boolean) && !error;
  const visible = activities.filter(a => (filter === 'all' || (a.activityType ?? 'lesson') === filter) && (status === 'all' || a.status === status) && `${a.name} ${a.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="p-4 sm:p-7 lg:p-8 max-w-7xl mx-auto space-y-6">
    {selectedId && schoolId ? <ActivityWorkspace key={`${schoolId}:${selectedId}`} schoolId={schoolId} activityId={selectedId} onBack={() => setParams({})} onEdit={loaded ? activity => setEditor(activity) : undefined} /> : <>
      <header className="flex flex-wrap justify-between items-start gap-4"><div><p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">Learn · Practise · Discover</p><h1 className="text-3xl font-bold text-slate-900">School Activities</h1><p className="text-sm text-slate-500 mt-2 max-w-2xl">One home for special lessons and after-school clubs. Bring students together across classes, plan their meetings and track attendance.</p></div><button disabled={!loaded} onClick={() => setEditor('new')} className="inline-flex gap-2 items-center rounded-xl bg-indigo-600 text-white px-5 py-3 font-semibold text-sm shadow-sm disabled:opacity-40"><Plus size={18} />New activity</button></header>
      <div className="grid sm:grid-cols-3 gap-3">{[['All activities', activities.length], ['Special lessons', activities.filter(a => a.activityType !== 'club').length], ['After-school clubs', activities.filter(a => a.activityType === 'club').length]].map(([title, count]) => <div key={title} className="border bg-white rounded-2xl p-4 flex items-center gap-4"><span className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><Sparkles size={20} /></span><div><p className="text-2xl font-bold">{count}</p><p className="text-xs text-slate-500">{title}</p></div></div>)}</div>
      <div className="flex flex-wrap gap-3 items-center"><div className="flex gap-1 p-1.5 bg-slate-100 rounded-xl overflow-x-auto">{[['all', 'All activities'], ['lesson', 'Special lessons'], ['club', 'After-school clubs']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap font-semibold ${filter === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div><input aria-label="Search school activities" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activities…" className="flex-1 min-w-[180px] rounded-xl border py-2.5 px-3 text-sm" /><select aria-label="Activity status filter" value={status} onChange={e => setStatus(e.target.value)} className="border rounded-xl p-2.5 text-sm bg-white"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed / archived</option></select></div>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-5 text-rose-600">{error}</p> : !ready.activities ? <p className="py-16 text-center text-slate-400">Loading school activities…</p> : !visible.length ? <div className="border-2 border-dashed rounded-3xl p-16 text-center bg-white"><Sparkles className="mx-auto mb-4 text-indigo-300" size={36} /><h2 className="font-semibold">{activities.length ? 'No activities match these filters' : 'Start something students will look forward to'}</h2><p className="text-sm text-slate-500 mt-2">Create a special lesson or a club, then add students and plan the first meeting.</p></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{visible.map(activity => <button key={activity.id} onClick={() => setParams({ activity: activity.id! })} className="text-left bg-white border rounded-3xl p-5 hover:shadow-md hover:border-indigo-200 transition-all group"><div className="flex items-center justify-between"><span className={`inline-flex gap-1.5 items-center px-2.5 py-1 rounded-full text-xs font-semibold ${activity.activityType === 'club' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{activity.activityType === 'club' ? <Sparkles size={13} /> : <GraduationCap size={13} />}{activityTypeLabel(activity)}</span><span className={`text-xs capitalize ${activity.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>{activity.status === 'completed' ? 'Archived' : activity.status}</span></div><h2 className="text-lg font-bold mt-4 text-slate-900">{activity.name}</h2><p className="text-sm text-slate-500 mt-2 line-clamp-2 min-h-10">{activity.description || 'Open to see members, meeting plans and attendance.'}</p><div className="text-xs text-slate-500 mt-5 space-y-2"><p>{activitySchedule(activity)}</p><p>{activity.enrolledStudentIds.length} students · {(activity.teacherNames ?? []).join(', ') || 'Leader not assigned'}</p><p>{activity.academicSession} · {activity.term}</p></div><div className="flex items-center justify-between mt-5 border-t pt-4 text-sm font-semibold text-indigo-600">Open activity workspace<ArrowUpRight size={17} className="group-hover:translate-x-0.5 transition-transform" /></div></button>)}</div>}
    </>}
    {editor && schoolId && <ActivityEditor schoolId={schoolId} activity={editor === 'new' ? undefined : editor} teachers={teachers} students={students} onClose={() => setEditor(null)} onSaved={id => { setEditor(null); setParams({ activity: id }); }} />}
  </div>;
}
