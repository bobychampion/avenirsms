import { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Student } from '../types';
import type { AttendanceStatus } from '../utils/attendanceStatus';

const EMPTY: Student[] = [];
const EMPTY_MARKS: Record<string, AttendanceStatus> = {};

/** Load explicitly invited students and their own daily registers, always within this school. */
export function useAdditionalAttendanceStudents(schoolId: string | null | undefined, ids: string[], date: string) {
  const context = JSON.stringify([schoolId, ids, date]);
  const [result, setResult] = useState<{ context: string; students: Student[]; daily: Record<string, AttendanceStatus>; error: boolean }>();
  useEffect(() => {
    if (!schoolId || !ids.length) return;
    let cancelled = false;
    const load = async () => {
      const students: Student[] = [];
      const daily: Record<string, AttendanceStatus> = {};
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const [roster, marks] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId), where(documentId(), 'in', chunk))),
          getDocs(query(collection(db, 'attendance'), where('schoolId', '==', schoolId), where('date', '==', date), where('studentId', 'in', chunk))),
        ]);
        students.push(...roster.docs.map(d => ({ ...d.data(), id: d.id } as Student)));
        marks.docs.forEach(d => { daily[d.data().studentId] = d.data().status; });
      }
      if (!cancelled) setResult({ context, students, daily, error: false });
    };
    load().catch(() => { if (!cancelled) setResult({ context, students: EMPTY, daily: EMPTY_MARKS, error: true }); });
    return () => { cancelled = true; };
  }, [context]);
  const ready = !ids.length || result?.context === context;
  return { students: ids.length && ready ? result!.students : EMPTY,
    daily: ids.length && ready ? result!.daily : EMPTY_MARKS,
    loading: !ready, error: !!ids.length && ready && !!result?.error };
}
