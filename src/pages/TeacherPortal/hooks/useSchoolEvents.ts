import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { SchoolEvent } from '../../../types';

/** All school events for the school, ordered by date — same source as SchoolCalendar.tsx. */
export function useSchoolEvents(schoolId: string | null | undefined) {
  const [events, setEvents] = useState<SchoolEvent[]>([]);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'events'), where('schoolId', '==', schoolId), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolEvent)));
    }, e => console.error('[useSchoolEvents] failed:', e));
    return unsub;
  }, [schoolId]);

  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(ev => ev.date >= todayStr);

  return { events, upcoming };
}
