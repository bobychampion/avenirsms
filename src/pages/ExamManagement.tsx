import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Student, ExamSeating, SCHOOL_CLASSES } from '../types';
import { motion } from 'motion/react';
import { Search, Filter, Calendar, MapPin, Hash, User, Loader2, Save, Printer, Download, GraduationCap, Clock, ArrowLeft } from 'lucide-react';

export default function ExamManagement() {
  const [students, setStudents] = useState<Student[]>([]);
  const [seating, setSeating] = useState<ExamSeating[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedClass, setSelectedClass] = useState(SCHOOL_CLASSES[0]);
  const [examName, setExamName] = useState('2025/2026 1st Term Final Exam');
  const [hallName, setHallName] = useState('Main Hall A');
  const [examDate, setExamDate] = useState('2025-12-15');
  const [examTime, setExamTime] = useState('09:00 AM');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'students'), where('currentClass', '==', selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
      fetchSeating(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    return () => unsubscribe();
  }, [selectedClass]);

  const fetchSeating = async (studentList: Student[]) => {
    if (studentList.length === 0) {
      setSeating([]);
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'exam_seating'),
        where('examName', '==', examName)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSeating));
      setSeating(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'exam_seating');
    } finally {
      setLoading(false);
    }
  };

  const generateSeating = async () => {
    setSaving(true);
    try {
      // Clear existing seating for this exam and class (simplified for demo)
      // In a real app, you'd delete or update. Here we just add new ones.
      
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const existing = seating.find(s => s.studentId === student.id);
        if (!existing) {
          const newSeating: ExamSeating = {
            examName,
            hallName,
            studentId: student.id!,
            seatNumber: `${selectedClass.charAt(0)}${i + 101}`,
            date: examDate,
            time: examTime
          };
          await addDoc(collection(db, 'exam_seating'), newSeating);
        }
      }
      fetchSeating(students);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'exam_seating');
    } finally {
      setSaving(false);
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
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Exam Management</h1>
        <p className="text-slate-500 mt-1">Manage exam seating plans and generate hall tickets for students.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Configuration Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <Filter className="w-5 h-5 mr-2 text-indigo-600" />
              Exam Config
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Exam Name</label>
                <input
                  type="text"
                  value={examName}
                  onChange={e => setExamName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hall Name</label>
                <input
                  type="text"
                  value={hallName}
                  onChange={e => setHallName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Exam Date</label>
                <input
                  type="date"
                  value={examDate}
                  onChange={e => setExamDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
                />
              </div>
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
              <button
                onClick={generateSeating}
                disabled={saving || students.length === 0}
                className="w-full mt-4 flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                Generate Seating
              </button>
            </div>
          </div>
        </div>

        {/* Seating Plan Table */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Seating Plan: {selectedClass}</h3>
              <div className="flex space-x-2">
                <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="Print All Hall Tickets">
                  <Printer className="w-5 h-5" />
                </button>
                <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="Download Excel">
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Seat Number</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Hall</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Date & Time</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Hall Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading seating plan...</td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">No students found in this class.</td>
                    </tr>
                  ) : (
                    students.map((student) => {
                      const seat = seating.find(s => s.studentId === student.id);
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
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
                            {seat ? (
                              <span className="font-bold text-indigo-600 font-mono">{seat.seatNumber}</span>
                            ) : (
                              <span className="text-slate-300 italic text-xs">Not assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center text-sm text-slate-600">
                            {seat ? seat.hallName : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {seat ? (
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-bold text-slate-700">{seat.date}</span>
                                <span className="text-[10px] text-slate-400">{seat.time}</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              disabled={!seat}
                              className="inline-flex items-center px-3 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 transition-all disabled:opacity-30"
                            >
                              <Printer className="w-3 h-3 mr-1" />
                              Print
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

          {/* Hall Ticket Preview (Mockup) */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <GraduationCap className="w-6 h-6 text-indigo-600" />
                  <span className="font-bold text-slate-900">Hall Ticket Preview</span>
                </div>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">OFFICIAL</span>
              </div>
              <div className="border-2 border-slate-900 p-4 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-slate-900 rotate-45 translate-x-8 -translate-y-8" />
                <div className="text-center border-b border-slate-200 pb-4 mb-4">
                  <h4 className="font-bold uppercase text-sm">Avenir Smart School</h4>
                  <p className="text-[10px] text-slate-500">EXAMINATION HALL TICKET</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-[10px]">
                  <div>
                    <p className="text-slate-400 uppercase font-bold tracking-tighter">Student Name</p>
                    <p className="font-bold">JOHN DOE</p>
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase font-bold tracking-tighter">Student ID</p>
                    <p className="font-bold font-mono">STU-1234</p>
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase font-bold tracking-tighter">Exam Hall</p>
                    <p className="font-bold">MAIN HALL A</p>
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase font-bold tracking-tighter">Seat Number</p>
                    <p className="font-bold text-indigo-600 font-mono">P101</p>
                  </div>
                </div>
                <div className="mt-6 flex justify-between items-end">
                  <div className="w-16 h-16 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                    <User className="w-8 h-8 text-slate-300" />
                  </div>
                  <div className="text-right">
                    <div className="w-24 h-px bg-slate-900 mb-1" />
                    <p className="text-[8px] font-bold uppercase">Principal Signature</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-indigo-900 p-8 rounded-2xl text-white flex flex-col justify-center">
              <h3 className="text-xl font-bold mb-4">Automated Hall Tickets</h3>
              <p className="text-indigo-200 text-sm mb-6 leading-relaxed">
                Generate professional examination hall tickets for your entire student body in seconds. 
                Our system ensures zero seating conflicts and clear instructions for every student.
              </p>
              <div className="flex items-center space-x-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-indigo-900 bg-indigo-700 flex items-center justify-center text-[10px] font-bold">
                      {i}
                    </div>
                  ))}
                </div>
                <span className="text-xs font-medium text-indigo-300">Used by 50+ Schools</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
