import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/FirebaseProvider';
import { useImpersonation } from '../components/ImpersonationContext';
import { getPostAuthHomePath } from '../utils/postAuthRedirect';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap, Users, ClipboardList, FileText, DollarSign, BookOpen,
  Award, BarChart3, Bell, MessageSquare, Clock, CreditCard, Briefcase,
  Map, CheckCircle2, ArrowRight, Star, Shield, Zap, Globe, Phone,
  Mail, X, ChevronDown, ChevronUp, Sparkles, UserCheck, TrendingUp,
  CheckCircle, Key, Layers, Database, Activity, Menu, ExternalLink,
  Compass, Github, Target, Copy, Loader2, Lock,
} from 'lucide-react';
import { CURRENT_SESSION } from '../types';

// ─── Data ─────────────────────────────────────────────────────────────────────

/** Sister product: adaptive career discovery for JSS & SSS (Vite + React; live on Vercel). */
const AVENIR_CAREER_URL = 'https://avenir-hazel.vercel.app/';
const AVENIR_CAREER_REPO = 'https://github.com/bobychampion/avenir';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Career Discovery', href: '#avenir-career' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

const FEATURES = [
  {
    icon: Users, color: 'bg-blue-500',
    title: 'Student Management',
    desc: 'Complete student records with medical history, guardian linkage, sibling mapping, and academic history tracking.',
  },
  {
    icon: ClipboardList, color: 'bg-green-500',
    title: 'Attendance Tracking',
    desc: 'Daily roll-call with present/absent/late status, class-level reporting, and automated alerts for parents.',
  },
  {
    icon: FileText, color: 'bg-orange-500',
    title: 'Automated Report Cards',
    desc: 'Generate and print full-term report cards with subject rankings, psychomotor skills, and AI-written principal remarks.',
  },
  {
    icon: DollarSign, color: 'bg-emerald-500',
    title: 'Online Fee Payments',
    desc: 'Paystack-integrated invoice generation, bulk fee scheduling per class, and real-time payment tracking.',
  },
  {
    icon: Briefcase, color: 'bg-slate-500',
    title: 'Teacher & Parent Portals',
    desc: 'Dedicated dashboards for teachers (grades, assignments, AI tools) and parents (progress, fees, messaging).',
  },
  {
    icon: Sparkles, color: 'bg-violet-500',
    title: 'AI-Powered Insights',
    desc: 'Google Gemini AI generates lesson notes, exam questions, student insights, fee reminders, and payroll summaries.',
  },
  {
    icon: BarChart3, color: 'bg-indigo-500',
    title: 'Analytics Dashboard',
    desc: 'Real-time charts for enrollment trends, grade distribution, revenue vs expenses, and attendance rates.',
  },
  {
    icon: MessageSquare, color: 'bg-sky-500',
    title: 'WhatsApp & Notifications',
    desc: 'Send broadcast messages, fee reminders, and exam notices to parents via WhatsApp and in-app notifications.',
  },
];

const MODULES = [
  { icon: UserCheck, label: 'Admissions Pipeline', color: 'bg-indigo-500' },
  { icon: Users, label: 'Student Profiles', color: 'bg-blue-500' },
  { icon: ClipboardList, label: 'Attendance', color: 'bg-green-500' },
  { icon: BookOpen, label: 'Class Management', color: 'bg-purple-500' },
  { icon: Clock, label: 'Timetable', color: 'bg-cyan-500' },
  { icon: Award, label: 'Gradebook', color: 'bg-amber-500' },
  { icon: FileText, label: 'Report Cards', color: 'bg-orange-500' },
  { icon: GraduationCap, label: 'Exam Management', color: 'bg-rose-500' },
  { icon: DollarSign, label: 'Finance', color: 'bg-emerald-500' },
  { icon: CreditCard, label: 'Payroll', color: 'bg-teal-500' },
  { icon: Briefcase, label: 'Staff / HR', color: 'bg-slate-500' },
  { icon: BarChart3, label: 'Analytics', color: 'bg-violet-500' },
  { icon: Map, label: 'Curriculum Mapping', color: 'bg-lime-500' },
  { icon: ArrowRight, label: 'Student Promotion', color: 'bg-fuchsia-500' },
  { icon: Bell, label: 'Notifications', color: 'bg-sky-500' },
  { icon: MessageSquare, label: 'WhatsApp', color: 'bg-green-600' },
  { icon: Key, label: 'Result PINs', color: 'bg-orange-600' },
  { icon: Database, label: 'Bulk Import', color: 'bg-teal-600' },
  { icon: Shield, label: 'User Management', color: 'bg-pink-500' },
  { icon: Activity, label: 'School Calendar', color: 'bg-blue-600' },
];

