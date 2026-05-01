import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  doc, getDoc, onSnapshot, updateDoc, serverTimestamp, addDoc,
  collection, query, where, getDocs, writeBatch, arrayUnion
} from 'firebase/firestore';
import { Application, ApplicationStatus, NIGERIAN_REGULATIONS, Student, Guardian, formatDate } from '../types';
import { generateStudentId } from '../services/firestoreService';
import { stripUndefined } from '../utils/firestoreSanitize';
import { assertNotSuperAdminEmail } from '../utils/superAdminGuard';
import { useSchoolSettings } from './SchoolSettings';
import { buildStudentLoginEmail, generateStudentTempPassword, upsertStudentLoginIndex } from '../utils/studentAccount';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, ShieldCheck,
  Database, User, BookOpen, Phone, FileText, AlertTriangle,
  Loader2, Save, Send, MessageSquare, Users, Baby, Heart,
  Link2, MapPin, School, ChevronDown, X, Copy, Share2, KeyRound, GraduationCap
} from 'lucide-react';
import { differenceInYears, parseISO } from 'date-fns';
import { StatusBadge } from './AdminDashboard';
import { useSchool } from '../components/SchoolContext';

// ─── Guardian panel ───────────────────────────────────────────────────────────

const RELATIONSHIPS = ['father', 'mother', 'uncle', 'aunt', 'sibling', 'guardian', 'other'];

// ─── Admission Success Modal ──────────────────────────────────────────────────

