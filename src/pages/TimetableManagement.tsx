import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Timetable, TimetablePeriod, SCHOOL_CLASSES, SUBJECTS, DAYS_OF_WEEK } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Plus, Trash2, Loader2, Calendar, Clock, BookOpen, User, ChevronRight, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function TimetableManagement() {
  const [selectedClass, setSelectedClass] = useState(SCHOOL_CLASSES[0]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [session] = useState('2025/2026');
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const initialSchedule = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: []
  };

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'timetables'),
      where('class', '==', selectedClass),
      where('term', '==', selectedTerm),
      where('session', '==', session)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setTimetable({ id: doc.id, ...doc.data() } as Timetable);
      } else {
        setTimetable({
          class: selectedClass,
          term: selectedTerm,
          session,
          schedule: { ...initialSchedule },
          updatedAt: null
        });
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'timetables'));

    return () => unsubscribe();
  }, [selectedClass, selectedTerm]);

  const addPeriod = (day: keyof Timetable['schedule']) => {
    if (!timetable) return;
    const newPeriod: TimetablePeriod = {
      subject: SUBJECTS[0],
      startTime: '08:00',
      endTime: '09:00',
      teacher: ''
    };
    const updatedSchedule = { ...timetable.schedule };
    updatedSchedule[day] = [...updatedSchedule[day], newPeriod];
    setTimetable({ ...timetable, schedule: updatedSchedule });
  };

  const removePeriod = (day: keyof Timetable['schedule'], index: number) => {
    if (!timetable) return;
    const updatedSchedule = { ...timetable.schedule };
    updatedSchedule[day] = updatedSchedule[day].filter((_, i) => i !== index);
    setTimetable({ ...timetable, schedule: updatedSchedule });
  };

  const updatePeriod = (day: keyof Timetable['schedule'], index: number, field: keyof TimetablePeriod, value: string) => {
    if (!timetable) return;
    const updatedSchedule = { ...timetable.schedule };
    updatedSchedule[day][index] = { ...updatedSchedule[day][index], [field]: value };
    setTimetable({ ...timetable, schedule: updatedSchedule });
  };

  const saveTimetable = async () => {
    if (!timetable) return;
    setSaving(true);
    setMessage(null);
    try {
      if (timetable.id) {
        await updateDoc(doc(db, 'timetables', timetable.id), {
          ...timetable,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'timetables'), {
          ...timetable,
          updatedAt: serverTimestamp()
        });
      }
      setMessage({ type: 'success', text: 'Timetable saved successfully!' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'timetables');
      setMessage({ type: 'error', text: 'Failed to save timetable.' });
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
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Timetable Management</h1>
          <p className="text-slate-500 mt-1">Design and manage weekly class schedules.</p>
        </div>
        <button
          onClick={saveTimetable}
          disabled={saving || loading}
          className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
          Save Timetable
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mb-6 p-4 rounded-xl flex items-center ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-3" /> : <AlertCircle className="w-5 h-5 mr-3" />}
            <span className="font-medium">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {DAYS_OF_WEEK.map((day) => (
          <div key={day} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 text-indigo-600 mr-2" />
                <h3 className="font-bold text-slate-900">{day}</h3>
              </div>
              <button
                onClick={() => addPeriod(day)}
                className="inline-flex items-center px-3 py-1 bg-white border border-slate-200 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-all"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Period
              </button>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                </div>
              ) : !timetable || timetable.schedule[day].length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl">
                  <p className="text-slate-400 text-sm">No periods scheduled for {day}.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {timetable.schedule[day].map((period, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 rounded-xl border border-slate-100 bg-slate-50 relative group"
                    >
                      <button
                        onClick={() => removePeriod(day, index)}
                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <BookOpen className="w-4 h-4 text-indigo-500" />
                          <select
                            value={period.subject}
                            onChange={e => updatePeriod(day, index, 'subject', e.target.value)}
                            className="bg-transparent font-bold text-slate-900 outline-none w-full text-sm"
                          >
                            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <input
                              type="time"
                              value={period.startTime}
                              onChange={e => updatePeriod(day, index, 'startTime', e.target.value)}
                              className="bg-transparent text-xs text-slate-600 outline-none"
                            />
                          </div>
                          <span className="text-slate-300 text-xs">-</span>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <input
                              type="time"
                              value={period.endTime}
                              onChange={e => updatePeriod(day, index, 'endTime', e.target.value)}
                              className="bg-transparent text-xs text-slate-600 outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2 border-t border-slate-200/50">
                          <User className="w-3 h-3 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Teacher (Optional)"
                            value={period.teacher || ''}
                            onChange={e => updatePeriod(day, index, 'teacher', e.target.value)}
                            className="bg-transparent text-[10px] text-slate-500 outline-none w-full italic"
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
