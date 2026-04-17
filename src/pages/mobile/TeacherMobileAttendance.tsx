import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MobileShell } from '../../components/MobileShell';
import { useAuth } from '../../components/FirebaseProvider';
import { batchUpsertAttendance } from '../../services/firestoreService';
import { Student, Attendance } from '../../types';
import { CheckCircle2, XCircle, Clock, Save, Users, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

type AttStatus = 'present' | 'absent' | 'late';

interface AttendanceRow {
  studentId: string;
  studentName: string;
  currentClass: string;
  status: AttStatus | null;
}

const STATUS_CONFIG: Record<AttStatus, { label: string; color: string; icon: React.ElementType }> = {
  present: { label: 'P', color: 'bg-emerald-500 text-white', icon: CheckCircle2 },
  late: { label: 'L', color: 'bg-amber-400 text-white', icon: Clock },
  absent: { label: 'A', color: 'bg-rose-500 text-white', icon: XCircle },
};

export default function TeacherMobileAttendance() {
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [students, setStudents] = useState<(Student & { id: string })[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [existingRecords, setExistingRecords] = useState<Record<string, AttStatus>>({});

  // Load all students once
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'students'), where('admissionStatus', '!=', 'withdrawn')),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student & { id: string }));
        setStudents(all);
        const classSet = [...new Set(all.map(s => s.currentClass).filter(Boolean))].sort();
        setClasses(classSet);
        if (classSet.length > 0 && !selectedClass) setSelectedClass(classSet[0]);
      }
    );
    return () => unsub();
  }, []);

  // Filter students by selected class
  useEffect(() => {
    if (!selectedClass) return;
    const filtered = students.filter(s => s.currentClass === selectedClass);
    setRows(filtered.map(s => ({
      studentId: s.studentId || s.id,
      studentName: s.studentName,
      currentClass: s.currentClass,
      status: existingRecords[s.studentId || s.id] ?? null,
    })));
  }, [selectedClass, students, existingRecords]);

  // Load existing attendance for selected class + date
  useEffect(() => {
    if (!selectedClass || !date) return;
    const unsub = onSnapshot(
      query(collection(db, 'attendance'), where('class', '==', selectedClass), where('date', '==', date)),
      snap => {
        const map: Record<string, AttStatus> = {};
        snap.docs.forEach(d => {
          const data = d.data() as Attendance;
          map[data.studentId] = data.status;
        });
        setExistingRecords(map);
      }
    );
    return () => unsub();
  }, [selectedClass, date]);

  const mark = useCallback((studentId: string, status: AttStatus) => {
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, status } : r));
  }, []);

  const markAll = (status: AttStatus) => {
    setRows(prev => prev.map(r => ({ ...r, status })));
  };

  const markedCount = rows.filter(r => r.status !== null).length;
  const progress = rows.length > 0 ? (markedCount / rows.length) * 100 : 0;

  const handleSave = async () => {
    const toSave = rows.filter(r => r.status !== null);
    if (toSave.length === 0) { toast.error('Mark at least one student'); return; }
    setSaving(true);
    try {
      await batchUpsertAttendance(toSave.map(r => ({
        studentId: r.studentId,
        date,
        status: r.status!,
        class: selectedClass,
        recordedBy: user?.uid ?? profile?.displayName ?? 'teacher',
      })));
      toast.success(`Saved ${toSave.length} records`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileShell role="teacher">
      <div className="px-4 pt-5 pb-4 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
          <p className="text-xs text-slate-500 mt-0.5">Mark today's attendance for your class</p>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {/* Class selector */}
          <div className="relative flex-1">
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-8"
            >
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
              {classes.length === 0 && <option value="">No classes</option>}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {/* Date */}
          <input
            type="date"
            value={date}
            max={today}
            onChange={e => setDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{markedCount} of {rows.length} marked</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Bulk mark */}
        <div className="flex gap-2">
          {(['present', 'late', 'absent'] as AttStatus[]).map(s => (
            <button
              key={s}
              onClick={() => markAll(s)}
              className={cn(
                'flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all active:scale-95',
                STATUS_CONFIG[s].color
              )}
            >
              All {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Student list */}
        <div className="space-y-2">
          {rows.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No students in this class</p>
            </div>
          )}
          {rows.map(row => (
            <div
              key={row.studentId}
              className={cn(
                'flex items-center gap-3 bg-white rounded-xl px-3 py-3 shadow-sm border transition-all',
                row.status ? 'border-transparent' : 'border-slate-100'
              )}
            >
              {/* Avatar */}
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0',
                row.status === 'present' ? 'bg-emerald-500' :
                row.status === 'late' ? 'bg-amber-400' :
                row.status === 'absent' ? 'bg-rose-500' :
                'bg-slate-300'
              )}>
                {row.studentName?.[0]?.toUpperCase() ?? '?'}
              </div>
              <p className="flex-1 text-sm font-semibold text-slate-800 truncate">{row.studentName}</p>
              {/* Status buttons */}
              <div className="flex gap-1.5">
                {(['present', 'late', 'absent'] as AttStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => mark(row.studentId, s)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-xs font-bold transition-all active:scale-90',
                      row.status === s
                        ? STATUS_CONFIG[s].color + ' shadow-sm'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || markedCount === 0}
        className={cn(
          'fixed bottom-20 right-4 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-lg font-semibold text-sm text-white transition-all active:scale-95',
          markedCount > 0
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-200'
            : 'bg-slate-300 cursor-not-allowed'
        )}
      >
        {saving ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {saving ? 'Saving…' : `Save ${markedCount > 0 ? markedCount : ''}`}
      </button>
    </MobileShell>
  );
}
