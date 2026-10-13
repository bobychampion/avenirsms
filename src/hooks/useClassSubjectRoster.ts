import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { ClassSubject } from '../types';
const EMPTY_ASSIGNMENTS: ClassSubject[] = [];

export function useClassSubjectRoster(schoolId: string | null | undefined, classId: string | undefined) {
  const context = JSON.stringify([schoolId, classId]);
  const [result, setResult] = useState<{ context: string; assignments: ClassSubject[]; error: boolean }>();
  useEffect(() => {
    if (!schoolId || !classId) return;
    let cancelled = false;
    const unsubscribe = onSnapshot(query(collection(db, 'class_subjects'), where('schoolId', '==', schoolId), where('classId', '==', classId)),
      snap => { if (!cancelled) setResult({ context, assignments: snap.docs.map(d => ({ ...d.data(), id: d.id } as ClassSubject)), error: false }); },
      () => { if (!cancelled) setResult({ context, assignments: EMPTY_ASSIGNMENTS, error: true }); });
    return () => { cancelled = true; unsubscribe(); };
  }, [schoolId, classId, context]);
  return { assignments: result?.context === context ? result.assignments : EMPTY_ASSIGNMENTS,
    loading: !schoolId || !classId || result?.context !== context,
    error: result?.context === context && result.error };
}
