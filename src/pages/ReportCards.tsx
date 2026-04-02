import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, orderBy } from 'firebase/firestore';
import { Student, Grade, SCHOOL_CLASSES, SUBJECTS } from '../types';
import { motion } from 'motion/react';
import { Search, Filter, FileText, Download, Printer, GraduationCap, User, BookOpen, Clock, ChevronRight, AlertCircle, ArrowLeft } from 'lucide-react';

export default function ReportCards() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentGrades, setStudentGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [selectedClass, setSelectedClass] = useState(SCHOOL_CLASSES[0]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [session] = useState('2025/2026');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'students'), where('currentClass', '==', selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    return () => unsubscribe();
  }, [selectedClass]);

  const fetchStudentGrades = async (student: Student) => {
    setLoadingGrades(true);
    setSelectedStudent(student);
    try {
      const q = query(
        collection(db, 'grades'),
        where('studentId', '==', student.id),
        where('term', '==', selectedTerm),
        where('session', '==', session)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
      setStudentGrades(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'grades');
    } finally {
      setLoadingGrades(false);
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentGrades(selectedStudent);
    }
  }, [selectedTerm]);

  const calculateAverage = () => {
    if (studentGrades.length === 0) return "0.00";
    const sum = studentGrades.reduce((acc, g) => acc + g.totalScore, 0);
    return (sum / studentGrades.length).toFixed(2);
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
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Report Cards & Transcripts</h1>
        <p className="text-slate-500 mt-1">Generate and review academic performance reports for students.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Student Selection Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <Filter className="w-5 h-5 mr-2 text-indigo-600" />
              Select Student
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Class</label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
                >
                  {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Term</label>
                <select
                  value={selectedTerm}
                  onChange={e => setSelectedTerm(e.target.value as any)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
                >
                  <option value="1st Term">1st Term</option>
                  <option value="2nd Term">2nd Term</option>
                  <option value="3rd Term">3rd Term</option>
                </select>
              </div>
            </div>

            <div className="mt-8 space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {loading ? (
                <p className="text-center text-slate-400 text-sm py-4">Loading students...</p>
              ) : students.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-4">No students in this class.</p>
              ) : (
                students.map(student => (
                  <button
                    key={student.id}
                    onClick={() => fetchStudentGrades(student)}
                    className={`w-full flex items-center p-3 rounded-xl border transition-all text-left ${
                      selectedStudent?.id === student.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
                        : 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs mr-3 ${
                      selectedStudent?.id === student.id ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      {student.studentName.charAt(0)}
                    </div>
                    <div className="flex-grow">
                      <p className="font-bold text-sm truncate">{student.studentName}</p>
                      <p className={`text-[10px] font-mono ${selectedStudent?.id === student.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {student.studentId}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${selectedStudent?.id === student.id ? 'text-white' : 'text-slate-300'}`} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Report Card Preview */}
        <div className="lg:col-span-2">
          {!selectedStudent ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-20 text-center">
              <FileText className="w-16 h-16 text-slate-200 mx-auto mb-6" />
              <h3 className="text-xl font-bold text-slate-400">Select a student to view their report card</h3>
              <p className="text-slate-300 mt-2">Academic results for the selected term will appear here.</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            >
              {/* Report Card Header */}
              <div className="bg-indigo-900 p-8 text-white">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white p-3 rounded-2xl shadow-lg">
                      <GraduationCap className="w-8 h-8 text-indigo-900" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">AVENIR SMART SCHOOL</h2>
                      <p className="text-indigo-200 text-sm font-medium">Academic Performance Report</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors" title="Print">
                      <Printer className="w-5 h-5" />
                    </button>
                    <button className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors" title="Download PDF">
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Student Name</p>
                    <p className="font-bold">{selectedStudent.studentName}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Student ID</p>
                    <p className="font-bold font-mono">{selectedStudent.studentId}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Class</p>
                    <p className="font-bold">{selectedStudent.currentClass}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Term / Session</p>
                    <p className="font-bold">{selectedTerm} - {session}</p>
                  </div>
                </div>
              </div>

              {/* Results Table */}
              <div className="p-8">
                {loadingGrades ? (
                  <div className="text-center py-20 text-slate-400">Fetching academic records...</div>
                ) : studentGrades.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
                    <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">No results found for this term.</p>
                    <p className="text-slate-400 text-sm mt-1">Please ensure grades have been uploaded in the Gradebook.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-hidden rounded-xl border border-slate-200 mb-8">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">CA (40)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Exam (60)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total (100)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {studentGrades.map((grade) => (
                            <tr key={grade.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-900 text-sm">{grade.subject}</td>
                              <td className="px-6 py-4 text-center text-sm font-medium text-slate-600">{grade.caScore}</td>
                              <td className="px-6 py-4 text-center text-sm font-medium text-slate-600">{grade.examScore}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={`font-bold text-sm ${grade.totalScore >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {grade.totalScore}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="font-bold text-indigo-600">{grade.grade}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Subjects</p>
                        <p className="text-3xl font-extrabold text-slate-900">{studentGrades.length}</p>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Average Score</p>
                        <p className="text-3xl font-extrabold text-indigo-600">{calculateAverage()}%</p>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Overall Grade</p>
                        <p className="text-3xl font-extrabold text-emerald-600">
                          {parseFloat(calculateAverage()) >= 70 ? 'Distinction' : parseFloat(calculateAverage()) >= 50 ? 'Pass' : 'Fail'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-12 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start">
                      <Clock className="w-5 h-5 text-indigo-600 mr-4 mt-1" />
                      <div>
                        <h4 className="font-bold text-indigo-900 text-sm">Principal's Remark</h4>
                        <p className="text-indigo-700 text-sm mt-1">
                          {parseFloat(calculateAverage()) >= 70 
                            ? "An excellent performance. Keep up the high standard and continue to strive for excellence."
                            : parseFloat(calculateAverage()) >= 50 
                              ? "A good effort. There is room for improvement in some subjects. Focus more on your weak areas."
                              : "This performance is below expectation. A serious meeting with parents is required to discuss academic support."}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
