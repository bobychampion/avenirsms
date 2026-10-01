import { attendanceStatusLabel, type AttendanceStatus } from '../../utils/attendanceStatus';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Student, SubjectAttendance } from '../../types';
import { suggestAttendanceAlert } from '../../services/geminiService';
import { buildEffectiveAttendanceByStudent } from '../../utils/attendanceConflict';
import { dedupeSubjectLessons } from '../../utils/subjectAttendanceMatrix';
import toast from 'react-hot-toast';
import {
  BarChart3, Calendar, Users, Sparkles, Clock, ClipboardList, XCircle,
} from 'lucide-react';

type AttStatus = AttendanceStatus;

interface Props {
  /** Which of the two views to render — the tab row lives in the parent (TeacherPortal),
      alongside its existing "Mark Attendance" button, so this component owns no tab UI. */
  view: 'report' | 'monthly';
  schoolId: string | null | undefined;
  /** Class currently selected on the Attendance tab (shared with Mark Attendance). */
  selectedClass: string;
  /** Firestore doc id for `selectedClass`, when known — needed to look up subject attendance. */
  classId: string | undefined;
  /** Roster for `selectedClass` — already loaded by the parent for the Mark Attendance table. */
  students: Student[];
  attendanceMode: 'daily_only' | 'daily_and_subject' | 'subject_only';
}

/**
 * Report + Monthly views for a teacher's own classes — the same two views the admin
 * Attendance page offers, scoped down to whatever class the teacher has selected.
 * Mirrors AttendancePage.tsx's logic (including the daily/subject reconciliation) so a
 * teacher's numbers never disagree with what an admin or parent sees for the same student.
 */
