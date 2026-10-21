import { useEffect, useState } from 'react';
import { collection, doc, documentId, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { ActivityMeeting, SpecialLesson, SpecialLessonAttendance, Student } from '../types';
import { clubRoster } from '../utils/clubAttendance';

export function useActivityWorkspace(schoolId: string, activityId: string) {
  const [activity, setActivity] = useState<SpecialLesson | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [meetings, setMeetings] = useState<ActivityMeeting[]>([]);
  const [attendance, setAttendance] = useState<SpecialLessonAttendance[]>([]);
  const [ready, setReady] = useState({ roster: false, meetings: false, attendance: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    setActivity(null); setStudents([]); setMeetings([]); setAttendance([]); setErrors({}); setReady({ roster: false, meetings: false, attendance: false });
    const fail = (key: string, message: string) => { if (!cancelled) setErrors(prev => ({ ...prev, [key]: message })); };
    const rosterStop = onSnapshot(doc(db, 'special_lessons', activityId), async snap => {
      const version = ++revision;
      setReady(prev => ({ ...prev, roster: false }));
      try {
        if (!snap.exists() || snap.data().schoolId !== schoolId) throw new Error('Activity not found in this school.');
        const next = { ...snap.data(), id: snap.id } as SpecialLesson;
        const rows: Student[] = [];
        const ids = [...new Set(next.enrolledStudentIds ?? [])];
        for (let i = 0; i < ids.length; i += 30) {
          const data = await getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId), where(documentId(), 'in', ids.slice(i, i + 30))));
          rows.push(...data.docs.map(d => ({ ...d.data(), id: d.id } as Student)));
        }
        if (!cancelled && version === revision) { setActivity(next); setStudents(clubRoster(next, rows)); setReady(prev => ({ ...prev, roster: true })); setErrors(prev => ({ ...prev, roster: '' })); }
      } catch (e) { if (version === revision) fail('roster', e instanceof Error ? e.message : 'Unable to load members.'); }
    }, () => fail('roster', 'Unable to load activity. Reload to retry.'));
    const meetingStop = onSnapshot(query(collection(db, 'activity_meetings'), where('schoolId', '==', schoolId), where('specialLessonId', '==', activityId)), snap => {
      if (!cancelled) { setMeetings(snap.docs.map(d => ({ ...d.data(), id: d.id } as ActivityMeeting)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))); setReady(prev => ({ ...prev, meetings: true })); setErrors(prev => ({ ...prev, meetings: '' })); }
    }, () => fail('meetings', 'Unable to load meetings. Reload to retry.'));
    const attendanceStop = onSnapshot(query(collection(db, 'specialLessonAttendance'), where('schoolId', '==', schoolId), where('specialLessonId', '==', activityId)), snap => {
      if (!cancelled) { setAttendance(snap.docs.map(d => ({ ...d.data(), id: d.id } as SpecialLessonAttendance))); setReady(prev => ({ ...prev, attendance: true })); setErrors(prev => ({ ...prev, attendance: '' })); }
    }, () => fail('attendance', 'Unable to load attendance. Reload before saving.'));
    return () => { cancelled = true; rosterStop(); meetingStop(); attendanceStop(); };
  }, [schoolId, activityId]);
  return { activity, students, meetings, attendance, ready: Object.values(ready).every(Boolean), error: Object.values(errors).filter(Boolean).join(' ') };
}
