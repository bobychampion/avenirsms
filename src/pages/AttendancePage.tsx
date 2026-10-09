import EarlyDepartures, { useEarlyDepartures } from '../components/EarlyDepartures';
import { departureDescription } from '../utils/earlyDeparture';
import { isAttendanceWeekend, attendanceDayTitle } from '../utils/attendanceCalendar';
import { ATTENDANCE_STATUSES, attendanceStatusLabel, type AttendanceStatus } from '../utils/attendanceStatus';
import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Student, Attendance, SubjectAttendance, SpecialLesson, SpecialLessonAttendance } from '../types';
import { batchUpsertAttendance, batchUpsertSubjectAttendance, fetchDailyAttendanceMap } from '../services/firestoreService';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import { suggestAttendanceAlert } from '../services/geminiService';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  ClipboardList, Search, CheckCircle, XCircle, Clock, Save,
  BarChart3, Filter, Calendar, Users, Sparkles, Bell, Download, BookOpen
} from 'lucide-react';
import { exportAttendanceCsv, exportSubjectAttendanceCsv, exportSpecialLessonAttendanceCsv } from '../services/dataExport/csvModules';
import { ClassSelect } from '../components/ClassSelect';
import { describeAttendanceConflicts, buildEffectiveAttendanceByStudent } from '../utils/attendanceConflict';
import { buildSubjectMatrix, dedupeSubjectLessons } from '../utils/subjectAttendanceMatrix';


interface AttendanceRow {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const schoolId = useSchoolId();
  const { attendanceMode, currentSession, currentTerm } = useSchool();
  const [selectedClass, setSelectedClass] = useState('');
  const { records: departureRecords } = useEarlyDepartures(schoolId, selectedClass);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [classRows, setClassRows] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  // Status as last read from Firestore for the current class+date.
  const [savedAttendance, setSavedAttendance] = useState<Record<string, AttendanceStatus>>({});
  // Status clicked locally but not yet saved — never touched by listener churn,
  // only cleared when the class or date selection changes.
  const [localAttendanceEdits, setLocalAttendanceEdits] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'mark' | 'subject_mark' | 'report' | 'monthly' | 'subject_report' | 'special_lessons_report'>('mark');
  const [reportData, setReportData] = useState<{ studentId: string; studentName: string; present: number; absent: number; late: number; school_trip: number; rate: number }[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiAlertLoading, setAiAlertLoading] = useState<string | null>(null);

  // ── Subject Attendance report (class + subject summary) ──
  const [subjectReportRecords, setSubjectReportRecords] = useState<(SubjectAttendance & { studentName?: string })[]>([]);
  const [loadingSubjectReport, setLoadingSubjectReport] = useState(false);
  // 'day' follows the page's date picker; 'all' aggregates every recorded date as present/total.
  const [subjectScope, setSubjectScope] = useState<'day' | 'all'>('day');

  // ── Special Lesson report (per-lesson summary) ──
  const [specialLessons, setSpecialLessons] = useState<SpecialLesson[]>([]);
  const [specialLessonReportRecords, setSpecialLessonReportRecords] = useState<SpecialLessonAttendance[]>([]);
  const [loadingSpecialLessonReport, setLoadingSpecialLessonReport] = useState(false);

