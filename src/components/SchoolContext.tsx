/**
 * SchoolContext.tsx
 *
 * Provides school-wide shared state (classes, subjects, levels, period times,
 * current session/term) fetched once on mount — no more repeated getDocs calls
 * in every page.
 *
 * Usage:
 *   const { classes, subjects, schoolLevels, periodTimes, currentSession, currentTerm } = useSchool();
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, orderBy, query, doc } from 'firebase/firestore';
import { SchoolClass, SCHOOL_CLASSES, SUBJECTS, CURRENT_SESSION, TERMS } from '../types';
import { SchoolSettings, defaultSettings } from '../pages/SchoolSettings';

const DEFAULT_PERIOD_TIMES = [
  '07:00', '07:40', '08:20', '09:00', '09:40', '10:20',
  '11:00', '11:40', '12:20', '13:00', '14:00', '14:40', '15:20'
];

interface SchoolContextValue {
  classes: SchoolClass[];          // from Firestore /classes (dynamic)
  classNames: string[];            // derived string list for selects
  subjects: string[];              // merged: built-in SUBJECTS + school customSubjects
  schoolLevels: string[];          // from school_settings (dynamic, fallback SCHOOL_CLASSES)
  periodTimes: string[];           // from school_settings (dynamic, fallback DEFAULT_PERIOD_TIMES)
  currentSession: string;          // from school_settings (dynamic, fallback CURRENT_SESSION)
  currentTerm: (typeof TERMS)[number];
  setCurrentTerm: (t: (typeof TERMS)[number]) => void;
  refreshClasses: () => void;
  loading: boolean;
}

const SchoolContext = createContext<SchoolContextValue>({
  classes: [],
  classNames: SCHOOL_CLASSES,
  subjects: SUBJECTS,
  schoolLevels: SCHOOL_CLASSES,
  periodTimes: DEFAULT_PERIOD_TIMES,
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

  // Dynamic settings from school_settings/main
  const [schoolLevels, setSchoolLevels] = useState<string[]>([...SCHOOL_CLASSES]);
  const [periodTimes, setPeriodTimes] = useState<string[]>([...DEFAULT_PERIOD_TIMES]);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [currentSession, setCurrentSession] = useState<string>(CURRENT_SESSION);

  // Subscribe to school_settings/main for dynamic configuration
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'school_settings', 'main'),
      snap => {
        if (snap.exists()) {
          const data = { ...defaultSettings, ...snap.data() } as SchoolSettings;
          if (data.schoolLevels?.length) setSchoolLevels(data.schoolLevels);
          if (data.periodTimes?.length) setPeriodTimes(data.periodTimes);
          if (data.customSubjects) setCustomSubjects(data.customSubjects);
          if (data.currentSession) setCurrentSession(data.currentSession);
          if (data.currentTerm) setCurrentTerm(data.currentTerm);
        }
      },
      () => { /* silently fall back to defaults on error */ }
    );
    return () => unsub();
  }, []);

  // Subscribe to /classes collection
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

  // Merge built-in subjects with custom subjects (deduplicated)
  const mergedSubjects = [...SUBJECTS, ...customSubjects.filter(s => !SUBJECTS.includes(s))];

  return (
    <SchoolContext.Provider value={{
      classes,
      classNames,
      subjects: mergedSubjects,
      schoolLevels,
      periodTimes,
      currentSession,
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

/**
 * Options for class <select>s — keys use Firestore class doc ids so duplicate names
 * (e.g. two "JSS 1A" rows) do not produce duplicate React keys.
 */
export function useClassSelectOptions(): { key: string; value: string; label: string }[] {
  const { classes, classNames } = useContext(SchoolContext);
  if (classes.length > 0) {
    return classes.map((c, i) => ({
      key: c.id || `class-fallback-${i}`,
      value: c.name,
      label: `${c.name} (${c.level})`,
    }));
  }
  return classNames.map((name, i) => ({
    key: `preset-${i}-${name}`,
    value: name,
    label: name,
  }));
}
