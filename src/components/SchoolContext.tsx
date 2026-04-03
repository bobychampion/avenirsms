/**
 * SchoolContext.tsx
 *
 * Provides school-wide shared state (classes, subjects, current session/term)
 * fetched once on mount — no more repeated getDocs('classes') in every page.
 *
 * Usage:
 *   const { classes, subjects, currentSession, currentTerm } = useSchool();
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { SchoolClass, SCHOOL_CLASSES, SUBJECTS, CURRENT_SESSION, TERMS } from '../types';

interface SchoolContextValue {
  classes: SchoolClass[];          // from Firestore /classes (dynamic)
  classNames: string[];            // derived string list for selects
  subjects: string[];              // from SUBJECTS constant (static)
  currentSession: string;
  currentTerm: (typeof TERMS)[number];
  setCurrentTerm: (t: (typeof TERMS)[number]) => void;
  refreshClasses: () => void;
  loading: boolean;
}

const SchoolContext = createContext<SchoolContextValue>({
  classes: [],
  classNames: SCHOOL_CLASSES,
  subjects: SUBJECTS,
  currentSession: CURRENT_SESSION,
  currentTerm: '1st Term',
  setCurrentTerm: () => {},
  refreshClasses: () => {},
  loading: false,
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classNames, setClassNames] = useState<string[]>(SCHOOL_CLASSES);
  const [currentTerm, setCurrentTerm] = useState<(typeof TERMS)[number]>('1st Term');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'classes'), orderBy('name', 'asc')),
      snap => {
        if (snap.empty) {
          setClasses([]);
          setClassNames(SCHOOL_CLASSES);
        } else {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolClass));
          setClasses(list);
          setClassNames(list.map(c => c.name));
        }
        setLoading(false);
      },
      () => {
        setClasses([]);
        setClassNames(SCHOOL_CLASSES);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tick]);

  return (
    <SchoolContext.Provider value={{
      classes,
      classNames,
      subjects: SUBJECTS,
      currentSession: CURRENT_SESSION,
      currentTerm,
      setCurrentTerm,
      refreshClasses: () => setTick(t => t + 1),
      loading,
    }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  return useContext(SchoolContext);
}
