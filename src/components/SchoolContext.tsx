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
import { SchoolClass, SCHOOL_CLASSES, SUBJECTS, CURRENT_SESSION, TERMS, GradingSystem, CustomGradeScale } from '../types';
import { SchoolSettings, defaultSettings } from '../pages/SchoolSettings';

const DEFAULT_PERIOD_TIMES = [
  '07:00', '07:40', '08:20', '09:00', '09:40', '10:20',
  '11:00', '11:40', '12:20', '13:00', '14:00', '14:40', '15:20'
];

export type TermStructure = '3-term' | '2-semester' | '4-quarter';

/** Returns the ordered list of term/semester labels for a given structure. */
export function getTermLabels(structure: TermStructure = '3-term'): readonly string[] {
  switch (structure) {
    case '2-semester': return ['1st Semester', '2nd Semester'] as const;
    case '4-quarter':  return ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'] as const;
    default:           return TERMS; // ['1st Term', '2nd Term', '3rd Term']
  }
}

interface SchoolContextValue {
  classes: SchoolClass[];          // from Firestore /classes (dynamic)
  classNames: string[];            // derived string list for selects
  subjects: string[];              // merged: built-in SUBJECTS + school customSubjects
  schoolLevels: string[];          // from school_settings (dynamic, fallback SCHOOL_CLASSES)
  periodTimes: string[];           // from school_settings (dynamic, fallback DEFAULT_PERIOD_TIMES)
  currentSession: string;          // from school_settings (dynamic, fallback CURRENT_SESSION)
  currentTerm: string;
  setCurrentTerm: (t: string) => void;
  termStructure: TermStructure;    // '3-term' | '2-semester' | '4-quarter'
  terms: readonly string[];        // dynamic term labels derived from termStructure
  refreshClasses: () => void;
  loading: boolean;
  // Internationalisation
  locale: string;
  currency: string;
  country: string;
  timezone: string;
  phoneCountryCode: string;
  gradingSystem: GradingSystem;
  customGradingScale: CustomGradeScale[];
  taxModel: 'nigeria_paye' | 'flat_rate' | 'none';
  taxFlatRate: number;
  cloudinaryConfig: { cloudName: string; uploadPreset: string };
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
  termStructure: '3-term',
  terms: TERMS,
  refreshClasses: () => {},
  loading: false,
  locale: 'en',
  currency: 'USD',
  country: '',
  timezone: '',
  phoneCountryCode: '',
  gradingSystem: 'percentage',
  customGradingScale: [],
  taxModel: 'none',
  taxFlatRate: 0,
  cloudinaryConfig: { cloudName: '', uploadPreset: '' },
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classNames, setClassNames] = useState<string[]>(SCHOOL_CLASSES);
  const [currentTerm, setCurrentTerm] = useState<string>('1st Term');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Dynamic settings from school_settings/main
  const [schoolLevels, setSchoolLevels] = useState<string[]>([...SCHOOL_CLASSES]);
  const [periodTimes, setPeriodTimes] = useState<string[]>([...DEFAULT_PERIOD_TIMES]);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [currentSession, setCurrentSession] = useState<string>(CURRENT_SESSION);
  const [termStructure, setTermStructure] = useState<TermStructure>('3-term');

  // Internationalisation state
  const [locale, setLocale] = useState('en');
  const [currency, setCurrency] = useState('USD');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('');
  const [gradingSystem, setGradingSystem] = useState<GradingSystem>('percentage');
  const [customGradingScale, setCustomGradingScale] = useState<CustomGradeScale[]>([]);
  const [taxModel, setTaxModel] = useState<'nigeria_paye' | 'flat_rate' | 'none'>('none');
  const [taxFlatRate, setTaxFlatRate] = useState(0);
  const [cloudinaryConfig, setCloudinaryConfig] = useState({ cloudName: '', uploadPreset: '' });

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
          setTermStructure((data.termStructure as TermStructure) || '3-term');
          // Internationalisation
          setLocale(data.locale || 'en');
          setCurrency(data.currency || 'USD');
          setCountry(data.country || '');
          setTimezone(data.timezone || '');
          setPhoneCountryCode(data.phoneCountryCode || '');
          setGradingSystem(data.gradingSystem || 'percentage');
          setCustomGradingScale(data.customGradingScale || []);
          setTaxModel(data.taxModel || 'none');
          setTaxFlatRate(data.taxFlatRate || 0);
          setCloudinaryConfig({
            cloudName: data.cloudinaryCloudName || '',
            uploadPreset: data.cloudinaryUploadPreset || '',
          });
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

  // Dynamic term labels derived from termStructure
  const terms = getTermLabels(termStructure);

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
      termStructure,
      terms,
      refreshClasses: () => setTick(t => t + 1),
      loading,
      locale,
      currency,
      country,
      timezone,
      phoneCountryCode,
      gradingSystem,
      customGradingScale,
      taxModel,
      taxFlatRate,
      cloudinaryConfig,
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
