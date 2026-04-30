import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, writeBatch, onSnapshot, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Settings, Save, School, Calendar, Lock, Phone, Loader2,
  Hash, BookOpen, Plus, X, Trash2, AlertTriangle,
  Globe, DollarSign, Image as ImageIcon, Award, ChevronUp, ChevronDown,
  Upload, Eye, EyeOff, Users, Bell, ShieldCheck, FileText, ClipboardCheck,
  MapPin, Navigation, CheckCircle2, XCircle, RefreshCw, Brain,
  Palette, Link as LinkIcon, Monitor, ExternalLink, Brush,
} from 'lucide-react';
import { GeoFence } from '../types';
import { haversineDistance } from '../services/geofenceService';
import { SCHOOL_CLASSES, SUBJECTS, TERMS, GradingSystem, CustomGradeScale, SubjectDefinition, UserProfile } from '../types';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import { useSchool } from '../components/SchoolContext';
import { useAuth } from '../components/FirebaseProvider';

export interface SchoolSettings {
  schoolName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  /** URL of a custom favicon (PNG/ICO/SVG). Displayed in browser tab. */
  faviconUrl?: string;
  /** Brand primary colour (hex, e.g. '#4f46e5'). Used for sidebar accents, buttons, etc. */
  primaryColor?: string;
  /** Secondary / accent colour (hex). Used for highlights and hover states. */
  secondaryColor?: string;
  /** Sidebar style variant */
  sidebarStyle?: 'dark' | 'light' | 'brand' | 'minimal';
  /** Sidebar background image URL */
  sidebarBgImageUrl?: string;
  /** School watermark / stamp image used on printed reports */
  stampImageUrl?: string;
  /** Named colour preset (e.g. 'royal-blue') — sets primaryColor when applied */
  colorPreset?: string;
  /** Login page hero/background image */
  loginBgImageUrl?: string;
  /** Login page welcome headline */
  loginWelcomeText?: string;
  /** Login page tagline below the headline */
  loginTagline?: string;
  /** Hero banner image for the public landing page */
  heroBannerImageUrl?: string;
  /** School description paragraph shown on the public landing page */
  schoolDescription?: string;
  /** Social media links for the public landing page */
  socialLinks?: { facebook?: string; twitter?: string; instagram?: string; website?: string };
  /** Intro text shown at the top of the online application form */
  applicationIntroText?: string;
  /** Application deadline date (ISO string) */
  applicationDeadline?: string;
  /** Welcome banner text on the admin dashboard */
  dashboardBannerText?: string;
  /** Custom app name shown in the nav header instead of "AvenirSMS" */
  appDisplayName?: string;
  /** Google Font or system font family name */
  fontFamily?: string;
  /** Short custom URL slug (e.g. 'greenfield-academy'). Super-admin only. */
  urlSlug?: string;
  /** Visual tier for the student portal: 'primary' (playful) or 'secondary' (toned-down) */
  studentAgeTier?: 'primary' | 'secondary';
  currentSession: string;
  currentTerm: '1st Term' | '2nd Term' | '3rd Term';
  examLocked: boolean;
  motto?: string;
  principalName?: string;
  // Student ID configuration
  studentIdPrefix: string;
  studentIdFormat: 'PREFIX-YEAR-SEQ' | 'PREFIXYEARSEQ' | 'PREFIX-SEQ';
  studentIdPadding: number;
  /**
   * Minimum class at which a synthetic school-email login is auto-provisioned
   * for a newly admitted student. Classes below this tier skip account
   * creation (parents use the parent portal on their behalf).
   * Empty string / undefined disables auto-provisioning for all classes.
   */
  studentAccountMinClass?: string;
  // Dynamic lists
  schoolLevels: string[];
  customSubjects: string[];
  periodTimes: string[];
  // Internationalisation
  country: string;           // ISO 3166-1 alpha-2, e.g. 'NG', 'SI', 'US'
  timezone: string;          // IANA tz string, e.g. 'Africa/Lagos', 'Europe/Ljubljana'
  locale: string;            // BCP 47, e.g. 'en-NG', 'sl-SI', 'en-US'
  currency: string;          // ISO 4217, e.g. 'NGN', 'EUR', 'USD'
  phoneCountryCode: string;  // e.g. '+234', '+386', '+1'
  // Academic configuration
  gradingSystem: GradingSystem;
  customGradingScale: CustomGradeScale[];
  termStructure: '3-term' | '2-semester' | '4-quarter';
  // Finance & Payroll
  taxModel: 'nigeria_paye' | 'flat_rate' | 'none';
  taxFlatRate: number;       // percentage, used when taxModel === 'flat_rate'
  // Media / Cloudinary
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;

  // ── Admissions & Enrolment ────────────────────────────────────────────────
  /** Allow new online applications from the /apply portal */
  admissionsOpen: boolean;
  /** Maximum number of open applications allowed at one time (0 = unlimited) */
  maxApplications: number;
  /** Require document uploads as part of the application */
  requireDocuments: boolean;
  /** Auto-approve applications without admin review */
  autoApproveApplications: boolean;
  /** Minimum age (years) to enrol in the school */
  minimumEnrolmentAge: number;

  // ── Attendance ────────────────────────────────────────────────────────────
  /** Number of minutes late before marking as "Late" rather than "Present" */
  lateThresholdMinutes: number;
  /** Minimum attendance percentage required before a warning is triggered */
  attendanceWarningThreshold: number;
  /** Minimum attendance percentage required to sit exams */
  attendanceExamThreshold: number;
  /** School days per week (Mon–Fri = 5, Mon–Sat = 6) */
  schoolDaysPerWeek: 5 | 6;

  // ── Assessment & Grading ─────────────────────────────────────────────────
  /** Maximum CA (continuous assessment) score out of total */
  caMaxScore: number;
  /** Maximum exam score out of total */
  examMaxScore: number;
  /** Show class/subject position (rank) on report cards */
  showPositionOnReport: boolean;
  /** Show teacher comment field on report cards */
  showTeacherComment: boolean;
  /** Show psychomotor / skills section on report cards */
  showSkillsOnReport: boolean;
  /** Passing / promotion score threshold (percentage) */
  passMarkPercent: number;

  // ── Notifications & Communication ────────────────────────────────────────
  /** Send fee-due reminders to parents */
  feeReminderEnabled: boolean;
  /** Days before due date to send the reminder */
  feeReminderDaysBefore: number;
  /** Send attendance SMS/notification when student is absent */
  absenceAlertEnabled: boolean;
  /** Send result/report card notifications to parents */
  resultNotificationEnabled: boolean;
  /** WhatsApp sender/API phone number */
  whatsappSenderPhone: string;

  // ── Portal & Access ───────────────────────────────────────────────────────
  /** Allow parents to view their children's grades */
  parentCanViewGrades: boolean;
  /** Allow parents to view attendance records */
  parentCanViewAttendance: boolean;
  /** Allow parents to download report cards */
  parentCanDownloadReports: boolean;
  /** Allow teachers to enter/edit grades */
  teacherCanEnterGrades: boolean;
  /** Allow teachers to manage their own timetable view */
  teacherCanViewTimetable: boolean;
  /** Session timeout in minutes for all portal users (0 = never) */
  sessionTimeoutMinutes: number;

  // ── Report Card & Printing ────────────────────────────────────────────────
  /** Show school watermark / stamp on printed report cards */
  reportWatermarkEnabled: boolean;
  /** Paper size for printed reports */
  reportPaperSize: 'A4' | 'Letter' | 'A5';
  /** Show school logo on report card header */
  reportShowLogo: boolean;
  /** Custom footer text printed at the bottom of each report card */
  reportFooterText: string;
  /** Number of decimal places for score display on reports */
  reportScoreDecimals: 0 | 1 | 2;

  // ── AI & CBT ──────────────────────────────────────────────────────────────
  /** Enable the CBT (Computer-Based Testing) engine school-wide */
  cbtEnabled: boolean;
  /** Enable the AI Curriculum Training document upload & summarisation feature */
  aiCurriculumEnabled: boolean;
  /** Maximum number of curriculum documents the school can upload (0 = unlimited) */
  maxCurriculumDocs: number;
  /** Roles that may sit CBT exams (comma-separated or array-style toggle) */
  cbtAllowedRoles: ('student' | 'applicant')[];

  updatedAt?: any;
}

const SETTINGS_DOC = 'school_settings';

const DEFAULT_PERIOD_TIMES = [
  '07:00', '07:40', '08:20', '09:00', '09:40', '10:20',
  '11:00', '11:40', '12:20', '13:00', '14:00', '14:40', '15:20'
];