interface AdmissionResult {
  studentId: string;
  className: string;
  parentEmail?: string;
  parentPassword?: string;
  studentLogin?: string;
  studentPassword?: string;
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
        copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
      }`}
    >
      <Copy className="w-3 h-3" />
      {copied ? 'Copied!' : (label ?? 'Copy')}
    </button>
  );
}

function AdmissionSuccessModal({ result, onClose }: { result: AdmissionResult; onClose: () => void }) {
  const [copiedAll, setCopiedAll] = useState(false);

  const buildShareText = () => {
    const lines: string[] = [
      `Student Admission Confirmed`,
      `──────────────────────────`,
      `Student ID : ${result.studentId}`,
      `Class      : ${result.className}`,
    ];
    if (result.parentEmail) {
      lines.push('', 'Parent Portal Login', `  Email    : ${result.parentEmail}`, `  Password : ${result.parentPassword}`);
    }
    if (result.studentLogin) {
      lines.push('', 'Student Portal Login', `  Login    : ${result.studentLogin}`, `  Password : ${result.studentPassword}`);
    }
    lines.push('', 'Please log in and change the temporary password on first sign-in.');
    return lines.join('\n');
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(buildShareText());
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handleShare = async () => {
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ title: 'Student Admission Details', text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pt-7 pb-6 text-white">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Student Admitted!</h2>
                <p className="text-emerald-100 text-sm">Enrolment complete</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* ID + Class chips */}
          <div className="flex gap-2 mt-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              <User className="w-3 h-3" /> {result.studentId}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              <GraduationCap className="w-3 h-3" /> {result.className}
            </span>
          </div>
        </div>

        {/* Credentials cards */}
        <div className="px-6 py-5 space-y-3 max-h-[55vh] overflow-y-auto">
          {result.parentEmail && (
            <div className="border border-indigo-100 rounded-2xl overflow-hidden">
              <div className="bg-indigo-50 px-4 py-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Parent Portal Account</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Email</p>
                    <p className="text-sm font-mono text-slate-900 select-all">{result.parentEmail}</p>
                  </div>
                  <CopyBtn value={result.parentEmail} />
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Temporary Password</p>
                    <p className="text-sm font-mono text-slate-900 select-all">{result.parentPassword}</p>
                  </div>
                  <CopyBtn value={result.parentPassword!} />
                </div>
              </div>
            </div>
          )}

          {result.studentLogin && (
            <div className="border border-violet-100 rounded-2xl overflow-hidden">
              <div className="bg-violet-50 px-4 py-2 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Student Portal Account</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Login</p>
                    <p className="text-sm font-mono text-slate-900 select-all">{result.studentLogin}</p>
                  </div>
                  <CopyBtn value={result.studentLogin} />
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Temporary Password</p>
                    <p className="text-sm font-mono text-slate-900 select-all">{result.studentPassword}</p>
                  </div>
                  <CopyBtn value={result.studentPassword!} />
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            Share credentials with the family. They will be prompted to set a new password on first sign-in.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-1 flex gap-2">
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button
            onClick={handleCopyAll}
            className={`flex-1 flex items-center justify-center gap-2 font-semibold py-2.5 rounded-xl text-sm transition-colors border ${
              copiedAll ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <Copy className="w-4 h-4" /> {copiedAll ? 'Copied!' : 'Copy All'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

interface GuardianForm {
  g1Name: string; g1Phone: string; g1Email: string; g1Relationship: string; g1Occupation: string;
  g2Name: string; g2Phone: string; g2Email: string; g2Relationship: string;
  classAssignment: string;
  siblingSearch: string;
}

function GuardianPanel({
  form,
  onChange,
  existingStudents,
  selectedSiblings,
  onToggleSibling,
  parentUsers,
  linkExistingParent,
  onToggleLinkParent,
  linkedUserId,
  onLinkedUserChange,
}: {
  form: GuardianForm;
  onChange: (field: keyof GuardianForm, val: string) => void;
  existingStudents: Student[];
  selectedSiblings: Student[];
  onToggleSibling: (s: Student) => void;
  parentUsers: { uid: string; displayName: string; email: string }[];
  linkExistingParent: boolean;
  onToggleLinkParent: () => void;
  linkedUserId: string;
  onLinkedUserChange: (uid: string) => void;
}) {
  const siblingResults = form.siblingSearch.trim()
    ? existingStudents.filter(s =>
        s.studentName.toLowerCase().includes(form.siblingSearch.toLowerCase()) ||
        s.studentId.toLowerCase().includes(form.siblingSearch.toLowerCase())
      ).slice(0, 5)
    : [];

  return (
    <div className="space-y-5">
      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800 flex items-start gap-2">
        <Heart className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        Linking a guardian enables the Parent Portal for fee tracking, grades & communication.
      </div>

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primary Guardian</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-bold text-slate-500 mb-1">Full Name *</label>
          <input value={form.g1Name} onChange={e => onChange('g1Name', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Phone *</label>
          <input value={form.g1Phone} onChange={e => onChange('g1Phone', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
          <input type="email" value={form.g1Email} onChange={e => onChange('g1Email', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Relationship</label>
          <select value={form.g1Relationship} onChange={e => onChange('g1Relationship', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm capitalize">
            {RELATIONSHIPS.map(r => <option key={r} className="capitalize">{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Occupation</label>
          <input value={form.g1Occupation} onChange={e => onChange('g1Occupation', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
      </div>

      {/* Link existing parent account */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={linkExistingParent} onChange={onToggleLinkParent} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-indigo-500" /> Link to existing parent portal account
          </span>
        </label>
        {linkExistingParent && (
          <select value={linkedUserId} onChange={e => onLinkedUserChange(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
            <option value="">— Select parent account —</option>
            {parentUsers.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>)}
          </select>
        )}
      </div>

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Secondary Guardian (Optional)</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
          <input value={form.g2Name} onChange={e => onChange('g2Name', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Phone</label>
          <input value={form.g2Phone} onChange={e => onChange('g2Phone', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Relationship</label>
          <select value={form.g2Relationship} onChange={e => onChange('g2Relationship', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm capitalize">
            {RELATIONSHIPS.map(r => <option key={r} className="capitalize">{r}</option>)}
          </select>
        </div>
      </div>

      {/* Sibling linking */}
      <div className="pt-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Baby className="w-3.5 h-3.5" /> Sibling Linking
        </p>
        <input value={form.siblingSearch} onChange={e => onChange('siblingSearch', e.target.value)}
          placeholder="Search existing students by name or ID..."
          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        {siblingResults.length > 0 && (
          <div className="mt-1 space-y-1">
            {siblingResults.map(s => {
              const sel = selectedSiblings.some(x => x.id === s.id);
              return (
                <button key={s.id} onClick={() => onToggleSibling(s)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition-all ${
                    sel ? 'bg-indigo-50 border-indigo-300 font-medium text-indigo-800' : 'border-slate-200 hover:border-indigo-200 text-slate-700'
                  }`}>
                  <span>{s.studentName} <span className="text-slate-400 font-normal text-xs">({s.studentId})</span></span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${sel ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                    {sel ? 'Linked ✓' : s.currentClass}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {selectedSiblings.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedSiblings.map(s => (
              <span key={s.id} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-medium">
                {s.studentName}
                <button onClick={() => onToggleSibling(s)}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schoolId, classNames } = useSchool();
  const { settings: schoolSettings } = useSchoolSettings();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [verifyingNIN, setVerifyingNIN] = useState(false);
  const [verifyingExam, setVerifyingExam] = useState(false);
  const [ninVerified, setNinVerified] = useState(false);
  const [examVerified, setExamVerified] = useState(false);
  const [showGuardianPanel, setShowGuardianPanel] = useState(false);
  const [admissionResult, setAdmissionResult] = useState<AdmissionResult | null>(null);

  // Guardian / sibling / class state
  const [guardianForm, setGuardianForm] = useState<GuardianForm>({
    g1Name: '', g1Phone: '', g1Email: '', g1Relationship: 'father', g1Occupation: '',
    g2Name: '', g2Phone: '', g2Email: '', g2Relationship: 'mother',
    classAssignment: '',
    siblingSearch: '',
  });
  const [selectedSiblings, setSelectedSiblings] = useState<Student[]>([]);
  const [existingStudents, setExistingStudents] = useState<Student[]>([]);
  const [parentUsers, setParentUsers] = useState<{ uid: string; displayName: string; email: string }[]>([]);
  const [linkExistingParent, setLinkExistingParent] = useState(false);
  const [linkedUserId, setLinkedUserId] = useState('');
  const [enrolledLoginEmail, setEnrolledLoginEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'applications', id), snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Application;
        setApplication({ id: snapshot.id, ...data });
        setNotes(data.reviewerNotes || '');
        // Pre-fill guardian from application form submission (if collected via public apply form)
        setGuardianForm(prev => ({
          ...prev,
          classAssignment: data.classApplyingFor,
          g1Name: prev.g1Name || data.guardianName || '',
          g1Phone: prev.g1Phone || data.guardianPhone || '',
          g1Email: prev.g1Email || data.guardianEmail || '',
          g1Relationship: prev.g1Relationship || data.guardianRelationship || 'father',
        }));
      }
      setLoading(false);
    }, error => handleFirestoreError(error, OperationType.GET, `applications/${id}`));

    // Load students for sibling search — scoped to this school
    const studentsQuery = schoolId
      ? query(collection(db, 'students'), where('schoolId', '==', schoolId))
      : collection(db, 'students');
    getDocs(studentsQuery).then(snap => {
      setExistingStudents(snap.docs.map(d => ({ id: d.id, ...(d.data() as Student) })));
    });
    // Load parent accounts (include both 'parent' and 'guardian' roles)
    getDocs(query(collection(db, 'users'), where('role', 'in', ['parent', 'guardian']))).then(snap => {
      setParentUsers(snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })));
    });
    // Pre-populate guardian form from existing enrolled student (if already approved)
    getDocs(query(collection(db, 'students'), where('applicationId', '==', id))).then(snap => {
      if (!snap.empty) {
        const s = snap.docs[0].data() as Student;
        if (s.loginEmail) setEnrolledLoginEmail(s.loginEmail);
        setGuardianForm(prev => ({
          ...prev,
          g1Name: s.guardianName || '',
          g1Phone: s.guardianPhone || '',
          g1Email: s.guardianEmail || '',
          g1Relationship: s.guardianRelationship || 'father',
          g1Occupation: '',
          g2Name: s.guardian2Name || '',
          g2Phone: s.guardian2Phone || '',
          g2Relationship: s.guardian2Relationship || 'mother',
          g2Email: s.guardian2Email || '',
        }));
        if (s.guardianUserId) {
          setLinkExistingParent(true);
          setLinkedUserId(s.guardianUserId);
        }
      }
    });

    return () => unsubscribe();
  }, [id]);

  const handleStatusUpdate = async (newStatus: ApplicationStatus) => {
    if (!id || !application) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);

      // Update application status
      batch.update(doc(db, 'applications', id), {
        status: newStatus,
        reviewerNotes: notes,
        updatedAt: serverTimestamp(),
      });

      if (newStatus === 'approved') {
        // Check if student already exists
        const studentQuery = query(collection(db, 'students'), where('applicationId', '==', id));
        const studentSnap = await getDocs(studentQuery);

        if (studentSnap.empty) {
          const studentId = await generateStudentId(application.schoolId ?? schoolId ?? 'main');
          const siblingIds = selectedSiblings.map(s => s.id!).filter(Boolean);
          const assignedClass = guardianForm.classAssignment || application.classApplyingFor;

          // ── Parent account resolution ────────────────────────────────────
          // Priority: 1) explicitly linked parent, 2) existing user with same email,
          // 3) create new Firebase Auth account + users/ doc.
          let resolvedParentUserId: string | undefined;
          let tempPassword: string | undefined;
          let parentNewlyCreated = false;

          const normalizedEmail = guardianForm.g1Email.trim().toLowerCase();

          // Block super-admin emails from being used as parent accounts
          if (normalizedEmail) {
            try { assertNotSuperAdminEmail(normalizedEmail, 'parent'); }
            catch (guardErr: any) {
              toast.error(guardErr.message);
              setSaving(false);
              return;
            }
          }

          if (linkExistingParent && linkedUserId) {
            resolvedParentUserId = linkedUserId;
          } else if (normalizedEmail) {
            // Look up existing user by email (auto-identify by email)
            const existingByEmail = await getDocs(
              query(collection(db, 'users'), where('email', '==', normalizedEmail))
            );
            if (!existingByEmail.empty) {
              resolvedParentUserId = existingByEmail.docs[0].id;
            } else {
              // Create new parent Firebase Auth account via secondary app
              // so the admin's session remains intact.
              const digits = (guardianForm.g1Phone || '').replace(/\D/g, '').slice(-4) || '0000';
              tempPassword = `Parent@${digits}${new Date().getFullYear()}`;
              try {
                const secondaryApp = getApps().find(a => a.name === 'parent-creator')
                  || initializeApp(firebaseConfig as any, 'parent-creator');
                const secondaryAuth = getAuth(secondaryApp);
                const cred = await createUserWithEmailAndPassword(
                  secondaryAuth, normalizedEmail, tempPassword
                );
                resolvedParentUserId = cred.user.uid;
                parentNewlyCreated = true;
                await firebaseSignOut(secondaryAuth);
              } catch (authErr: any) {
                console.error('Parent Auth creation failed:', authErr);
                if (authErr.code === 'auth/email-already-in-use') {
                  // Auth user exists but no Firestore doc yet — skip profile doc
                  // but let the admin know they need to recover it manually.
                  alert(
                    `Note: A Firebase Auth account for ${normalizedEmail} already exists, ` +
                    `but no parent profile was found in Firestore. Student will be enrolled, ` +
                    `but you'll need to manually link the parent later from User Management.`
                  );
                } else {
                  alert(
                    `⚠ Parent portal account could not be created automatically ` +
                    `(${authErr.message || authErr.code}). Student will still be enrolled; ` +
                    `create the parent account manually from User Management afterwards.`
                  );
                }
                tempPassword = undefined;
              }
            }
          }

          const studentRef = doc(collection(db, 'students'));
          const newStudent: Omit<Student, 'id'> = {
            studentName: application.applicantName,
            email: application.email,
            phone: application.phone,
            dob: application.dob,
            gender: application.gender,
            nin: application.nin,
            currentClass: assignedClass,
            studentId,
            enrolledAt: serverTimestamp(),
            applicationId: id,
            previousSchool: application.previousSchool,
            admissionStatus: 'active',
            schoolId: application.schoolId ?? schoolId ?? undefined,
            // Guardian info
            guardianName: guardianForm.g1Name || undefined,
            guardianPhone: guardianForm.g1Phone || undefined,
            guardianRelationship: guardianForm.g1Relationship || undefined,
            guardianEmail: normalizedEmail || undefined,
            guardianUserId: resolvedParentUserId,
            guardian2Name: guardianForm.g2Name || undefined,
            guardian2Phone: guardianForm.g2Phone || undefined,
            guardian2Relationship: guardianForm.g2Relationship || undefined,
            guardian2Email: guardianForm.g2Email || undefined,
            siblingIds: siblingIds.length ? siblingIds : undefined,
          };
          batch.set(studentRef, stripUndefined(newStudent as Record<string, unknown>) as Omit<Student, 'id'>);

          // Denormalized child entry for one-to-many tracking
          const newChildEntry = {
            studentId: studentRef.id,
            studentName: application.applicantName,
            currentClass: assignedClass,
          };
          const siblingChildEntries = selectedSiblings.map(s => ({
            studentId: s.id!,
            studentName: s.studentName,
            currentClass: s.currentClass,
          }));

          // Create Guardian document — includes linkedChildren
          if (guardianForm.g1Name) {
            const guardianRef = doc(collection(db, 'guardians'));
            batch.set(guardianRef, {
              fullName: guardianForm.g1Name,
              email: normalizedEmail,
              phone: guardianForm.g1Phone,
              relationship: guardianForm.g1Relationship,
              occupation: guardianForm.g1Occupation,
              userId: resolvedParentUserId ?? null,
              studentIds: [studentRef.id, ...siblingIds],
              linkedChildren: [newChildEntry, ...siblingChildEntries],
              createdAt: serverTimestamp(),
              schoolId: application.schoolId ?? schoolId ?? undefined,
            } as Omit<Guardian, 'id'>);
          }

          // Create users/{uid} profile for newly created parent account
          if (parentNewlyCreated && resolvedParentUserId) {
            batch.set(doc(db, 'users', resolvedParentUserId), stripUndefined({
              uid: resolvedParentUserId,
              email: normalizedEmail,
              role: 'parent',
              displayName: guardianForm.g1Name || normalizedEmail,
              schoolId: application.schoolId ?? schoolId ?? undefined,
              linkedStudentIds: [studentRef.id, ...siblingIds],
              linkedChildren: [newChildEntry, ...siblingChildEntries],
              createdAt: serverTimestamp(),
            }) as Record<string, unknown>);
          } else if (resolvedParentUserId) {
            // Existing user (either linked explicitly or matched by email) — append child
            batch.update(doc(db, 'users', resolvedParentUserId), {
              linkedStudentIds: arrayUnion(studentRef.id, ...siblingIds),
              linkedChildren: arrayUnion(newChildEntry, ...siblingChildEntries),
            });
          }

          // Update siblings to include this new student
          for (const sib of selectedSiblings) {
            if (!sib.id) continue;
            const existingSibIds = sib.siblingIds || [];
            if (!existingSibIds.includes(studentRef.id)) {
              batch.update(doc(db, 'students', sib.id), {
                siblingIds: [...existingSibIds, studentRef.id],
              });
            }
          }

          // ── Applicant → Student role upgrade ──────────────────────────
          // If the applicant registered their own account via /apply, promote
          // them from 'applicant' to 'student' and link to the student record.
          let existingStudentAccount = false;
          if (application.applicantUid && application.applicantUid !== 'admin') {
            try {
              const applicantUserSnap = await getDoc(doc(db, 'users', application.applicantUid));
              if (applicantUserSnap.exists()) {
                const applicantRole = applicantUserSnap.data().role;
                if (applicantRole === 'applicant') {
                  // Promote applicant → student
                  batch.update(doc(db, 'users', application.applicantUid), {
                    role: 'student',
                    linkedStudentIds: arrayUnion(studentRef.id),
                    schoolId: application.schoolId ?? schoolId ?? undefined,
                  });
                  existingStudentAccount = true;
                } else if (applicantRole === 'student') {
                  // Already a student (re-approval or duplicate) — just link
                  batch.update(doc(db, 'users', application.applicantUid), {
                    linkedStudentIds: arrayUnion(studentRef.id),
                  });
                  existingStudentAccount = true;
                }
                // Any other role (parent, teacher, etc.) applied via the form —
                // do NOT count as an existing student account. A fresh synthetic
                // login will be provisioned for the child instead.
              }
            } catch (upgradeErr) {
              console.warn('Applicant role upgrade skipped:', upgradeErr);
            }
          }

          // ── Synthetic student login provisioning ─────────────────────
          // Always provision a school-issued login for every new student.
          // Students sign in with Student ID + password — the synthetic email
          // is internal only and never shown to the student.
          let studentSyntheticEmail: string | undefined;
          let studentTempPassword: string | undefined;
          if (!existingStudentAccount) {
            studentSyntheticEmail = buildStudentLoginEmail(studentId, schoolSettings);
            studentTempPassword = generateStudentTempPassword(studentId);
            try {
              const secondaryApp = getApps().find(a => a.name === 'student-creator')
                || initializeApp(firebaseConfig as any, 'student-creator');
              const studentAuth = getAuth(secondaryApp);
              const cred = await createUserWithEmailAndPassword(
                studentAuth, studentSyntheticEmail, studentTempPassword
              );
              batch.set(doc(db, 'users', cred.user.uid), stripUndefined({
                uid: cred.user.uid,
                email: studentSyntheticEmail,
                role: 'student',
                displayName: application.applicantName,
                schoolId: application.schoolId ?? schoolId ?? undefined,
                linkedStudentIds: [studentRef.id],
                mustChangePassword: true,
                syntheticLogin: true,
                createdAt: serverTimestamp(),
              }) as Record<string, unknown>);
              batch.update(studentRef, { loginEmail: studentSyntheticEmail });
              await firebaseSignOut(studentAuth);
            } catch (studentAuthErr: any) {
              console.error('Student Auth provisioning failed:', studentAuthErr);
              alert(
                `⚠ Student portal account could not be created ` +
                `(${studentAuthErr.message || studentAuthErr.code}). ` +
                `Student is still enrolled; use "Set Password" in the Student Directory to fix this.`
              );
              studentSyntheticEmail = undefined;
              studentTempPassword = undefined;
            }
          }

          await batch.commit();
          // Write student_logins index AFTER batch so schoolId is available
          if (studentSyntheticEmail && (application.schoolId ?? schoolId)) {
            await upsertStudentLoginIndex(db, application.schoolId ?? schoolId!, studentId, studentSyntheticEmail).catch(console.warn);
          }

          setAdmissionResult({
            studentId,
            className: assignedClass,
            parentEmail: (parentNewlyCreated && tempPassword) ? normalizedEmail : undefined,
            parentPassword: (parentNewlyCreated && tempPassword) ? tempPassword : undefined,
            studentLogin: studentSyntheticEmail,
            studentPassword: studentTempPassword,
          });
          return;
        } else {
          // Student already exists — update guardian link on the existing student record
          const existingStudentDoc = studentSnap.docs[0];
          const existingStudentId = existingStudentDoc.id;
          const existingStudentData = existingStudentDoc.data() as Student;
          const siblingIds = selectedSiblings.map(s => s.id!).filter(Boolean);

          const guardianUpdates: Record<string, unknown> = {};
          if (guardianForm.g1Name) guardianUpdates.guardianName = guardianForm.g1Name;
          if (guardianForm.g1Phone) guardianUpdates.guardianPhone = guardianForm.g1Phone;
          if (guardianForm.g1Email) guardianUpdates.guardianEmail = guardianForm.g1Email;
          if (guardianForm.g1Relationship) guardianUpdates.guardianRelationship = guardianForm.g1Relationship;
          if (linkExistingParent && linkedUserId) guardianUpdates.guardianUserId = linkedUserId;
          if (guardianForm.g2Name) guardianUpdates.guardian2Name = guardianForm.g2Name;
          if (guardianForm.g2Phone) guardianUpdates.guardian2Phone = guardianForm.g2Phone;
          if (guardianForm.g2Relationship) guardianUpdates.guardian2Relationship = guardianForm.g2Relationship;
          if (guardianForm.g2Email) guardianUpdates.guardian2Email = guardianForm.g2Email;

          if (Object.keys(guardianUpdates).length > 0) {
            batch.update(doc(db, 'students', existingStudentId), guardianUpdates);
          }

          // Link parent portal account on existing student
          if (linkExistingParent && linkedUserId) {
            const existingChildEntry = {
              studentId: existingStudentId,
              studentName: existingStudentData.studentName,
              currentClass: existingStudentData.currentClass,
            };
            const siblingChildEntries = selectedSiblings.map(s => ({
              studentId: s.id!,
              studentName: s.studentName,
              currentClass: s.currentClass,
            }));
            batch.update(doc(db, 'users', linkedUserId), {
              linkedStudentIds: arrayUnion(existingStudentId, ...siblingIds),
              linkedChildren: arrayUnion(existingChildEntry, ...siblingChildEntries),
            });
          }
        }
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const simulateNINVerification = () => {
    setVerifyingNIN(true);
    setTimeout(() => { setVerifyingNIN(false); setNinVerified(true); }, 2000);
  };

  const simulateExamVerification = () => {
    setVerifyingExam(true);
    setTimeout(() => { setVerifyingExam(false); setExamVerified(true); }, 2500);
  };

  const gf = (field: keyof GuardianForm, val: string) =>
    setGuardianForm(prev => ({ ...prev, [field]: val }));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );
  if (!application) return <div className="min-h-screen flex items-center justify-center">Application not found.</div>;

  const age = differenceInYears(new Date(), parseISO(application.dob));
  const isAgeEligible = application.classApplyingFor.startsWith('Primary')
    ? age >= NIGERIAN_REGULATIONS.minAgePrimary1
    : application.classApplyingFor.startsWith('JSS')
      ? age >= NIGERIAN_REGULATIONS.minAgeJSS1
      : age >= NIGERIAN_REGULATIONS.minAgeSSS1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Admission Success Modal */}
      <AnimatePresence>
        {admissionResult && (
          <AdmissionSuccessModal result={admissionResult} onClose={() => setAdmissionResult(null)} />
        )}
      </AnimatePresence>

      <button onClick={() => navigate('/admin/admissions')}
        className="flex items-center text-slate-500 hover:text-indigo-600 font-medium mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Admissions
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Main Content ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile header */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold mr-6">
                  {application.applicantName.charAt(0)}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{application.applicantName}</h1>
                  <div className="flex items-center mt-1 space-x-3">
                    <StatusBadge status={application.status} />
                    <span className="text-slate-400 text-sm">•</span>
                    <span className="text-slate-500 text-sm">Applied for {application.classApplyingFor}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <DetailSection icon={<User className="w-5 h-5" />} title="Personal Details">
                <DetailItem label="Date of Birth" value={`${formatDate(application.dob)} (${age} years old)`} />
                <DetailItem label="Gender" value={application.gender} className="capitalize" />
                <DetailItem label="NIN" value={application.nin} />
              </DetailSection>

              <DetailSection icon={<BookOpen className="w-5 h-5" />} title="Academic History">
                <DetailItem label="Target Class" value={application.classApplyingFor} />
                <DetailItem label="Previous School" value={application.previousSchool} />
                {application.waecNecoNumber && <DetailItem label="WAEC/NECO ID" value={application.waecNecoNumber} />}
              </DetailSection>

              <DetailSection icon={<Phone className="w-5 h-5" />} title="Contact Info">
                <DetailItem label="Email" value={application.email} />
                <DetailItem label="Phone" value={application.phone} />
              </DetailSection>

              <DetailSection icon={<FileText className="w-5 h-5" />} title="Documents">
                <div className="space-y-2 mt-2">
                  {[{ name: 'Birth_Certificate.pdf' }, { name: 'Last_Report_Card.pdf' }].map(f => (
                    <div key={f.name} className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-indigo-50 hover:border-indigo-100 transition-all group">
                      <FileText className="w-4 h-4 text-slate-400 mr-3 group-hover:text-indigo-500" />
                      <span className="text-sm font-medium text-slate-700">{f.name}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            </div>
          </div>

          {/* Class Assignment Override */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <School className="w-5 h-5 text-indigo-600" /> Class Assignment
            </h3>
            <p className="text-sm text-slate-500 mb-3">Confirm or override the class this student will be admitted into.</p>
            <select value={guardianForm.classAssignment} onChange={e => gf('classAssignment', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium">
              <option value="">— Use applied class ({application.classApplyingFor}) —</option>
              {classNames.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Guardian & Sibling Linking */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button onClick={() => setShowGuardianPanel(v => !v)}
              className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 transition-colors">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> Guardian & Sibling Linking
                <span className="text-xs font-medium text-slate-400">(recommended before approval)</span>
              </h3>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showGuardianPanel ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showGuardianPanel && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  className="overflow-hidden">
                  <div className="px-6 pb-6">
                    <GuardianPanel
                      form={guardianForm}
                      onChange={gf}
                      existingStudents={existingStudents}
                      selectedSiblings={selectedSiblings}
                      onToggleSibling={s => setSelectedSiblings(prev =>
                        prev.find(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, s]
                      )}
                      parentUsers={parentUsers}
                      linkExistingParent={linkExistingParent}
                      onToggleLinkParent={() => setLinkExistingParent(v => !v)}
                      linkedUserId={linkedUserId}
                      onLinkedUserChange={setLinkedUserId}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Reviewer Notes */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center space-x-3 mb-6">
              <MessageSquare className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-900">Reviewer Notes</h2>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add internal notes about this application..."
              className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm" />
            <div className="flex justify-end mt-4">
              <button onClick={() => handleStatusUpdate(application.status)} disabled={saving}
                className="flex items-center px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-all disabled:opacity-50 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Notes
              </button>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">
          {/* Verification */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" /> Verification Checks
            </h3>
            <div className="space-y-4">
              <VerificationItem label="Age Eligibility"
                status={isAgeEligible ? 'success' : 'error'}
                message={isAgeEligible ? `Age ${age} — Eligible` : `Age ${age} — Below minimum`} />

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">External Databases</p>
                <div className="space-y-3">
                  <button onClick={simulateNINVerification} disabled={verifyingNIN || ninVerified}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      ninVerified ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                    }`}>
                    <div className="flex items-center">
                      <ShieldCheck className={`w-4 h-4 mr-3 ${ninVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className={`text-sm font-bold ${ninVerified ? 'text-emerald-700' : 'text-slate-700'}`}>NIN Verification</span>
                    </div>
                    {verifyingNIN ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> :
                     ninVerified ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : null}
                  </button>

                  <button onClick={simulateExamVerification} disabled={verifyingExam || examVerified}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      examVerified ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                    }`}>
                    <div className="flex items-center">
                      <Database className={`w-4 h-4 mr-3 ${examVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className={`text-sm font-bold ${examVerified ? 'text-emerald-700' : 'text-slate-700'}`}>WAEC/NECO Sync</span>
                    </div>
                    {verifyingExam ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> :
                     examVerified ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : null}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Guardian summary — only before approval */}
          {application.status !== 'approved' && (guardianForm.g1Name || selectedSiblings.length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">On Approval Will Create</p>
              {guardianForm.g1Name && (
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-medium text-slate-700">{guardianForm.g1Name}</span>
                  <span className="text-xs text-slate-400 capitalize">({guardianForm.g1Relationship})</span>
                </div>
              )}
              {selectedSiblings.length > 0 && (
                <div className="flex items-start gap-2 mt-2">
                  <Baby className="w-4 h-4 text-indigo-400 mt-0.5" />
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">Siblings:</span>{' '}
                    {selectedSiblings.map(s => s.studentName).join(', ')}
                  </div>
                </div>
              )}
              {guardianForm.classAssignment && (
                <div className="flex items-center gap-2 mt-2">
                  <School className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-medium text-slate-700">Class: {guardianForm.classAssignment}</span>
                </div>
              )}
            </div>
          )}

          {/* Decision — state-aware */}
          {application.status === 'approved' ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                <h3 className="text-base font-bold text-emerald-900">Student Enrolled</h3>
              </div>
              <p className="text-sm text-emerald-800 leading-relaxed">
                This application has been <strong>approved</strong> and the applicant is now an
                enrolled student. To cancel the application, dismiss the student, or make any other
                changes, please use the <strong>Student Panel</strong>.
              </p>
              <button onClick={() => navigate('/admin/students')}
                className="mt-4 w-full flex items-center justify-center px-4 py-2.5 bg-white border border-emerald-300 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-all text-sm">
                <Users className="w-4 h-4 mr-2" /> Go to Student Panel
              </button>
              <button
                onClick={async () => {
                  // Try stored loginEmail first, then live-query the student doc
                  let loginEmail = enrolledLoginEmail;
                  if (!loginEmail) {
                    const snap = await getDocs(
                      query(collection(db, 'students'), where('applicationId', '==', id))
                    );
                    if (!snap.empty) loginEmail = (snap.docs[0].data() as Student).loginEmail ?? null;
                  }
                  if (loginEmail) {
                    const localPart = loginEmail.split('@')[0];
                    const pw = generateStudentTempPassword(localPart);
                    alert(
                      `🎒 Student portal credentials\n\n` +
                      `Login: ${loginEmail}\n` +
                      `Temporary password: ${pw}\n\n` +
                      `Note: if the student already changed their password, ` +
                      `use Admin → Roles & Permissions → Re-provision login instead.`
                    );
                  } else {
                    alert(
                      `No school-issued login found for this student.\n\n` +
                      `This happens when:\n` +
                      `• The student was enrolled before auto-provisioning was enabled, or\n` +
                      `• Their class was below the configured minimum.\n\n` +
                      `To create a login now, go to Admin → Roles & Permissions, find the student, and use Re-provision login.`
                    );
                  }
                }}
                className="mt-2 w-full flex items-center justify-center px-4 py-2.5 bg-white border border-emerald-300 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-all text-sm"
              >
                <ShieldCheck className="w-4 h-4 mr-2" /> Show student login credentials
              </button>
            </div>
          ) : application.status === 'rejected' ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <h3 className="text-base font-bold text-rose-900">Application Rejected</h3>
              </div>
              <p className="text-sm text-rose-800 leading-relaxed">
                This application was rejected. If you'd like to reconsider, you can move it back to
                reviewing.
              </p>
              <button onClick={() => handleStatusUpdate('reviewing')} disabled={saving}
                className="mt-4 w-full flex items-center justify-center px-4 py-2.5 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 transition-all disabled:opacity-50 text-sm">
                <Clock className="w-4 h-4 mr-2" /> Move Back to Reviewing
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Admission Decision</h3>
              <div className="space-y-3">
                <button onClick={() => handleStatusUpdate('approved')} disabled={saving}
                  className="w-full flex items-center justify-center px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                  Approve & Enroll
                </button>
                <button onClick={() => handleStatusUpdate('rejected')} disabled={saving}
                  className="w-full flex items-center justify-center px-6 py-3 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 transition-all disabled:opacity-50">
                  <XCircle className="w-5 h-5 mr-2" /> Reject Application
                </button>
                <button onClick={() => handleStatusUpdate('reviewing')} disabled={saving}
                  className="w-full flex items-center justify-center px-6 py-3 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition-all disabled:opacity-50">
                  <Clock className="w-5 h-5 mr-2" /> Mark as Reviewing
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 text-indigo-600">
        {icon}
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-3 pl-7">{children}</div>
    </div>
  );
}

function DetailItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-slate-700 font-medium ${className}`}>{value || '—'}</p>
    </div>
  );
}

function VerificationItem({ label, status, message }: { label: string; status: 'success' | 'error' | 'pending'; message: string }) {
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    error: <AlertTriangle className="w-4 h-4 text-rose-600" />,
    pending: <Clock className="w-4 h-4 text-amber-600" />,
  };
  const bgColors = {
    success: 'bg-emerald-50 border-emerald-100',
    error: 'bg-rose-50 border-rose-100',
    pending: 'bg-amber-50 border-amber-100',
  };
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${bgColors[status]}`}>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-bold ${status === 'success' ? 'text-emerald-700' : status === 'error' ? 'text-rose-700' : 'text-amber-700'}`}>
          {message}
        </p>
      </div>
      {icons[status]}
    </div>
  );
}