  // Monthly view state
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [monthlyData, setMonthlyData] = useState<{
    studentId: string;
    studentName: string;
    cells: Record<string, AttendanceStatus | null>;
    present: number; absent: number; late: number; school_trip: number; rate: number;
  }[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  // Subject records for the loaded month, and the student/day cell whose subject breakdown is open.
  const [monthlySubjectRecords, setMonthlySubjectRecords] = useState<SubjectAttendance[]>([]);
  const [expandedCell, setExpandedCell] = useState<{ studentId: string; date: string } | null>(null);

  // Approved absence requests for this class — used to default attendance to "absent"
  // and flag students who are on authorised leave for the selected date.
  const [approvedAbsences, setApprovedAbsences] = useState<{ studentId: string; startDate: string; endDate: string }[]>([]);
  useEffect(() => {
    if (!schoolId || !selectedClass) { setApprovedAbsences([]); return; }
    const q = query(
      collection(db, 'absence_requests'),
      where('schoolId', '==', schoolId),
      where('class', '==', selectedClass),
      where('status', '==', 'approved'),
    );
    const unsub = onSnapshot(q, snap => {
      setApprovedAbsences(snap.docs.map(d => {
        const data = d.data() as { studentId: string; startDate: string; endDate: string };
        return { studentId: data.studentId, startDate: data.startDate, endDate: data.endDate };
      }));
    }, () => setApprovedAbsences([]));
    return unsub;
  }, [schoolId, selectedClass]);

  const isOnApprovedLeave = (studentId: string, date: string) =>
    approvedAbsences.some(a => a.studentId === studentId && a.startDate <= date && a.endDate >= date);

  // Load classes from Firestore so the dropdown matches actual data
  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'classes'), where('schoolId', '==', schoolId!), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setClassRows(snap.docs.map(d => ({ id: d.id, name: (d.data().name as string) || '' })));
    });
    return () => unsub();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    if (!selectedClass) return;
    const q = query(
      collection(db, 'students'),
      where('schoolId', '==', schoolId!),
      where('currentClass', '==', selectedClass),
      orderBy('studentName', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Student))
        .filter(s => s.admissionStatus !== 'withdrawn');
      setStudents(data);
    }, err => handleFirestoreError(err, OperationType.LIST, 'students'));
    return () => unsub();
  }, [selectedClass, schoolId]);

  // Load existing attendance ONLY when class or date actually changes — deliberately excludes
  // `students`/`approvedAbsences` from deps, since those are live-listener-derived and re-emit
  // on unrelated writes, which previously reset any in-progress local edits back to defaults.
  useEffect(() => {
    if (!schoolId) return;
    if (!selectedClass || !selectedDate) return;
    let cancelled = false;
    const loadExisting = async () => {
      const q = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('class', '==', selectedClass),
        where('date', '==', selectedDate)
      );
      const snap = await getDocs(q);
      const existing: Record<string, AttendanceStatus> = {};
      snap.docs.forEach(d => { existing[d.data().studentId] = d.data().status; });
      if (cancelled) return;
      setSavedAttendance(existing);
      setLocalAttendanceEdits({}); // fresh class/date selection — discard any stale local edits
    };
    loadExisting().catch(console.error);
    return () => { cancelled = true; };
  }, [selectedDate, selectedClass, schoolId]);

  // Effective attendance rows: local (unsaved) edit wins, else the last value read from
  // Firestore, else the default. Recomputing from `students` is safe — never touches saved state.
  const attendanceRows: AttendanceRow[] = useMemo(() => students.map(s => ({
    studentId: s.id!,
    studentName: s.studentName,
    status: localAttendanceEdits[s.id!] ?? savedAttendance[s.id!] ?? (isOnApprovedLeave(s.id!, selectedDate) ? 'absent' : 'present'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [students, localAttendanceEdits, savedAttendance, selectedDate, approvedAbsences]);

  const setAllStatus = (status: AttendanceStatus) => {
    setLocalAttendanceEdits(() => Object.fromEntries(attendanceRows.map(r => [r.studentId, status])));
  };

  const toggleStatus = (studentId: string) => {
    const current = attendanceRows.find(r => r.studentId === studentId)?.status ?? 'present';
    const cycle: AttendanceStatus[] = ATTENDANCE_STATUSES;
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    setLocalAttendanceEdits(prev => ({ ...prev, [studentId]: next }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const records = attendanceRows.map(r => ({
      studentId: r.studentId,
      date: selectedDate,
      status: r.status,
      class: selectedClass,
      recordedBy: user.uid,
    }));
    const tid = toast.loading('Saving attendance…');
    try {
      let res = await batchUpsertAttendance(records, schoolId, { baseline: savedAttendance });
      toast.dismiss(tid);
      if (res.conflicts.length > 0) {
        const proceed = window.confirm(
          describeAttendanceConflicts(res.conflicts, id => students.find(s => s.id === id)?.studentName ?? id)
        );
        if (!proceed) {
          toast('Not saved. Reopen the class to load the latest marks.', { icon: 'ℹ️' });
          setSaving(false);
          return;
        }
        res = await batchUpsertAttendance(records, schoolId, { overrideConflicts: true });
      }
      setSavedAttendance(prev => {
        const next = { ...prev };
        records.forEach(r => { next[r.studentId] = r.status; });
        return next;
      });
      setLocalAttendanceEdits({});
      const changed = res.created + res.updated;
      toast.success(changed > 0 ? `Attendance saved (${changed} change${changed === 1 ? '' : 's'}).` : 'Attendance already up to date.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown error'), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  // ── Subject attendance (mark) — the admin counterpart of the Teacher Portal's Subject Attendance tab ──
  const selectedClassId = useMemo(() => classRows.find(c => c.name === selectedClass)?.id, [classRows, selectedClass]);
  type ClassSubjectRow = { subjectName: string; teacherId?: string; enrolledStudentIds?: string[] };
  const [classSubjectRows, setClassSubjectRows] = useState<ClassSubjectRow[]>([]);
  const [markSubject, setMarkSubject] = useState('');
  // Daily register for the class/date, which subject attendance is pre-filled from.
  const [dailyInheritMap, setDailyInheritMap] = useState<Record<string, AttendanceStatus>>({});
  const [savedSubjectMarks, setSavedSubjectMarks] = useState<Record<string, { status: AttendanceStatus; inheritedFromDaily: boolean }>>({});
  const [localSubjectEdits, setLocalSubjectEdits] = useState<Record<string, AttendanceStatus>>({});
  const [savingSubjectMarks, setSavingSubjectMarks] = useState(false);
  const [subjectMarksSaved, setSubjectMarksSaved] = useState(false);

  // Subjects assigned to the class (and any elective roster) — live, and only for schools that record subject attendance.
  useEffect(() => {
    if (!schoolId || !selectedClassId || attendanceMode === 'daily_only') { setClassSubjectRows([]); return; }
    const unsub = onSnapshot(
      query(collection(db, 'class_subjects'), where('schoolId', '==', schoolId), where('classId', '==', selectedClassId)),
      snap => setClassSubjectRows(snap.docs.map(d => d.data() as ClassSubjectRow)),
      () => setClassSubjectRows([]),
    );
    return unsub;
  }, [schoolId, selectedClassId, attendanceMode]);

  const markSubjectOptions = useMemo(
    () => Array.from(new Set<string>(classSubjectRows.map(r => r.subjectName))).sort((a, b) => a.localeCompare(b)),
    [classSubjectRows],
  );
  useEffect(() => {
    setMarkSubject(prev => markSubjectOptions.includes(prev) ? prev : (markSubjectOptions[0] ?? ''));
  }, [markSubjectOptions]);

  // subjectName -> student ids enrolled (only subjects with a restricted roster, i.e. electives)
  const subjectEnrolment = useMemo(() => {
    const enrolment: Record<string, string[]> = {};
    classSubjectRows.forEach(r => {
      if (r.enrolledStudentIds && r.enrolledStudentIds.length > 0) enrolment[r.subjectName] = r.enrolledStudentIds;
    });
    return enrolment;
  }, [classSubjectRows]);
  const markRoster = subjectEnrolment[markSubject] ?? null;

  // Load the daily register + any saved subject marks ONLY when class/subject/date change, so
  // in-progress clicks are never reset by unrelated re-renders (same discipline as the daily tab).
  useEffect(() => {
    if (activeTab !== 'subject_mark' || !schoolId || !selectedClass || !selectedClassId || !markSubject || !selectedDate) return;
    let cancelled = false;
    (async () => {
      const [dailyMap, subjSnap] = await Promise.all([
        fetchDailyAttendanceMap(selectedClass, selectedDate, schoolId),
        getDocs(query(
          collection(db, 'subjectAttendance'),
          where('schoolId', '==', schoolId),
          where('classId', '==', selectedClassId),
          where('subjectName', '==', markSubject),
          where('attendanceDate', '==', selectedDate),
        )),
      ]);
      if (cancelled) return;
      const existing: Record<string, { status: AttendanceStatus; inheritedFromDaily: boolean }> = {};
      subjSnap.docs.forEach(d => {
        const data = d.data() as SubjectAttendance;
        existing[data.studentId] = { status: data.status, inheritedFromDaily: data.inheritedFromDaily };
      });
      setDailyInheritMap(dailyMap);
      setSavedSubjectMarks(existing);
      setLocalSubjectEdits({});
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [activeTab, schoolId, selectedClass, selectedClassId, markSubject, selectedDate]);

  // Local click wins, else a saved mark, else the day's daily register (approved leave counts as
  // absent when the daily register hasn't been taken), else present.
  const subjectMarkRows = useMemo(() => students
    .filter(s => !markRoster || markRoster.includes(s.id!))
    .map(s => {
      const local = localSubjectEdits[s.id!];
      const saved = savedSubjectMarks[s.id!];
      const fallback: AttendanceStatus = isOnApprovedLeave(s.id!, selectedDate) ? 'absent' : 'present';
      return {
        studentId: s.id!,
        studentName: s.studentName,
        status: local ?? saved?.status ?? dailyInheritMap[s.id!] ?? fallback,
        inherited: local === undefined && (saved ? saved.inheritedFromDaily : true),
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [students, markRoster, localSubjectEdits, savedSubjectMarks, dailyInheritMap, selectedDate, approvedAbsences]);

  const cycleSubjectMark = (studentId: string) => {
    const current = subjectMarkRows.find(r => r.studentId === studentId)?.status ?? 'present';
    const next: Record<AttendanceStatus, AttendanceStatus> = { present: 'absent', absent: 'late', late: 'school_trip', school_trip: 'present' };
    setLocalSubjectEdits(prev => ({ ...prev, [studentId]: next[current] }));
  };

  const handleSaveSubjectMarks = async () => {
    if (!user || !selectedClassId || !markSubject || subjectMarkRows.length === 0) return;
    setSavingSubjectMarks(true);
    // Credit the lesson to the subject's assigned teacher; recordedBy still says who actually saved it.
    const teacherId = classSubjectRows.find(r => r.subjectName === markSubject)?.teacherId || user.uid;
    const records = subjectMarkRows.map(r => ({
      studentId: r.studentId,
      classId: selectedClassId,
      className: selectedClass,
      subjectName: markSubject,
      teacherId,
      academicSession: currentSession,
      term: currentTerm,
      attendanceDate: selectedDate,
      status: r.status,
      inheritedFromDaily: r.inherited,
      recordedBy: user.uid,
    }));
    const tid = toast.loading('Saving subject attendance…');
    try {
      await batchUpsertSubjectAttendance(records, schoolId);
      toast.success(`${markSubject} attendance saved.`, { id: tid });
      setSavedSubjectMarks(prev => {
        const next = { ...prev };
        records.forEach(r => { next[r.studentId] = { status: r.status, inheritedFromDaily: r.inheritedFromDaily }; });
        return next;
      });
      setLocalSubjectEdits({});
      setSubjectMarksSaved(true);
      setTimeout(() => setSubjectMarksSaved(false), 3000);
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown error'), { id: tid });
    } finally {
      setSavingSubjectMarks(false);
    }
  };

  const loadReport = async () => {
    if (!selectedClass) return;
    setLoadingReport(true);
    const q = query(collection(db, 'attendance'), where('schoolId', '==', schoolId!), where('class', '==', selectedClass));
    const snap = await getDocs(q);
    const dailyRecords = snap.docs.map(d => {
      const data = d.data();
      return { studentId: data.studentId as string, date: data.date as string, status: data.status as AttendanceStatus };
    });

    // Reconcile against subject attendance (see attendanceConflict.ts) so this report never
    // disagrees with what parents see for the same student/day in their own portal.
    let subjectRecords: { studentId: string; attendanceDate: string; status: AttendanceStatus; inheritedFromDaily: boolean }[] = [];
    if (attendanceMode !== 'daily_only' && schoolId) {
      const classId = classRows.find(c => c.name === selectedClass)?.id;
      if (classId) {
        const subjSnap = await getDocs(query(
          collection(db, 'subjectAttendance'),
          where('schoolId', '==', schoolId),
          where('classId', '==', classId),
        ));
        subjectRecords = subjSnap.docs.map(d => {
          const data = d.data() as SubjectAttendance;
          return { studentId: data.studentId, attendanceDate: data.attendanceDate, status: data.status, inheritedFromDaily: data.inheritedFromDaily };
        });
      }
    }

    const effectiveByStudent = buildEffectiveAttendanceByStudent(dailyRecords, subjectRecords);
    const byStudent: Record<string, { id: string; name: string; present: number; absent: number; late: number; school_trip: number }> = {};
    Object.entries(effectiveByStudent).forEach(([studentId, byDate]) => {
      const student = students.find(s => s.id === studentId);
      const counts = { id: studentId, name: student?.studentName || studentId, present: 0, absent: 0, late: 0, school_trip: 0 };
      Object.values(byDate).forEach(status => {
        if (status === 'present') counts.present++;
        else if (status === 'absent') counts.absent++;
        else if (status === 'late') counts.late++;
        else if (status === 'school_trip') counts.school_trip++;
      });
      byStudent[studentId] = counts;
    });
    const report = Object.values(byStudent).map(s => {
      const total = s.present + s.absent + s.late + s.school_trip;
      return { studentId: s.id, studentName: s.name, present: s.present, absent: s.absent, late: s.late, school_trip: s.school_trip, rate: total > 0 ? Math.round(((s.present + s.school_trip) / total) * 100) : 0 };
    }).sort((a, b) => b.rate - a.rate);
    setReportData(report);
    setLoadingReport(false);
  };

  // ── Subject Attendance report: per-subject and per-student breakdown for a class ──
  const loadSubjectReport = async () => {
    if (!selectedClass || !schoolId) return;
    const classId = classRows.find(c => c.name === selectedClass)?.id;
    if (!classId) { toast.error('Class not found'); return; }
    setLoadingSubjectReport(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'subjectAttendance'),
        where('schoolId', '==', schoolId),
        where('classId', '==', classId),
      ));
      const nameById = Object.fromEntries(students.map(s => [s.id, s.studentName]));
      setSubjectReportRecords(snap.docs.map(d => {
        const data = d.data() as SubjectAttendance;
        return { id: d.id, ...data, studentName: nameById[data.studentId] ?? data.studentId };
      }));
    } finally {
      setLoadingSubjectReport(false);
    }
  };

  // Reload when the class changes while the tab is open (previously required reopening the tab).
  useEffect(() => {
    if (activeTab === 'subject_report' && selectedClass && classRows.length > 0) loadSubjectReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedClass, classRows]);

  // Real lessons per student per day for the loaded month (duplicates collapsed), keyed
  // "studentId|YYYY-MM-DD" — drives the clickable day cells in the Monthly grid.
  const monthlyLessons = useMemo(() => {
    const byCell: Record<string, SubjectAttendance[]> = {};
    dedupeSubjectLessons<SubjectAttendance>(monthlySubjectRecords).forEach(r => {
      (byCell[`${r.studentId}|${r.attendanceDate}`] ??= []).push(r);
    });
    Object.values(byCell).forEach(list => list.sort((a, b) => a.subjectName.localeCompare(b.subjectName)));
    return byCell;
  }, [monthlySubjectRecords]);

  // Student × subject grid for the selected day (or all recorded dates); see buildSubjectMatrix
  // for how duplicate records of the same lesson are collapsed.
  const subjectMatrix = useMemo(
    () => buildSubjectMatrix(subjectReportRecords, subjectScope === 'day' ? selectedDate : undefined),
    [subjectReportRecords, subjectScope, selectedDate],
  );

  // ── Special Lessons report: per-lesson enrollment + attendance rate ──
  const loadSpecialLessonsReport = async () => {
    if (!schoolId) return;
    setLoadingSpecialLessonReport(true);
    try {
      const [lessonsSnap, attSnap] = await Promise.all([
        getDocs(query(collection(db, 'special_lessons'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'specialLessonAttendance'), where('schoolId', '==', schoolId))),
      ]);
      setSpecialLessons(lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() } as SpecialLesson)));
      setSpecialLessonReportRecords(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as SpecialLessonAttendance)));
    } finally {
      setLoadingSpecialLessonReport(false);
    }
  };

  const specialLessonSummary = useMemo(() => {
    return specialLessons.map(lesson => {
      const records = specialLessonReportRecords.filter(r => r.specialLessonId === lesson.id);
      const present = records.filter(r => r.status === 'present' || r.status === 'school_trip').length;
      const rate = records.length > 0 ? Math.round((present / records.length) * 100) : 0;
      return { lesson, enrolled: lesson.enrolledStudentIds.length, sessionsRecorded: records.length, rate };
    });
  }, [specialLessons, specialLessonReportRecords]);

  const loadMonthlyData = async () => {
    if (!selectedClass || !selectedMonth) return;
    setLoadingMonthly(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = `${selectedMonth}-01`;
    const lastDay = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    // Build array of day strings for the month
    const allDays: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      allDays.push(`${selectedMonth}-${String(d).padStart(2, '0')}`);
    }
    const q = query(
      collection(db, 'attendance'),
      where('schoolId', '==', schoolId!),
      where('class', '==', selectedClass),
      where('date', '>=', firstDay),
      where('date', '<=', lastDay)
    );
    const snap = await getDocs(q);
    const dailyRecords = snap.docs.map(d => {
      const data = d.data();
      return { studentId: data.studentId as string, date: data.date as string, status: data.status as AttendanceStatus };
    });

    // Reconcile against subject attendance (see attendanceConflict.ts) so this grid never
    // disagrees with what parents see for the same student/day. Filtered to schoolId+classId
    // only (no date range) to reuse the same equality-only query the Subject Report tab
    // already makes — an added date range here would need a new composite index.
    let monthSubjectDocs: SubjectAttendance[] = [];
    if (attendanceMode !== 'daily_only' && schoolId) {
      const classId = classRows.find(c => c.name === selectedClass)?.id;
      if (classId) {
        const subjSnap = await getDocs(query(
          collection(db, 'subjectAttendance'),
          where('schoolId', '==', schoolId),
          where('classId', '==', classId),
        ));
        monthSubjectDocs = subjSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as SubjectAttendance) }))
          .filter(data => data.attendanceDate >= firstDay && data.attendanceDate <= lastDay);
      }
    }
    setMonthlySubjectRecords(monthSubjectDocs);
    setExpandedCell(null);
    const subjectRecords = monthSubjectDocs.map(data => ({
      studentId: data.studentId, attendanceDate: data.attendanceDate, status: data.status, inheritedFromDaily: data.inheritedFromDaily,
    }));

    // Build lookup: studentId -> day -> effective status
    const lookup = buildEffectiveAttendanceByStudent(dailyRecords, subjectRecords);
    const rows = students.map(s => {
      const cells: Record<string, AttendanceStatus | null> = {};
      let present = 0, absent = 0, late = 0, school_trip = 0;
      allDays.forEach(day => {
        const st = lookup[s.id!]?.[day] || null;
        cells[day] = st;
        if (st === 'present') present++;
        else if (st === 'absent') absent++;
        else if (st === 'late') late++;
        else if (st === 'school_trip') school_trip++;
      });
      const total = present + absent + late + school_trip;
      return { studentId: s.id!, studentName: s.studentName, cells, present, absent, late, school_trip, rate: total > 0 ? Math.round(((present + school_trip) / total) * 100) : 0 };
    }).sort((a, b) => a.studentName.localeCompare(b.studentName));
    setMonthlyData(rows);
    setLoadingMonthly(false);
  };

  const sendAIAlert = async (row: typeof reportData[0]) => {
    setAiAlertLoading(row.studentId);
    const tid = toast.loading(`Generating alert for ${row.studentName}…`);
    try {
      const msg = await suggestAttendanceAlert(row.studentName, row.rate, row.absent);
      // Store as a notification in Firestore (parent will see it)
      const student = students.find(s => s.id === row.studentId);
      if (student?.guardianUserId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: student.guardianUserId,
          title: `Attendance Alert — ${row.studentName}`,
          body: msg || `Attendance rate is ${row.rate}% with ${row.absent} absences.`,
          type: 'attendance',
          read: false,
          createdAt: serverTimestamp(),
          schoolId: schoolId ?? undefined,
        });
        toast.success(`Alert sent to parent of ${row.studentName}`, { id: tid });
      } else {
        // No linked parent — show the generated message to the admin
        toast.success('Alert generated (no linked parent account)', { id: tid });
        alert(`AI Alert for ${row.studentName}:\n\n${msg}`);
      }
    } catch (e: any) {
      toast.error('Failed to generate alert', { id: tid });
    } finally {
      setAiAlertLoading(null);
    }
  };

  const filtered = attendanceRows.filter(r =>
    r.studentName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const summary = {
    present: attendanceRows.filter(r => r.status === 'present').length,
    absent: attendanceRows.filter(r => r.status === 'absent').length,
    late: attendanceRows.filter(r => r.status === 'late').length,
    school_trip: attendanceRows.filter(r => r.status === 'school_trip').length,
  };

  const statusIcon = (status: AttendanceStatus) => {
    if (status === 'school_trip') return <Users className="w-5 h-5 text-blue-600" />;
    if (status === 'present') return <CheckCircle className="w-5 h-5 text-emerald-600" />;
    if (status === 'absent') return <XCircle className="w-5 h-5 text-rose-500" />;
    return <Clock className="w-5 h-5 text-amber-500" />;
  };

  const statusBg = (status: AttendanceStatus) => {
    if (status === 'school_trip') return 'bg-blue-50 border-blue-200';
    if (status === 'present') return 'bg-emerald-50 border-emerald-200';
    if (status === 'absent') return 'bg-rose-50 border-rose-200';
    return 'bg-amber-50 border-amber-200';
  };

  const exportAllAttendance = async () => {
    if (!schoolId) return;
    const tid = toast.loading('Preparing export…');
    try {
      const snap = await getDocs(query(collection(db, 'attendance'), where('schoolId', '==', schoolId)));
      const nameById = Object.fromEntries(students.map(s => [s.id, s.studentName]));
      exportAttendanceCsv(snap.docs.map(d => {
        const data = d.data() as Attendance;
        return { ...data, studentName: nameById[data.studentId] ?? '' };
      }));
      toast.success('Attendance CSV downloaded', { id: tid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed', { id: tid });
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            Attendance Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Mark and track daily attendance for each class.</p>
        </div>
        <button
          type="button"
          onClick={exportAllAttendance}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Class</label>
            <ClassSelect
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              options={classRows.map(c => c.name)}
              placeholder="Select class..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab('mark'); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'mark' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Mark Attendance
            </button>
            {attendanceMode !== 'daily_only' && (
              <button
                onClick={() => setActiveTab('subject_mark')}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'subject_mark' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <BookOpen className="w-4 h-4 inline mr-1.5" />
                Subject Attendance
              </button>
            )}
            <button
              onClick={() => { setActiveTab('report'); loadReport(); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'report' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <BarChart3 className="w-4 h-4 inline mr-1.5" />
              Report
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'monthly' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Calendar className="w-4 h-4 inline mr-1.5" />
              Monthly
            </button>
            {attendanceMode !== 'daily_only' && (
              <button
                onClick={() => setActiveTab('subject_report')}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'subject_report' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <BarChart3 className="w-4 h-4 inline mr-1.5" />
                Subject Report
              </button>
            )}
            <button
              onClick={() => { setActiveTab('special_lessons_report'); loadSpecialLessonsReport(); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'special_lessons_report' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Sparkles className="w-4 h-4 inline mr-1.5" />
              Special Lessons
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'mark' && selectedClass && (
        <>
          {/* Summary + Quick Actions */}
          <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold border border-emerald-100">
                ✓ Present: {summary.present}
              </span>
              <span className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-xl text-sm font-semibold border border-rose-100">
                ✗ Absent: {summary.absent}
              </span>
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-sm font-semibold border border-amber-100">
                ⏰ Late: {summary.late}
              </span>
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold border border-blue-100">School trip: {summary.school_trip}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAllStatus('present')} className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors">All Present</button>
              <button onClick={() => setAllStatus('absent')} className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors">All Absent</button>
              <button onClick={() => setAllStatus('school_trip')} className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200">All School Trip</button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>

          <EarlyDepartures schoolId={schoolId} className={selectedClass} date={selectedDate} students={attendanceRows} editable />
          {/* Student List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>{selectedClass ? 'No students found in this class.' : 'Select a class to begin.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((row, i) => (
                  <motion.div
                    key={row.studentId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors`}
                    onClick={() => toggleStatus(row.studentId)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                        {i + 1}
                      </div>
                      <p className="font-medium text-slate-800 text-sm">{row.studentName}</p>
                      {isOnApprovedLeave(row.studentId, selectedDate) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                          On approved leave
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold capitalize ${statusBg(row.status)}`}>
                      {statusIcon(row.status)}
                      <span className={row.status === 'present' ? 'text-emerald-700' : row.status === 'absent' ? 'text-rose-700' : row.status === 'school_trip' ? 'text-blue-700' : 'text-amber-700'}>
                        {attendanceStatusLabel(row.status)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {attendanceRows.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Attendance'}
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'report' && (
        <><EarlyDepartures schoolId={schoolId} className={selectedClass} /><div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Attendance Summary — {selectedClass || 'All Classes'}</h2>
          </div>
          {loadingReport ? (
            <div className="py-16 text-center text-slate-400">Loading report...</div>
          ) : reportData.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No attendance data available. Select a class and click Report.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">Student</th>
                    <th className="text-center px-4 py-3">Present</th>
                    <th className="text-center px-4 py-3">Absent</th>
                    <th className="text-center px-4 py-3">Late</th>
                    <th className="text-center px-4 py-3">School trip</th>
                    <th className="text-center px-4 py-3" title="School trips count as attended">Rate</th>
                    <th className="text-center px-4 py-3">Alert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map(row => (
                    <tr key={row.studentName} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{row.studentName}</td>
                      <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{row.present}</td>
                      <td className="px-4 py-3 text-center text-rose-600 font-semibold">{row.absent}</td>
                      <td className="px-4 py-3 text-center text-amber-600 font-semibold">{row.late}</td>
                      <td className="px-4 py-3 text-center text-blue-600 font-semibold">{row.school_trip}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-slate-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${row.rate >= 80 ? 'bg-emerald-500' : row.rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.rate}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${row.rate >= 80 ? 'text-emerald-700' : row.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{row.rate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.rate < 75 && (
                          <button
                            onClick={() => sendAIAlert(row)}
                            disabled={aiAlertLoading === row.studentId}
                            title="Send AI attendance alert to parent"
                            className="p-1.5 text-violet-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {aiAlertLoading === row.studentId
                              ? <span className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-500 rounded-full animate-spin inline-block" />
                              : <Sparkles className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      )}

      {/* ── Subject Attendance (mark) Tab ── */}
      {activeTab === 'subject_mark' && attendanceMode !== 'daily_only' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                Subject Attendance
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Pre-filled from that day's Daily Attendance — only click to change a student who differs for this lesson.
              </p>
            </div>
            {selectedClass && markSubjectOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="subject-mark-subject" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Subject</label>
                <select
                  id="subject-mark-subject"
                  value={markSubject}
                  onChange={e => setMarkSubject(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {markSubjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {!selectedClass ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Select a class and date above to take subject attendance.</p>
            </div>
          ) : markSubjectOptions.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No subjects are assigned to {selectedClass} yet.</p>
              <p className="text-xs text-slate-400 mt-1">Assign them under Class Management → Subjects.</p>
            </div>
          ) : subjectMarkRows.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                {markRoster ? `No students in ${selectedClass} are enrolled in ${markSubject}.` : `No students found in ${selectedClass}.`}
              </p>
            </div>
          ) : (
            <>
              {markRoster && (
                <p className="text-xs text-slate-500">
                  Showing the <span className="font-semibold">{subjectMarkRows.length}</span> student{subjectMarkRows.length !== 1 ? 's' : ''} enrolled in {markSubject}.
                </p>
              )}
              <div className="flex gap-4 text-xs font-bold">
                <span className="text-emerald-600">{subjectMarkRows.filter(r => r.status === 'present').length} Present</span>
                <span className="text-rose-600">{subjectMarkRows.filter(r => r.status === 'absent').length} Absent</span>
                <span className="text-amber-600">{subjectMarkRows.filter(r => r.status === 'late').length} Late</span>
                <span className="text-blue-600">{subjectMarkRows.filter(r => r.status === 'school_trip').length} School trip</span>
                <span className="text-slate-400">/ {subjectMarkRows.length} Total</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase w-12">#</th>
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Student</th>
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {subjectMarkRows.map((row, i) => (
                      <tr key={row.studentId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 text-sm text-slate-400 font-medium">{i + 1}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">{row.studentName}</span>
                            {row.inherited && (
                              <span title="Inherited from Daily Attendance — click the status to override" className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-slate-50 text-slate-500 border-slate-200">
                                Inherited
                              </span>
                            )}
                            {isOnApprovedLeave(row.studentId, selectedDate) && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                                On approved leave
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => cycleSubjectMark(row.studentId)}
                            aria-label={`${row.studentName}: ${attendanceStatusLabel(row.status)}. Click to change`}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase cursor-pointer transition-all hover:scale-105 ${statusBg(row.status)}`}
                          >
                            {statusIcon(row.status)}
                            <span className={row.status === 'present' ? 'text-emerald-700' : row.status === 'absent' ? 'text-rose-700' : row.status === 'school_trip' ? 'text-blue-700' : 'text-amber-700'}>
                              {attendanceStatusLabel(row.status)}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveSubjectMarks}
                  disabled={savingSubjectMarks}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60"
                >
                  {savingSubjectMarks
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Save className="w-4 h-4" />}
                  {subjectMarksSaved
                    ? 'Saved!'
                    : `Save ${markSubject} attendance for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB')}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Subject Attendance Report Tab ── */}
      {activeTab === 'subject_report' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Subject Attendance — {selectedClass || 'Select a class'}</h2>
            {subjectReportRecords.length > 0 && (
              <button
                onClick={() => {
                  const nameById = Object.fromEntries(students.map(s => [s.id, s.studentName]));
                  exportSubjectAttendanceCsv(subjectReportRecords.map(r => ({ ...r, studentName: nameById[r.studentId] ?? r.studentName })));
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
          </div>

          {loadingSubjectReport ? (
            <div className="py-16 text-center text-slate-400">Loading…</div>
          ) : !selectedClass ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">Select a class above, then reopen this tab.</div>
          ) : subjectReportRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">No subject attendance recorded for this class yet.</div>
          ) : (
            <>
              {/* Scope: follow the date picker above, or roll every recorded date together */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                  {([
                    { id: 'day', label: 'Selected day' },
                    { id: 'all', label: 'All recorded dates' },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSubjectScope(opt.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${subjectScope === opt.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  {subjectScope === 'day'
                    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Each cell shows lessons attended (including school trips) / lessons recorded'}
                </p>
              </div>

              {subjectMatrix.lessonCount === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">
                  No subject attendance was recorded for {selectedClass} on this date.
                  <button onClick={() => setSubjectScope('all')} className="block mx-auto mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                    Show all recorded dates
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="sticky left-0 z-10 bg-slate-50 text-left px-5 py-3 min-w-[11rem] border-r border-slate-100">Student</th>
                          {subjectMatrix.subjects.map(subject => (
                            <th key={subject} className="text-center px-3 py-3 min-w-[6rem] normal-case tracking-normal font-bold">{subject}</th>
                          ))}
                          <th className="text-center px-4 py-3 border-l border-slate-100">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[...students].sort((a, b) => a.studentName.localeCompare(b.studentName)).map(student => {
                          const row = subjectMatrix.cells[student.id!] ?? {};
                          const total = subjectMatrix.totalsByStudent[student.id!];
                          const totalLessons = total ? total.present + total.absent + total.late + total.school_trip : 0;
                          return (
                            <tr key={student.id} className="hover:bg-slate-50/60">
                              <td className="sticky left-0 z-10 bg-white px-5 py-3 font-medium text-slate-800 border-r border-slate-100 whitespace-nowrap">{student.studentName}</td>
                              {subjectMatrix.subjects.map(subject => {
                                const c = row[subject];
                                if (!c) {
                                  const enrolled = subjectEnrolment[subject];
                                  const notTaking = enrolled && !enrolled.includes(student.id!);
                                  return (
                                    <td key={subject} className="px-3 py-3 text-center text-xs" title={notTaking ? 'Not enrolled in this subject' : 'No attendance recorded'}>
                                      <span className={notTaking ? 'text-slate-300' : 'text-slate-400'}>{notTaking ? 'n/a' : '–'}</span>
                                    </td>
                                  );
                                }
                                const cellTotal = c.present + c.absent + c.late + c.school_trip;
                                if (subjectScope === 'all') {
                                  const tone = c.absent > 0 ? 'bg-rose-50 text-rose-700' : c.late > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
                                  return (
                                    <td key={subject} className="px-3 py-3 text-center" title={`${c.present} present, ${c.absent} absent, ${c.late} late, ${c.school_trip} school trip`}>
                                      <span className={`inline-block min-w-[2.75rem] px-2 py-0.5 rounded-lg text-xs font-bold ${tone}`}>{c.present + c.school_trip}/{cellTotal}</span>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={subject} className="px-3 py-3 text-center">
                                    <div className="inline-flex gap-1">
                                      {ATTENDANCE_STATUSES.flatMap(status =>
                                        Array.from({ length: c[status] }, (_, i) => (
                                          <span
                                            key={`${status}-${i}`}
                                            title={attendanceStatusLabel(status)}
                                            className={`inline-flex items-center justify-center w-7 h-6 rounded-lg text-[11px] font-bold ${
                                              status === 'present' ? 'bg-emerald-100 text-emerald-700'
                                              : status === 'absent' ? 'bg-rose-100 text-rose-700'
                                              : status === 'school_trip' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                            }`}
                                          >
                                            {status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'school_trip' ? 'ST' : 'L'}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 text-center border-l border-slate-100 whitespace-nowrap">
                                {total ? (
                                  <span className={`text-xs font-bold ${total.absent > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {total.present + total.school_trip}/{totalLessons}
                                  </span>
                                ) : <span className="text-slate-300 text-xs">–</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr className="border-t border-slate-200">
                          <td className="sticky left-0 z-10 bg-slate-50 px-5 py-3 border-r border-slate-100">Class total</td>
                          {subjectMatrix.subjects.map(subject => {
                            const t = subjectMatrix.totalsBySubject[subject];
                            return (
                              <td key={subject} className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-emerald-700">{t.present}</span>
                                <span className="text-slate-300"> · </span>
                                <span className={t.absent > 0 ? 'text-rose-600' : 'text-slate-400'}>{t.absent}</span>
                                {t.school_trip > 0 && <><span className="text-slate-300"> · </span><span className="text-blue-600">{t.school_trip} ST</span></>}
                                {t.late > 0 && <><span className="text-slate-300"> · </span><span className="text-amber-600">{t.late}</span></>}
                              </td>
                            );
                          })}
                          <td className="border-l border-slate-100" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span><span className="font-bold text-emerald-700">P</span> present</span>
                    <span><span className="font-bold text-rose-700">A</span> absent</span>
                    <span><span className="font-bold text-amber-700">L</span> late</span>
                    <span><span className="text-slate-400">–</span> not recorded</span>
                    <span><span className="text-slate-300">n/a</span> not enrolled in this subject</span>
                    <span className="ml-auto">Class total = present · absent (· late · school trip, if any). Subjects with no attendance recorded {subjectScope === 'day' ? 'on this date ' : ''}are not shown.</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Special Lessons Report Tab ── */}
      {activeTab === 'special_lessons_report' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Special Lessons Summary</h2>
            {specialLessonReportRecords.length > 0 && (
              <button
                onClick={() => {
                  const lessonNameById = Object.fromEntries(specialLessons.map(l => [l.id, l.name]));
                  const nameById = Object.fromEntries(students.map(s => [s.id, s.studentName]));
                  exportSpecialLessonAttendanceCsv(specialLessonReportRecords.map(r => ({
                    ...r, lessonName: lessonNameById[r.specialLessonId], studentName: nameById[r.studentId],
                  })));
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
          </div>

          {loadingSpecialLessonReport ? (
            <div className="py-16 text-center text-slate-400">Loading…</div>
          ) : specialLessonSummary.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">No special lessons found.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-5 py-3">Lesson</th>
                      <th className="text-left px-4 py-3">Teacher(s)</th>
                      <th className="text-center px-4 py-3">Enrolled</th>
                      <th className="text-center px-4 py-3">Sessions Recorded</th>
                      <th className="text-center px-4 py-3">Attendance Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {specialLessonSummary.map(({ lesson, enrolled, sessionsRecorded, rate }) => (
                      <tr key={lesson.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{lesson.name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{(lesson.teacherNames || []).join(', ') || '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-700 font-semibold">{enrolled}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{sessionsRecorded}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">{sessionsRecorded > 0 ? `${rate}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly View Tab */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <EarlyDepartures schoolId={schoolId} className={selectedClass} month={selectedMonth} />
          {/* Month controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Month</label>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <button onClick={loadMonthlyData} disabled={!selectedClass || loadingMonthly}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm disabled:opacity-60">
              {loadingMonthly ? <><Clock className="w-4 h-4 animate-spin" /> Loading…</> : <><Calendar className="w-4 h-4" /> Load Month</>}
            </button>
            {monthlyData.length > 0 && (
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
                Print / PDF
              </button>
            )}
          </div>

          {!selectedClass && (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Select a class above to view monthly attendance.</p>
            </div>
          )}

          {selectedClass && monthlyData.length === 0 && !loadingMonthly && (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Click "Load Month" to display the monthly attendance grid.</p>
            </div>
          )}

          {monthlyData.length > 0 && (() => {
            const [year, month] = selectedMonth.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            const days = Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              return `${selectedMonth}-${String(d).padStart(2, '0')}`;
            });
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    {selectedClass} — {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="flex flex-wrap gap-3 text-xs font-medium">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 inline-block" />Present</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-200 inline-block" />Absent</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" />Late</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 inline-block" />School trip</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 inline-block" />No record</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-100 inline-block" />Weekend</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />Left early</span>
                    {attendanceMode !== 'daily_only' && (
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />Missed a subject lesson</span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: `${200 + daysInMonth * 30}px` }}>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-left font-bold text-slate-500 sticky left-0 bg-slate-50 z-10 min-w-[140px]">Student</th>
                        {days.map(d => (
                          <th key={d} title={attendanceDayTitle(d)} className={`px-1 py-2 text-center font-bold min-w-[28px] ${isAttendanceWeekend(d) ? 'bg-violet-100 text-violet-700' : 'text-slate-400'}`}>
                            {Number(d.split('-')[2])}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">P</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">A</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">L</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">ST</th>
                        <th className="px-3 py-2 text-center font-bold text-purple-700 min-w-[60px]" title="Early departures">E</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthlyData.map(row => (
                        <tr key={row.studentId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-1.5 font-medium text-slate-800 sticky left-0 bg-white z-10">{row.studentName}</td>
                          {days.map(d => {
                            const st = row.cells[d];
                            const bg = st === 'present' ? 'bg-emerald-200' : st === 'absent' ? 'bg-rose-200' : st === 'late' ? 'bg-amber-200' : st === 'school_trip' ? 'bg-blue-200' : 'bg-slate-100';
                            const title = st ? attendanceStatusLabel(st) : '—';
                            const lessons = monthlyLessons[`${row.studentId}|${d}`] ?? [];
                            const departures = departureRecords.filter(r => r.studentId === row.studentId && r.date === d);
                            const expandable = departures.length > 0 || (attendanceMode !== 'daily_only' && (!!st || lessons.length > 0));
                            if (!expandable) {
                              return <td key={d} className={`px-1 py-1.5 text-center ${isAttendanceWeekend(d) ? 'bg-violet-50' : ''}`}><span title={title} className={`inline-block w-5 h-5 rounded ${bg}`} /></td>;
                            }
                            const missed = lessons.filter(l => l.status === 'absent').length;
                            // The daily register can say present/late while individual lessons were missed —
                            // flag those days so they stand out without opening every cell.
                            const partial = missed > 0 && st !== 'absent';
                            const isOpen = expandedCell?.studentId === row.studentId && expandedCell.date === d;
                            return (
                              <td key={d} className={`px-1 py-1.5 text-center ${isOpen ? 'bg-indigo-50' : isAttendanceWeekend(d) ? 'bg-violet-50' : ''}`}>
                                <button
                                  type="button"
                                  title={`${title}${departures.length ? ` — ${departures.map(departureDescription).join('; ')}` : ''}${partial ? ` — missed ${missed} subject lesson${missed === 1 ? '' : 's'}` : ''} — click for subjects`}
                                  aria-label={`${row.studentName}, ${d}: ${title}${departures.length ? ' — left early' : ''}. Show attendance details`}
                                  aria-expanded={isOpen}
                                  onClick={() => setExpandedCell(isOpen ? null : { studentId: row.studentId, date: d })}
                                  className={`relative inline-block w-5 h-5 rounded cursor-pointer hover:ring-2 hover:ring-indigo-300 ${bg} ${isOpen ? 'ring-2 ring-indigo-400' : ''}`}
                                >
                                  {partial && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 border border-white" />}
                                  {departures.length > 0 && <span className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-purple-600 border border-white" />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-center font-bold text-emerald-700">{row.present}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-rose-600">{row.absent}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-amber-600">{row.late}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-blue-600">{row.school_trip}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-purple-700">{departureRecords.filter(r => r.studentId === row.studentId && r.date.startsWith(selectedMonth)).length}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`font-bold ${row.rate >= 80 ? 'text-emerald-700' : row.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {row.rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Summary row */}
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-600">
                        <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10">Total</td>
                        {days.map(d => {
                          const cnt = monthlyData.filter(r => r.cells[d] === 'present').length;
                          return <td key={d} className={`px-1 py-2 text-center text-[10px] text-emerald-700 ${isAttendanceWeekend(d) ? 'bg-violet-100' : ''}`}>{cnt > 0 ? cnt : ''}</td>;
                        })}
                        <td className="px-3 py-2 text-center text-emerald-700">{monthlyData.reduce((s, r) => s + r.present, 0)}</td>
                        <td className="px-3 py-2 text-center text-rose-600">{monthlyData.reduce((s, r) => s + r.absent, 0)}</td>
                        <td className="px-3 py-2 text-center text-amber-600">{monthlyData.reduce((s, r) => s + r.late, 0)}</td>
                        <td className="px-3 py-2 text-center text-blue-600">{monthlyData.reduce((s, r) => s + r.school_trip, 0)}</td>
                        <td className="px-3 py-2 text-center text-purple-700">{departureRecords.filter(r => r.date.startsWith(selectedMonth) && monthlyData.some(row => row.studentId === r.studentId)).length}</td>
                        <td className="px-3 py-2 text-center">
                          {monthlyData.length > 0 ? Math.round(monthlyData.reduce((s, r) => s + r.rate, 0) / monthlyData.length) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Subject breakdown for the clicked student/day (only when the school records subject attendance) */}
                {expandedCell && (() => {
                  const openRow = monthlyData.find(r => r.studentId === expandedCell.studentId);
                  if (!openRow) return null;
                  const lessons = monthlyLessons[`${expandedCell.studentId}|${expandedCell.date}`] ?? [];
                  const dailyStatus = openRow.cells[expandedCell.date];
                  const missedNames = lessons.filter(l => l.status === 'absent').map(l => l.subjectName);
                  const lateNames = lessons.filter(l => l.status === 'late').map(l => l.subjectName);
                  return (
                    <div className="border-t border-indigo-100 bg-indigo-50/40 p-5 print:hidden">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            {openRow.studentName} — {new Date(expandedCell.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Daily register: <span className="font-semibold capitalize">{attendanceStatusLabel(dailyStatus ?? 'not recorded')}</span>
                            {lessons.length > 0 && <> · {lessons.filter(l => l.status === 'present').length} of {lessons.length} lessons present</>}
                          </p>
                        </div>
                        <button onClick={() => setExpandedCell(null)} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close subject breakdown">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                      <EarlyDepartures schoolId={schoolId} studentId={expandedCell.studentId} date={expandedCell.date} />
                      {lessons.length === 0 ? (
                        <p className="text-xs text-slate-400 py-3 text-center">No per-subject records for this day — daily attendance only.</p>
                      ) : (
                        <>
                          {(missedNames.length > 0 || lateNames.length > 0) && (
                            <p className="text-xs mb-3 text-slate-600">
                              {missedNames.length > 0 && <><span className="font-bold text-rose-600">Missed:</span> {missedNames.join(', ')}</>}
                              {missedNames.length > 0 && lateNames.length > 0 && <span className="text-slate-300"> · </span>}
                              {lateNames.length > 0 && <><span className="font-bold text-amber-600">Late:</span> {lateNames.join(', ')}</>}
                            </p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {lessons.map(l => (
                              <div key={l.id ?? `${l.subjectName}-${l.timetablePeriodId ?? ''}`} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-100">
                                <span className="text-sm font-medium text-slate-700">{l.subjectName}</span>
                                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                                  l.status === 'present' ? 'bg-emerald-100 text-emerald-700'
                                  : l.status === 'absent' ? 'bg-rose-100 text-rose-700'
                                  : l.status === 'school_trip' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>{attendanceStatusLabel(l.status)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      )}

      {!selectedClass && activeTab === 'mark' && (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Select a class and date above to begin marking attendance.</p>
        </div>
      )}
    </div>
  );
}
