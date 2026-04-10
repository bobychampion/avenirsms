import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { SchoolClass, ClassSubject, SUBJECTS, UserProfile } from '../types';
import { useSchool } from '../components/SchoolContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Edit2, Users, BookOpen, UserCheck, 
  Search, Filter, Loader2, X, CheckCircle2, AlertCircle,
  ChevronRight, LayoutGrid, GraduationCap
} from 'lucide-react';

export default function ClassManagement() {
  const navigate = useNavigate();
  const { schoolLevels, currentSession, subjects: schoolSubjects } = useSchool();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
  
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

  useEffect(() => {
    const q = query(collection(db, 'classes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'classes'));

    const teachersQuery = query(collection(db, 'users'), where('role', '==', 'teacher'));
    const unsubscribeTeachers = onSnapshot(teachersQuery, (snapshot) => {
      setTeachers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    });

    const subjectsQuery = query(collection(db, 'class_subjects'));
    const unsubscribeSubjects = onSnapshot(subjectsQuery, (snapshot) => {
      setClassSubjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassSubject)));
    });

    return () => {
      unsubscribe();
      unsubscribeTeachers();
      unsubscribeSubjects();
    };
  }, []);

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tutor = teachers.find(t => t.uid === formData.formTutorId);
      const data = {
        ...formData,
        formTutorName: tutor?.displayName || 'Not Assigned'
      };

      if (editingClass?.id) {
        await updateDoc(doc(db, 'classes', editingClass.id), data);
      } else {
        await addDoc(collection(db, 'classes'), data);
      }
      setIsModalOpen(false);
      setEditingClass(null);
      setFormData({ name: '', level: schoolLevels[0] ?? '', academicSession: currentSession, formTutorId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'classes');
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass?.id) return;
    try {
      const teacher = teachers.find(t => t.uid === subjectFormData.teacherId);
      const data = {
        classId: selectedClass.id,
        subjectName: subjectFormData.subjectName,
        teacherId: subjectFormData.teacherId,
        teacherName: teacher?.displayName || 'Not Assigned'
      };

      if (editingSubject?.id) {
        await updateDoc(doc(db, 'class_subjects', editingSubject.id), data);
        setEditingSubject(null);
      } else {
        // Check if subject already exists for this class
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

  const handleDeleteClass = async (id: string) => {
    if (!window.confirm('Are you sure? This will not delete students but will remove class associations.')) return;
    try {
      await deleteDoc(doc(db, 'classes', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `classes/${id}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <LayoutGrid className="w-6 h-6" />
                  </div>
                  <div className="flex space-x-1">
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
                      onClick={() => handleDeleteClass(cls.id!)}
                      className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
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
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">
                    {editingClass ? 'Edit Class' : 'Create New Class'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleSaveClass} className="space-y-6">
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
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
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
