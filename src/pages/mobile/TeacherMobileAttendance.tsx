import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, getDocs
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MobileShell } from '../../components/MobileShell';
import { useAuth } from '../../components/FirebaseProvider';
import { batchUpsertAttendance } from '../../services/firestoreService';
import { Student, Attendance } from '../../types';
import { CheckCircle2, XCircle, Clock, Save, Users, ChevronDown, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import { useSchoolId } from '../../hooks/useSchoolId';
import { useTeacherAssignments } from '../../hooks/useTeacherAssignments';

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
  const schoolId = useSchoolId();
  const today = new Date().toISOString().split('T')[0];

  const [students, setStudents] = useState<(Student & { id: string })[]>([]);
  const { assignedClassNames: assignedClasses, loading: assignmentLoading } = useTeacherAssignments();
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  // Status as last read from Firestore for the current class+date.
  const [savedRecords, setSavedRecords] = useState<Record<string, AttStatus>>({});
  // Status tapped locally but not yet saved — never touched by listener churn,
  // only cleared when the class or date selection changes.
  const [localEdits, setLocalEdits] = useState<Record<string, AttStatus>>({});

  // Keep selectedClass valid as the teacher's assignment list loads/changes.
  useEffect(() => {
    if (assignmentLoading) return;
    setSelectedClass(prev => assignedClasses.includes(prev) ? prev : (assignedClasses[0] ?? ''));
  }, [assignmentLoading, assignedClasses]);

  // Load all students once
  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, 'students'), where('schoolId', '==', schoolId!), where('admissionStatus', '!=', 'withdrawn')),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student & { id: string }));
        setStudents(all);
      }
    );
    return () => unsub();
  }, [schoolId]);

  // Load existing attendance ONLY when class or date actually changes — a one-shot fetch
  // (not a live listener) so marking in progress is never clobbered by unrelated writes.
  useEffect(() => {
    if (!selectedClass || !date || !schoolId) return;
    let cancelled = false;
    getDocs(
      query(collection(db, 'attendance'), where('schoolId', '==', schoolId), where('class', '==', selectedClass), where('date', '==', date))
    ).then(snap => {
      if (cancelled) return;
      const map: Record<string, AttStatus> = {};
      snap.docs.forEach(d => {
        const data = d.data() as Attendance;
        map[data.studentId] = data.status;
      });
      setSavedRecords(map);
      setLocalEdits({}); // fresh class/date selection — discard any stale local taps
    });
    return () => { cancelled = true; };
  }, [selectedClass, date, schoolId]);

  // Effective rows: local (unsaved) tap wins, else the last value read from Firestore, else unmarked.
  const rows: AttendanceRow[] = useMemo(() =>
    students.filter(s => s.currentClass === selectedClass).map(s => ({
      studentId: s.studentId || s.id,
      studentName: s.studentName,
      currentClass: s.currentClass,
      status: localEdits[s.studentId || s.id] ?? savedRecords[s.studentId || s.id] ?? null,
    })), [students, selectedClass, localEdits, savedRecords]);

  const mark = useCallback((studentId: string, status: AttStatus) => {
    setLocalEdits(prev => ({ ...prev, [studentId]: status }));
  }, []);

  const markAll = (status: AttStatus) => {
    setLocalEdits(() => Object.fromEntries(rows.map(r => [r.studentId, status])));
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
      setSavedRecords(prev => {
        const next = { ...prev };
        toSave.forEach(r => { next[r.studentId] = r.status!; });
        return next;
      });
      setLocalEdits({});
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

        {/* No assigned classes guard */}
        {!assignmentLoading && assignedClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Lock className="w-10 h-10 opacity-40" />
            <p className="text-sm font-medium text-center">You are not assigned to any class.<br />Contact your administrator.</p>
          </div>
        ) : (
          <>
        {/* Filters */}
        <div className="flex gap-2">
          {/* Class selector */}
          <div className="relative flex-1">
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-8"
            >
              {assignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
              {assignedClasses.length === 0 && <option value="">No classes</option>}
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
          </>
        )}
      </div>

      {/* Floating Save Button */}
      {assignedClasses.length > 0 && (
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
      )}
    </MobileShell>
  );
}
