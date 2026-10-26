import { useCallback, useSyncExternalStore } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { SchoolEvent } from '../types';

type State = { holidays: SchoolEvent[]; loading: boolean; error: string };
type Entry = { state: State; listeners: Set<() => void>; stop?: () => void };
const entries = new Map<string, Entry>();
const missing: State = { holidays: [], loading: true, error: '' };
function entryFor(schoolId: string) {
  if (!entries.has(schoolId)) entries.set(schoolId, { state: { ...missing }, listeners: new Set() });
  return entries.get(schoolId)!;
}

/** For one-off report loaders; reuse a live snapshot whenever one is already available. */
export async function getSchoolHolidays(schoolId: string) {
  const cached = entries.get(schoolId)?.state;
  if (cached && !cached.loading && !cached.error) return cached.holidays;
  const snap = await getDocs(query(collection(db, 'events'), where('schoolId', '==', schoolId), where('type', '==', 'holiday')));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as SchoolEvent));
}

/** One school-scoped holiday listener shared by registers, reports and dashboards. */
export function useSchoolHolidays(schoolId: string | null | undefined) {
  const subscribe = useCallback((listener: () => void) => {
    if (!schoolId) return () => {};
    const entry = entryFor(schoolId);
    entry.listeners.add(listener);
    const publish = (state: State) => { entry.state = state; entry.listeners.forEach(fn => fn()); };
    if (!entry.stop) entry.stop = onSnapshot(query(collection(db, 'events'), where('schoolId', '==', schoolId), where('type', '==', 'holiday')),
      snap => publish({ holidays: snap.docs.map(d => ({ ...d.data(), id: d.id } as SchoolEvent)), loading: false, error: '' }),
      () => publish({ holidays: [], loading: false, error: 'Unable to check school holidays. Reload before marking attendance.' }));
    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size) { entry.stop?.(); entries.delete(schoolId); }
    };
  }, [schoolId]);
  const snapshot = useCallback(() => schoolId ? entryFor(schoolId).state : missing, [schoolId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