const PLANS = [
  {
    name: 'Basic',
    tagline: 'Perfect for small schools just getting started',
    monthlyPrice: 30000,
    yearlyPrice: 300000,
    yearlyDiscount: 17,
    popular: false,
    color: 'border-slate-200',
    badge: '',
    badgeColor: '',
    features: [
      '1 Admin User',
      'Up to 10 Staff/Teachers',
      'Up to 500 Students',
      'Student Management',
      'Attendance Tracking',
      'Fee Management & Paystack',
      'Report Cards & Gradebook',
      'Timetable & Class Management',
      'Parent Portal',
      'WhatsApp Notifications',
      'Email Support',
    ],
    aiFeatures: false,
    cta: 'Get Started',
  },
  {
    name: 'Professional',
    tagline: 'For growing schools that need full control',
    monthlyPrice: 60000,
    yearlyPrice: 600000,
    yearlyDiscount: 17,
    popular: true,
    color: 'border-indigo-500',
    badge: 'Most Popular',
    badgeColor: 'bg-indigo-600 text-white',
    features: [
      '1 Super Admin + 1 Admin Staff',
      'Up to 20 Staff & Teachers',
      'Up to 1,000 Students',
      'Everything in Basic',
      'Exam Seating Management',
      'Curriculum / NERDC Mapping',
      'Student Promotion Module',
      'Result PIN Management',
      'Payroll Management',
      'Analytics Dashboard',
      'Bulk CSV Student Import',
      'Priority Email Support',
    ],
    aiFeatures: true,
    aiList: [
      'AI Lesson Notes Generator',
      'AI Exam Question Generator',
      'AI Student Insights',
      'AI Fee Reminder Drafts',
      'AI Payroll Summaries',
    ],
    cta: 'Get Professional',
  },
  {
    name: 'College',
    tagline: 'Enterprise-grade for large institutions',
    monthlyPrice: 100000,
    yearlyPrice: 1000000,
    yearlyDiscount: 17,
    popular: false,
    color: 'border-amber-400',
    badge: 'Enterprise',
    badgeColor: 'bg-amber-500 text-white',
    features: [
      'Unlimited Admin Accounts',
      'Unlimited Staff & Teachers',
      'Unlimited Students',
      'Everything in Professional',
      'Avenir Career Discovery — complimentary access for students, parents & guidance (see below)',
      'Multi-campus Support',
      'Custom Branding / Logo',
      'Advanced Analytics & Reports',
      'Staff Leave Management',
      'Dedicated Data Migration',
      'SLA-backed Uptime',
      'Phone + WhatsApp Support',
      'Onboarding & Training Session',
    ],
    aiFeatures: true,
    aiList: [
      'All AI Features from Professional',
      'AI Attendance Alert SMS Drafts',
      'AI Curriculum Objectives',
      'AI Report Card Principal Remarks',
      'Custom AI Integrations',
    ],
    cta: 'Contact Sales',
  },
];

const FAQS = [
  {
    q: 'Is Avenir SIS suitable for primary schools?',
    a: 'Yes. Avenir SIS is built for Nigerian Primary 1–6, JSS 1–3, and SSS 1–3 schools. It follows the 6-3-3-4 national curriculum structure with NERDC compliance and WAEC grading (A1–F9).',
  },
  {
    q: 'Can parents and teachers access the system?',
    a: 'Absolutely. Teachers have a dedicated portal for attendance, gradebook, assignments, and AI teaching tools. Parents can view their child\'s progress, pay fees online, and communicate with teachers.',
  },
  {
    q: 'How does the AI feature work?',
    a: 'Avenir SIS integrates Google Gemini AI to generate lesson notes, exam questions, student performance insights, fee reminders, and payroll summaries — all from within the app.',
  },
  {
    q: 'What payment methods are supported?',
    a: 'Fees can be collected via cash, bank transfer, or directly through Paystack (debit card / bank payment). All payments are recorded and invoices generated automatically.',
  },
  {
    q: 'Is there a free trial or demo?',
    a: 'Yes! Request a free demo using the form on this page. Our team will set up a live demo environment with sample data so you can explore every feature before subscribing.',
  },
  {
    q: 'Can I import existing student data?',
    a: 'Yes. The Professional and College plans include a Bulk CSV Import tool that lets you upload hundreds of student records at once with our provided template.',
  },
  {
    q: 'What is Avenir Career Discovery?',
    a: 'It is a separate Avenir product focused on adaptive career discovery for JSS and SSS students — assessments, trait-based insights, and career clusters, with portals for students, parents, teachers, and counselors. College plan schools receive complimentary access for their community at avenir-hazel.vercel.app.',
  },
];

const TESTIMONIALS = [
  {
    name: 'Mrs. Adeyemi Folake',
    role: 'Principal, Bright Future Academy, Lagos',
    text: 'Avenir SIS has completely transformed how we manage our school. The report cards now take minutes instead of days, and parents love the portal.',
    rating: 5,
  },
  {
    name: 'Mr. Ibrahim Suleiman',
    role: 'Admin Officer, Al-Noor School, Abuja',
    text: 'The fee management module alone is worth the subscription. We\'ve reduced payment defaults by 40% since switching to Avenir.',
    rating: 5,
  },
  {
    name: 'Mrs. Chioma Okafor',
    role: 'Proprietress, Greenfield Schools, Enugu',
    text: 'The AI lesson note generator is incredible. My teachers save hours of preparation time every week. Highly recommend!',
    rating: 5,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
      {children}
    </span>
  );
}

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

// ─── Demo Request Modal ───────────────────────────────────────────────────────

const DEMO_DURATION_DAYS = 7;

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

interface DemoForm {
  schoolName: string;
  adminName: string;
  adminEmail: string;
  phone: string;
  phone2: string;
  reportEmail: string;
  plan: string;
  message: string;
}

interface DemoCredentials {
  email: string;
  password: string;
  schoolId: string;
  loginUrl: string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-all ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
    >
      <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function DemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const EMPTY: DemoForm = { schoolName: '', adminName: '', adminEmail: '', phone: '', phone2: '', reportEmail: '', plan: 'Professional', message: '' };
  const [form, setForm] = useState<DemoForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [provisionStep, setProvisionStep] = useState('');
  const [credentials, setCredentials] = useState<DemoCredentials | null>(null);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const update = (k: keyof DemoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.schoolName || !form.adminEmail || !form.phone) return;
    setSubmitting(true);
    setError('');

    const tempPassword = generateTempPassword();
    const schoolRef = doc(collection(db, 'schools'));
    const schoolId = schoolRef.id;
    const demoReqRef = doc(collection(db, 'demo_requests'));
    const expiresAt = new Date(Date.now() + DEMO_DURATION_DAYS * 24 * 60 * 60 * 1000);

