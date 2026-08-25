import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Student, Grade, GradingMode, SUBJECTS, calculateGrade, scoreBadgeClasses, TERMS } from '../types';
import { suggestGradingComment } from '../services/geminiService';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { Save, Loader2, BookOpen, ArrowLeft, Sparkles, CheckCircle, Download } from 'lucide-react';
import { exportGradesCsv } from '../services/dataExport/csvModules';
import { useClassSelectOptions, useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { useAuth } from '../components/FirebaseProvider';

// Student, [score column(s)], Grade, [Pos.], Comment, AI — column count varies by grading mode.
function gradebookColCount(mode: GradingMode): number {
  if (mode === 'single_grade') return 4;
  if (mode === 'score_percentage') return 6;
  return 8; // ca_exam / custom
}

export default function Gradebook() {
  const classSelectOptions = useClassSelectOptions();
  const { getGradingForClass, subjects: allSubjects, classes, currentSession } = useSchool();
  const schoolId = useSchoolId();
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const session = currentSession;
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const grading = getGradingForClass(selectedClass, session);
  const gradingMode = grading.gradingMode;

  // Elective roster for the selected class+subject. A class_subjects doc with a
  // non-empty enrolledStudentIds means only those students take the subject;
  // absent/empty means the whole class does (the default).
  const [subjectRoster, setSubjectRoster] = useState<string[] | null>(null);
  useEffect(() => {
    if (!schoolId || !selectedClass || !selectedSubject) { setSubjectRoster(null); return; }
    const cls = classes.find(c => c.name === selectedClass);
    if (!cls?.id) { setSubjectRoster(null); return; }
    const q = query(
      collection(db, 'class_subjects'),
      where('schoolId', '==', schoolId),
      where('classId', '==', cls.id),
      where('subjectName', '==', selectedSubject),
    );
    const unsub = onSnapshot(q, snap => {
      const ids = snap.docs[0]?.data()?.enrolledStudentIds as string[] | undefined;
      setSubjectRoster(ids && ids.length > 0 ? ids : null);
    }, () => setSubjectRoster(null));
    return () => unsub();
  }, [schoolId, selectedClass, selectedSubject, classes]);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    const q = query(collection(db, 'students'), where('schoolId', '==', schoolId!), where('currentClass', '==', selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Student))
        .filter(s => s.admissionStatus !== 'withdrawn')
        // Electives: show only the students actually enrolled in this subject.
        .filter(s => !subjectRoster || subjectRoster.includes(s.id!));
      setStudents(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));
    return () => unsubscribe();
  }, [selectedClass, schoolId, subjectRoster]);

  useEffect(() => {
    if (students.length === 0) { setLoading(false); return; }
    if (!schoolId) return;
    const fetchGrades = async () => {
      setLoading(true);
      const q = query(
        collection(db, 'grades'),
        where('schoolId', '==', schoolId!),
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

  const emptyGrade = (studentId: string): Grade => ({
    studentId, subject: selectedSubject, class: selectedClass, term: selectedTerm, session,
    caScore: 0, examScore: 0, totalScore: 0, grade: '', updatedAt: null,
  });

  const handleScoreChange = (studentId: string, field: 'caScore' | 'examScore', value: string) => {
    const numValue = Math.min(parseFloat(value) || 0, field === 'caScore' ? 40 : 60);
    const current = grades[studentId] || emptyGrade(studentId);
    const updated = { ...current, [field]: numValue };
    updated.totalScore = (updated.caScore ?? 0) + (updated.examScore ?? 0);
    updated.grade = calculateGrade(updated.totalScore, grading.gradingSystem, grading.customGradingScale);
    setGrades({ ...grades, [studentId]: updated });
  };

  // score_percentage mode: one 0-100 field, no CA/Exam split.
  const handleScoreOnlyChange = (studentId: string, value: string) => {
    const numValue = Math.min(Math.max(parseFloat(value) || 0, 0), 100);
    const current = grades[studentId] || emptyGrade(studentId);
    const updated = { ...current, totalScore: numValue, caScore: undefined, examScore: undefined };
    updated.grade = calculateGrade(numValue, grading.gradingSystem, grading.customGradingScale);
    setGrades({ ...grades, [studentId]: updated });
  };

  // single_grade mode: teacher picks a value directly — no score, no computed total.
  const handleSingleGradeChange = (studentId: string, value: string) => {
    const current = grades[studentId] || emptyGrade(studentId);
    setGrades({ ...grades, [studentId]: { ...current, grade: value, caScore: undefined, examScore: undefined, totalScore: undefined } });
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
      const classId = classes.find(c => c.name === selectedClass)?.id;

      // Position ranking doesn't apply to single_grade mode (no score to rank by, and the
      // school configuring it explicitly doesn't want position at all).
      const positionMap: Record<string, number> = {};
      if (gradingMode !== 'single_grade') {
        const sortedStudents = [...students].sort((a, b) => {
          const ga = grades[a.id!]?.totalScore ?? 0;
          const gb = grades[b.id!]?.totalScore ?? 0;
          return gb - ga;
        });
        sortedStudents.forEach((s, i) => { positionMap[s.id!] = i + 1; });
      }

      const batch = writeBatch(db);
      for (const [studentId, gradeData] of Object.entries(grades)) {
        const withPos = {
          ...gradeData,
          classId,
          gradingMode,
          ...(gradingMode !== 'single_grade' ? { subjectPosition: positionMap[studentId] || 0 } : {}),
        };
        if (gradeData.id) {
          const ref = doc(db, 'grades', gradeData.id);
          batch.update(ref, { ...withPos, updatedAt: serverTimestamp() });
        } else {
          const ref = doc(collection(db, 'grades'));
          batch.set(ref, { ...withPos, schoolId, updatedAt: serverTimestamp() });
        }
      }
      await batch.commit();

      // Notify each affected student's parent — one per student per save,
      // not per field, so re-saving doesn't spam the same parent repeatedly.
      const notifiedStudentIds = Object.keys(grades);
      await Promise.all(notifiedStudentIds.map(studentId => {
        const student = students.find(s => s.id === studentId);
        if (!student?.guardianUserId) return null;
        return addDoc(collection(db, 'notifications'), {
          recipientId: student.guardianUserId,
          title: `New grade posted — ${selectedSubject}`,
          body: `${student.studentName}'s ${selectedSubject} grade for ${selectedTerm} has been posted by ${profile?.displayName ?? 'a teacher'}.`,
          type: 'grade',
          read: false,
          schoolId,
          createdAt: serverTimestamp(),
        }).catch(() => {/* non-fatal — grade itself already saved */});
      }));

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
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            Gradebook
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {gradingMode === 'single_grade'
              ? 'Pick the grade for each student — set by your school in Settings.'
              : gradingMode === 'score_percentage'
              ? 'Enter each student\'s score. Grade is computed from your school\'s configured grading system.'
              : 'Enter CA and exam scores. Grade is computed from your school\'s configured grading system.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const classId = classes.find(c => c.name === selectedClass)?.id;
            const rows = students
              .map(s => {
                const g = grades[s.id!];
                if (!g) return null;
                return {
                  ...g,
                  grade: gradingMode === 'single_grade' ? g.grade : calculateGrade(g.totalScore ?? 0, grading.gradingSystem, grading.customGradingScale),
                  classId,
                  gradingMode,
                  studentId: s.studentId,
                  studentName: s.studentName,
                  class: selectedClass,
                  subject: selectedSubject,
                  term: selectedTerm,
                  session,
                };
              })
              .filter((g): g is Grade & { studentName: string } => g !== null);
            exportGradesCsv(rows);
          }}
          disabled={!selectedClass || students.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Class', value: selectedClass, onChange: setSelectedClass, options: classSelectOptions.map(o => ({ k: o.key, v: o.value, l: o.label })) },
            { label: 'Subject', value: selectedSubject, onChange: setSelectedSubject, options: allSubjects.map((s, i) => ({ k: `subj-${i}`, v: s, l: s })) },
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
                {gradingMode === 'ca_exam' && <>
                  <th className="px-4 py-3 text-center w-24">CA /40</th>
                  <th className="px-4 py-3 text-center w-24">Exam /60</th>
                  <th className="px-4 py-3 text-center w-24">Total</th>
                </>}
                {gradingMode === 'score_percentage' && <th className="px-4 py-3 text-center w-24">Score /100</th>}
                <th className="px-4 py-3 text-center w-16">Grade</th>
                {gradingMode !== 'single_grade' && <th className="px-4 py-3 text-center w-16" title="Subject position in class">Pos.</th>}
                <th className="px-5 py-3 text-left">Teacher's Comment</th>
                <th className="px-4 py-3 text-center w-12">AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={gradebookColCount(gradingMode)} className="py-16 text-center text-slate-400">Loading...</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={gradebookColCount(gradingMode)} className="py-16 text-center text-slate-400">No students found in {selectedClass}.</td></tr>
              ) : (
                students.map(student => {
                  const grade = grades[student.id!] || emptyGrade(student.id!);
                  const displayGrade = gradingMode === 'single_grade'
                    ? grade.grade
                    : calculateGrade(grade.totalScore ?? 0, grading.gradingSystem, grading.customGradingScale);
                  const isSaved = savedIds.has(student.id!);
                  return (
                    <tr key={student.id} className={`hover:bg-slate-50 transition-colors ${isSaved ? 'bg-emerald-50/50' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg overflow-hidden bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                            {student.photoUrl ? (
                              <img src={student.photoUrl} alt={student.studentName} className="w-full h-full object-cover" />
                            ) : (
                              student.studentName.charAt(0)
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{student.studentName}</p>
                            <p className="text-[10px] text-slate-400">{student.studentId}</p>
                          </div>
                          {isSaved && <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />}
                        </div>
                      </td>
                      {gradingMode === 'ca_exam' && <>
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
                          <span className={`font-bold ${(grade.totalScore ?? 0) >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>{grade.totalScore ?? 0}</span>
                        </td>
                      </>}
                      {gradingMode === 'score_percentage' && (
                        <td className="px-4 py-3 text-center">
                          <input type="number" min={0} max={100} value={grade.totalScore ?? ''}
                            onChange={e => handleScoreOnlyChange(student.id!, e.target.value)}
                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center focus:ring-2 focus:ring-indigo-400 outline-none text-sm font-semibold"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        {gradingMode === 'single_grade' ? (
                          <select value={grade.grade || ''} onChange={e => handleSingleGradeChange(student.id!, e.target.value)}
                            className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-400">
                            <option value="">—</option>
                            {(grading.allowedGrades ?? []).map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded-md text-xs font-bold border ${scoreBadgeClasses(grade.totalScore ?? 0)}`}>{displayGrade}</span>
                        )}
                      </td>
                      {gradingMode !== 'single_grade' && (
                        <td className="px-4 py-3 text-center">
                          {grade.subjectPosition
                            ? <span className="text-xs font-bold text-slate-500">#{grade.subjectPosition}</span>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      )}
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
