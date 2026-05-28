import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { SchoolClass, ClassSubject, SUBJECTS, UserProfile } from '../types';
import { useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, Edit2, Users, BookOpen, UserCheck,
  Loader2, X, Chrome, RefreshCw, CheckCircle2, AlertCircle,
  LayoutGrid
} from 'lucide-react';

type ClassroomStatus = 'connected' | 'disconnected' | 'disabled' | 'loading';

export default function ClassManagement() {
  const navigate = useNavigate();
  const schoolId = useSchoolId();
  const { schoolLevels, currentSession, subjects: schoolSubjects } = useSchool();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<SchoolClass>>({
    name: '',
    level: '',
    academicSession: currentSession,
    formTutorId: ''
  });

  const [subjectFormData, setSubjectFormData] = useState<Partial<ClassSubject>>({
    subjectName: schoolSubjects[0] ?? SUBJECTS[0],
    teacherId: ''
  });
  const [editingSubject, setEditingSubject] = useState<ClassSubject | null>(null);

  // Google Classroom integration status
  const [classroomStatus, setClassroomStatus] = useState<ClassroomStatus>('loading');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // ── Load classes, teachers, subjects ──────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'classes'), where('schoolId', '==', schoolId!));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClasses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SchoolClass)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'classes'));

    const teachersQuery = query(
      collection(db, 'users'),
      where('role', '==', 'teacher'),
      where('schoolId', '==', schoolId!),
    );
    const unsubscribeTeachers = onSnapshot(teachersQuery, (snapshot) => {
      setTeachers(snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });

    const subjectsQuery = query(collection(db, 'class_subjects'), where('schoolId', '==', schoolId!));
    const unsubscribeSubjects = onSnapshot(subjectsQuery, (snapshot) => {
      setClassSubjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClassSubject)));
    });

    return () => {
      unsubscribe();
      unsubscribeTeachers();
      unsubscribeSubjects();
    };
  }, [schoolId]);

  // ── Load Google Classroom connection status ────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    const ref = doc(db, 'schools', schoolId, 'integrations', 'google');
    return onSnapshot(ref, snap => {
      if (!snap.exists()) { setClassroomStatus('disconnected'); return; }
      const d = snap.data();
      if (!d.connected) { setClassroomStatus('disconnected'); return; }
      setClassroomStatus(d.enabledServices?.classroom ? 'connected' : 'disabled');
    }, () => setClassroomStatus('disconnected'));
  }, [schoolId]);

  // ── Sync class to Google Classroom ────────────────────────────────────────
  const syncToGoogle = async (
    firestoreId: string,
    classData: Partial<SchoolClass>,
    existingCourseId?: string
  ) => {
    if (classroomStatus !== 'connected' || !schoolId) return;
    setSyncingId(firestoreId);
    try {
      const functions = getFunctions();
      const syncFn = httpsCallable<
        { schoolId: string; cls: { name: string; section?: string }; googleCourseId?: string },
        { googleCourseId: string }
      >(functions, 'syncClassroomCourse');

      const { data: result } = await syncFn({
        schoolId,
        cls: {
          name: classData.name!,
          section: classData.academicSession,
        },
        ...(existingCourseId ? { googleCourseId: existingCourseId } : {}),
      });

      // Store googleCourseId back on the Firestore class document
      await updateDoc(doc(db, 'classes', firestoreId), {
        googleCourseId: result.googleCourseId,
      });

      toast.success(`Synced "${classData.name}" to Google Classroom`);
    } catch (err: any) {
      console.error('Classroom sync failed:', err);
      const detail = err?.message ?? String(err);
      // If classroom isn't enabled, give a direct action hint
      if (detail.includes('not connected') || detail.includes('failed-precondition')) {
        toast.error('Enable Google Classroom in Integration Settings first.', { duration: 5000 });
      } else if (detail.includes('unauthenticated') || detail.includes('permission-denied')) {
        toast.error('Reconnect Google Workspace — your authorization may have expired.', { duration: 5000 });
      } else {
        toast.error(`Classroom sync failed: ${detail}`, { duration: 6000 });
      }
    } finally {
      setSyncingId(null);
    }
  };

  // ── Manually sync an unsynced class ───────────────────────────────────────
  const handleManualSync = async (cls: SchoolClass) => {
    if (!cls.id) return;
    await syncToGoogle(cls.id, cls, cls.googleCourseId);
  };

  // ── Save class ────────────────────────────────────────────────────────────
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tutor = teachers.find(t => t.uid === formData.formTutorId);
      const data = {
        ...formData,
        formTutorName: tutor?.displayName || 'Not Assigned',
        schoolId: schoolId ?? 'main',
      };

      let savedId: string;
      if (editingClass?.id) {
        await updateDoc(doc(db, 'classes', editingClass.id), data);
        savedId = editingClass.id;
      } else {
        const ref = await addDoc(collection(db, 'classes'), data);
        savedId = ref.id;
      }

      setIsModalOpen(false);
      setEditingClass(null);
      setFormData({ name: '', level: schoolLevels[0] ?? '', academicSession: currentSession, formTutorId: '' });

      // Sync to Google Classroom after Firestore save
      if (classroomStatus === 'connected') {
        await syncToGoogle(savedId, data, editingClass?.googleCourseId);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'classes');
    } finally {
      setSaving(false);
    }
  };

  // ── Add / edit subject ────────────────────────────────────────────────────
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass?.id) return;
    try {
      const teacher = teachers.find(t => t.uid === subjectFormData.teacherId);
      const data = {
        classId: selectedClass.id,
        subjectName: subjectFormData.subjectName,
        teacherId: subjectFormData.teacherId,
        teacherName: teacher?.displayName || 'Not Assigned',
        schoolId: schoolId ?? 'main',
      };

      if (editingSubject?.id) {
        await updateDoc(doc(db, 'class_subjects', editingSubject.id), data);
        setEditingSubject(null);
      } else {
        const existing = classSubjects.find(s => s.classId === selectedClass.id && s.subjectName === data.subjectName);
        if (existing) {
          if (window.confirm(`${data.subjectName} is already assigned to this class. Do you want to update the teacher?`)) {
            await updateDoc(doc(db, 'class_subjects', existing.id!), data);
          } else {
            return;
          }
        } else {
          await addDoc(collection(db, 'class_subjects'), data);
        }
      }
      setSubjectFormData({ subjectName: schoolSubjects[0] ?? SUBJECTS[0], teacherId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'class_subjects');
    }
  };

  const handleDeleteSubject = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'class_subjects', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `class_subjects/${id}`);
    }
  };

  // ── Delete class ──────────────────────────────────────────────────────────
  const handleDeleteClass = async (cls: SchoolClass) => {
    if (!cls.id) return;
    if (!window.confirm('Are you sure? This will not delete students but will remove class associations.')) return;
    setDeletingId(cls.id);
    try {
      // Archive the Google Classroom course first (if synced)
      if (cls.googleCourseId && classroomStatus === 'connected') {
        try {
          const functions = getFunctions();
          const archiveFn = httpsCallable(functions, 'archiveClassroomCourse');
          await archiveFn({ schoolId, googleCourseId: cls.googleCourseId });
        } catch (err: any) {
          console.warn('Classroom archive failed:', err?.message ?? err);
          // Proceed with Firestore deletion regardless
        }
      }
      await deleteDoc(doc(db, 'classes', cls.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `classes/${cls.id}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Status banner config ───────────────────────────────────────────────────
  const statusBanner = {
    connected: {
      bg: 'bg-emerald-50 border-emerald-200',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
      text: 'text-emerald-800',
      message: 'Google Classroom connected — new classes will automatically appear as courses.',
    },
    disabled: {
      bg: 'bg-amber-50 border-amber-200',
      icon: <AlertCircle className="w-4 h-4 text-amber-600" />,
      text: 'text-amber-800',
      message: 'Google Classroom is connected but disabled. Enable it in Integration Settings.',
    },
    disconnected: null,
    loading: null,
  }[classroomStatus];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Google Classroom status banner */}
      {statusBanner && (
        <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-medium ${statusBanner.bg}`}>
          {statusBanner.icon}
          <span className={statusBanner.text}>{statusBanner.message}</span>
          {classroomStatus === 'disabled' && (
            <a
              href="/admin/integrations/google"
              className="ml-auto text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors text-xs font-bold"
            >
              Go to Settings →
            </a>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Class Management</h1>
          <p className="text-slate-500 mt-1">Organize classes, assign form tutors, and distribute subjects.</p>
        </div>
        <button
          onClick={() => {
            setEditingClass(null);
            setFormData({ name: '', level: schoolLevels[0] ?? '', academicSession: currentSession, formTutorId: '' });
            setIsModalOpen(true);
          }}
          className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Class
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-400 font-medium">Loading classes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <motion.div
              key={cls.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all group"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <LayoutGrid className="w-6 h-6" />
                    </div>
                    {/* Google Classroom sync badge */}
                    {cls.googleCourseId && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm" title="Synced to Google Classroom">
                        <Chrome className="w-3 h-3 text-blue-500" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    {/* Manual sync button for unsynced classes */}
                    {classroomStatus === 'connected' && !cls.googleCourseId && (
                      <button
                        onClick={() => handleManualSync(cls)}
                        disabled={syncingId === cls.id}
                        className="p-2 text-slate-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Sync to Google Classroom"
                      >
                        {syncingId === cls.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <RefreshCw className="w-4 h-4" />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingClass(cls);
                        setFormData(cls);
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClass(cls)}
                      disabled={deletingId === cls.id}
                      className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      {deletingId === cls.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-1">{cls.name}</h3>
                <p className="text-sm font-medium text-slate-500 mb-4">{cls.level} • {cls.academicSession}</p>

                <div className="space-y-3">
                  <div className="flex items-center text-sm text-slate-600">
                    <UserCheck className="w-4 h-4 mr-2 text-indigo-500" />
                    <span className="font-medium">Tutor:</span>
                    <span className="ml-2 text-slate-900">{cls.formTutorName}</span>
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <BookOpen className="w-4 h-4 mr-2 text-indigo-500" />
                    <span className="font-medium">Subjects:</span>
                    <span className="ml-2 text-slate-900">
                      {classSubjects.filter(s => s.classId === cls.id).length} Assigned
                    </span>
                  </div>
                  {cls.googleCourseId && (
                    <div className="flex items-center text-sm text-blue-600">
                      <Chrome className="w-4 h-4 mr-2" />
                      <span className="font-medium">Classroom:</span>
                      <span className="ml-2 text-blue-700 font-semibold">Synced</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedClass(cls);
                      setIsSubjectModalOpen(true);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-50 text-slate-700 font-bold rounded-xl hover:bg-indigo-50 hover:text-indigo-700 transition-all text-sm flex items-center justify-center"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Subjects
                  </button>
                  <button
                    onClick={() => navigate(`/admin/students?class=${cls.name}`)}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm flex items-center justify-center"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Students
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Class Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-2xl font-bold text-slate-900">
                    {editingClass ? 'Edit Class' : 'Create New Class'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                {/* Google Classroom sync hint */}
                {classroomStatus === 'connected' && (
                  <p className="text-xs text-blue-600 font-medium mb-6 flex items-center gap-1.5">
                    <Chrome className="w-3.5 h-3.5" />
                    Will sync to Google Classroom as a course
                  </p>
                )}

                <form onSubmit={handleSaveClass} className={`space-y-6 ${classroomStatus !== 'connected' ? 'mt-8' : ''}`}>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Class Name</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="e.g., JSS 1A"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Level</label>
                      <select
                        value={formData.level}
                        onChange={e => setFormData({ ...formData, level: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                      >
                        {schoolLevels.map(lvl => (
                          <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Academic Session</label>
                      <input
                        required
                        type="text"
                        value={formData.academicSession}
                        onChange={e => setFormData({ ...formData, academicSession: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="e.g., 2025/2026"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Form Tutor (Teacher)</label>
                    <select
                      value={formData.formTutorId}
                      onChange={e => setFormData({ ...formData, formTutorId: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                    >
                      <option value="">Select a Teacher</option>
                      {teachers.map(t => (
                        <option key={t.uid} value={t.uid}>{t.displayName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-4 flex space-x-4">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {editingClass ? 'Update Class' : 'Create Class'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subject Distribution Modal */}
      <AnimatePresence>
        {isSubjectModalOpen && selectedClass && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSubjectModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Subject Distribution</h3>
                    <p className="text-slate-500 text-sm">Managing subjects for {selectedClass.name}</p>
                  </div>
                  <button onClick={() => setIsSubjectModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Add Subject Form */}
                  <div className="space-y-6">
                    <h4 className="font-bold text-slate-900 flex items-center">
                      {editingSubject ? <Edit2 className="w-4 h-4 mr-2 text-indigo-600" /> : <Plus className="w-4 h-4 mr-2 text-indigo-600" />}
                      {editingSubject ? 'Edit Assignment' : 'Assign New Subject'}
                    </h4>
                    <form onSubmit={handleAddSubject} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subject</label>
                        <select
                          disabled={!!editingSubject}
                          value={subjectFormData.subjectName}
                          onChange={e => setSubjectFormData({ ...subjectFormData, subjectName: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white disabled:bg-slate-50 disabled:text-slate-500"
                        >
                          {schoolSubjects.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subject Teacher</label>
                        <select
                          value={subjectFormData.teacherId}
                          onChange={e => setSubjectFormData({ ...subjectFormData, teacherId: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                        >
                          <option value="">Select a Teacher</option>
                          {teachers.map(t => (
                            <option key={t.uid} value={t.uid}>{t.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        {editingSubject && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSubject(null);
                              setSubjectFormData({ subjectName: schoolSubjects[0] ?? SUBJECTS[0], teacherId: '' });
                            }}
                            className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-[2] px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                        >
                          {editingSubject ? 'Update Assignment' : 'Assign Subject'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Assigned Subjects List */}
                  <div className="space-y-6">
                    <h4 className="font-bold text-slate-900 flex items-center">
                      <BookOpen className="w-4 h-4 mr-2 text-indigo-600" />
                      Assigned Subjects
                    </h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {classSubjects.filter(s => s.classId === selectedClass.id).length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-10">No subjects assigned yet.</p>
                      ) : (
                        classSubjects.filter(s => s.classId === selectedClass.id).map(s => (
                          <div key={s.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group">
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{s.subjectName}</p>
                              <p className="text-xs text-slate-500">{s.teacherName}</p>
                            </div>
                            <div className="flex space-x-1">
                              <button
                                onClick={() => {
                                  setEditingSubject(s);
                                  setSubjectFormData({ subjectName: s.subjectName, teacherId: s.teacherId });
                                }}
                                className="p-2 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSubject(s.id!)}
                                className="p-2 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