export default function AttendanceReports({ view, schoolId, selectedClass, classId, students, attendanceMode }: Props) {
  // ── Report ──────────────────────────────────────────────────────────────────
  const [reportData, setReportData] = useState<{ studentId: string; studentName: string; present: number; absent: number; late: number; school_trip: number; rate: number }[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [aiAlertLoading, setAiAlertLoading] = useState<string | null>(null);

  const loadReport = async () => {
    if (!selectedClass || !schoolId) return;
    setLoadingReport(true);
    try {
      const snap = await getDocs(query(collection(db, 'attendance'), where('schoolId', '==', schoolId), where('class', '==', selectedClass)));
      const dailyRecords = snap.docs.map(d => {
        const data = d.data();
        return { studentId: data.studentId as string, date: data.date as string, status: data.status as AttStatus };
      });

      let subjectRecords: { studentId: string; attendanceDate: string; status: AttStatus; inheritedFromDaily: boolean }[] = [];
      if (attendanceMode !== 'daily_only' && classId) {
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
    } finally {
      setLoadingReport(false);
    }
  };

  // Reload whenever the teacher switches to Report, or changes class while it's open.
  useEffect(() => {
    if (view === 'report' && selectedClass) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedClass, classId, attendanceMode]);

  const sendAIAlert = async (row: typeof reportData[0]) => {
    setAiAlertLoading(row.studentId);
    const tid = toast.loading(`Generating alert for ${row.studentName}…`);
    try {
      const msg = await suggestAttendanceAlert(row.studentName, row.rate, row.absent);
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
        toast.success('Alert generated (no linked parent account)', { id: tid });
        alert(`AI Alert for ${row.studentName}:\n\n${msg}`);
      }
    } catch {
      toast.error('Failed to generate alert', { id: tid });
    } finally {
      setAiAlertLoading(null);
    }
  };

  // ── Monthly ─────────────────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthlyData, setMonthlyData] = useState<{
    studentId: string; studentName: string;
    cells: Record<string, AttStatus | null>;
    present: number; absent: number; late: number; school_trip: number; rate: number;
  }[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [monthlySubjectRecords, setMonthlySubjectRecords] = useState<SubjectAttendance[]>([]);
  const [expandedCell, setExpandedCell] = useState<{ studentId: string; date: string } | null>(null);

  const loadMonthlyData = async () => {
    if (!selectedClass || !selectedMonth || !schoolId) return;
    setLoadingMonthly(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = `${selectedMonth}-01`;
    const lastDay = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    const allDays: string[] = Array.from({ length: daysInMonth }, (_, i) => `${selectedMonth}-${String(i + 1).padStart(2, '0')}`);

    try {
      const snap = await getDocs(query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('class', '==', selectedClass),
        where('date', '>=', firstDay),
        where('date', '<=', lastDay),
      ));
      const dailyRecords = snap.docs.map(d => {
        const data = d.data();
        return { studentId: data.studentId as string, date: data.date as string, status: data.status as AttStatus };
      });

      let monthSubjectDocs: SubjectAttendance[] = [];
      if (attendanceMode !== 'daily_only' && classId) {
        const subjSnap = await getDocs(query(
          collection(db, 'subjectAttendance'),
          where('schoolId', '==', schoolId),
          where('classId', '==', classId),
        ));
        monthSubjectDocs = subjSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as SubjectAttendance) }))
          .filter(data => data.attendanceDate >= firstDay && data.attendanceDate <= lastDay);
      }
      setMonthlySubjectRecords(monthSubjectDocs);
      setExpandedCell(null);
      const subjectRecords = monthSubjectDocs.map(data => ({
        studentId: data.studentId, attendanceDate: data.attendanceDate, status: data.status, inheritedFromDaily: data.inheritedFromDaily,
      }));

      const lookup = buildEffectiveAttendanceByStudent(dailyRecords, subjectRecords);
      const rows = students.map(s => {
        const cells: Record<string, AttStatus | null> = {};
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
    } finally {
      setLoadingMonthly(false);
    }
  };

  // Real lessons per student per day for the loaded month, keyed "studentId|YYYY-MM-DD".
  const monthlyLessons = useMemo(() => {
    const byCell: Record<string, SubjectAttendance[]> = {};
    dedupeSubjectLessons<SubjectAttendance>(monthlySubjectRecords).forEach(r => {
      (byCell[`${r.studentId}|${r.attendanceDate}`] ??= []).push(r);
    });
    Object.values(byCell).forEach(list => list.sort((a, b) => a.subjectName.localeCompare(b.subjectName)));
    return byCell;
  }, [monthlySubjectRecords]);

  // Reset the loaded month's data when the class changes so stale numbers never show under a
  // new class name — matches admin's "click Load Month" gesture rather than auto-fetching.
  useEffect(() => { setMonthlyData([]); setMonthlySubjectRecords([]); setExpandedCell(null); }, [selectedClass]);

  return (
    <div className="space-y-4">
      {view === 'report' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Attendance Summary — {selectedClass || 'Select a class'}</h2>
          </div>
          {loadingReport ? (
            <div className="py-16 text-center text-slate-400">Loading report...</div>
          ) : reportData.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No attendance recorded for {selectedClass || 'this class'} yet.</p>
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
                    <tr key={row.studentId} className="hover:bg-slate-50">
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
      )}

      {view === 'monthly' && (
        <div className="space-y-4">
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
            const days = Array.from({ length: daysInMonth }, (_, i) => `${selectedMonth}-${String(i + 1).padStart(2, '0')}`);
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    {selectedClass} — {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="flex gap-3 text-xs font-medium">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 inline-block" />Present</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-200 inline-block" />Absent</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" />Late</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 inline-block" />School trip</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 inline-block" />No record</span>
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
                          <th key={d} className="px-1 py-2 text-center font-bold text-slate-400 min-w-[28px]">{Number(d.split('-')[2])}</th>
                        ))}
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">P</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">A</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">L</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">ST</th>
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
                            const expandable = attendanceMode !== 'daily_only' && (!!st || lessons.length > 0);
                            if (!expandable) {
                              return <td key={d} className="px-1 py-1.5 text-center"><span title={title} className={`inline-block w-5 h-5 rounded ${bg}`} /></td>;
                            }
                            const missed = lessons.filter(l => l.status === 'absent').length;
                            const partial = missed > 0 && st !== 'absent';
                            const isOpen = expandedCell?.studentId === row.studentId && expandedCell.date === d;
                            return (
                              <td key={d} className={`px-1 py-1.5 text-center ${isOpen ? 'bg-indigo-50' : ''}`}>
                                <button
                                  type="button"
                                  title={`${title}${partial ? ` — missed ${missed} subject lesson${missed === 1 ? '' : 's'}` : ''} — click for subjects`}
                                  aria-label={`${row.studentName}, ${d}: ${title}. Show subjects`}
                                  aria-expanded={isOpen}
                                  onClick={() => setExpandedCell(isOpen ? null : { studentId: row.studentId, date: d })}
                                  className={`relative inline-block w-5 h-5 rounded cursor-pointer hover:ring-2 hover:ring-indigo-300 ${bg} ${isOpen ? 'ring-2 ring-indigo-400' : ''}`}
                                >
                                  {partial && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 border border-white" />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-center font-bold text-emerald-700">{row.present}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-rose-600">{row.absent}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-amber-600">{row.late}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-blue-600">{row.school_trip}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`font-bold ${row.rate >= 80 ? 'text-emerald-700' : row.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{row.rate}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-600">
                        <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10">Total</td>
                        {days.map(d => {
                          const cnt = monthlyData.filter(r => r.cells[d] === 'present').length;
                          return <td key={d} className="px-1 py-2 text-center text-[10px] text-emerald-700">{cnt > 0 ? cnt : ''}</td>;
                        })}
                        <td className="px-3 py-2 text-center text-emerald-700">{monthlyData.reduce((s, r) => s + r.present, 0)}</td>
                        <td className="px-3 py-2 text-center text-rose-600">{monthlyData.reduce((s, r) => s + r.absent, 0)}</td>
                        <td className="px-3 py-2 text-center text-amber-600">{monthlyData.reduce((s, r) => s + r.late, 0)}</td>
                        <td className="px-3 py-2 text-center text-blue-600">{monthlyData.reduce((s, r) => s + r.school_trip, 0)}</td>
                        <td className="px-3 py-2 text-center">
                          {monthlyData.length > 0 ? Math.round(monthlyData.reduce((s, r) => s + r.rate, 0) / monthlyData.length) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {expandedCell && attendanceMode !== 'daily_only' && (() => {
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
    </div>
  );
}
