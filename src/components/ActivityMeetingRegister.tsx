import React, { useRef, useState } from 'react';
import type { ActivityMeeting, SpecialLesson, SpecialLessonAttendance, Student } from '../types';
import type { AttendanceStatus } from '../utils/attendanceStatus';
import { completeClubMarks, clubDateError } from '../utils/clubAttendance';
import { saveMeetingAttendance } from '../services/activityMeetingService';
import { useAuth } from './FirebaseProvider';
import toast from 'react-hot-toast';

export default function ActivityMeetingRegister({ activity, meeting, students, attendance, today, canRecord }: {
  activity: SpecialLesson; meeting: ActivityMeeting; students: Student[]; attendance: SpecialLessonAttendance[]; today: string; canRecord: boolean;
}) {
  const { user } = useAuth();
  const [edits, setEdits] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const saved = Object.fromEntries(attendance.filter(r => r.meetingId === meeting.id).map(r => [r.studentId, r.status]));
  const marks = { ...saved, ...edits };
  const dateError = clubDateError(activity, meeting.date, today);
  const editable = canRecord && meeting.status !== 'cancelled' && activity.status === 'active' && !dateError && !saving;
  const save = async () => {
    if (!editable || !user || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await saveMeetingAttendance(activity, meeting, students, marks, user.uid, today); setEdits({}); toast.success('Meeting attendance saved.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save attendance.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="space-y-4">
    <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4"><h3 className="font-bold">{meeting.title}</h3><p className="text-sm text-slate-600 mt-1">{meeting.date} · {meeting.startTime}–{meeting.endTime}{meeting.location ? ` · ${meeting.location}` : ''}</p></div>
    {meeting.status === 'cancelled' && <p role="status" className="bg-amber-50 text-amber-800 rounded-xl p-4 text-sm">This meeting is cancelled. Attendance is read-only and excluded from attendance totals and exports.</p>}
    {dateError && <p role="status" className="text-amber-700 text-sm">{dateError}</p>}
    {activity.status !== 'active' && <p className="text-sm text-slate-500">This activity is archived or inactive. Its registers remain available to view.</p>}
    {!students.length ? <p className="text-sm text-slate-500 py-6">No active members. An administrator can add students in Members.</p> : <>
      {meeting.status !== 'cancelled' && <div className="flex flex-wrap gap-3 text-sm"><span>{students.filter(s => marks[s.id!] === 'present').length} present</span><span>{students.filter(s => marks[s.id!] === 'absent').length} absent</span><span>{students.filter(s => marks[s.id!] === 'late').length} late</span><span>{students.filter(s => !marks[s.id!]).length} unmarked</span></div>}
      <button disabled={!editable} type="button" onClick={() => setEdits(Object.fromEntries(students.map(s => [s.id!, 'present'])))} className="border px-3 py-2 rounded-xl text-sm disabled:opacity-40">Mark all present</button>
      <div className="overflow-x-auto border rounded-2xl"><table className="w-full text-sm text-left"><thead className="bg-slate-50"><tr><th className="p-3">Student</th><th className="p-3">Main class</th><th className="p-3">Attendance</th></tr></thead><tbody>{students.map(s => <tr key={s.id} className="border-t"><td className="p-3 font-medium">{s.studentName}</td><td className="p-3 text-slate-500">{s.currentClass}</td><td className="p-3"><select aria-label={`Attendance for ${s.studentName}`} disabled={!editable} value={marks[s.id!] ?? ''} onChange={e => setEdits(prev => ({ ...prev, [s.id!]: e.target.value as AttendanceStatus }))} className="border rounded-xl p-2 bg-white"><option value="">Not marked</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="school_trip">School trip</option></select></td></tr>)}</tbody></table></div>
      <button disabled={!editable || !completeClubMarks(students, marks)} onClick={save} className="bg-indigo-600 text-white rounded-xl px-5 py-2.5 font-semibold disabled:opacity-40">{saving ? 'Saving…' : 'Save meeting attendance'}</button>
    </>}
  </div>;
}