    try {
      // 1. Write the demo request first (public, unauthenticated)
      setProvisionStep('Saving your request…');
      await setDoc(demoReqRef, {
        schoolName: form.schoolName,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        email: form.adminEmail,
        phone: form.phone,
        phone2: form.phone2 || null,
        reportEmail: form.reportEmail || null,
        plan: form.plan,
        message: form.message || null,
        status: 'pending',
        schoolId: null,
        createdAt: serverTimestamp(),
      });

      // 2. Create the Firebase Auth account for the demo admin — this also signs them in
      setProvisionStep('Creating your admin account…');
      const cred = await createUserWithEmailAndPassword(auth, form.adminEmail, tempPassword);
      const uid = cred.user.uid;

      // 3. Write the admin's user profile (isOwner rule allows this immediately)
      setProvisionStep('Setting up your profile…');
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: form.adminEmail,
        displayName: form.adminName || form.schoolName + ' Admin',
        role: 'admin',
        schoolId,
        disabled: false,
        createdAt: serverTimestamp(),
      });

      // 4. Create the school record — the new demo-school rule allows this since
      //    status=demo and adminEmail matches auth token
      setProvisionStep('Creating your school…');
      await setDoc(schoolRef, {
        name: form.schoolName,
        adminEmail: form.adminEmail,
        status: 'demo',
        subscriptionPlan: 'starter',
        subscriptionExpiresAt: expiresAt,
        maxStudents: 50,
        maxStaff: 10,
        createdAt: serverTimestamp(),
        createdBy: uid,
        country: 'NG',
        timezone: 'Africa/Lagos',
        notes: `Demo account. Plan of interest: ${form.plan}.`,
        demoRequestId: demoReqRef.id,
        reportEmail: form.reportEmail || null,
        phone: form.phone,
      });

      // 5. Create school settings (default config)
      setProvisionStep('Configuring school settings…');
      await setDoc(doc(db, 'school_settings', schoolId), {
        schoolId,
        schoolName: form.schoolName,
        currentSession: CURRENT_SESSION,
        currentTerm: '1st Term',
        termStructure: '3-term',
        schoolLevels: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
        customSubjects: [],
        periodTimes: [],
        timetablePeriods: [],
        currency: 'NGN',
        locale: 'en-NG',
        country: 'NG',
        timezone: 'Africa/Lagos',
        phoneCountryCode: '+234',
        gradingSystem: 'percentage',
        customGradingScale: [],
        taxModel: 'none',
        taxFlatRate: 0,
        identityDocumentLabel: 'NIN',
        identityDocumentHint: '11-digit NIN',
        admissionsOpen: true,
        maxApplications: 0,
        requireDocuments: false,
        autoApproveApplications: false,
        minimumEnrolmentAge: 3,
        lateThresholdMinutes: 15,
        attendanceWarningThreshold: 75,
        attendanceExamThreshold: 70,
        schoolDaysPerWeek: 5,
        caMaxScore: 40,
        examMaxScore: 60,
        showPositionOnReport: true,
        showTeacherComment: true,
        showSkillsOnReport: true,
        passMarkPercent: 50,
        feeReminderEnabled: true,
        feeReminderDaysBefore: 7,
        parentCanViewGrades: true,
        parentCanViewAttendance: true,
        parentCanDownloadReports: false,
        teacherCanEnterGrades: true,
        teacherCanViewTimetable: true,
        reportPaperSize: 'A4',
        reportShowLogo: true,
        reportFooterText: '',
        reportWatermarkEnabled: false,
        cbtEnabled: true,
        aiCurriculumEnabled: true,
        maxCurriculumDocs: 50,
        cbtAllowedRoles: [],
        paymentMethods: { bankTransfer: false, cash: true, paystack: false },
        bankDetails: { bankName: '', accountNumber: '', accountName: '' },
        studentIdPrefix: 'STU',
        studentIdFormat: 'PREFIX-YEAR-SEQ',
        studentIdPadding: 3,
        logoUrl: '',
        primaryColor: '#4f46e5',
      });

      // 6. Seed 3 demo classes + 6 students so the admin sees a live system
      setProvisionStep('Loading sample data…');
      const batch = writeBatch(db);
      const demoClasses = [
        { name: 'Primary 1', level: 'Primary' },
        { name: 'Primary 4', level: 'Primary' },
        { name: 'JSS 2', level: 'Junior Secondary' },
      ];
      const classIds: string[] = [];
      demoClasses.forEach(cls => {
        const ref = doc(collection(db, 'classes'));
        classIds.push(ref.id);
        batch.set(ref, { ...cls, schoolId, academicSession: CURRENT_SESSION, studentCount: 2 });
      });
      const demoStudents = [
        { studentName: 'Chidimma Okafor',  currentClass: 'Primary 1' },
        { studentName: 'Babatunde Adeyemi', currentClass: 'Primary 1' },
        { studentName: 'Kelechi Nwosu',     currentClass: 'Primary 4' },
        { studentName: 'Aisha Ibrahim',     currentClass: 'Primary 4' },
        { studentName: 'Emeka Obi',         currentClass: 'JSS 2' },
        { studentName: 'Fatima Musa',       currentClass: 'JSS 2' },
      ];
      demoStudents.forEach((s, i) => {
        const ref = doc(collection(db, 'students'));
        const yr = new Date().getFullYear();
        batch.set(ref, {
          ...s,
          schoolId,
          studentId: `DEMO-${yr}-${String(i + 1).padStart(3, '0')}`,
          email: `student${i + 1}@demo.avenir.school`,
          phone: `070000000${i + 1}0`,
          dob: `${yr - 10 - Math.floor(i / 2)}-01-01`,
          gender: i % 2 === 0 ? 'female' : 'male',
          nin: '',
          enrolledAt: serverTimestamp(),
          applicationId: 'demo',
          admissionStatus: 'active',
        });
      });
      await batch.commit();

      // 7. Update demo_request to provisioned state. tempPassword is stored here
      //    so super_admin can look it up later (e.g. if the requester loses the
      //    one-time display below) — there's no email delivery on the Spark plan,
      //    so this is currently the only recovery path for a forgotten demo password.
      setProvisionStep('Finalising…');
      await setDoc(demoReqRef, {
        status: 'provisioned', schoolId, adminUid: uid, provisionedAt: serverTimestamp(), tempPassword,
      }, { merge: true });

      // 8. Sign OUT so the landing page doesn't auto-redirect (credentials must be
      //    shown first — since there's no email delivery on Spark plan, this is the
      //    only time the admin sees their temporary password).
      await firebaseSignOut(auth);

      const loginUrl = `${window.location.origin}`;
      setCredentials({ email: form.adminEmail, password: tempPassword, schoolId, loginUrl });
    } catch (err: any) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'That email already has an account. Try logging in or use a different email.'
        : err.message || 'Something went wrong. Please try again.';
      setError(msg);
      // Best-effort sign out if partially signed in
      firebaseSignOut(auth).catch(() => {});
    } finally {
      setSubmitting(false);
      setProvisionStep('');
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
    setTimeout(() => { setForm(EMPTY); setCredentials(null); setError(''); }, 400);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Start Your Free Demo</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your school account is ready in seconds — no waiting</p>
              </div>
              {!submitting && (
                <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* ── Provisioning (in-progress) ── */}
            {submitting && (
              <div className="px-6 py-16 text-center">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
                <h3 className="text-base font-bold text-slate-800 mb-1">Setting up your school…</h3>
                <p className="text-sm text-slate-500">{provisionStep}</p>
              </div>
            )}

            {/* ── Credentials screen ── */}
            {!submitting && credentials && (
              <div className="px-6 py-8">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 text-center mb-1">Your demo is ready!</h3>
                <p className="text-sm text-slate-500 text-center mb-6">
                  You have <strong>{DEMO_DURATION_DAYS} days</strong> to explore. Save these credentials — they won't be emailed.
                </p>

                <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200 mb-6">
                  {[
                    { label: 'Login Email', value: credentials.email },
                    { label: 'Temporary Password', value: credentials.password, secret: true },
                    { label: 'Login URL', value: credentials.loginUrl },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{row.label}</p>
                        <p className={`text-sm font-mono text-slate-900 truncate ${row.secret && !showPw ? 'tracking-widest' : ''}`}>
                          {row.secret && !showPw ? '••••••••••' : row.value}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {row.secret && (
                          <button type="button" onClick={() => setShowPw(v => !v)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
                            {showPw ? <Lock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <CopyButton value={row.value} />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-5 flex items-start gap-2">
                  <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Copy your temporary password now — this is the only time it will be shown. You can change it after logging in.
                </p>

                <button
                  onClick={() => { navigate('/login'); handleClose(); }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" /> Go to Login →
                </button>
              </div>
            )}

            {/* ── Form ── */}
            {!submitting && !credentials && (
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-xs text-indigo-700 font-medium">
                  🎓 Your demo school is provisioned <strong>instantly</strong> — no waiting for a callback.
                  You get {DEMO_DURATION_DAYS} days to explore every feature with sample data.
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">School Name <span className="text-rose-500">*</span></label>
                  <input value={form.schoolName} onChange={update('schoolName')} required placeholder="e.g. Bright Future Academy"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name <span className="text-rose-500">*</span></label>
                  <input value={form.adminName} onChange={update('adminName')} required placeholder="Full name (will be your admin display name)"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email <span className="text-rose-500">*</span></label>
                  <input type="email" value={form.adminEmail} onChange={update('adminEmail')} required placeholder="you@school.ng — this will be your portal login"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Phone <span className="text-rose-500">*</span></label>
                    <input type="tel" value={form.phone} onChange={update('phone')} required placeholder="080XXXXXXXX"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Secondary Phone</label>
                    <input type="tel" value={form.phone2} onChange={update('phone2')} placeholder="Optional"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Report Forwarding Email</label>
                  <input type="email" value={form.reportEmail} onChange={update('reportEmail')} placeholder="Where to receive grade/attendance reports (optional)"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Plan of Interest</label>
                  <select value={form.plan} onChange={update('plan')}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option>Basic</option>
                    <option>Professional</option>
                    <option>College</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Message / Requirements</label>
                  <textarea value={form.message} onChange={update('message')} rows={2} placeholder="Anything specific you'd like to see in the demo…"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                </div>

                {error && (
                  <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">{error}</p>
                )}

                <button type="submit" disabled={submitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  <Zap className="w-4 h-4" /> Create My Demo School Now
                </button>
                <p className="text-center text-xs text-slate-400">Your account is created instantly. No credit card required.</p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Pricing Toggle ───────────────────────────────────────────────────────────

function PricingCard({ plan, yearly, onDemo }: { plan: typeof PLANS[0]; yearly: boolean; onDemo: () => void }) {
  const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
  const perMonth = yearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`relative flex flex-col bg-white rounded-2xl border-2 ${plan.color} shadow-sm hover:shadow-lg transition-shadow p-6`}
    >
      {plan.badge && (
        <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold ${plan.badgeColor} shadow`}>
          {plan.badge}
        </div>
      )}
      <div className="mb-5">
        <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
        <p className="text-sm text-slate-500 mt-1">{plan.tagline}</p>
      </div>

      {/* Price */}
      <div className="mb-5">
        {yearly && (
          <p className="text-xs text-rose-500 line-through mb-0.5">{formatNaira(plan.monthlyPrice * 12)}/yr</p>
        )}
        <div className="flex items-end gap-2">
          <span className="text-3xl font-extrabold text-slate-900">{formatNaira(yearly ? price : price)}</span>
          <span className="text-slate-500 text-sm mb-1">/{yearly ? 'yr' : 'mo'}</span>
        </div>
        {yearly ? (
          <p className="text-xs text-emerald-600 font-semibold mt-1">
            ≈ {formatNaira(perMonth)}/month · Save {plan.yearlyDiscount}% (pay 10 months)
          </p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">Billed monthly</p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-2 mb-5 flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      {/* AI Features */}
      {plan.aiFeatures && plan.aiList && (
        <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 mb-5">
          <p className="text-xs font-bold text-violet-700 flex items-center gap-1 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> AI Features Included
          </p>
          <ul className="space-y-1">
            {plan.aiList.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-violet-700">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!plan.aiFeatures && (
        <div className="border border-slate-100 bg-slate-50 rounded-xl p-3 mb-5">
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> AI features not included in Basic
          </p>
        </div>
      )}

      <button
        onClick={onDemo}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
          plan.popular
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100'
            : plan.name === 'College'
            ? 'bg-amber-500 hover:bg-amber-600 text-white'
            : 'bg-slate-900 hover:bg-slate-700 text-white'
        }`}
      >
        {plan.cta} →
      </button>
    </motion.div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-800">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-indigo-600 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, isAdmin } = useAuth();
  const { impersonatedProfile } = useImpersonation();
  const [demoOpen, setDemoOpen] = useState(false);
  const [yearlyBilling, setYearlyBilling] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!user || authLoading) return;
    // While a super_admin "View As" session is active, send them to the
    // IMPERSONATED user's home, not their own — using the real isAdmin/
    // profile here would always resolve to /super-admin, which is
    // superAdminOnly and immediately redirects back to "/", looping forever.
    if (impersonatedProfile) {
      const impersonatedIsAdmin = ['admin', 'School_admin', 'accountant'].includes(impersonatedProfile.role);
      navigate(getPostAuthHomePath(impersonatedIsAdmin, impersonatedProfile as any), { replace: true });
      return;
    }
    navigate(getPostAuthHomePath(isAdmin, profile), { replace: true });
  }, [user, profile, authLoading, isAdmin, impersonatedProfile, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />

      {/* ─── Sticky Navbar ─── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-200' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-sm">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-extrabold text-slate-900 leading-none text-sm">Avenir SIS</p>
              <p className="text-slate-400 text-xs">by Jabpatech</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(l => (
              <button key={l.label} onClick={() => scrollTo(l.href.slice(1))}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <Link to="/login" className="text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors px-3 py-2">
              Login
            </Link>
            <button onClick={() => setDemoOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow transition-all">
              Request Demo
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-slate-600">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="lg:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-2 shadow-lg">
              {NAV_LINKS.map(l => (
                <button key={l.label} onClick={() => { scrollTo(l.href.slice(1)); setMobileMenuOpen(false); }}
                  className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors">
                  {l.label}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-100 flex gap-2">
                <Link to="/login" className="flex-1 text-center py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl">Login</Link>
                <button onClick={() => { setDemoOpen(true); setMobileMenuOpen(false); }}
                  className="flex-1 bg-indigo-600 text-white text-sm font-bold py-2.5 rounded-xl">Request Demo</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 pt-16">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-3xl" />
          {/* Grid */}
          <div className="absolute inset-0 opacity-5"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>
              <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
                <Zap className="w-3.5 h-3.5" /> Built for Nigerian Schools · WAEC · NERDC Ready
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
                Run Your Entire<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">School From One</span><br />
                Dashboard
              </h1>

              <p className="text-lg text-indigo-100/80 mb-8 leading-relaxed">
                Avenir SIS is a complete School Information System built for Primary & Secondary Schools in Nigeria — covering Admissions, Attendance, Fees, Results, Staff HR, and AI-powered Tools, all in one platform.
              </p>

              {/* Trust badges */}
              <div className="flex flex-wrap gap-3 mb-8">
                {[
                  { icon: Shield, label: 'Paystack Integrated' },
                  { icon: MessageSquare, label: 'WhatsApp Ready' },
                  { icon: Globe, label: 'Works on Any Device' },
                  { icon: Sparkles, label: 'AI Powered' },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-1.5 bg-white/10 border border-white/10 text-white/80 text-xs font-medium px-3 py-1.5 rounded-full">
                    <b.icon className="w-3.5 h-3.5" />
                    {b.label}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setDemoOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-2xl shadow-lg shadow-indigo-900/40 transition-all flex items-center justify-center gap-2 text-sm">
                  Request a Free Demo <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <div className="flex -space-x-2">
                  {['A', 'B', 'C', 'F'].map((l, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full border-2 border-indigo-950 flex items-center justify-center text-white text-xs font-bold ${['bg-indigo-500', 'bg-violet-500', 'bg-teal-500', 'bg-amber-500'][i]}`}>{l}</div>
                  ))}
                </div>
                <p className="text-white/60 text-sm">Trusted by schools across Nigeria</p>
              </div>
            </motion.div>

            {/* Right — Hero image from the provided asset */}
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2 }}>
              <div className="relative">
                {/* Glow behind image */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-violet-600/30 rounded-3xl blur-2xl scale-105" />
                {/* Dashboard mockup */}
                <div className="relative bg-slate-800/60 backdrop-blur-sm border border-white/10 rounded-2xl p-4 shadow-2xl">
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-3 h-3 rounded-full bg-rose-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    <div className="flex-1 bg-white/5 rounded-md h-5 ml-2" />
                  </div>
                  <div className="bg-slate-900 rounded-xl overflow-hidden">
                    <div className="flex">
                      {/* Sidebar preview */}
                      <div className="w-40 bg-slate-950 p-3 hidden sm:block">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <GraduationCap className="w-3 h-3 text-white" />
                          </div>
                          <div>
                            <p className="text-white text-xs font-bold">Avenir SIS</p>
                            <p className="text-slate-500 text-[9px]">School Mgmt</p>
                          </div>
                        </div>
                        {['Dashboard', 'Students', 'Admissions', 'Attendance', 'Classes', 'Timetable', 'Gradebook', 'Report Cards'].map((item, i) => (
                          <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 ${i === 0 ? 'bg-indigo-600' : ''}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-slate-600'}`} />
                            <span className={`text-[9px] ${i === 0 ? 'text-white font-semibold' : 'text-slate-500'}`}>{item}</span>
                          </div>
                        ))}
                      </div>
                      {/* Main content */}
                      <div className="flex-1 p-3">
                        <p className="text-white text-xs font-bold mb-0.5">Admin Dashboard</p>
                        <p className="text-slate-500 text-[9px] mb-3">Welcome back — last updated 11:31 AM</p>
                        {/* KPI row */}
                        <div className="grid grid-cols-3 gap-1.5 mb-3">
                          {[
                            { label: 'Students', value: '35', color: 'from-blue-600 to-blue-700' },
                            { label: 'Revenue', value: '₦10k', color: 'from-emerald-600 to-green-700' },
                            { label: 'Attend.', value: '84%', color: 'from-violet-600 to-purple-700' },
                          ].map(k => (
                            <div key={k.label} className={`bg-gradient-to-br ${k.color} rounded-lg p-2`}>
                              <p className="text-white text-xs font-bold">{k.value}</p>
                              <p className="text-white/70 text-[8px]">{k.label}</p>
                            </div>
                          ))}
                        </div>
                        {/* Chart bars placeholder */}
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-400 text-[8px] mb-1.5">Application Trend</p>
                          <div className="flex items-end gap-1 h-10">
                            {[3, 6, 4, 8, 5, 7].map((h, i) => (
                              <div key={i} className="flex-1 bg-indigo-500 rounded-sm" style={{ height: `${h * 10}%` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Floating badges */}
                <div className="absolute -bottom-4 -left-4 bg-white rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <p className="text-xs font-bold text-slate-800">NERDC Compliant</p>
                </div>
                <div className="absolute -top-4 -right-4 bg-white rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  <p className="text-xs font-bold text-slate-800">AI Powered</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce">
            <p className="text-white/40 text-xs">Scroll to explore</p>
            <ChevronDown className="w-5 h-5 text-white/30" />
          </div>
        </div>
      </section>

      {/* ─── STATS STRIP ─── */}
      <section className="bg-indigo-600 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-white text-center">
            {[
              { value: '20+', label: 'Modules Included' },
              { value: '9', label: 'AI Features' },
              { value: '12', label: 'School Levels Supported' },
              { value: '100%', label: 'NERDC / WAEC Ready' },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <p className="text-4xl font-extrabold">{s.value}</p>
                <p className="text-indigo-200 text-sm mt-1">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <SectionLabel><Star className="w-3.5 h-3.5" /> Features</SectionLabel>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Everything Your School Needs</h2>
            <p className="text-slate-500 text-lg">From enrollment to graduation — Avenir SIS covers every aspect of school administration in one unified system.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="bg-slate-50 rounded-2xl p-6 hover:bg-white hover:shadow-lg border border-transparent hover:border-slate-200 transition-all group">
                <div className={`w-11 h-11 ${f.color} rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── AI SPOTLIGHT ─── */}
      <section className="py-24 bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center gap-2 bg-violet-500/20 border border-violet-400/30 text-violet-200 text-xs font-bold px-4 py-1.5 rounded-full mb-6">
                <Sparkles className="w-3.5 h-3.5" /> Powered by Google Gemini AI
              </div>
              <h2 className="text-4xl font-extrabold text-white mb-6 leading-tight">
                Your School's<br />AI-Powered Assistant
              </h2>
              <p className="text-violet-100/70 text-lg mb-8">
                Avenir SIS integrates cutting-edge AI to help teachers, administrators, and school owners save time, make smarter decisions, and communicate better.
              </p>
              <div className="space-y-3">
                {[
                  { label: 'AI Lesson Notes Generator', desc: 'Generate full NERDC-aligned lesson plans in seconds' },
                  { label: 'AI Exam Question Generator', desc: 'Create WAEC/NECO-standard questions for any subject' },
                  { label: 'AI Student Performance Insights', desc: 'Structured analysis of strengths, risks, and recommendations' },
                  { label: 'AI Fee Reminder Drafts', desc: 'Professional payment reminder letters auto-generated' },
                  { label: 'AI Report Card Principal Remarks', desc: 'Personalized end-of-term remarks per student' },
                  { label: 'AI Payroll Summaries', desc: 'Auto-generate monthly HR payroll reports' },
                ].map((ai, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white text-sm font-semibold">{ai.label}</p>
                      <p className="text-white/50 text-xs">{ai.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">AI Teaching Tools</p>
                    <p className="text-white/40 text-xs">Powered by Gemini 2.5 Flash</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-violet-300 text-xs font-semibold mb-1">Generated Lesson Note</p>
                    <p className="text-white/60 text-xs leading-relaxed">
                      <span className="text-white font-medium">Topic:</span> Photosynthesis · Biology · JSS 2<br />
                      <span className="text-white/80 font-medium">Objective:</span> Students will be able to explain the process of photosynthesis and identify the reactants and products involved…<br />
                      <span className="text-white/80 font-medium">Activities:</span> Leaf chromatography experiment, diagram labelling…
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-indigo-300 text-xs font-semibold mb-1">Student Insight Report</p>
                    <p className="text-white/60 text-xs leading-relaxed">
                      <span className="text-emerald-400">↑ Strengths:</span> Mathematics (A1), Physics (B2)<br />
                      <span className="text-amber-400">⚠ Risk Level:</span> Low · Attendance: 91%<br />
                      <span className="text-blue-300">Recommendation:</span> Enrol in science club to leverage analytical skills.
                    </p>
                  </div>
                </div>
                <button onClick={() => setDemoOpen(true)}
                  className="w-full mt-4 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                  See AI in Action →
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── MODULES ─── */}
      <section id="modules" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <SectionLabel><Layers className="w-3.5 h-3.5" /> Modules</SectionLabel>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">20+ Modules in One System</h2>
            <p className="text-slate-500 text-lg">Every tool a Nigerian school needs — fully integrated, no separate subscriptions required.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {MODULES.map((mod, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all group text-center">
                <div className={`w-10 h-10 ${mod.color} rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-sm`}>
                  <mod.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">{mod.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── AVENIR CAREER DISCOVERY (sister product — College plan perk) ─── */}
      <section id="avenir-career" className="py-24 bg-gradient-to-br from-teal-950 via-slate-900 to-emerald-950 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="inline-flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  College plan · Included free
                </span>
                <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 text-teal-100 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <Compass className="w-3.5 h-3.5" /> Sister product
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
                Avenir Career Discovery for JSS &amp; SSS
              </h2>
              <p className="text-teal-100/75 text-lg mb-6 leading-relaxed">
                Beyond running the school: help learners explore who they are and where they could thrive.{' '}
                <strong className="text-white font-semibold">Avenir Career Discovery</strong> is an adaptive career discovery experience — onboarding, branched assessments, trait dimensions, and career clusters — with dedicated paths for{' '}
                <strong className="text-white font-semibold">students</strong>,{' '}
                <strong className="text-white font-semibold">parents</strong>,{' '}
                <strong className="text-white font-semibold">teachers</strong>, and{' '}
                <strong className="text-white font-semibold">counselors</strong>. Schools on our{' '}
                <strong className="text-amber-200 font-semibold">College</strong> plan receive this for their community at no extra charge.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  { icon: Target, text: 'Adaptive questions and branching paths tuned for JSS and SSS levels' },
                  { icon: BarChart3, text: 'Results framed around traits and career clusters — not a single “label”' },
                  { icon: Users, text: 'Parent portal with report codes; teacher views; counselor read-only insights' },
                  { icon: Globe, text: 'Cloud-hosted web app — share one link with your school community' },
                ].map((row, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-teal-50/90">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                      <row.icon className="w-4 h-4 text-teal-300" />
                    </span>
                    <span className="pt-1.5 leading-relaxed">{row.text}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <a
                  href={AVENIR_CAREER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-teal-900/30"
                >
                  Open Career Discovery <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href={AVENIR_CAREER_REPO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors"
                >
                  <Github className="w-4 h-4" /> Source on GitHub
                </a>
              </div>
              <p className="mt-5 text-xs text-teal-200/50">
                Production app:{' '}
                <span className="text-teal-200/80 font-mono break-all">{AVENIR_CAREER_URL.replace(/^https:\/\//, '')}</span>
                {' · '}Stack aligns with the open repo (Vite, React, TypeScript; optional Supabase for sync).
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 sm:p-8 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg">
                    <Compass className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">How your community uses it</p>
                    <p className="text-teal-200/60 text-xs">Same platform, roles for everyone</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { role: 'Students', path: '/student', detail: 'Onboarding → adaptive assessment → personalised cluster results' },
                    { role: 'Parents', path: '/parent', detail: 'Access results with a report code or browse shared reports' },
                    { role: 'Teachers', path: '/teacher', detail: 'See report lists and support classroom guidance conversations' },
                    { role: 'Schools / Counselors', path: '/counselor · /admin', detail: 'Counselor insights; admin tools for content and publishing (per product design)' },
                  ].map((row, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                      <p className="text-teal-300 text-xs font-bold uppercase tracking-wide">{row.role}</p>
                      <p className="text-white/90 text-sm font-semibold mt-0.5 font-mono">{row.path}</p>
                      <p className="text-teal-100/55 text-xs mt-1 leading-relaxed">{row.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-5 border-t border-white/10 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <p className="text-xs text-teal-100/70 leading-relaxed">
                    <strong className="text-amber-200">College plan schools:</strong> we bundle complimentary access so you can offer career discovery alongside Avenir SIS — request a demo to confirm onboarding for your institution.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <SectionLabel><TrendingUp className="w-3.5 h-3.5" /> How It Works</SectionLabel>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Up and Running in Minutes</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: '01', icon: Phone, title: 'Request Demo', desc: "Fill out our quick form and we'll set up your school environment within 24 hours." },
              { step: '02', icon: Users, title: 'We Onboard You', desc: 'Our team helps you import students, set up classes, and configure your school settings.' },
              { step: '03', icon: GraduationCap, title: 'Start Managing', desc: 'Launch admissions, track attendance, collect fees, and generate reports from day one.' },
              { step: '04', icon: TrendingUp, title: 'Grow With Data', desc: "Use AI insights and analytics to continuously improve your school's performance." },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="relative">
                {i < 3 && <div className="hidden lg:block absolute top-10 right-0 w-full h-px bg-gradient-to-r from-indigo-200 to-transparent translate-x-1/2 z-0" />}
                <div className="relative z-10 text-center">
                  <div className="w-20 h-20 bg-indigo-50 border-2 border-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <s.icon className="w-8 h-8 text-indigo-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-indigo-100 mb-2">{s.step}</div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-slate-500">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <SectionLabel><Star className="w-3.5 h-3.5" /> Testimonials</SectionLabel>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Schools Love Avenir SIS</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <StarRating count={t.rating} />
                <p className="text-slate-600 text-sm leading-relaxed mt-4 mb-6 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionLabel><CheckCircle className="w-3.5 h-3.5" /> FAQ</SectionLabel>
            <h2 className="text-4xl font-extrabold text-slate-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => <FAQItem key={i} q={faq.q} a={faq.a} />)}
          </div>
        </div>
      </section>

      {/* ─── ABOUT JABPATECH ─── */}
      <section id="about" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <SectionLabel><Globe className="w-3.5 h-3.5" /> About Us</SectionLabel>
              <h2 className="text-4xl font-extrabold text-slate-900 mb-6">Built by Jabpatech</h2>
              <p className="text-slate-600 text-lg mb-6 leading-relaxed">
                <strong>Jabpatech</strong> is a Nigerian software development company dedicated to building practical, locally-relevant technology solutions for African businesses and institutions.
              </p>
              <p className="text-slate-500 mb-6 leading-relaxed">
                We specialize in custom software development, enterprise management systems, mobile applications, and cloud-based platforms. Avenir SIS is our flagship product in the EdTech space — born from real interactions with Nigerian school administrators who needed a better way to manage their institutions.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { label: 'Enterprise Software', icon: Database },
                  { label: 'Mobile Applications', icon: Phone },
                  { label: 'Cloud Platforms', icon: Globe },
                  { label: 'EdTech Solutions', icon: GraduationCap },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <s.icon className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-slate-400 text-sm">
                📍 Nigeria &nbsp;·&nbsp; 💼 Software & Technology &nbsp;·&nbsp; 🎓 EdTech Focus
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 text-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-indigo-600 p-3 rounded-xl">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-extrabold text-lg">Avenir SIS</p>
                    <p className="text-indigo-200 text-sm">by Jabpatech</p>
                  </div>
                </div>
                <p className="text-indigo-100/80 mb-6 leading-relaxed">
                  "Our mission is to give every Nigerian school — from a small community primary school to a large college — access to enterprise-grade management tools at an affordable price."
                </p>
                <div className="space-y-3">
                  {[
                    'Built specifically for Nigerian 6-3-3-4 system',
                    'WAEC grading (A1–F9) pre-configured',
                    'NERDC curriculum compliance built-in',
                    'Paystack payment gateway integration',
                    'WhatsApp communication ready',
                    'Accessible on laptop, tablet & mobile',
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm text-indigo-100/80">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ─── */}
      <section className="py-24 bg-gradient-to-r from-indigo-600 to-violet-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-4xl font-extrabold text-white mb-4">Ready to Transform Your School?</h2>
            <p className="text-indigo-100 text-lg mb-8">
              Join Nigerian schools already running smarter with Avenir SIS. Request a free demo today — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => setDemoOpen(true)}
                className="bg-white text-indigo-700 font-bold px-8 py-4 rounded-2xl shadow-lg hover:bg-indigo-50 transition-all text-sm">
                Request a Free Demo →
              </button>
              <button onClick={() => scrollTo('pricing')}
                className="bg-white/10 border border-white/30 text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/20 transition-all text-sm">
                View Pricing
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── CONTACT ─── */}
      <section id="contact" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <SectionLabel><Mail className="w-3.5 h-3.5" /> Contact</SectionLabel>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Get in Touch</h2>
            <p className="text-slate-500 text-lg">Our team is available to answer your questions and help your school get started.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Mail, label: 'Email Us', value: 'info@jabpatech.com', sub: 'We reply within 24 hours' },
              { icon: Phone, label: 'Call / WhatsApp', value: '+234 800 000 0000', sub: 'Mon–Fri, 8am–6pm WAT' },
              { icon: Globe, label: 'Website', value: 'www.jabpatech.com', sub: 'Learn more about us' },
            ].map((c, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-200">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <c.icon className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{c.label}</p>
                <p className="text-sm font-bold text-slate-900 mb-1">{c.value}</p>
                <p className="text-xs text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <button onClick={() => setDemoOpen(true)}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 rounded-2xl shadow transition-all text-sm">
              Request a Demo Now <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="bg-indigo-600 p-2 rounded-xl">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-extrabold text-white text-sm">Avenir SIS</p>
                  <p className="text-slate-500 text-xs">by Jabpatech</p>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Nigeria's most complete school management system. Built for the 6-3-3-4 education structure.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Product</p>
              <ul className="space-y-2 text-sm">
                {['Features', 'Modules', 'Pricing', 'AI Tools', 'Request Demo'].map(l => (
                  <li key={l}><button type="button" onClick={() => scrollTo(l.toLowerCase().replace(' ', '-'))} className="text-slate-400 hover:text-white transition-colors">{l}</button></li>
                ))}
                <li>
                  <button type="button" onClick={() => scrollTo('avenir-career')} className="text-slate-400 hover:text-white transition-colors">Career Discovery</button>
                </li>
                <li>
                  <a href={AVENIR_CAREER_URL} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1">
                    Open Avenir Career <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Company</p>
              <ul className="space-y-2 text-sm">
                {['About Jabpatech', 'Contact Us', 'Privacy Policy', 'Terms of Service'].map(l => (
                  <li key={l}><span className="text-slate-400">{l}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">App Access</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/login" className="text-slate-400 hover:text-white transition-colors flex items-center gap-1">Admin Login <ArrowRight className="w-3 h-3" /></Link></li>
                <li><Link to="/apply" className="text-slate-400 hover:text-white transition-colors flex items-center gap-1">Apply for Admission <ArrowRight className="w-3 h-3" /></Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-xs">
              &copy; {new Date().getFullYear()} Jabpatech. All rights reserved. Avenir SIS is a product of Jabpatech.
            </p>
            <div className="flex items-center gap-4">
              {[
                { icon: Shield, label: 'Paystack Secured' },
                { icon: CheckCircle, label: 'NERDC Certified' },
              ].map(b => (
                <div key={b.label} className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <b.icon className="w-3.5 h-3.5" />{b.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
