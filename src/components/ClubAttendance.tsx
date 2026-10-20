import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, documentId, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './FirebaseProvider';
import { useSchool } from './SchoolContext';
import type { SpecialLesson, SpecialLessonAttendance, Student } from '../types';
import { clubDateError, clubRoster, completeClubMarks } from '../utils/clubAttendance';
import { saveClubAttendance } from '../services/clubAttendanceService';
import { downloadCsv } from '../services/dataExport/csvModules';
import type { AttendanceStatus } from '../utils/attendanceStatus';
import toast from 'react-hot-toast';

export default function ClubAttendance({ schoolId, clubId }: { schoolId: string; clubId: string }) {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { timezone } = useSchool();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [date, setDate] = useState(today);
  const [club, setClub] = useState<SpecialLesson | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [history, setHistory] = useState<SpecialLessonAttendance[]>([]);
  const [edits, setEdits] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dateRef = useRef(date); dateRef.current = date;

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    setLoading(true); setError(''); setEdits({}); setClub(null); setRoster([]);
    const stop = onSnapshot(doc(db, 'special_lessons', clubId), async snap => {
      const version = ++revision;
      setLoading(true);
      try {
        if (!snap.exists() || snap.data().schoolId !== schoolId || snap.data().activityType !== 'club') throw new Error('Club not found.');
        const activity = { ...snap.data(), id: snap.id } as SpecialLesson;
        const all: Student[] = [];
        const ids = [...new Set(activity.enrolledStudentIds)];
        for (let i = 0; i < ids.length; i += 30) {
          const students = await getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId), where(documentId(), 'in', ids.slice(i, i + 30))));
          all.push(...students.docs.map(d => ({ ...d.data(), id: d.id } as Student)));
        }
        if (!cancelled && version === revision) { setClub(activity); setRoster(clubRoster(activity, all)); setError(''); setEdits({}); setLoading(false); }
      } catch (e) {
        if (!cancelled && version === revision) { setError(e instanceof Error ? e.message : 'Unable to load club enrolment.'); setLoading(false); }
      }
    }, () => { if (!cancelled) { setError('Unable to load club. Reload to try again.'); setLoading(false); } });
    return () => { cancelled = true; stop(); };
  }, [schoolId, clubId]);

  useEffect(() => {
    setHistoryReady(false); setHistory([]);
    return onSnapshot(query(collection(db, 'specialLessonAttendance'), where('schoolId', '==', schoolId), where('specialLessonId', '==', clubId)), snap => {
      setHistory(snap.docs.map(d => ({ ...d.data(), id: d.id } as SpecialLessonAttendance))); setHistoryReady(true);
    }, () => { setError('Unable to load attendance history. Reload before saving.'); setHistoryReady(false); });
  }, [schoolId, clubId]);

  const saved = useMemo(() => Object.fromEntries(history.filter(r => r.attendanceDate === date).map(r => [r.studentId, r.status])), [history, date]);
  const marks = { ...saved, ...edits };
  const allowed = !!user && !!club && (isAdmin || isSuperAdmin || club.teacherIds.includes(user.uid));
  const dateError = club ? clubDateError(club, date, today) : '';
  const editable = allowed && !loading && historyReady && !error && !dateError && club?.status === 'active' && !saving;
  const sessions = [...new Set(history.map(r => r.attendanceDate))].sort().reverse();
  const save = async () => {
    if (!editable || !club || !user || savingRef.current) return;
    const savingDate = date;
    savingRef.current = true; setSaving(true);
    try {
      await saveClubAttendance(club, roster, savingDate, marks, user.uid, today);
      if (dateRef.current === savingDate) setEdits({});
      toast.success('Club attendance saved.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Attendance could not be saved.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const exportHistory = () => {
    const names = new Map(roster.map(s => [s.id, s]));
    downloadCsv('club-attendance.csv', ['Club', 'Date', 'Student', 'Main class', 'Status'],
      [...history].sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate)).map(r => [club?.name ?? '', r.attendanceDate, r.studentName ?? names.get(r.studentId)?.studentName ?? r.studentId, r.studentClass ?? names.get(r.studentId)?.currentClass ?? '', r.status]));
  };

  return <section className="space-y-4" aria-label="Club attendance">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="font-bold text-lg">{club?.name ?? 'Club'} — Attendance</h2>
      <label className="text-sm">Date <input aria-label="Club attendance date" type="date" value={date} max={today} disabled={saving} onChange={e => { setDate(e.target.value); setEdits({}); }} className="border rounded-lg p-2" /></label>
      <button onClick={exportHistory} disabled={!historyReady || !history.length} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-40">Export history CSV</button>
    </div>
    <p className="text-sm text-slate-500">Students can belong to different classes. Club attendance is separate from daily and subject attendance.</p>
    {error && <p role="alert" className="text-rose-600">{error}</p>}
    {dateError && <p role="alert" className="text-amber-700">{dateError}</p>}
    {club && club.status !== 'active' && <p className="text-amber-700">This club is {club.status}. Its history is available to view and export.</p>}
    {!allowed && !loading && <p role="alert">Only assigned club leaders and school administrators can record attendance.</p>}
    {loading || !historyReady ? <p>Loading club register…</p> : !error && <>
      <p className="text-sm">{roster.length} enrolled · {roster.filter(s => marks[s.id!] === 'present').length} present · {roster.filter(s => marks[s.id!] === 'absent').length} absent · {roster.filter(s => !marks[s.id!]).length} unmarked</p>
      {!roster.length ? <p>No active students enrolled. Ask an administrator to use Manage Students.</p> : <>
        <button disabled={!editable} onClick={() => setEdits(Object.fromEntries(roster.map(s => [s.id!, 'present' as AttendanceStatus])))} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-40">Mark all present</button>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-3">Student</th><th className="p-3">Main class</th><th className="p-3">Attendance</th></tr></thead><tbody>
          {roster.map(student => <tr key={student.id} className="border-t"><td className="p-3">{student.studentName}</td><td className="p-3">{student.currentClass}</td><td className="p-3">
            <select aria-label={`Attendance for ${student.studentName}`} value={marks[student.id!] ?? ''} disabled={!editable} onChange={e => setEdits(prev => ({ ...prev, [student.id!]: e.target.value as AttendanceStatus }))} className="border rounded-lg p-2">
              <option value="">Not marked</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="school_trip">School trip</option>
            </select></td></tr>)}
        </tbody></table></div>
        <button onClick={save} disabled={!editable || !completeClubMarks(roster, marks)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-40">{saving ? 'Saving…' : 'Save club attendance'}</button>
      </>}
      <div><h3 className="font-semibold">Recorded sessions ({sessions.length})</h3><div className="flex flex-wrap gap-2 mt-2">{sessions.map(day => <button key={day} disabled={saving} onClick={() => { setDate(day); setEdits({}); }} className="border rounded-lg px-3 py-1 text-sm">{day} · {history.filter(r => r.attendanceDate === day).length} recorded</button>)}</div>{!sessions.length && <p className="text-sm text-slate-500">No club attendance recorded yet.</p>}</div>
    </>}
  </section>;
}
