import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Student, Grade, SUBJECTS, calculateGrade, CURRENT_SESSION, TERMS } from '../types';
import { suggestGradingComment } from '../services/geminiService';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { Save, Loader2, BookOpen, ArrowLeft, Sparkles, CheckCircle } from 'lucide-react';
import { useClassSelectOptions } from '../components/SchoolContext';

const GRADE_COLORS: Record<string, string> = {
  A1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  B2: 'bg-green-50 text-green-700 border-green-200',
  B3: 'bg-lime-50 text-lime-700 border-lime-200',
  C4: 'bg-blue-50 text-blue-700 border-blue-200',
  C5: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  C6: 'bg-violet-50 text-violet-700 border-violet-200',
  D7: 'bg-amber-50 text-amber-700 border-amber-200',
  E8: 'bg-orange-50 text-orange-700 border-orange-200',
  F9: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function Gradebook() {
  const classSelectOptions = useClassSelectOptions();
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [session] = useState(CURRENT_SESSION);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'students'), where('currentClass', '==', selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));
    return () => unsubscribe();
  }, [selectedClass]);

  useEffect(() => {
    if (students.length === 0) { setLoading(false); return; }
    const fetchGrades = async () => {
      setLoading(true);
      const q = query(
        collection(db, 'grades'),
        where('class', '==', selectedClass),
        where('subject', '==', selectedSubject),
        where('term', '==', selectedTerm),
        where('session', '==', session)
      );
      const snapshot = await getDocs(q).catch(e => { handleFirestoreError(e, OperationType.LIST, 'grades'); return null; });
      if (!snapshot) { setLoading(false); return; }
      const gradeMap: Record<string, Grade> = {};
      snapshot.docs.forEach(d => {
        const data = d.data() as Grade;
        gradeMap[data.studentId] = { id: d.id, ...data };
      });
      setGrades(gradeMap);
      setLoading(false);
    };
    fetchGrades();
  }, [students, selectedSubject, selectedTerm, selectedClass, session]);

  const handleScoreChange = (studentId: string, field: 'caScore' | 'examScore', value: string) => {
    const numValue = Math.min(parseFloat(value) || 0, field === 'caScore' ? 40 : 60);
    const current = grades[studentId] || { studentId, subject: selectedSubject, class: selectedClass, term: selectedTerm, session, caScore: 0, examScore: 0, totalScore: 0, grade: 'F9', updatedAt: null };
    const updated = { ...current, [field]: numValue };
    updated.totalScore = updated.caScore + updated.examScore;
    updated.grade = calculateGrade(updated.totalScore);
    setGrades({ ...grades, [studentId]: updated });
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    const current = grades[studentId];
    if (!current) return;
    setGrades({ ...grades, [studentId]: { ...current, teacherNotes: notes } });
  };

  const generateAIComment = async (studentId: string, studentName: string) => {
    const grade = grades[studentId];
    if (!grade) return;
    setAiLoading(studentId);
    const comment = await suggestGradingComment(grade.totalScore, selectedSubject, studentName).catch(() => null);
    if (comment) handleNotesChange(studentId, comment.trim());
    setAiLoading(null);
  };

  const saveAll = async () => {
    setSavingAll(true);
    const tid = toast.loading('Saving grades…');
    try {
      // 1. Compute subject positions: sort students by totalScore desc, assign rank
      const sortedStudents = [...students].sort((a, b) => {
        const ga = grades[a.id!]?.totalScore ?? 0;
        const gb = grades[b.id!]?.totalScore ?? 0;
        return gb - ga;
      });
      const positionMap: Record<string, number> = {};
      sortedStudents.forEach((s, i) => { positionMap[s.id!] = i + 1; });

      const batch = writeBatch(db);
      for (const [studentId, gradeData] of Object.entries(grades)) {
        const withPos = { ...gradeData, subjectPosition: positionMap[studentId] || 0 };
        if (gradeData.id) {
          const ref = doc(db, 'grades', gradeData.id);
          batch.update(ref, { ...withPos, updatedAt: serverTimestamp() });
        } else {
          const ref = doc(collection(db, 'grades'));
          batch.set(ref, { ...withPos, updatedAt: serverTimestamp() });
        }
      }
      await batch.commit();
      toast.success(`Grades saved for ${Object.keys(grades).length} students!`, { id: tid });
      setSavedIds(new Set(Object.keys(grades)));
      setTimeout(() => setSavedIds(new Set()), 3000);
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown error'), { id: tid });
      handleFirestoreError(e, OperationType.WRITE, 'grades');
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          Gradebook
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Enter CA and exam scores. Nigerian grading: A1(75+), B2(70+), B3(65+), C4(60+), C5(55+), C6(50+), D7(45+), E8(40+), F9.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Class', value: selectedClass, onChange: setSelectedClass, options: classSelectOptions.map(o => ({ k: o.key, v: o.value, l: o.label })) },
            { label: 'Subject', value: selectedSubject, onChange: setSelectedSubject, options: SUBJECTS.map((s, i) => ({ k: `subj-${i}`, v: s, l: s })) },
            { label: 'Term', value: selectedTerm, onChange: (v: any) => setSelectedTerm(v), options: [{ k: 't1', v: '1st Term', l: '1st Term' }, { k: 't2', v: '2nd Term', l: '2nd Term' }, { k: 't3', v: '3rd Term', l: '3rd Term' }] },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
              <select value={f.value} onChange={e => f.onChange(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-medium">
                {f.options.map(o => <option key={o.k} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Session</label>
            <div className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm font-medium text-slate-500">{session}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {selectedClass} — {selectedSubject} — {selectedTerm}
            <span className="ml-2 text-slate-400 font-normal">({students.length} students)</span>
          </p>
          <button
            onClick={saveAll}
            disabled={savingAll || students.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm"
          >
            {savingAll ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-center w-24">CA /40</th>
                <th className="px-4 py-3 text-center w-24">Exam /60</th>
                <th className="px-4 py-3 text-center w-24">Total</th>
                <th className="px-4 py-3 text-center w-16">Grade</th>
                <th className="px-4 py-3 text-center w-16" title="Subject position in class">Pos.</th>
                <th className="px-5 py-3 text-left">Teacher's Comment</th>
                <th className="px-4 py-3 text-center w-12">AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400">Loading...</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400">No students found in {selectedClass}.</td></tr>
              ) : (
                students.map(student => {
                  const grade = grades[student.id!] || { caScore: 0, examScore: 0, totalScore: 0, grade: 'F9', teacherNotes: '', subjectPosition: 0 };
                  const isSaved = savedIds.has(student.id!);
                  return (
                    <tr key={student.id} className={`hover:bg-slate-50 transition-colors ${isSaved ? 'bg-emerald-50/50' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                            {student.studentName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{student.studentName}</p>
                            <p className="text-[10px] text-slate-400">{student.studentId}</p>
                          </div>
                          {isSaved && <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="number" min={0} max={40} value={grade.caScore || ''}
                          onChange={e => handleScoreChange(student.id!, 'caScore', e.target.value)}
                          className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center focus:ring-2 focus:ring-indigo-400 outline-none text-sm font-semibold"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="number" min={0} max={60} value={grade.examScore || ''}
                          onChange={e => handleScoreChange(student.id!, 'examScore', e.target.value)}
                          className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center focus:ring-2 focus:ring-indigo-400 outline-none text-sm font-semibold"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${grade.totalScore >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>{grade.totalScore}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold border ${GRADE_COLORS[grade.grade] || GRADE_COLORS['F9']}`}>{grade.grade}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {grade.subjectPosition
                          ? <span className="text-xs font-bold text-slate-500">#{grade.subjectPosition}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <input type="text" value={grade.teacherNotes || ''}
                          onChange={e => handleNotesChange(student.id!, e.target.value)}
                          placeholder="Teacher's comment..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => generateAIComment(student.id!, student.studentName)}
                          disabled={aiLoading === student.id || !grade.totalScore}
                          title="Generate AI comment"
                          className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
                        >
                          {aiLoading === student.id ? <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
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