export const defaultSettings: SchoolSettings = {
  schoolName: 'Avenir International School',
  address: '',
  phone: '',
  email: '',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#4f46e5',
  secondaryColor: '',
  sidebarStyle: 'dark',
  sidebarBgImageUrl: '',
  stampImageUrl: '',
  colorPreset: '',
  loginBgImageUrl: '',
  loginWelcomeText: '',
  loginTagline: '',
  heroBannerImageUrl: '',
  schoolDescription: '',
  socialLinks: { facebook: '', twitter: '', instagram: '', website: '' },
  applicationIntroText: '',
  applicationDeadline: '',
  dashboardBannerText: '',
  appDisplayName: '',
  fontFamily: 'Inter',
  urlSlug: '',
  studentAgeTier: 'primary',
  currentSession: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
  currentTerm: '1st Term',
  examLocked: false,
  motto: '',
  principalName: '',
  studentIdPrefix: 'STU',
  studentIdFormat: 'PREFIX-YEAR-SEQ',
  studentIdPadding: 3,
  studentAccountMinClass: 'Primary 1',
  schoolLevels: [...SCHOOL_CLASSES],
  customSubjects: [],
  periodTimes: [...DEFAULT_PERIOD_TIMES],
  // Internationalisation
  country: '',
  timezone: '',
  locale: 'en',
  currency: 'USD',
  phoneCountryCode: '',
  // Academic
  gradingSystem: 'percentage',
  customGradingScale: [],
  termStructure: '3-term',
  // Finance
  taxModel: 'none',
  taxFlatRate: 0,
  // Media
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  // Admissions
  admissionsOpen: true,
  maxApplications: 0,
  requireDocuments: false,
  autoApproveApplications: false,
  minimumEnrolmentAge: 3,
  // Attendance
  lateThresholdMinutes: 15,
  attendanceWarningThreshold: 75,
  attendanceExamThreshold: 70,
  schoolDaysPerWeek: 5,
  // Assessment
  caMaxScore: 40,
  examMaxScore: 60,
  showPositionOnReport: true,
  showTeacherComment: true,
  showSkillsOnReport: true,
  passMarkPercent: 50,
  // Notifications
  feeReminderEnabled: true,
  feeReminderDaysBefore: 7,
  absenceAlertEnabled: false,
  resultNotificationEnabled: false,
  whatsappSenderPhone: '',
  // Portal & Access
  parentCanViewGrades: true,
  parentCanViewAttendance: true,
  parentCanDownloadReports: false,
  teacherCanEnterGrades: true,
  teacherCanViewTimetable: true,
  sessionTimeoutMinutes: 60,
  // Report Card
  reportWatermarkEnabled: false,
  reportPaperSize: 'A4',
  reportShowLogo: true,
  reportFooterText: '',
  reportScoreDecimals: 1,
  // AI & CBT
  cbtEnabled: true,
  aiCurriculumEnabled: true,
  maxCurriculumDocs: 50,
  cbtAllowedRoles: ['student', 'applicant'],
};

export function useSchoolSettings() {
  const [settings, setSettings] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const { schoolId } = useSchool();

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    getDoc(doc(db, SETTINGS_DOC, schoolId)).then(snap => {
      if (snap.exists()) setSettings({ ...defaultSettings, ...snap.data() } as SchoolSettings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId]);

  return { settings, loading };
}

// ─── Tag List Editor ──────────────────────────────────────────────────────────
function TagListEditor({
  label, items, placeholder, validate, onAdd, onRemove
}: {
  label: string;
  items: string[];
  placeholder: string;
  validate?: (v: string) => string | null;
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');

  const handleAdd = () => {
    const val = input.trim();
    if (!val) return;
    if (items.includes(val)) { setErr('Already exists'); return; }
    const validationErr = validate?.(val);
    if (validationErr) { setErr(validationErr); return; }
    onAdd(val);
    setInput('');
    setErr('');
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-100">
            {item}
            <button onClick={() => onRemove(i)} className="ml-0.5 text-indigo-400 hover:text-red-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-slate-400 italic">No items yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
        />
        <button onClick={handleAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

// ─── Orderable Level Editor ────────────────────────────────────────────────────
function OrderableLevelEditor({
  items, onReorder, onAdd, onRemove
}: {
  items: string[];
  onReorder: (items: string[]) => void;
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...items]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onReorder(next);
  };
  const moveDown = (i: number) => {
    if (i === items.length - 1) return;
    const next = [...items]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; onReorder(next);
  };
  const handleAdd = () => {
    const val = input.trim();
    if (!val) return;
    if (items.includes(val)) { setErr('Already exists'); return; }
    onAdd(val); setInput(''); setErr('');
  };
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
        Grade / Year Levels <span className="text-slate-400 font-normal normal-case">(order = promotion sequence)</span>
      </label>
      <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto pr-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5">
            <span className="flex-1 text-xs font-semibold text-indigo-700">{item}</span>
            <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1 text-indigo-400 hover:text-indigo-700 disabled:opacity-25"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => moveDown(i)} disabled={i === items.length - 1} className="p-1 text-indigo-400 hover:text-indigo-700 disabled:opacity-25"><ChevronDown className="w-3.5 h-3.5" /></button>
            <button onClick={() => onRemove(i)} className="p-1 text-slate-400 hover:text-red-500 ml-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {items.length === 0 && <span className="text-xs text-slate-400 italic">No levels yet</span>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => { setInput(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Year 7, Grade 10, Form 3"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        <button onClick={handleAdd} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

// ─── Custom Grade Scale Editor ────────────────────────────────────────────────
function CustomGradeScaleEditor({ scale, onChange }: { scale: CustomGradeScale[]; onChange: (s: CustomGradeScale[]) => void }) {
  const [row, setRow] = useState<CustomGradeScale>({ min: 0, max: 100, grade: '', label: '' });
  const add = () => {
    if (!row.grade.trim()) return;
    onChange([...scale, { ...row }]);
    setRow({ min: 0, max: 100, grade: '', label: '' });
  };
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Custom Grade Scale</label>
      <div className="space-y-1.5 mb-3">
        {scale.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
            <span className="font-bold text-indigo-700 w-10">{s.grade}</span>
            <span className="text-slate-500">{s.min}–{s.max}</span>
            <span className="flex-1 text-slate-600">{s.label}</span>
            <button onClick={() => onChange(scale.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
          </div>
        ))}
        {scale.length === 0 && <span className="text-xs text-slate-400 italic">No grades defined</span>}
      </div>
      <div className="grid grid-cols-5 gap-2">
        <input type="number" placeholder="Min" value={row.min} onChange={e => setRow({ ...row, min: Number(e.target.value) })} className="px-2 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
        <input type="number" placeholder="Max" value={row.max} onChange={e => setRow({ ...row, max: Number(e.target.value) })} className="px-2 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
        <input placeholder="Grade" value={row.grade} onChange={e => setRow({ ...row, grade: e.target.value })} className="px-2 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
        <input placeholder="Label" value={row.label} onChange={e => setRow({ ...row, label: e.target.value })} className="px-2 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
        <button onClick={add} className="flex items-center justify-center gap-1 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// ─── Cloudinary Logo Upload ───────────────────────────────────────────────────
function CloudinaryLogoUpload({ cloudName, uploadPreset, onUploaded }: { cloudName: string; uploadPreset: string; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const tid = toast.loading('Uploading logo…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', uploadPreset);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.secure_url) { onUploaded(data.secure_url); toast.success('Logo uploaded!', { id: tid }); }
      else throw new Error(data.error?.message || 'Upload failed');
    } catch (err: any) {
      toast.error('Upload error: ' + err.message, { id: tid });
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <input type="file" accept="image/*" ref={ref} onChange={handleFile} className="hidden" />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Upload Logo via Cloudinary
      </button>
    </div>
  );
}

// ─── ID Preview helper ────────────────────────────────────────────────────────
function previewStudentId(prefix: string, format: SchoolSettings['studentIdFormat'], padding: number): string {
  const year = new Date().getFullYear();
  const seq = String(1).padStart(padding, '0');
  switch (format) {
    case 'PREFIX-YEAR-SEQ': return `${prefix}-${year}-${seq}`;
    case 'PREFIXYEARSEQ':   return `${prefix}${year}${seq}`;
    case 'PREFIX-SEQ':      return `${prefix}-${seq}`;
  }
}

// ─── Geo-fence map preview (Leaflet) ─────────────────────────────────────────
function GeoFenceMapPreview({
  lat, lng, radius, onMapClick,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<any>(null);
  const circleRef = React.useRef<any>(null);
  const markerRef = React.useRef<any>(null);
  const onMapClickRef = React.useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const validCoords = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);

  React.useEffect(() => {
    if (!containerRef.current) return;

    import('leaflet').then(L => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const initialLat = validCoords ? lat! : 6.5244;
      const initialLng = validCoords ? lng! : 3.3792;
      const zoom = validCoords ? 17 : 6;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current!).setView([initialLat, initialLng], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current);

        // Click-to-place handler
        mapRef.current.on('click', (e: any) => {
          onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
        });
      } else if (validCoords) {
        mapRef.current.setView([lat!, lng!], 17);
      }

      if (validCoords) {
        if (circleRef.current) {
          circleRef.current.setLatLng([lat!, lng!]).setRadius(radius);
        } else {
          circleRef.current = L.circle([lat!, lng!], {
            radius,
            color: '#4f46e5',
            fillColor: '#4f46e5',
            fillOpacity: 0.15,
            weight: 2,
          }).addTo(mapRef.current);
        }

        if (markerRef.current) {
          markerRef.current.setLatLng([lat!, lng!]);
        } else {
          markerRef.current = L.marker([lat!, lng!], { draggable: true })
            .addTo(mapRef.current)
            .bindPopup('School entrance — drag to adjust')
            .openPopup();

          // Drag marker to reposition
          markerRef.current.on('dragend', (e: any) => {
            const pos = e.target.getLatLng();
            onMapClickRef.current?.(pos.lat, pos.lng);
          });
        }

        mapRef.current.fitBounds(circleRef.current.getBounds(), { padding: [30, 30] });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radius]);

  React.useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm relative" style={{ height: 300 }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {!validCoords && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 rounded-xl px-4 py-2 text-sm text-slate-500 flex items-center gap-2 shadow">
            <MapPin className="w-4 h-4" /> Click the map or search an address to set location
          </div>
        </div>
      )}
      <div className="absolute bottom-2 right-2 bg-white/90 text-xs text-slate-500 px-2 py-1 rounded-lg shadow pointer-events-none">
        Click map or drag marker to reposition
      </div>
    </div>
  );
}

// ─── Reusable Toggle row ──────────────────────────────────────────────────────
function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-indigo-600 rounded-full transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>}
      </div>
    </label>
  );
}

