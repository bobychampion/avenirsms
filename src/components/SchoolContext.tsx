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
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, orderBy, query, doc, where } from 'firebase/firestore';
import { SchoolClass, SCHOOL_CLASSES, SUBJECTS, CURRENT_SESSION, TERMS, GradingSystem, CustomGradeScale, LevelGradingOverride, resolveGradingForLevel, SubjectDefinition, TimetablePeriodSlot, DAYS_OF_WEEK, WeekendDay } from '../types';
import {
  DEFAULT_TIMETABLE_PERIODS,
  resolveTimetablePeriodSlots,
  periodTimesFromSlots,
} from '../utils/timetablePeriods';
import { SchoolSettings, defaultSettings } from '../pages/SchoolSettings';
import { useAuth } from './FirebaseProvider';
import { useSuperAdmin } from './SuperAdminContext';
import { useImpersonation } from './ImpersonationContext';

const DEFAULT_PERIOD_TIMES = periodTimesFromSlots(DEFAULT_TIMETABLE_PERIODS);

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
  weekendDays: WeekendDay[];       // opt-in weekend class days from school_settings
  schoolDays: string[];            // DAYS_OF_WEEK + any enabled weekendDays, in calendar order
  /** 'daily_only' (default) | 'daily_and_subject' | 'subject_only' — from school_settings */
  attendanceMode: 'daily_only' | 'daily_and_subject' | 'subject_only';
  periodTimes: string[];           // legacy start times — derived from timetablePeriods
  timetablePeriods: TimetablePeriodSlot[]; // school bell schedule for timetable columns
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
  identityDocumentLabel: string;
  identityDocumentHint: string;
  gradingSystem: GradingSystem;
  customGradingScale: CustomGradeScale[];
  levelGradingOverrides: Record<string, LevelGradingOverride>;
  /** Resolves the effective grading system/scale for a class name, honouring any per-level override. */
  getGradingForClass: (className: string) => { gradingSystem: GradingSystem; customGradingScale?: CustomGradeScale[] };
  taxModel: 'nigeria_paye' | 'flat_rate' | 'none';
  taxFlatRate: number;
  cloudinaryConfig: { cloudName: string; uploadPreset: string };
  /** Drives terminology + which feature set is shown across the app. */
  institutionType: 'secondary' | 'college' | 'online';
  // School branding
  schoolName: string;
  logoUrl: string;
  faviconUrl: string;
  // Report card
  reportShowLogo: boolean;
  reportFooterText: string;
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
  weekendDays: [],
  schoolDays: [...DAYS_OF_WEEK],
  attendanceMode: 'daily_only',
  periodTimes: DEFAULT_PERIOD_TIMES,
  timetablePeriods: [...DEFAULT_TIMETABLE_PERIODS],
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
  identityDocumentLabel: 'NIN',
  identityDocumentHint: '11-digit NIN',
  gradingSystem: 'percentage',
  customGradingScale: [],
  levelGradingOverrides: {},
  getGradingForClass: () => ({ gradingSystem: 'percentage', customGradingScale: [] }),
  taxModel: 'none',
  taxFlatRate: 0,
  cloudinaryConfig: { cloudName: '', uploadPreset: '' },
  institutionType: 'secondary',
  schoolName: 'Avenir SIS',
  logoUrl: '',
  faviconUrl: '',
  reportShowLogo: true,
  reportFooterText: '',
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
  const { impersonatedProfile } = useImpersonation();

  // Effective schoolId, matching useSchoolId()'s precedence: an active "View
  // As" session overrides super_admin school-browsing, which overrides the
  // signed-in profile's own schoolId.
  const schoolId = impersonatedProfile?.schoolId ?? activeSchoolId ?? profileSchoolId;

  const [rawClasses, setRawClasses] = useState<SchoolClass[]>([]);
  const [currentTerm, setCurrentTerm] = useState<string>('1st Term');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Dynamic settings from school_settings/{schoolId}
  const [schoolLevels, setSchoolLevels] = useState<string[]>([...SCHOOL_CLASSES]);
  const [weekendDays, setWeekendDays] = useState<WeekendDay[]>([]);
  const [attendanceMode, setAttendanceMode] = useState<'daily_only' | 'daily_and_subject' | 'subject_only'>('daily_only');
  const [periodTimes, setPeriodTimes] = useState<string[]>([...DEFAULT_PERIOD_TIMES]);
  const [timetablePeriods, setTimetablePeriods] = useState<TimetablePeriodSlot[]>([...DEFAULT_TIMETABLE_PERIODS]);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [currentSession, setCurrentSession] = useState<string>(CURRENT_SESSION);
  const [termStructure, setTermStructure] = useState<TermStructure>('3-term');

  // Internationalisation state
  const [locale, setLocale] = useState('en');
  const [currency, setCurrency] = useState('USD');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('');
  const [identityDocumentLabel, setIdentityDocumentLabel] = useState('NIN');
  const [identityDocumentHint, setIdentityDocumentHint] = useState('11-digit NIN');
  const [gradingSystem, setGradingSystem] = useState<GradingSystem>('percentage');
  const [customGradingScale, setCustomGradingScale] = useState<CustomGradeScale[]>([]);
  const [levelGradingOverrides, setLevelGradingOverrides] = useState<Record<string, LevelGradingOverride>>({});
  const [taxModel, setTaxModel] = useState<'nigeria_paye' | 'flat_rate' | 'none'>('none');
  const [taxFlatRate, setTaxFlatRate] = useState(0);
  const [cloudinaryConfig, setCloudinaryConfig] = useState({ cloudName: '', uploadPreset: '' });
  const [institutionType, setInstitutionType] = useState<'secondary' | 'college' | 'online'>('secondary');

  // Subject definitions from Firestore subjects collection
  const [subjectDefinitions, setSubjectDefinitions] = useState<SubjectDefinition[]>([]);

  // School branding state
  const [schoolName, setSchoolName] = useState('Avenir SIS');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [reportShowLogo, setReportShowLogo] = useState(true);
  const [reportFooterText, setReportFooterText] = useState('');
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
      setWeekendDays([]);
      setAttendanceMode('daily_only');
      setPeriodTimes([...DEFAULT_PERIOD_TIMES]);
      setCustomSubjects([]);
      setCurrentSession(CURRENT_SESSION);
      setTermStructure('3-term');
      setLocale('en');
      setCurrency('USD');
      setCountry('');
      setTimezone('');
      setPhoneCountryCode('');
      setIdentityDocumentLabel('NIN');
      setIdentityDocumentHint('11-digit NIN');
      setGradingSystem('percentage');
      setCustomGradingScale([]);
      setLevelGradingOverrides({});
      setTaxModel('none');
      setTaxFlatRate(0);
      setCloudinaryConfig({ cloudName: '', uploadPreset: '' });
      setInstitutionType('secondary');
      setSchoolName('Avenir SIS');
      setLogoUrl('');
      setFaviconUrl('');
      setReportShowLogo(true);
      setReportFooterText('');
      setPrimaryColor('#4f46e5');
      setSecondaryColor('');
      setSidebarStyle('dark');
      setAppDisplayName('');
      setFontFamily('Inter');
      setUrlSlug('');
      setSubjectDefinitions([]);
      setRawClasses([]);
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
          setWeekendDays(data.weekendDays || []);
          setAttendanceMode(data.attendanceMode || 'daily_only');
          const resolvedSlots = resolveTimetablePeriodSlots({
            timetablePeriods: data.timetablePeriods,
            periodTimes: data.periodTimes,
          });
          setTimetablePeriods(resolvedSlots);
          setPeriodTimes(periodTimesFromSlots(resolvedSlots));
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
          setIdentityDocumentLabel(data.identityDocumentLabel || 'NIN');
          setIdentityDocumentHint(data.identityDocumentHint || '11-digit NIN');
          setGradingSystem(data.gradingSystem || 'percentage');
          setCustomGradingScale(data.customGradingScale || []);
          setLevelGradingOverrides(data.levelGradingOverrides || {});
          setTaxModel(data.taxModel || 'none');
          setTaxFlatRate(data.taxFlatRate || 0);
          setInstitutionType(data.institutionType || 'secondary');
          setCloudinaryConfig({
            cloudName: data.cloudinaryCloudName || '',
            uploadPreset: data.cloudinaryUploadPreset || '',
          });
          // Branding
          setSchoolName(data.schoolName || 'Avenir SIS');
          setLogoUrl(data.logoUrl || '');
          setFaviconUrl(data.faviconUrl || '');
          setReportShowLogo(data.reportShowLogo !== false);
          setReportFooterText(data.reportFooterText || '');
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

  // Subscribe to /classes collection filtered by schoolId. Left unsorted here —
  // final ordering is derived below, against schoolLevels, in the classes/classNames memo.
  useEffect(() => {
    if (!schoolId) {
      setRawClasses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'classes'), where('schoolId', '==', schoolId)),
      snap => {
        setRawClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolClass)));
        setLoading(false);
      },
      () => {
        setRawClasses([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [schoolId, tick]);

  // Final class ordering: prefer the school's configured schoolLevels order (its
  // index IS the promotion sequence — see the "Grade / Year Levels" editor in
  // SchoolSettings), falling back to a numeric-aware name sort for any class name
  // schoolLevels doesn't know about. Without this, schools using spelled-out level
  // names (e.g. "Basic Two", "Reception Three" — no digits at all) would sort
  // alphabetically ("Basic Five" before "Basic Four"), breaking promotion order.
  const { classes, classNames } = useMemo(() => {
    if (rawClasses.length === 0) {
      return { classes: [] as SchoolClass[], classNames: SCHOOL_CLASSES };
    }
    const sorted = [...rawClasses].sort((a, b) => {
      const ia = schoolLevels.indexOf(a.name);
      const ib = schoolLevels.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    // Deduplicate: two Firestore docs with the same name would produce
    // duplicate option keys (React warning) in every class <select>.
    return { classes: sorted, classNames: [...new Set(sorted.map(c => c.name))] };
  }, [rawClasses, schoolLevels]);

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

  // Mon–Fri plus any weekend days this school has opted into, in calendar order
  const schoolDays = [...DAYS_OF_WEEK, ...weekendDays];

  // Helper: resolve the effective grading system/scale for a class, honouring per-level overrides
  const getGradingForClass = (className: string) => {
    const level = classes.find(c => c.name === className)?.level;
    return resolveGradingForLevel(level, gradingSystem, customGradingScale, levelGradingOverrides);
  };

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
      weekendDays,
      schoolDays,
      attendanceMode,
      periodTimes,
      timetablePeriods,
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
      identityDocumentLabel,
      identityDocumentHint,
      gradingSystem,
      customGradingScale,
      levelGradingOverrides,
      getGradingForClass,
      taxModel,
      taxFlatRate,
      cloudinaryConfig,
      institutionType,
      schoolName,
      logoUrl,
      faviconUrl,
      reportShowLogo,
      reportFooterText,
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
