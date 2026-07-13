import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, where, serverTimestamp } from 'firebase/firestore';
import { SpecialLesson, Student, UserProfile, DAYS_OF_WEEK, WEEKEND_DAYS } from '../types';
import { useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, Edit2, Users, Loader2, X, Sparkles, Search, Calendar, Clock, UserCheck,
} from 'lucide-react';

const ALL_DAYS = [...DAYS_OF_WEEK, ...WEEKEND_DAYS];

const emptyForm: Omit<SpecialLesson, 'id' | 'schoolId'> = {
  name: '',
  description: '',
  teacherIds: [],
  teacherNames: [],
  academicSession: '',
  term: '',
  startDate: '',
  endDate: '',
  days: [],
  time: '',
  status: 'active',
  enrolledStudentIds: [],
};

export default function SpecialLessons() {
  const schoolId = useSchoolId();
  const { currentSession, currentTerm, terms } = useSchool();
  const [lessons, setLessons] = useState<SpecialLesson[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<SpecialLesson | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [enrollingLesson, setEnrollingLesson] = useState<SpecialLesson | null>(null);
  const [studentSearch, setStudentSearch] = useState('');

  useEffect(() => {
    if (!schoolId) return;
    const unsubLessons = onSnapshot(
      query(collection(db, 'special_lessons'), where('schoolId', '==', schoolId)),
      snap => { setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() } as SpecialLesson))); setLoading(false); },
      err => handleFirestoreError(err, OperationType.LIST, 'special_lessons'),
    );
    const unsubTeachers = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'teacher'), where('schoolId', '==', schoolId)),
      snap => setTeachers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))),
    );
    const unsubStudents = onSnapshot(
      query(collection(db, 'students'), where('schoolId', '==', schoolId)),
      snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).filter(s => s.admissionStatus !== 'withdrawn')),
    );
    return () => { unsubLessons(); unsubTeachers(); unsubStudents(); };
  }, [schoolId]);

  const openCreate = () => {
    setEditingLesson(null);
    setForm({ ...emptyForm, academicSession: currentSession, term: currentTerm });
    setIsModalOpen(true);
  };

  const openEdit = (lesson: SpecialLesson) => {
    setEditingLesson(lesson);
    setForm({
      name: lesson.name,
      description: lesson.description || '',
      teacherIds: lesson.teacherIds,
      teacherNames: lesson.teacherNames || [],
      academicSession: lesson.academicSession,
      term: lesson.term,
      startDate: lesson.startDate,
      endDate: lesson.endDate,
      days: lesson.days,
      time: lesson.time || '',
      status: lesson.status,
      enrolledStudentIds: lesson.enrolledStudentIds,
    });
    setIsModalOpen(true);
  };

  const toggleTeacher = (t: UserProfile) => {
    const has = form.teacherIds.includes(t.uid);
    setForm(f => ({
      ...f,
      teacherIds: has ? f.teacherIds.filter(id => id !== t.uid) : [...f.teacherIds, t.uid],
      teacherNames: has ? (f.teacherNames || []).filter(n => n !== t.displayName) : [...(f.teacherNames || []), t.displayName || ''],
    }));
  };

  const toggleDay = (day: string) => {
    setForm(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day] }));
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!form.name.trim()) { toast.error('Lesson name is required'); return; }
    if (form.teacherIds.length === 0) { toast.error('Assign at least one teacher'); return; }
    setSaving(true);
    try {
      if (editingLesson?.id) {
        await updateDoc(doc(db, 'special_lessons', editingLesson.id), { ...form, updatedAt: serverTimestamp() });
        toast.success('Special lesson updated');
      } else {
        await addDoc(collection(db, 'special_lessons'), { ...form, schoolId, createdAt: serverTimestamp() });
        toast.success('Special lesson created');
      }
      setIsModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this special lesson? Attendance history will be kept but the lesson will no longer appear for teachers or students.')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'special_lessons', id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleEnrollment = async (lesson: SpecialLesson, studentId: string) => {
    if (!lesson.id) return;
    const enrolled = lesson.enrolledStudentIds.includes(studentId);
    const next = enrolled ? lesson.enrolledStudentIds.filter(id => id !== studentId) : [...lesson.enrolledStudentIds, studentId];
    try {
      await updateDoc(doc(db, 'special_lessons', lesson.id), { enrolledStudentIds: next, updatedAt: serverTimestamp() });
    } catch (e) {
      toast.error('Failed to update enrollment');
    }
  };

  const filteredStudents = useMemo(() =>
    students.filter(s => s.studentName.toLowerCase().includes(studentSearch.toLowerCase())),
    [students, studentSearch]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            Special Lessons
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Coaching, clubs, remedial classes and other lessons outside the normal class timetable.
            A student can be enrolled in any number of these regardless of their class.
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Special Lesson
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : lessons.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
          <Sparkles className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No special lessons yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lessons.map(lesson => (
            <div key={lesson.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900">{lesson.name}</h3>
                  {lesson.description && <p className="text-xs text-slate-500 mt-0.5">{lesson.description}</p>}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border shrink-0 ${
                  lesson.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  lesson.status === 'completed' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>{lesson.status}</span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> {(lesson.teacherNames || []).join(', ') || '—'}</div>
                <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {lesson.days.join(', ') || '—'} · {lesson.startDate} → {lesson.endDate}</div>
                {lesson.time && <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {lesson.time}</div>}
                <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {lesson.enrolledStudentIds.length} enrolled · {lesson.academicSession} {lesson.term}</div>
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={() => setEnrollingLesson(lesson)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
                  <Users className="w-3.5 h-3.5" /> Manage Students
                </button>
                <button onClick={() => openEdit(lesson)} className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => lesson.id && handleDelete(lesson.id)} disabled={deletingId === lesson.id}
                  className="px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-50">
                  {deletingId === lesson.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-900 text-lg">{editingLesson ? 'Edit' : 'New'} Special Lesson</h2>
              <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. WAEC Coaching" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Teacher(s)</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-xl">
                  {teachers.map(t => {
                    const active = form.teacherIds.includes(t.uid);
                    return (
                      <button key={t.uid} type="button" onClick={() => toggleTeacher(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}>
                        {t.displayName || t.email}
                      </button>
                    );
                  })}
                  {teachers.length === 0 && <p className="text-xs text-slate-400 p-1">No teachers found.</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Session</label>
                  <input value={form.academicSession} onChange={e => setForm(f => ({ ...f, academicSession: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Term</label>
                  <select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                    {terms.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Start Date</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">End Date</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Days</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map(day => {
                    const active = form.days.includes(day);
                    return (
                      <button key={day} type="button" onClick={() => toggleDay(day)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}>
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Time</label>
                  <input value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    placeholder="e.g. 4:00 - 5:30 PM" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SpecialLesson['status'] }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrollment modal */}
      {enrollingLesson && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEnrollingLesson(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 text-lg">Enroll Students — {enrollingLesson.name}</h2>
              <button onClick={() => setEnrollingLesson(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search students..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredStudents.map(s => {
                const enrolled = enrollingLesson.enrolledStudentIds.includes(s.id!);
                return (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enrolled} onChange={() => {
                      toggleEnrollment(enrollingLesson, s.id!);
                      setEnrollingLesson(prev => prev ? {
                        ...prev,
                        enrolledStudentIds: enrolled ? prev.enrolledStudentIds.filter(id => id !== s.id) : [...prev.enrolledStudentIds, s.id!],
                      } : prev);
                    }} className="w-4 h-4 rounded text-indigo-600" />
                    <span className="text-sm text-slate-800 flex-1">{s.studentName}</span>
                    <span className="text-xs text-slate-400">{s.currentClass}</span>
                  </label>
                );
              })}
              {filteredStudents.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No students found.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