type TabId = 'school' | 'academic' | 'subjects' | 'admissions' | 'attendance' | 'notifications' | 'access' | 'geofence' | 'customize';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'school',        label: 'School',           icon: <School className="w-4 h-4" /> },
  { id: 'customize',     label: 'Customization',    icon: <Palette className="w-4 h-4" /> },
  { id: 'academic',      label: 'Academic',         icon: <Award className="w-4 h-4" /> },
  { id: 'subjects',      label: 'Subjects',         icon: <BookOpen className="w-4 h-4" /> },
  { id: 'admissions',    label: 'Admissions',       icon: <ClipboardCheck className="w-4 h-4" /> },
  { id: 'attendance',    label: 'Attendance',       icon: <Users className="w-4 h-4" /> },
  { id: 'notifications', label: 'Notifications',    icon: <Bell className="w-4 h-4" /> },
  { id: 'access',        label: 'Access & Reports', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'geofence',      label: 'Geo-fence',        icon: <MapPin className="w-4 h-4" /> },
];

const COLOR_PRESETS = [
  { name: 'Indigo',       value: '#4f46e5' },
  { name: 'Royal Blue',   value: '#1d4ed8' },
  { name: 'Forest Green', value: '#15803d' },
  { name: 'Crimson',      value: '#be123c' },
  { name: 'Amber Gold',   value: '#b45309' },
  { name: 'Teal',         value: '#0f766e' },
  { name: 'Purple',       value: '#7e22ce' },
  { name: 'Slate',        value: '#475569' },
];

