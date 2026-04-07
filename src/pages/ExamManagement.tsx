import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { ExamSeating, Student, SUBJECTS } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { GraduationCap, Plus, Printer, Trash2, X, Search, Edit2, Users, Calendar } from 'lucide-react';
import { useClassSelectOptions } from '../components/SchoolContext';

interface Exam {
  id?: string;
  name: string;
  subject: string;
  class: string;
  date: string;
  startTime: string;
  endTime: string;
  hall: string;
  createdAt?: any;
}

export default function ExamManagement() {
  const classSelectOptions = useClassSelectOptions();
  const [exams, setExams] = useState<Exam[]>([]);
  const [seatings, setSeatings] = useState<ExamSeating[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExamModal, setIsExamModal] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [examForm, setExamForm] = useState<Partial<Exam>>({
    name: '', subject: SUBJECTS[0], class: '',
    date: '', startTime: '09:00', endTime: '11:00', hall: 'Hall A'
  });
  const [autoAssigning, setAutoAssigning] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'exams'), ), snap => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'exam_seating'), snap => {
      setSeatings(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamSeating)));
    });
    const unsub3 = onSnapshot(collection(db, 'students'), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const saveExam = async () => {
    if (!examForm.name || !examForm.date) return;
    if ((examForm as any).id) {
      await updateDoc(doc(db, 'exams', (examForm as any).id), { ...examForm }).catch(console.error);
    } else {
      await addDoc(collection(db, 'exams'), { ...examForm, createdAt: serverTimestamp() }).catch(console.error);
    }
    setIsExamModal(false);
    setExamForm({ name: '', subject: SUBJECTS[0], class: '', date: '', startTime: '09:00', endTime: '11:00', hall: 'Hall A' });
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam?')) return;
    await deleteDoc(doc(db, 'exams', id)).catch(console.error);
  };

  const autoAssignSeats = async (exam: Exam) => {
    setAutoAssigning(true);
    const classStudents = students.filter(s => s.currentClass === exam.class);
    // remove existing seating for this exam
    const existingQ = query(collection(db, 'exam_seating'), where('examName', '==', exam.name));
    const existing = await getDocs(existingQ);
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
    // assign
    await Promise.all(classStudents.map((s, i) =>
      addDoc(collection(db, 'exam_seating'), {
        examName: exam.name,
        hallName: exam.hall,
        studentId: s.id,
        seatNumber: `${exam.hall.replace(/\s/g, '')}-${String(i + 1).padStart(2, '0')}`,
        date: exam.date,
        time: exam.startTime,
        createdAt: serverTimestamp(),
      })
    ));
    setAutoAssigning(false);
    alert(`Seats assigned for ${classStudents.length} students.`);
  };

  const getSeatingForExam = (examName: string) => seatings.filter(s => s.examName === examName);
  const getStudentName = (id: string) => students.find(s => s.id === id)?.studentName || id;
  const getStudentId = (id: string) => students.find(s => s.id === id)?.studentId || '';

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-600" />
            Exam Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Schedule exams, assign halls and seats, print hall tickets.</p>
        </div>
        <button onClick={() => setIsExamModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
          <Plus className="w-4 h-4" /> New Exam
        </button>
      </div>

      {/* Exams List */}
      <div className="space-y-4 mb-8">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">Loading...</div>
        ) : exams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
            <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500">No exams scheduled. Create your first exam.</p>
          </div>
        ) : (
          exams.map(exam => {
            const examSeatings = getSeatingForExam(exam.name);
            return (
              <motion.div key={exam.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-900">{exam.name}</h3>
                      <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">{exam.class}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                      <span><span className="font-medium text-slate-700">Subject:</span> {exam.subject}</span>
                      <span><span className="font-medium text-slate-700">Date:</span> {exam.date}</span>
                      <span><span className="font-medium text-slate-700">Time:</span> {exam.startTime} – {exam.endTime}</span>
                      <span><span className="font-medium text-slate-700">Hall:</span> {exam.hall}</span>
                      <span><span className="font-medium text-slate-700">Seats:</span> {examSeatings.length}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => autoAssignSeats(exam)} disabled={autoAssigning}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-60">
                      {autoAssigning ? '...' : 'Auto-Assign Seats'}
                    </button>
                    <button onClick={() => { setSelectedExam(exam === selectedExam ? null : exam); }}
                      className="px-3 py-1.5 bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                      {selectedExam?.id === exam.id ? 'Hide' : 'View Seats'}
                    </button>
                    <button onClick={() => { setPrintingId(exam.id!); setTimeout(() => { window.print(); setPrintingId(null); }, 200); }}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteExam(exam.id!)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Seating list */}
                <AnimatePresence>
                  {selectedExam?.id === exam.id && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="border-t border-slate-100 overflow-x-auto">
                        {examSeatings.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-slate-400">No seats assigned yet. Click "Auto-Assign Seats".</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                              <tr>
                                <th className="px-5 py-2 text-left">Seat No.</th>
                                <th className="px-4 py-2 text-left">Student Name</th>
                                <th className="px-4 py-2 text-left">Student ID</th>
                                <th className="px-4 py-2 text-left">Hall</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {examSeatings.map(seat => (
                                <tr key={seat.id} className="hover:bg-slate-50">
                                  <td className="px-5 py-2 font-mono font-bold text-indigo-700">{seat.seatNumber}</td>
                                  <td className="px-4 py-2 font-medium text-slate-800">{getStudentName(seat.studentId)}</td>
                                  <td className="px-4 py-2 text-slate-500 font-mono text-xs">{getStudentId(seat.studentId)}</td>
                                  <td className="px-4 py-2 text-slate-500">{seat.hallName}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Create Exam Modal */}
      <AnimatePresence>
        {isExamModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setIsExamModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900">Schedule New Exam</h2>
                <button onClick={() => setIsExamModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Exam Name', key: 'name', type: 'text', placeholder: 'e.g. 1st Term Mathematics Exam' },
                  { label: 'Date', key: 'date', type: 'date' },
                  { label: 'Start Time', key: 'startTime', type: 'time' },
                  { label: 'End Time', key: 'endTime', type: 'time' },
                  { label: 'Hall / Venue', key: 'hall', type: 'text', placeholder: 'e.g. Hall A' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">{f.label}</label>
                    <input type={f.type} value={(examForm as any)[f.key] || ''} placeholder={f.placeholder}
                      onChange={e => setExamForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                    <select value={examForm.subject} onChange={e => setExamForm(p => ({ ...p, subject: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Class</label>
                    <select value={examForm.class} onChange={e => setExamForm(p => ({ ...p, class: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsExamModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                <button onClick={saveExam} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm">Save Exam</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
