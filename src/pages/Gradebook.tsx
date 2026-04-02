import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Student, Grade, SUBJECTS, SCHOOL_CLASSES, calculateGrade } from '../types';
import { motion } from 'motion/react';
import { Search, Filter, Save, Loader2, CheckCircle, AlertCircle, BookOpen, User, ArrowLeft } from 'lucide-react';

export default function Gradebook() {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState(SCHOOL_CLASSES[0]);
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [session] = useState('2025/2026');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'students'), where('currentClass', '==', selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
      fetchGrades(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    return () => unsubscribe();
  }, [selectedClass]);

  const fetchGrades = async (studentList: Student[]) => {
    if (studentList.length === 0) {
      setGrades({});
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'grades'),
        where('class', '==', selectedClass),
        where('subject', '==', selectedSubject),
        where('term', '==', selectedTerm),
        where('session', '==', session)
      );
      const snapshot = await getDocs(q);
      const gradeMap: Record<string, Grade> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Grade;
        gradeMap[data.studentId] = { id: doc.id, ...data };
      });
      setGrades(gradeMap);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'grades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (students.length > 0) {
      fetchGrades(students);
    }
  }, [selectedSubject, selectedTerm]);

  const handleScoreChange = (studentId: string, field: 'caScore' | 'examScore', value: string) => {
    const numValue = parseFloat(value) || 0;
    const currentGrade = grades[studentId] || {
      studentId,
      subject: selectedSubject,
      class: selectedClass,
      term: selectedTerm,
      session,
      caScore: 0,
      examScore: 0,
      totalScore: 0,
      grade: 'F9',
      updatedAt: null
    };

    const updatedGrade = { ...currentGrade, [field]: numValue };
    updatedGrade.totalScore = updatedGrade.caScore + updatedGrade.examScore;
    updatedGrade.grade = calculateGrade(updatedGrade.totalScore);

    setGrades({ ...grades, [studentId]: updatedGrade });
  };

  const saveGrade = async (studentId: string) => {
    const gradeData = grades[studentId];
    if (!gradeData) return;

    setSaving(studentId);
    try {
      if (gradeData.id) {
        await updateDoc(doc(db, 'grades', gradeData.id), {
          ...gradeData,
          updatedAt: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, 'grades'), {
          ...gradeData,
          updatedAt: serverTimestamp()
        });
        setGrades({ ...grades, [studentId]: { ...gradeData, id: docRef.id } });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'grades');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Gradebook</h1>
        <p className="text-slate-500 mt-1">Input and manage student scores for continuous assessment and exams.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Class</label>
          <select
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
          >
            {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subject</label>
          <select
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
          >
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Term</label>
          <select
            value={selectedTerm}
            onChange={e => setSelectedTerm(e.target.value as any)}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
          >
            <option value="1st Term">1st Term</option>
            <option value="2nd Term">2nd Term</option>
            <option value="3rd Term">3rd Term</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Session</label>
          <div className="px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 font-medium text-slate-500">
            {session}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Student</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-center">CA (40)</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-center">Exam (60)</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-center">Total (100)</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-center">Grade</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">Loading student list...</td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No students found in this class.</td>
                </tr>
              ) : (
                students.map((student) => {
                  const grade = grades[student.id!] || { caScore: 0, examScore: 0, totalScore: 0, grade: 'F9' };
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold mr-3 text-xs">
                            {student.studentName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{student.studentName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{student.studentId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          max={40}
                          min={0}
                          value={grade.caScore || ''}
                          onChange={e => handleScoreChange(student.id!, 'caScore', e.target.value)}
                          className="w-16 px-2 py-1 rounded border border-slate-200 text-center focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          max={60}
                          min={0}
                          value={grade.examScore || ''}
                          onChange={e => handleScoreChange(student.id!, 'examScore', e.target.value)}
                          className="w-16 px-2 py-1 rounded border border-slate-200 text-center focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-bold text-sm ${grade.totalScore >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {grade.totalScore}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                          grade.totalScore >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          grade.totalScore >= 50 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {grade.grade}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => saveGrade(student.id!)}
                          disabled={saving === student.id}
                          className="inline-flex items-center px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          {saving === student.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