const FONT_OPTIONS = ['Inter', 'Poppins', 'Lato', 'Roboto', 'Nunito', 'Playfair Display'];

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function PortalLinks({ schoolId, urlSlug }: { schoolId: string | null; urlSlug: string }) {
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
  const base = window.location.origin;
  const id = schoolId ?? '';
  const slug = urlSlug || id;
  const links = [
    { label: 'Student Login', description: 'Share with students to log into their portal.', url: `${base}/s/${slug}/login/student`, color: 'bg-indigo-50 border-indigo-100' },
    { label: 'Parent Login', description: 'Share with parents to access the parent portal.', url: `${base}/s/${slug}/login/parent`, color: 'bg-emerald-50 border-emerald-100' },
    { label: 'Teacher Login', description: 'Share with teaching staff.', url: `${base}/s/${slug}/login/teacher`, color: 'bg-sky-50 border-sky-100' },
    { label: 'Staff / General Login', description: 'For admin, accountant, HR, librarian roles.', url: `${base}/s/${slug}/login`, color: 'bg-slate-50 border-slate-200' },
    { label: 'Online Admissions Form', description: 'Public link for new applicants to apply.', url: `${base}/s/${slug}/apply`, color: 'bg-amber-50 border-amber-100' },
    { label: 'School Portal Homepage', description: 'Public landing page for your school.', url: `${base}/s/${slug}`, color: 'bg-violet-50 border-violet-100' },
  ];
  const handleCopy = (url: string, idx: number) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
        <LinkIcon className="w-4 h-4 text-indigo-600" /> Portal &amp; Login Links
      </h2>
      <p className="text-xs text-slate-500 mb-5">
        Share these links with each user group so they can access the correct portal.
        {!urlSlug && (
          <span className="ml-1 text-amber-600 font-medium">
            Set a URL slug above to get shorter, memorable links.
          </span>
        )}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map((lnk, idx) => (
          <div key={lnk.label} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${lnk.color}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 mb-0.5">{lnk.label}</p>
              <p className="text-[11px] text-slate-500 mb-1.5 leading-snug">{lnk.description}</p>
              <p className="font-mono text-[11px] text-slate-600 truncate">{lnk.url}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => handleCopy(lnk.url, idx)}
                title="Copy link"
                className="p-1.5 rounded-lg hover:bg-white/80 transition-colors text-slate-500 hover:text-indigo-600"
              >
                {copiedIdx === idx
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : <LinkIcon className="w-4 h-4" />}
              </button>
              <a
                href={lnk.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
                className="p-1.5 rounded-lg hover:bg-white/80 transition-colors text-slate-500 hover:text-indigo-600"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SchoolSettingsPage() {
  const { schoolId } = useSchool();
  const { isSuperAdmin } = useAuth();
  const [form, setForm] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreset, setShowPreset] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('school');

  // URL slug management (super admin only)
  const [slugInput, setSlugInput] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  // Subject Management state
  const [subjectClassNames, setSubjectClassNames] = useState<string[]>(SCHOOL_CLASSES);
  const [subjectDefs, setSubjectDefs] = useState<SubjectDefinition[]>([]);
  const [subjectTeachers, setSubjectTeachers] = useState<UserProfile[]>([]);
  const [subjectForm, setSubjectForm] = useState<SubjectDefinition>({
    name: '', code: '', description: '', assignedClasses: [], level: 'All', isBuiltIn: false,
  });
  const [editingSubject, setEditingSubject] = useState<SubjectDefinition | null>(null);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [subjectLevelFilter, setSubjectLevelFilter] = useState<'All' | 'Primary' | 'Secondary'>('All');

  // Geo-fence state
  const [geofence, setGeofence] = useState<GeoFence | null>(null);
  const [geofenceForm, setGeofenceForm] = useState({ lat: '', lng: '', radius: '200' });
  const [savingGeofence, setSavingGeofence] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const fenceCircleRef = useRef<any>(null);
  const fenceMarkerRef = useRef<any>(null);

  const { blocker } = useUnsavedChanges(isDirty);

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, SETTINGS_DOC, schoolId)).then(snap => {
      if (snap.exists()) {
        const data = { ...defaultSettings, ...snap.data() } as SchoolSettings;
        setForm(data);
        setSlugInput(data.urlSlug || '');
      }
      setLoading(false);
    });
  }, [schoolId]);

  // Subscribe to subjects collection and teachers
  useEffect(() => {
    if (!schoolId) return;
    const unsubSubjects = onSnapshot(query(collection(db, 'subjects'), where('schoolId', '==', schoolId!)), snap => {
      setSubjectDefs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubjectDefinition)));
    });
    const unsubTeachers = onSnapshot(query(collection(db, 'users'), where('schoolId', '==', schoolId!)), snap => {
      setSubjectTeachers(
        snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)).filter(u => u.role === 'teacher')
      );
    });
    const unsubClasses = onSnapshot(query(collection(db, 'classes'), where('schoolId', '==', schoolId!)), snap => {
      if (!snap.empty) setSubjectClassNames(snap.docs.map(d => (d.data() as any).name as string));
    });
    // Load geo-fence
    const unsubFence = onSnapshot(doc(db, 'geofences', schoolId ?? 'main'), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as GeoFence;
        setGeofence(data);
        setGeofenceForm({
          lat: String(data.lat),
          lng: String(data.lng),
          radius: String(data.radius),
        });
      }
    });
    return () => { unsubSubjects(); unsubTeachers(); unsubClasses(); unsubFence(); };
  }, [schoolId]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported by this browser'); return; }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeofenceForm(f => ({
          ...f,
          lat: pos.coords.latitude.toFixed(7),
          lng: pos.coords.longitude.toFixed(7),
        }));
        setDetectingLocation(false);
        toast.success('Location detected!');
      },
      err => {
        setDetectingLocation(false);
        toast.error('Could not get location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const handleAddressSearch = async () => {
    if (!addressSearch.trim()) return;
    setAddressSearching(true);
    try {
      const encoded = encodeURIComponent(addressSearch.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'AvenirSIS/1.0' } }
      );
      const data = await res.json();
      if (!data.length) {
        toast.error('Address not found. Try a more specific address.');
        return;
      }
      const { lat, lon, display_name } = data[0];
      setGeofenceForm(f => ({ ...f, lat: parseFloat(lat).toFixed(7), lng: parseFloat(lon).toFixed(7) }));
      toast.success(`Found: ${display_name.split(',').slice(0, 3).join(', ')}`);
    } catch {
      toast.error('Address search failed. Check your connection.');
    } finally {
      setAddressSearching(false);
    }
  };

  const handleSaveGeofence = async () => {
    const lat = parseFloat(geofenceForm.lat);
    const lng = parseFloat(geofenceForm.lng);
    const radius = parseInt(geofenceForm.radius, 10);
    if (isNaN(lat) || isNaN(lng)) { toast.error('Enter valid latitude and longitude'); return; }
    if (isNaN(radius) || radius < 50 || radius > 5000) {
      toast.error('Radius must be between 50 m and 5 000 m'); return;
    }
    setSavingGeofence(true);
    const tid = toast.loading('Saving geo-fence…');
    try {
      await setDoc(doc(db, 'geofences', schoolId ?? 'main'), {
        lat, lng, radius, updatedAt: serverTimestamp(),
      });
      toast.success('Geo-fence saved!', { id: tid });
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Unknown error'), { id: tid });
    } finally {
      setSavingGeofence(false);
    }
  };

  const checkSlugAvailability = async (slug: string) => {
    if (!slug || !SLUG_REGEX.test(slug)) { setSlugAvailable(null); return; }
    setSlugChecking(true);
    try {
      const snap = await getDoc(doc(db, 'school_slugs', slug));
      setSlugAvailable(!snap.exists() || snap.data()?.schoolId === schoolId);
    } finally {
      setSlugChecking(false);
    }
  };

  const handleSaveSlug = async () => {
    const slug = slugInput.trim().toLowerCase();
    if (!slug) {
      // Clear the slug
      if (form.urlSlug) {
        setSlugSaving(true);
        try {
          await deleteDoc(doc(db, 'school_slugs', form.urlSlug));
          await setDoc(doc(db, SETTINGS_DOC, schoolId!), { ...form, urlSlug: '', updatedAt: serverTimestamp() });
          await updateDoc(doc(db, 'schools', schoolId!), { urlSlug: '', updatedAt: serverTimestamp() });
          setForm(f => ({ ...f, urlSlug: '' }));
          toast.success('URL slug removed');
        } catch (e: any) { toast.error(e.message); }
        finally { setSlugSaving(false); }
      }
      return;
    }
    if (!SLUG_REGEX.test(slug)) { toast.error('Slug must be lowercase letters, numbers, and hyphens only'); return; }
    if (slug.length < 3 || slug.length > 50) { toast.error('Slug must be 3–50 characters'); return; }
    setSlugSaving(true);
    const tid = toast.loading('Saving URL slug…');
    try {
      const existing = await getDoc(doc(db, 'school_slugs', slug));
      if (existing.exists() && existing.data()?.schoolId !== schoolId) {
        toast.error('This slug is already taken by another school', { id: tid });
        return;
      }
      // Remove old slug if changed
      if (form.urlSlug && form.urlSlug !== slug) {
        await deleteDoc(doc(db, 'school_slugs', form.urlSlug));
      }
      await setDoc(doc(db, 'school_slugs', slug), { schoolId, schoolName: form.schoolName, updatedAt: serverTimestamp() });
      await setDoc(doc(db, SETTINGS_DOC, schoolId!), { ...form, urlSlug: slug, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'schools', schoolId!), { urlSlug: slug, updatedAt: serverTimestamp() });
      setForm(f => ({ ...f, urlSlug: slug }));
      setSlugAvailable(null);
      toast.success('URL slug saved!', { id: tid });
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setSlugSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const tid = toast.loading('Saving settings…');
    try {
      await setDoc(doc(db, SETTINGS_DOC, schoolId!), {
        ...form,
        updatedAt: serverTimestamp(),
        // Mark settings step done for onboarding wizard
        onboardingSettingsDone: true,
      });
      setIsDirty(false);
      toast.success('Settings saved!', { id: tid });
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof SchoolSettings, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSaveSubject = async () => {
    if (!subjectForm.name.trim()) { toast.error('Subject name is required'); return; }
    setSavingSubject(true);
    try {
      if (editingSubject?.id) {
        await setDoc(doc(db, 'subjects', editingSubject.id), { ...subjectForm, isBuiltIn: false, schoolId: schoolId ?? 'main' });
      } else {
        await addDoc(collection(db, 'subjects'), { ...subjectForm, isBuiltIn: false, schoolId: schoolId ?? 'main' });
      }
      setSubjectForm({ name: '', code: '', description: '', assignedClasses: [], level: 'All', isBuiltIn: false });
      setEditingSubject(null);
      setShowSubjectForm(false);
      toast.success(editingSubject ? 'Subject updated!' : 'Subject added!');
    } catch (e: any) {
      toast.error('Failed to save subject: ' + (e.message || 'Unknown'));
    } finally {
      setSavingSubject(false);
    }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!window.confirm('Delete this subject?')) return;
    await deleteDoc(doc(db, 'subjects', id)).catch(e => toast.error(e.message));
    toast.success('Subject deleted');
  };

  const validateTime = (v: string) => {
    if (!/^\d{2}:\d{2}$/.test(v)) return 'Format must be HH:MM (e.g. 08:30)';
    const [h, m] = v.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'Invalid time value';
    return null;
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <UnsavedChangesDialog blocker={blocker} />

      {/* ── Page header ── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-indigo-600" />
            School Settings
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Configure every aspect of your school — identity, academics, admissions, and more.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              Unsaved changes
            </span>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-60 text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB: SCHOOL
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'school' && (
        <div className="space-y-6">

          {/* School Identity */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <School className="w-4 h-4 text-indigo-600" /> School Identity
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Name *</label>
                <input value={form.schoolName} onChange={e => field('schoolName', e.target.value)} placeholder="e.g. Avenir International School"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Principal / Head Teacher</label>
                <input value={form.principalName || ''} onChange={e => field('principalName', e.target.value)} placeholder="e.g. Dr. Jana Kovač"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Motto</label>
                <input value={form.motto || ''} onChange={e => field('motto', e.target.value)} placeholder="e.g. Excellence in Education"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Brand Primary Colour</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primaryColor || '#4f46e5'} onChange={e => field('primaryColor', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
                  <input type="text" value={form.primaryColor || '#4f46e5'} onChange={e => field('primaryColor', e.target.value)}
                    placeholder="#4f46e5" className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" maxLength={7} />
                  <span className="text-xs text-slate-400">Sidebar & button accents</span>
                </div>
              </div>
            </div>
          </section>

          {/* Portal & Login Links */}
          <PortalLinks schoolId={schoolId} urlSlug={form.urlSlug ?? ''} />

          {/* Contact & Location */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <Phone className="w-4 h-4 text-indigo-600" /> Contact & Location
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
                <input value={form.phone} onChange={e => field('phone', e.target.value)} placeholder="e.g. +386 1 234 5678"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => field('email', e.target.value)} placeholder="school@example.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Address</label>
                <textarea value={form.address} onChange={e => field('address', e.target.value)} rows={2} placeholder="Full school address"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
              </div>
            </div>
          </section>

          {/* Internationalisation */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-indigo-600" /> Internationalisation
            </h2>
            <p className="text-xs text-slate-500 mb-5">Controls date/number formatting, phone validation, and payroll calculations.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Country <span className="font-normal text-slate-400">(ISO 3166-1, e.g. SI, NG)</span></label>
                <input value={form.country} onChange={e => field('country', e.target.value.toUpperCase().slice(0, 2))} placeholder="e.g. NG" maxLength={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono uppercase" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Timezone <span className="font-normal text-slate-400">(IANA)</span></label>
                <input value={form.timezone} onChange={e => field('timezone', e.target.value)} placeholder="e.g. Africa/Lagos"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Locale <span className="font-normal text-slate-400">(BCP 47)</span></label>
                <input value={form.locale} onChange={e => field('locale', e.target.value)} placeholder="e.g. en-NG"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Currency <span className="font-normal text-slate-400">(ISO 4217)</span></label>
                <input value={form.currency} onChange={e => field('currency', e.target.value.toUpperCase().slice(0, 3))} placeholder="e.g. NGN" maxLength={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono uppercase" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Phone Country Code</label>
                <input value={form.phoneCountryCode} onChange={e => field('phoneCountryCode', e.target.value)} placeholder="e.g. +234"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              </div>
            </div>
            {form.locale && (
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600">
                <strong>Preview: </strong>
                {(() => { try { return new Intl.NumberFormat(form.locale, { style: 'currency', currency: form.currency || 'USD' }).format(12500); } catch { return `${form.currency || '?'} 12,500.00`; } })()}
                {' · '}
                {(() => { try { return new Date().toLocaleDateString(form.locale, { dateStyle: 'full' }); } catch { return new Date().toLocaleDateString(); } })()}
              </div>
            )}
          </section>

          {/* Media & Uploads */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <ImageIcon className="w-4 h-4 text-indigo-600" /> Media & Uploads (Cloudinary)
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Configure Cloudinary for photos and logos. Use an <strong>unsigned upload preset</strong>.
              Get a free account at <a href="https://cloudinary.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">cloudinary.com</a>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Cloud Name</label>
                <input value={form.cloudinaryCloudName} onChange={e => field('cloudinaryCloudName', e.target.value)} placeholder="e.g. my-school-cloud"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Upload Preset (unsigned)</label>
                <div className="relative">
                  <input type={showPreset ? 'text' : 'password'} value={form.cloudinaryUploadPreset}
                    onChange={e => field('cloudinaryUploadPreset', e.target.value)} placeholder="e.g. avenir_unsigned"
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                  <button type="button" onClick={() => setShowPreset(!showPreset)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPreset ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Logo URL</label>
              <input value={form.logoUrl} onChange={e => field('logoUrl', e.target.value)} placeholder="Paste a URL or use the upload button"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              {form.logoUrl && <img src={form.logoUrl} alt="School logo" className="mt-2 h-14 w-14 object-contain rounded-lg border border-slate-200" />}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Custom Favicon URL</label>
              <p className="text-xs text-slate-400 mb-1.5">Direct URL to .png, .ico, or .svg — shown in browser tabs.</p>
              <div className="flex items-center gap-3">
                <input value={form.faviconUrl || ''} onChange={e => field('faviconUrl', e.target.value)} placeholder="https://example.com/favicon.png"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                {form.faviconUrl && <img src={form.faviconUrl} alt="Favicon" className="w-8 h-8 object-contain rounded border border-slate-200 bg-slate-50 p-0.5" />}
              </div>
            </div>
            {form.cloudinaryCloudName && form.cloudinaryUploadPreset ? (
              <CloudinaryLogoUpload cloudName={form.cloudinaryCloudName} uploadPreset={form.cloudinaryUploadPreset} onUploaded={url => field('logoUrl', url)} />
            ) : (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Enter Cloud Name and Upload Preset above to enable direct image uploads.
              </p>
            )}
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: ACADEMIC
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'academic' && (
        <div className="space-y-6">

          {/* Academic Period */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <Calendar className="w-4 h-4 text-indigo-600" /> Academic Period
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current Session / Year</label>
                <input value={form.currentSession} onChange={e => field('currentSession', e.target.value)} placeholder="e.g. 2025/2026"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current Term</label>
                <select value={form.currentTerm} onChange={e => field('currentTerm', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  {TERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Term Structure</label>
                <select value={form.termStructure || '3-term'} onChange={e => field('termStructure', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value="3-term">3-Term (UK / Africa)</option>
                  <option value="2-semester">2-Semester (EU / US Universities)</option>
                  <option value="4-quarter">4-Quarter (US K-12)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Academic Configuration */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-indigo-600" /> Academic Configuration
            </h2>
            <p className="text-xs text-slate-500 mb-5">Grading system, academic levels, custom subjects, and timetable periods.</p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Grading System</label>
              <select value={form.gradingSystem} onChange={e => field('gradingSystem', e.target.value as GradingSystem)}
                className="w-full sm:w-72 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value="waec">WAEC / NECO (A1–F9) — Nigerian</option>
                <option value="percentage">Percentage (A+, A, B, C, D, F)</option>
                <option value="gpa4">GPA 4.0 — US / International</option>
                <option value="ib">IB Scale (1–7) — International Baccalaureate</option>
                <option value="custom">Custom Scale</option>
              </select>
              {form.gradingSystem === 'custom' && (
                <div className="mt-4">
                  <CustomGradeScaleEditor scale={form.customGradingScale} onChange={s => field('customGradingScale', s)} />
                </div>
              )}
            </div>

            <div className="mb-6">
              <OrderableLevelEditor
                items={form.schoolLevels}
                onReorder={levels => field('schoolLevels', levels)}
                onAdd={v => field('schoolLevels', [...form.schoolLevels, v])}
                onRemove={i => field('schoolLevels', form.schoolLevels.filter((_, idx) => idx !== i))}
              />
            </div>

            <div className="mb-6">
              <TagListEditor label="Additional / Custom Subjects" items={form.customSubjects} placeholder="e.g. Slovenian Language, IB Theory of Knowledge"
                onAdd={v => field('customSubjects', [...form.customSubjects, v])}
                onRemove={i => field('customSubjects', form.customSubjects.filter((_, idx) => idx !== i))} />
            </div>

            <div>
              <TagListEditor label="Timetable Period Times (HH:MM)" items={form.periodTimes} placeholder="e.g. 08:30"
                validate={validateTime}
                onAdd={v => field('periodTimes', [...form.periodTimes, v].sort())}
                onRemove={i => field('periodTimes', form.periodTimes.filter((_, idx) => idx !== i))} />
            </div>
          </section>

          {/* Student ID Format */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Hash className="w-4 h-4 text-indigo-600" /> Student ID Format
            </h2>
            <p className="text-xs text-slate-500 mb-5">Define how student IDs are generated. Changes apply to new students only.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Prefix</label>
                <input value={form.studentIdPrefix} onChange={e => field('studentIdPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="e.g. KIS" maxLength={6}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono uppercase" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Format</label>
                <select value={form.studentIdFormat} onChange={e => field('studentIdFormat', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white">
                  <option value="PREFIX-YEAR-SEQ">PREFIX-YEAR-SEQ</option>
                  <option value="PREFIXYEARSEQ">PREFIXYEARSEQ</option>
                  <option value="PREFIX-SEQ">PREFIX-SEQ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Sequence Digits</label>
                <input type="number" min={2} max={8} value={form.studentIdPadding}
                  onChange={e => field('studentIdPadding', Math.max(2, Math.min(8, Number(e.target.value))))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Preview:</span>
              <span className="font-mono font-bold text-indigo-700 text-sm">
                {previewStudentId(form.studentIdPrefix || 'STU', form.studentIdFormat, form.studentIdPadding)}
              </span>
            </div>
            <div className="mt-5 pt-5 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Auto-provision student login from class
              </label>
              <p className="text-xs text-slate-500 mb-2">
                On admission approval, students at or above this class get a school email and temp password auto-generated.
                Younger students rely on their parent's portal account.
              </p>
              <select
                value={form.studentAccountMinClass ?? ''}
                onChange={e => field('studentAccountMinClass', e.target.value || undefined)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="">Disabled — never auto-create student accounts</option>
                {(form.schoolLevels?.length ? form.schoolLevels : []).map(c => (
                  <option key={c} value={c}>{c} and above</option>
                ))}
              </select>
            </div>
          </section>

          {/* Assessment & Grading Rules */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-indigo-600" /> Assessment & Grading Rules
            </h2>
            <p className="text-xs text-slate-500 mb-5">Define score allocation, pass marks, and what appears on report cards.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">CA max score</label>
                <input type="number" min={0} max={100} value={form.caMaxScore}
                  onChange={e => field('caMaxScore', Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Exam max score</label>
                <input type="number" min={0} max={100} value={form.examMaxScore}
                  onChange={e => field('examMaxScore', Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                {(form.caMaxScore + form.examMaxScore) !== 100 && (
                  <p className="text-xs text-amber-600 mt-1">CA + Exam = {form.caMaxScore + form.examMaxScore} (should be 100)</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Pass mark (%)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={30} max={70} step={5} value={form.passMarkPercent}
                    onChange={e => field('passMarkPercent', Number(e.target.value))} className="flex-1 accent-indigo-600" />
                  <span className="text-sm font-bold text-indigo-700 w-10 text-right">{form.passMarkPercent}%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Score decimal places on reports</label>
                <select value={form.reportScoreDecimals} onChange={e => field('reportScoreDecimals', Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value={0}>Whole number (e.g. 74)</option>
                  <option value={1}>1 decimal place (e.g. 74.5)</option>
                  <option value={2}>2 decimal places (e.g. 74.50)</option>
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <ToggleRow label="Show class position on report cards"
                description="Displays each student's rank within their class for every subject."
                checked={form.showPositionOnReport} onChange={v => field('showPositionOnReport', v)} />
              <ToggleRow label="Show teacher comment field"
                description="Includes a free-text comment box for the form tutor on each report."
                checked={form.showTeacherComment} onChange={v => field('showTeacherComment', v)} />
              <ToggleRow label="Show psychomotor / skills section"
                description="Appends skills and behaviour ratings to the report card."
                checked={form.showSkillsOnReport} onChange={v => field('showSkillsOnReport', v)} />
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: SUBJECTS
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" /> Subject Management
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Manage your school's subjects, assign them to classes and teachers.</p>
              </div>
              <button
                onClick={() => { setSubjectForm({ name: '', code: '', description: '', assignedClasses: [], level: 'All', isBuiltIn: false }); setEditingSubject(null); setShowSubjectForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
                <Plus className="w-4 h-4" /> New Subject
              </button>
            </div>

            {/* Level filter */}
            <div className="flex gap-2 mb-4">
              {(['All', 'Primary', 'Secondary'] as const).map(lvl => (
                <button key={lvl} onClick={() => setSubjectLevelFilter(lvl)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${subjectLevelFilter === lvl ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {lvl}
                </button>
              ))}
            </div>

            {/* Built-in subjects */}
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Built-in Subjects ({SUBJECTS.length})</p>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map(s => (
                  <span key={s} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>

            {/* Custom subjects from Firestore */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                Custom Subjects ({subjectDefs.filter(s => subjectLevelFilter === 'All' || s.level === subjectLevelFilter).length})
              </p>
              {subjectDefs.filter(s => subjectLevelFilter === 'All' || s.level === subjectLevelFilter).length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No custom subjects yet. Click "New Subject" to add one.</p>
              ) : (
                <div className="space-y-2">
                  {subjectDefs
                    .filter(s => subjectLevelFilter === 'All' || s.level === subjectLevelFilter)
                    .map(s => (
                      <div key={s.id} className="flex items-start justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{s.name}</span>
                            {s.code && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-mono">{s.code}</span>}
                            {s.level && s.level !== 'All' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">{s.level}</span>}
                          </div>
                          {s.description && <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>}
                          {s.assignedClasses.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {s.assignedClasses.map(c => (
                                <span key={c} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{c}</span>
                              ))}
                            </div>
                          )}
                          {s.assignedTeacherName && (
                            <p className="text-xs text-slate-400 mt-0.5">Teacher: {s.assignedTeacherName}</p>
                          )}
                        </div>
                        <div className="flex gap-1 ml-3">
                          <button onClick={() => { setSubjectForm({ ...s }); setEditingSubject(s); setShowSubjectForm(true); }}
                            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
                            <Hash className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button onClick={() => handleDeleteSubject(s.id!)}
                            className="p-1.5 hover:bg-rose-100 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>

          {/* Add / Edit Subject Modal */}
          {showSubjectForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-bold text-slate-900">{editingSubject ? 'Edit Subject' : 'New Subject'}</h2>
                  <button onClick={() => setShowSubjectForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject Name *</label>
                      <input value={subjectForm.name} onChange={e => setSubjectForm(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        placeholder="e.g. French" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Code (optional)</label>
                      <input value={subjectForm.code || ''} onChange={e => setSubjectForm(p => ({ ...p, code: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                        placeholder="e.g. FRN" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Description (optional)</label>
                    <textarea value={subjectForm.description || ''} onChange={e => setSubjectForm(p => ({ ...p, description: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                      placeholder="Brief description of the subject" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Level</label>
                    <select value={subjectForm.level || 'All'} onChange={e => setSubjectForm(p => ({ ...p, level: e.target.value as any }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      <option value="All">All Levels</option>
                      <option value="Primary">Primary</option>
                      <option value="Secondary">Secondary</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Assigned Classes</label>
                    <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto p-2 space-y-1">
                      {subjectClassNames.map(cn => (
                        <label key={cn} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer">
                          <input type="checkbox"
                            checked={subjectForm.assignedClasses.includes(cn)}
                            onChange={e => setSubjectForm(p => ({
                              ...p,
                              assignedClasses: e.target.checked
                                ? [...p.assignedClasses, cn]
                                : p.assignedClasses.filter(c => c !== cn)
                            }))}
                            className="rounded" />
                          <span className="text-sm text-slate-700">{cn}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Leave empty to show in all classes.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Assigned Teacher (optional)</label>
                    <select
                      value={subjectForm.assignedTeacherId || ''}
                      onChange={e => {
                        const t = subjectTeachers.find(x => x.uid === e.target.value);
                        setSubjectForm(p => ({ ...p, assignedTeacherId: t?.uid || '', assignedTeacherName: t?.displayName || '' }));
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      <option value="">Unassigned</option>
                      {subjectTeachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={() => setShowSubjectForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button onClick={handleSaveSubject} disabled={savingSubject || !subjectForm.name.trim()}
                    className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50 flex items-center gap-2">
                    {savingSubject && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {editingSubject ? 'Update Subject' : 'Add Subject'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: ADMISSIONS
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'admissions' && (
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <ClipboardCheck className="w-4 h-4 text-indigo-600" /> Admissions & Enrolment
            </h2>
            <p className="text-xs text-slate-500 mb-5">Control online application intake and enrolment rules.</p>
            <div className="space-y-4 mb-6">
              <ToggleRow label="Admissions portal open"
                description="When off, the /apply page shows a 'Closed' message and new applications cannot be submitted."
                checked={form.admissionsOpen} onChange={v => field('admissionsOpen', v)} />
              <ToggleRow label="Require document uploads"
                description="Applicants must attach supporting documents before submitting."
                checked={form.requireDocuments} onChange={v => field('requireDocuments', v)} />
              <ToggleRow label="Auto-approve applications"
                description="Newly submitted applications are automatically set to Approved without admin review."
                checked={form.autoApproveApplications} onChange={v => field('autoApproveApplications', v)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Max open applications <span className="font-normal text-slate-400">(0 = unlimited)</span>
                </label>
                <input type="number" min={0} max={9999} value={form.maxApplications}
                  onChange={e => field('maxApplications', Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Minimum enrolment age (years)
                </label>
                <input type="number" min={1} max={21} value={form.minimumEnrolmentAge}
                  onChange={e => field('minimumEnrolmentAge', Math.max(1, Math.min(21, Number(e.target.value))))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: ATTENDANCE
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-indigo-600" /> Attendance
            </h2>
            <p className="text-xs text-slate-500 mb-5">Set thresholds and rules that govern how attendance is recorded and enforced.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Late threshold (minutes)</label>
                <input type="number" min={1} max={120} value={form.lateThresholdMinutes}
                  onChange={e => field('lateThresholdMinutes', Math.max(1, Math.min(120, Number(e.target.value))))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                <p className="text-xs text-slate-400 mt-1">Arrivals after this many minutes are marked "Late".</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School days per week</label>
                <select value={form.schoolDaysPerWeek} onChange={e => field('schoolDaysPerWeek', Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value={5}>5 days (Mon – Fri)</option>
                  <option value={6}>6 days (Mon – Sat)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Attendance warning threshold (%)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={50} max={95} step={5} value={form.attendanceWarningThreshold}
                    onChange={e => field('attendanceWarningThreshold', Number(e.target.value))} className="flex-1 accent-indigo-600" />
                  <span className="text-sm font-bold text-indigo-700 w-12 text-right">{form.attendanceWarningThreshold}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Triggers a warning flag on the student profile.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Exam eligibility threshold (%)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={50} max={95} step={5} value={form.attendanceExamThreshold}
                    onChange={e => field('attendanceExamThreshold', Number(e.target.value))} className="flex-1 accent-indigo-600" />
                  <span className="text-sm font-bold text-indigo-700 w-12 text-right">{form.attendanceExamThreshold}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Students below this cannot sit exams.</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: NOTIFICATIONS
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-indigo-600" /> Notifications & Communication
            </h2>
            <p className="text-xs text-slate-500 mb-5">Configure automated alerts sent to parents and staff.</p>
            <div className="space-y-4 mb-6">
              <ToggleRow label="Fee due reminders"
                description="Automatically notify parents when a fee invoice is approaching its due date."
                checked={form.feeReminderEnabled} onChange={v => field('feeReminderEnabled', v)} />
              {form.feeReminderEnabled && (
                <div className="ml-14">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Days before due date</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={1} max={30} step={1} value={form.feeReminderDaysBefore}
                      onChange={e => field('feeReminderDaysBefore', Number(e.target.value))} className="w-48 accent-indigo-600" />
                    <span className="text-sm font-bold text-indigo-700">{form.feeReminderDaysBefore} day{form.feeReminderDaysBefore !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
              <ToggleRow label="Absence alerts"
                description="Send a notification to the parent when their child is marked absent."
                checked={form.absenceAlertEnabled} onChange={v => field('absenceAlertEnabled', v)} />
              <ToggleRow label="Result / report card notifications"
                description="Notify parents when a new term result is published."
                checked={form.resultNotificationEnabled} onChange={v => field('resultNotificationEnabled', v)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">WhatsApp sender phone number</label>
              <input value={form.whatsappSenderPhone} onChange={e => field('whatsappSenderPhone', e.target.value)}
                placeholder="e.g. +2348012345678"
                className="w-full sm:w-72 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              <p className="text-xs text-slate-400 mt-1">Used by the WhatsApp Notifications module as the sender ID.</p>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: ACCESS & REPORTS
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'access' && (
        <div className="space-y-6">

          {/* Portal & Access Control */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Portal & Access Control
            </h2>
            <p className="text-xs text-slate-500 mb-5">Choose what parents and teachers can see and do in their portals.</p>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Parent Portal</p>
            <div className="space-y-4 mb-6">
              <ToggleRow label="Parents can view grades"
                description="Shows subject scores and grade letters in the parent portal."
                checked={form.parentCanViewGrades} onChange={v => field('parentCanViewGrades', v)} />
              <ToggleRow label="Parents can view attendance"
                description="Shows daily attendance history for linked children."
                checked={form.parentCanViewAttendance} onChange={v => field('parentCanViewAttendance', v)} />
              <ToggleRow label="Parents can download report cards"
                description="Enables the PDF download button on report cards in the parent portal."
                checked={form.parentCanDownloadReports} onChange={v => field('parentCanDownloadReports', v)} />
            </div>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Teacher Portal</p>
            <div className="space-y-4 mb-6">
              <ToggleRow label="Teachers can enter & edit grades"
                description="Allows teachers to input CA and exam scores for their classes."
                checked={form.teacherCanEnterGrades} onChange={v => field('teacherCanEnterGrades', v)} />
              <ToggleRow label="Teachers can view their timetable"
                description="Shows the class timetable for each teacher in the teacher portal."
                checked={form.teacherCanViewTimetable} onChange={v => field('teacherCanViewTimetable', v)} />
            </div>

            <div className="sm:w-64">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Session timeout <span className="font-normal text-slate-400">(0 = never)</span>
              </label>
              <select value={form.sessionTimeoutMinutes} onChange={e => field('sessionTimeoutMinutes', Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value={0}>Never</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={480}>8 hours</option>
              </select>
            </div>
          </section>

          {/* Report Card & Printing */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-indigo-600" /> Report Card & Printing
            </h2>
            <p className="text-xs text-slate-500 mb-5">Customise the layout and content of printed report cards.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Paper size</label>
                <select value={form.reportPaperSize} onChange={e => field('reportPaperSize', e.target.value as SchoolSettings['reportPaperSize'])}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="Letter">Letter (8.5 × 11 in)</option>
                  <option value="A5">A5 (148 × 210 mm)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Report card footer text</label>
                <input value={form.reportFooterText} onChange={e => field('reportFooterText', e.target.value)}
                  placeholder="e.g. This report is computer generated."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
            </div>
            <div className="space-y-4">
              <ToggleRow label="Show school logo on report header"
                description="Prints the school logo at the top of every report card."
                checked={form.reportShowLogo} onChange={v => field('reportShowLogo', v)} />
              <ToggleRow label="Show watermark / official stamp"
                description="Overlays a faint school stamp watermark on the printed page."
                checked={form.reportWatermarkEnabled} onChange={v => field('reportWatermarkEnabled', v)} />
            </div>
          </section>

          {/* Finance & Payroll */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-indigo-600" /> Finance & Payroll
            </h2>
            <p className="text-xs text-slate-500 mb-5">Configure the tax / deduction model for staff payroll.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tax / Deduction Model</label>
                <select value={form.taxModel} onChange={e => field('taxModel', e.target.value as SchoolSettings['taxModel'])}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value="none">No Deductions</option>
                  <option value="flat_rate">Flat Rate (%)</option>
                  <option value="nigeria_paye">Nigeria PAYE (Graduated Brackets)</option>
                </select>
              </div>
              {form.taxModel === 'flat_rate' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tax Rate (%)</label>
                  <input type="number" min={0} max={50} value={form.taxFlatRate}
                    onChange={e => field('taxFlatRate', Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              )}
            </div>
          </section>

          {/* AI & CBT */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-indigo-600" /> AI & Computer-Based Testing (CBT)
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Control AI curriculum document features and the CBT exam engine for your school.
            </p>
            <div className="space-y-4 mb-5">
              <ToggleRow
                label="Enable AI Curriculum Training"
                description="Allow admins and teachers to upload curriculum documents for AI summarisation and context-aware question generation."
                checked={form.aiCurriculumEnabled}
                onChange={v => field('aiCurriculumEnabled', v)}
              />
              <ToggleRow
                label="Enable CBT Exam Engine"
                description="Activate the computer-based testing engine for entrance exams and internal assessments."
                checked={form.cbtEnabled}
                onChange={v => field('cbtEnabled', v)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Max curriculum documents <span className="font-normal normal-case text-slate-400">(0 = unlimited)</span>
                </label>
                <input
                  type="number" min={0} max={500}
                  value={form.maxCurriculumDocs}
                  onChange={e => field('maxCurriculumDocs', Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">CBT allowed for</label>
                <div className="flex gap-3 pt-1">
                  {(['student', 'applicant'] as const).map(role => (
                    <label key={role} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.cbtAllowedRoles.includes(role)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...form.cbtAllowedRoles, role]
                            : form.cbtAllowedRoles.filter(r => r !== role);
                          field('cbtAllowedRoles', next);
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700 capitalize">{role}s</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Exam Result Access */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-indigo-600" /> Exam Result Access
            </h2>
            <p className="text-xs text-slate-500 mb-4">When locked, students and parents must use a PIN to view results.</p>
            <ToggleRow
              label={form.examLocked ? '🔒 Exam results are LOCKED (PIN required)' : '🔓 Exam results are OPEN'}
              checked={form.examLocked} onChange={v => field('examLocked', v)} />
          </section>

          {/* Danger Zone */}
          <DangerZone />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: GEO-FENCE
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'geofence' && (
        <div className="space-y-6">

          {/* Info banner */}
          <section className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 flex gap-4 items-start">
            <MapPin className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-indigo-900 text-sm">GPS-based Teacher Attendance</p>
              <p className="text-indigo-700 text-xs mt-1 leading-relaxed">
                Define a circular boundary around the school campus. Teachers must check in from within
                this boundary for their attendance to be marked automatically. Set the centre to the
                school's main entrance and choose a radius that covers the full campus.
              </p>
            </div>
          </section>

          {/* Current fence status */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Navigation className="w-4 h-4 text-indigo-600" /> Current Geo-fence
            </h2>
            {geofence ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Latitude',  value: geofence.lat.toFixed(6) },
                  { label: 'Longitude', value: geofence.lng.toFixed(6) },
                  { label: 'Radius',    value: `${geofence.radius} m` },
                  { label: 'Status',    value: 'Active', color: 'text-emerald-600' },
                ].map(c => (
                  <div key={c.label} className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{c.label}</p>
                    <p className={`font-bold text-slate-800 text-sm font-mono ${c.color ?? ''}`}>{c.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                No geo-fence configured yet. Set one below to enable GPS check-in for teachers.
              </div>
            )}
          </section>

          {/* Configure fence */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <MapPin className="w-4 h-4 text-indigo-600" /> Configure Boundary
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Centre Latitude
                </label>
                <input
                  type="number" step="0.0000001"
                  value={geofenceForm.lat}
                  onChange={e => setGeofenceForm(f => ({ ...f, lat: e.target.value }))}
                  placeholder="e.g. 6.5244"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Centre Longitude
                </label>
                <input
                  type="number" step="0.0000001"
                  value={geofenceForm.lng}
                  onChange={e => setGeofenceForm(f => ({ ...f, lng: e.target.value }))}
                  placeholder="e.g. 3.3792"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Radius (metres)
                </label>
                <input
                  type="number" min={50} max={5000} step={10}
                  value={geofenceForm.radius}
                  onChange={e => setGeofenceForm(f => ({ ...f, radius: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
            </div>

            {/* Radius presets */}
            <div className="flex flex-wrap gap-2 mb-6">
              <p className="w-full text-xs text-slate-500 mb-1">Quick radius presets:</p>
              {[100, 200, 300, 500, 1000].map(r => (
                <button key={r}
                  onClick={() => setGeofenceForm(f => ({ ...f, radius: String(r) }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    geofenceForm.radius === String(r)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}>
                  {r} m
                </button>
              ))}
            </div>

            {/* Map preview */}
            <GeoFenceMapPreview
              lat={parseFloat(geofenceForm.lat) || null}
              lng={parseFloat(geofenceForm.lng) || null}
              radius={parseInt(geofenceForm.radius, 10) || 200}
              onMapClick={(lat, lng) => setGeofenceForm(f => ({
                ...f,
                lat: lat.toFixed(7),
                lng: lng.toFixed(7),
              }))}
            />

            {/* Address search */}
            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Search by Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addressSearch}
                  onChange={e => setAddressSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddressSearch()}
                  placeholder="e.g. 12 Admiralty Way, Lekki, Lagos"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
                <button
                  onClick={handleAddressSearch}
                  disabled={addressSearching || !addressSearch.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-colors text-sm disabled:opacity-50"
                >
                  {addressSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  {addressSearching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Powered by OpenStreetMap — no API key required</p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleDetectLocation}
                disabled={detectingLocation}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm disabled:opacity-60">
                {detectingLocation
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Navigation className="w-4 h-4" />}
                {detectingLocation ? 'Detecting…' : 'Use My Current Location'}
              </button>
              <button
                onClick={handleSaveGeofence}
                disabled={savingGeofence}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-60 text-sm">
                {savingGeofence ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingGeofence ? 'Saving…' : 'Save Geo-fence'}
              </button>
            </div>
          </section>

          {/* Tips */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm mb-4">Setup Tips</h2>
            <ul className="space-y-3 text-sm text-slate-600">
              {[
                'Walk to the school main entrance and click "Use My Current Location" to auto-fill the coordinates.',
                'A radius of 150–300 m works well for most school campuses. Increase it for larger multi-building sites.',
                'Teachers will see a "Check In" button on their portal only when a geo-fence is configured.',
                'If a teacher checks in from outside the boundary, the check-in is still recorded but flagged as out-of-fence.',
                'Coordinates are stored in decimal degrees (WGS-84). You can copy them from Google Maps.',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </section>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: CUSTOMIZATION
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'customize' && (
        <div className="space-y-6">

          {/* Colors & Theme */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Palette className="w-4 h-4 text-indigo-600" /> Colors & Theme
            </h2>
            <p className="text-xs text-slate-500 mb-5">Set your school's brand colors. These apply across the portal, sidebar, and public pages.</p>

            {/* Preset swatches */}
            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Color Presets</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => { field('primaryColor', preset.value); field('colorPreset', preset.name); }}
                    title={preset.name}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all"
                    style={{
                      borderColor: form.primaryColor === preset.value ? preset.value : 'transparent',
                      backgroundColor: form.primaryColor === preset.value ? preset.value + '15' : '#f8fafc',
                      color: preset.value,
                    }}
                  >
                    <span className="w-4 h-4 rounded-full inline-block shrink-0" style={{ backgroundColor: preset.value }} />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primaryColor || '#4f46e5'} onChange={e => { field('primaryColor', e.target.value); field('colorPreset', ''); }}
                    className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input type="text" value={form.primaryColor || '#4f46e5'} onChange={e => { field('primaryColor', e.target.value); field('colorPreset', ''); }}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" placeholder="#4f46e5" />
                </div>
                <p className="text-xs text-slate-400 mt-1">Used for buttons, active nav items, and accents.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Secondary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.secondaryColor || '#818cf8'} onChange={e => field('secondaryColor', e.target.value)}
                    className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input type="text" value={form.secondaryColor || ''} onChange={e => field('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" placeholder="#818cf8" />
                </div>
                <p className="text-xs text-slate-400 mt-1">Used for highlights and secondary elements.</p>
              </div>
            </div>

            {/* Sidebar style */}
            <div className="mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Sidebar Style</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { id: 'dark',    label: 'Dark',    preview: 'bg-slate-900' },
                  { id: 'light',   label: 'Light',   preview: 'bg-white border border-slate-200' },
                  { id: 'brand',   label: 'Brand',   preview: '' },
                  { id: 'minimal', label: 'Minimal', preview: 'bg-slate-100 border border-slate-200' },
                ] as const).map(style => (
                  <button
                    key={style.id}
                    onClick={() => field('sidebarStyle', style.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      form.sidebarStyle === style.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-full h-10 rounded-lg ${style.preview}`}
                      style={style.id === 'brand' ? { backgroundColor: form.primaryColor || '#4f46e5' } : {}}
                    >
                      <div className="h-full flex flex-col justify-center px-2 gap-1">
                        <div className={`h-1.5 w-3/4 rounded ${style.id === 'dark' ? 'bg-slate-600' : style.id === 'brand' ? 'bg-white/40' : 'bg-slate-200'}`} />
                        <div className={`h-1.5 w-1/2 rounded ${style.id === 'dark' ? 'bg-indigo-500' : style.id === 'brand' ? 'bg-white/80' : 'bg-indigo-300'}`} />
                        <div className={`h-1.5 w-2/3 rounded ${style.id === 'dark' ? 'bg-slate-600' : style.id === 'brand' ? 'bg-white/40' : 'bg-slate-200'}`} />
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${form.sidebarStyle === style.id ? 'text-indigo-700' : 'text-slate-600'}`}>{style.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Font */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Brush className="w-4 h-4 text-indigo-600" /> Typography
            </h2>
            <p className="text-xs text-slate-500 mb-4">Choose a Google Font for the portal interface.</p>
            <div className="sm:w-64">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Font Family</label>
              <select value={form.fontFamily || 'Inter'} onChange={e => field('fontFamily', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </section>

          {/* Login Page */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Monitor className="w-4 h-4 text-indigo-600" /> Login Page Branding
            </h2>
            <p className="text-xs text-slate-500 mb-5">Customise the school-branded login page at <code className="text-indigo-600">/s/&#123;slug&#125;/login</code>.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Welcome Headline</label>
                <input value={form.loginWelcomeText || ''} onChange={e => field('loginWelcomeText', e.target.value)}
                  placeholder="e.g. Welcome to Greenfield Academy Portal"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tagline</label>
                <input value={form.loginTagline || ''} onChange={e => field('loginTagline', e.target.value)}
                  placeholder="e.g. Shaping tomorrow's leaders today"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Login Background Image URL</label>
                <input value={form.loginBgImageUrl || ''} onChange={e => field('loginBgImageUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                <p className="text-xs text-slate-400 mt-1">Upload to Cloudinary and paste the URL here.</p>
              </div>
            </div>
          </section>

          {/* Public Landing Page */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-indigo-600" /> Public Landing Page
            </h2>
            <p className="text-xs text-slate-500 mb-5">Content shown on the school's public-facing admissions portal.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Hero Banner Image URL</label>
                <input value={form.heroBannerImageUrl || ''} onChange={e => field('heroBannerImageUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Description</label>
                <textarea value={form.schoolDescription || ''} onChange={e => field('schoolDescription', e.target.value)} rows={3}
                  placeholder="A short paragraph about your school shown on the landing page…"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Social Links</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['website', 'facebook', 'instagram', 'twitter'] as const).map(platform => (
                    <div key={platform}>
                      <label className="block text-xs text-slate-500 capitalize mb-1">{platform === 'twitter' ? 'X / Twitter' : platform.charAt(0).toUpperCase() + platform.slice(1)}</label>
                      <input
                        value={(form.socialLinks as any)?.[platform] || ''}
                        onChange={e => field('socialLinks', { ...form.socialLinks, [platform]: e.target.value })}
                        placeholder={`https://${platform === 'twitter' ? 'x' : platform}.com/…`}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Application Form */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-indigo-600" /> Application Form
            </h2>
            <p className="text-xs text-slate-500 mb-5">Personalise what applicants see on the online application form.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Application Intro Text</label>
                <textarea value={form.applicationIntroText || ''} onChange={e => field('applicationIntroText', e.target.value)} rows={2}
                  placeholder="e.g. Thank you for your interest in enrolling at Greenfield Academy…"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
              </div>
              <div className="sm:w-64">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Application Deadline</label>
                <input type="date" value={form.applicationDeadline || ''} onChange={e => field('applicationDeadline', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                <p className="text-xs text-slate-400 mt-1">Shown as a countdown on the landing page.</p>
              </div>
            </div>
          </section>

          {/* Portal Dashboard */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <Monitor className="w-4 h-4 text-indigo-600" /> Portal Dashboard
            </h2>
            <p className="text-xs text-slate-500 mb-5">Personalise the internal portal experience for your staff.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">App Display Name</label>
                <input value={form.appDisplayName || ''} onChange={e => field('appDisplayName', e.target.value)}
                  placeholder="e.g. Greenfield Academy Portal"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                <p className="text-xs text-slate-400 mt-1">Shown in the nav header instead of "AvenirSMS".</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dashboard Welcome Banner</label>
                <input value={form.dashboardBannerText || ''} onChange={e => field('dashboardBannerText', e.target.value)}
                  placeholder="e.g. Welcome back! Have a great term."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Student Portal Style</label>
                <p className="text-xs text-slate-400 mb-2">Choose the visual feel of the student portal based on your students' age group.</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['primary', 'secondary'] as const).map(tier => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => field('studentAgeTier', tier)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        (form.studentAgeTier || 'primary') === tier
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{tier === 'primary' ? '🎨' : '📘'}</div>
                      <p className="text-sm font-bold text-slate-900">
                        {tier === 'primary' ? 'Primary (Playful)' : 'Secondary (Toned-down)'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {tier === 'primary'
                          ? 'Bright pastels, big emoji icons, illustrated headers — for younger students.'
                          : 'Cleaner palette, smaller icons, no emoji — for teens.'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* URL Slug — super admin only */}
          {isSuperAdmin && (
            <section className="bg-white rounded-2xl border-2 border-purple-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="w-4 h-4 text-purple-600" />
                <h2 className="font-bold text-slate-800 text-sm">Custom URL Slug</h2>
                <span className="ml-auto text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Super Admin Only</span>
              </div>
              <p className="text-xs text-slate-500 mb-5">
                Give this school a short, memorable URL. The public landing page will be accessible at
                {' '}<span className="font-mono text-purple-700">/s/&#123;your-slug&#125;</span> in addition to the raw school ID.
              </p>

              {form.urlSlug && (
                <div className="mb-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Current slug: <span className="font-mono font-bold">{form.urlSlug}</span>
                  <a href={`/s/${form.urlSlug}`} target="_blank" rel="noopener noreferrer" className="ml-auto hover:text-emerald-800">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                    <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200 shrink-0">/s/</span>
                    <input
                      value={slugInput}
                      onChange={e => {
                        const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                        setSlugInput(v);
                        setSlugAvailable(null);
                      }}
                      onBlur={() => checkSlugAvailability(slugInput.trim())}
                      placeholder="greenfield-academy"
                      className="flex-1 px-3 py-2.5 outline-none text-sm font-mono bg-white"
                      maxLength={50}
                    />
                    {slugChecking && <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-2" />}
                    {!slugChecking && slugAvailable === true && <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-2" />}
                    {!slugChecking && slugAvailable === false && <XCircle className="w-4 h-4 text-red-500 mx-2" />}
                  </div>
                  {slugAvailable === false && (
                    <p className="text-xs text-red-600 mt-1">This slug is already taken by another school.</p>
                  )}
                  {slugAvailable === true && (
                    <p className="text-xs text-emerald-600 mt-1">This slug is available!</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Lowercase letters, numbers, and hyphens only. 3–50 characters.</p>
                </div>
                <button
                  onClick={handleSaveSlug}
                  disabled={slugSaving || slugAvailable === false}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-sm disabled:opacity-60 text-sm whitespace-nowrap"
                >
                  {slugSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Slug
                </button>
              </div>
            </section>
          )}

        </div>
      )}

      {/* ── Sticky bottom save bar (visible on all tabs when dirty) ── */}
      {isDirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-xl disabled:opacity-60 text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Collections to wipe (excludes users & school_settings) ──────────────────
const DEMO_COLLECTIONS = [
  { key: 'students',      label: 'Students' },
  { key: 'applications',  label: 'Applications' },
  { key: 'attendance',    label: 'Attendance' },
  { key: 'grades',        label: 'Grades' },
  { key: 'classes',       label: 'Classes' },
  { key: 'class_subjects',label: 'Class Subjects' },
  { key: 'timetables',    label: 'Timetables' },
  { key: 'invoices',      label: 'Invoices' },
  { key: 'fee_payments',  label: 'Fee Payments' },
  { key: 'expenses',      label: 'Expenses' },
  { key: 'events',        label: 'Events' },
  { key: 'assignments',   label: 'Assignments' },
  { key: 'messages',      label: 'Messages' },
  { key: 'exam_seating',  label: 'Exam Seating' },
];

async function deleteCollection(collectionName: string): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  if (snap.empty) return 0;
  // Firestore batch max is 500 writes
  let deleted = 0;
  const chunks: typeof snap.docs[] = [];
  for (let i = 0; i < snap.docs.length; i += 490) {
    chunks.push(snap.docs.slice(i, i + 490));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

function DangerZone() {
  const [selected, setSelected] = useState<Set<string>>(new Set(DEMO_COLLECTIONS.map(c => c.key)));
  const [confirm, setConfirm] = useState('');
  const [clearing, setClearing] = useState(false);
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleClear = async () => {
    if (confirm.trim().toLowerCase() !== 'clear') {
      toast.error('Type "clear" to confirm');
      return;
    }
    setClearing(true);
    const tid = toast.loading('Clearing data…');
    let total = 0;
    try {
      for (const col of DEMO_COLLECTIONS) {
        if (!selected.has(col.key)) continue;
        const count = await deleteCollection(col.key);
        total += count;
      }
      toast.success(`Done — ${total} documents deleted`, { id: tid });
      setStep('idle');
      setConfirm('');
    } catch (e: any) {
      toast.error('Error: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border-2 border-red-200 shadow-sm p-6">
      <h2 className="font-bold text-red-700 text-sm flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4" /> Danger Zone — Clear Test / Demo Data
      </h2>
      <p className="text-xs text-slate-500 mb-5">
        Permanently delete selected collections. <strong>Users</strong> and <strong>School Settings</strong> are always preserved.
        This action <strong>cannot be undone</strong>.
      </p>

      {step === 'idle' && (
        <button
          onClick={() => setStep('confirm')}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-700 border border-red-200 font-bold rounded-xl hover:bg-red-100 transition-colors text-sm">
          <Trash2 className="w-4 h-4" /> Clear Demo Data…
        </button>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          {/* Collection checkboxes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DEMO_COLLECTIONS.map(col => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.has(col.key)}
                  onChange={() => toggle(col.key)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-slate-700">{col.label}</span>
              </label>
            ))}
          </div>

          <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-700">
            <strong>{selected.size}</strong> collection{selected.size !== 1 ? 's' : ''} selected for deletion.
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Type <span className="font-mono text-red-600">clear</span> to confirm
            </label>
            <input
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder='Type "clear" here'
              className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-400 outline-none text-sm font-mono"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClear}
              disabled={clearing || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-50">
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {clearing ? 'Clearing…' : 'Confirm Clear'}
            </button>
            <button
              onClick={() => { setStep('idle'); setConfirm(''); }}
              disabled={clearing}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
