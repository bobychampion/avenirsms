/**
 * SchoolContext.tsx
 *
 * Provides school-wide shared state (classes, subjects, levels, period times,
 * current session/term) fetched once on mount — no more repeated getDocs calls
 * in every page.
 *
 * Multi-tenant: All three Firestore subscriptions are scoped to the effective
 * schoolId returned by useSchoolId(). When schoolId is null (super_admin on
 * their platform dashboard) no subscriptions are opened and defaults are used.
 *
 * Usage:
 *   const { classes, subjects, schoolLevels, periodTimes, currentSession, currentTerm } = useSchool();
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, orderBy, query, doc, where } from 'firebase/firestore';
import { SchoolClass, SCHOOL_CLASSES, SUBJECTS, CURRENT_SESSION, TERMS, GradingSystem, CustomGradeScale, SubjectDefinition } from '../types';
import { SchoolSettings, defaultSettings } from '../pages/SchoolSettings';
import { useAuth } from './FirebaseProvider';
import { useSuperAdmin } from './SuperAdminContext';

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
  /** Effective schoolId used by this context's subscriptions (null for super_admin on platform dash) */
  schoolId: string | null;
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
  // School branding
  schoolName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  sidebarStyle: 'dark' | 'light' | 'brand' | 'minimal';
  appDisplayName: string;
  fontFamily: string;
  urlSlug: string;
  /** Visual tier for the student portal: 'primary' = playful, 'secondary' = toned-down */
  studentAgeTier: 'primary' | 'secondary';
  // Subject management
  subjectDefinitions: SubjectDefinition[];
  getSubjectsForClass: (className: string) => string[];
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
  schoolId: null,
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
  schoolName: 'Avenir SIS',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#4f46e5',
  secondaryColor: '',
  sidebarStyle: 'dark',
  appDisplayName: '',
  fontFamily: 'Inter',
  urlSlug: '',
  studentAgeTier: 'primary',
  subjectDefinitions: [],
  getSubjectsForClass: () => SUBJECTS,
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const { schoolId: profileSchoolId } = useAuth();
  const { activeSchoolId } = useSuperAdmin();

  // Effective schoolId: super_admin override takes precedence over profile schoolId
  const schoolId = activeSchoolId ?? profileSchoolId;

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classNames, setClassNames] = useState<string[]>(SCHOOL_CLASSES);
  const [currentTerm, setCurrentTerm] = useState<string>('1st Term');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Dynamic settings from school_settings/{schoolId}
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

  // Subject definitions from Firestore subjects collection
  const [subjectDefinitions, setSubjectDefinitions] = useState<SubjectDefinition[]>([]);

  // School branding state
  const [schoolName, setSchoolName] = useState('Avenir SIS');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [sidebarStyle, setSidebarStyle] = useState<'dark' | 'light' | 'brand' | 'minimal'>('dark');
  const [appDisplayName, setAppDisplayName] = useState('');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [urlSlug, setUrlSlug] = useState('');
  const [studentAgeTier, setStudentAgeTier] = useState<'primary' | 'secondary'>('primary');

  // Inject CSS brand variables + load Google Font whenever they change
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--color-brand', primaryColor);
    root.setProperty('--color-brand-secondary', secondaryColor || primaryColor);

    // Derive readable variants based on luminance.
    const m = primaryColor.replace('#', '');
    if (m.length === 6) {
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      const isLight = lum > 160;

      // Text color to use ON the brand background (auto contrast)
      root.setProperty('--color-brand-on', isLight ? '#0f172a' : '#ffffff');

      // "Ink" — darkened brand color for use as text/accents on white backgrounds.
      // For light brand colors, multiply RGB by 0.35 to get a readable dark version.
      const ink = isLight
        ? '#' + [r, g, b].map(c => Math.round(c * 0.35).toString(16).padStart(2, '0')).join('')
        : primaryColor;
      root.setProperty('--color-brand-ink', ink);
    }
  }, [primaryColor, secondaryColor]);

  useEffect(() => {
    if (!fontFamily || fontFamily === 'Inter') return;
    const id = 'google-font-link';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
    document.documentElement.style.setProperty('--font-brand', `'${fontFamily}', sans-serif`);
  }, [fontFamily]);

  // ── Reset all school-scoped state synchronously when schoolId changes ──────
  // This prevents stale data from School A briefly appearing in dropdowns/forms
  // while School B's subscriptions are loading (super_admin school-switching).
  useEffect(() => {
    if (!schoolId) {
      // super_admin returning to platform dashboard — reset everything to defaults
      setSchoolLevels([...SCHOOL_CLASSES]);
      setPeriodTimes([...DEFAULT_PERIOD_TIMES]);
      setCustomSubjects([]);
      setCurrentSession(CURRENT_SESSION);
      setTermStructure('3-term');
      setLocale('en');
      setCurrency('USD');
      setCountry('');
      setTimezone('');
      setPhoneCountryCode('');
      setGradingSystem('percentage');
      setCustomGradingScale([]);
      setTaxModel('none');
      setTaxFlatRate(0);
      setCloudinaryConfig({ cloudName: '', uploadPreset: '' });
      setSchoolName('Avenir SIS');
      setLogoUrl('');
      setFaviconUrl('');
      setPrimaryColor('#4f46e5');
      setSecondaryColor('');
      setSidebarStyle('dark');
      setAppDisplayName('');
      setFontFamily('Inter');
      setUrlSlug('');
      setSubjectDefinitions([]);
      setClasses([]);
      setClassNames(SCHOOL_CLASSES);
    }
    // When schoolId is set we intentionally let the onSnapshot subscriptions
    // below overwrite the state — no reset needed (new school's data arrives fast).
  }, [schoolId]);

  // Subscribe to school_settings/{schoolId}
  useEffect(() => {
    if (!schoolId) return; // super_admin on platform dashboard — use defaults
    const unsub = onSnapshot(
      doc(db, 'school_settings', schoolId),
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
          // Branding
          setSchoolName(data.schoolName || 'Avenir SIS');
          setLogoUrl(data.logoUrl || '');
          setFaviconUrl(data.faviconUrl || '');
          setPrimaryColor(data.primaryColor || '#4f46e5');
          setSecondaryColor(data.secondaryColor || '');
          setSidebarStyle(data.sidebarStyle || 'dark');
          setAppDisplayName(data.appDisplayName || '');
          setFontFamily(data.fontFamily || 'Inter');
          setUrlSlug(data.urlSlug || '');
          setStudentAgeTier(data.studentAgeTier === 'secondary' ? 'secondary' : 'primary');
        }
      },
      () => { /* silently fall back to defaults on error */ }
    );
    return () => unsub();
  }, [schoolId]);

  // Subscribe to /classes collection filtered by schoolId
  useEffect(() => {
    if (!schoolId) {
      setClasses([]);
      setClassNames(SCHOOL_CLASSES);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'classes'), where('schoolId', '==', schoolId)),
      snap => {
        if (snap.empty) {
          setClasses([]);
          setClassNames(SCHOOL_CLASSES);
        } else {
          const list = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as SchoolClass))
            .sort((a, b) => a.name.localeCompare(b.name));
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
  }, [schoolId, tick]);

  // Subscribe to /subjects collection filtered by schoolId
  useEffect(() => {
    if (!schoolId) {
      setSubjectDefinitions([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'subjects'), where('schoolId', '==', schoolId)),
      snap => {
        setSubjectDefinitions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubjectDefinition)));
      },
      () => { /* silently ignore on error */ }
    );
    return () => unsub();
  }, [schoolId]);

  // Merge built-in subjects with custom subjects (deduplicated)
  const mergedSubjects = [...SUBJECTS, ...customSubjects.filter(s => !SUBJECTS.includes(s))];

  // Dynamic term labels derived from termStructure
  const terms = getTermLabels(termStructure);

  // Helper: get subjects for a specific class (from SubjectDefinitions, falling back to all merged subjects)
  const getSubjectsForClass = (className: string): string[] => {
    const custom = subjectDefinitions.filter(s => s.assignedClasses.includes(className));
    if (custom.length > 0) return custom.map(s => s.name);
    // Fallback: return built-in + custom subjects that haven't been assigned to specific classes
    const unassigned = subjectDefinitions.filter(s => s.assignedClasses.length === 0).map(s => s.name);
    return [...mergedSubjects, ...unassigned.filter(n => !mergedSubjects.includes(n))];
  };

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
      schoolId,
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
      schoolName,
      logoUrl,
      faviconUrl,
      primaryColor,
      secondaryColor,
      sidebarStyle,
      appDisplayName,
      fontFamily,
      urlSlug,
      studentAgeTier,
      subjectDefinitions,
      getSubjectsForClass,
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
