import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, doc,
  serverTimestamp, query, orderBy, getDocs, where, writeBatch
} from 'firebase/firestore';
import { generateStudentId } from '../services/firestoreService';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  ClipboardList, Search, Plus, Eye, CheckCircle, XCircle,
  Clock, Filter, Download, Users, TrendingUp, UserPlus,
  BookOpen, ChevronRight, X, Save, Loader2, AlertTriangle,
  Phone, Mail, MapPin, Heart, School, User, Link2, Baby,
  FileText, BarChart3, RefreshCw, Send, ShieldCheck
} from 'lucide-react';
import { Application, ApplicationStatus, Student, Guardian, SCHOOL_CLASSES, CURRENT_SESSION, formatDate } from '../types';
import { stripUndefined } from '../utils/firestoreSanitize';
import { differenceInYears, parseISO } from 'date-fns';
import { useAuth } from '../components/FirebaseProvider';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:   { label: 'Pending',   color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  reviewing: { label: 'Reviewing', color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  approved:  { label: 'Approved',  color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected:  { label: 'Rejected',  color: 'text-rose-700',   bg: 'bg-rose-50',    border: 'border-rose-200' },
};

function StatusPill({ status }: { status: ApplicationStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${c.color} ${c.bg} ${c.border}`}>
      {c.label}
    </span>
  );
}

// ─── Direct-Admit Modal ───────────────────────────────────────────────────────

interface DirectAdmitForm {
  // Student
  studentName: string; email: string; phone: string; dob: string;
  gender: string; nin: string; classApplyingFor: string;
  previousSchool: string; religion: string; homeAddress: string;
  stateOfOrigin: string; bloodGroup: string; medicalConditions: string; allergies: string;
  nationality: string;
  // Primary Guardian
  g1Name: string; g1Email: string; g1Phone: string; g1Relationship: string;
  g1Occupation: string; g1Address: string; linkExistingParent: boolean; g1UserId: string;
  // Secondary Guardian (optional)
  g2Name: string; g2Email: string; g2Phone: string; g2Relationship: string;
  // Siblings
  siblingSearch: string;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const RELATIONSHIPS = ['father', 'mother', 'uncle', 'aunt', 'sibling', 'guardian', 'other'];

const EMPTY_FORM: DirectAdmitForm = {
  studentName: '', email: '', phone: '', dob: '', gender: 'male', nin: '',
  classApplyingFor: '', previousSchool: '', religion: '', homeAddress: '',
  stateOfOrigin: '', bloodGroup: 'O+', medicalConditions: '', allergies: '', nationality: 'Nigerian',
  g1Name: '', g1Email: '', g1Phone: '', g1Relationship: 'father', g1Occupation: '', g1Address: '',
  linkExistingParent: false, g1UserId: '',
  g2Name: '', g2Email: '', g2Phone: '', g2Relationship: 'mother',
  siblingSearch: '',
};

function DirectAdmitModal({
  onClose, onSuccess, existingStudents
}: {
  onClose: () => void;
  onSuccess: () => void;
  existingStudents: Student[];
}) {
  const { user, profile } = useAuth();
  const [form, setForm] = useState<DirectAdmitForm>(EMPTY_FORM);
  const [step, setStep] = useState(1); // 1-Student Info, 2-Guardian, 3-Siblings & Class, 4-Review
  const [saving, setSaving] = useState(false);
  const [selectedSiblings, setSelectedSiblings] = useState<Student[]>([]);
  const [parentUsers, setParentUsers] = useState<{ uid: string; displayName: string; email: string }[]>([]);

  const f = (field: keyof DirectAdmitForm, val: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: val }));

  useEffect(() => {
    // load parent-role users for linking
    getDocs(query(collection(db, 'users'), where('role', '==', 'parent'))).then(snap => {
      setParentUsers(snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })));
    });
  }, []);

  const filteredSiblings = useMemo(() => {
    if (!form.siblingSearch.trim()) return [];
    const q = form.siblingSearch.toLowerCase();
    return existingStudents.filter(s =>
      s.studentName.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [form.siblingSearch, existingStudents]);

  const toggleSibling = (s: Student) => {
    setSelectedSiblings(prev =>
      prev.find(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, s]
    );
  };

  const validate = () => {
    if (step === 1) {
      if (!form.studentName.trim()) return 'Student name is required.';
      if (!form.dob) return 'Date of birth is required.';
      if (!form.gender) return 'Gender is required.';
    }
    if (step === 2) {
      if (!form.g1Name.trim()) return 'Primary guardian name is required.';
      if (!form.g1Phone.trim()) return 'Primary guardian phone is required.';
    }
    if (step === 3) {
      if (!form.classApplyingFor?.trim()) return 'Please select a class.';
    }
    return null;
  };

  const next = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setStep(s => Math.min(s + 1, 4));
  };

  const handleSubmit = async () => {
    if (!form.classApplyingFor?.trim()) {
      toast.error('Please select a class (go back to step 3).');
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);

      // 1. Generate student ID
      const studentId = await generateStudentId();

      // 2. Create application record (for audit trail)
      const appRef = doc(collection(db, 'applications'));
      batch.set(appRef, {
        applicantName: form.studentName,
        email: form.email || `${studentId.toLowerCase().replace(/-/g, '')}@avenir.school`,
        phone: form.phone,
        dob: form.dob,
        gender: form.gender,
        nin: form.nin,
        classApplyingFor: form.classApplyingFor,
        previousSchool: form.previousSchool,
        status: 'approved',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        reviewerNotes: 'Direct admission by admin.',
        applicantUid: user?.uid || 'admin',
        directAdmission: true,
      });

      // 3. Create Guardian record
      const guardianRef = doc(collection(db, 'guardians'));
      const siblingIds = selectedSiblings.map(s => s.id!).filter(Boolean);

      // 4. Create student record
      const studentRef = doc(collection(db, 'students'));
      const studentData: Omit<Student, 'id'> = {
        studentName: form.studentName,
        email: form.email || `${studentId.toLowerCase().replace(/-/g, '')}@avenir.school`,
        phone: form.phone,
        dob: form.dob,
        gender: form.gender,
        nin: form.nin,
        currentClass: form.classApplyingFor,
        studentId,
        enrolledAt: serverTimestamp(),
        applicationId: appRef.id,
        guardianName: form.g1Name,
        guardianPhone: form.g1Phone,
        guardianRelationship: form.g1Relationship,
        guardianEmail: form.g1Email,
        guardianUserId: form.linkExistingParent ? form.g1UserId : undefined,
        guardian2Name: form.g2Name || undefined,
        guardian2Phone: form.g2Phone || undefined,
        guardian2Relationship: form.g2Relationship || undefined,
        guardian2Email: form.g2Email || undefined,
        siblingIds: siblingIds.length ? siblingIds : undefined,
        previousSchool: form.previousSchool,
        bloodGroup: form.bloodGroup,
        medicalConditions: form.medicalConditions,
        allergies: form.allergies,
        religion: form.religion,
        homeAddress: form.homeAddress,
        stateOfOrigin: form.stateOfOrigin,
        nationality: form.nationality,
        admissionStatus: 'active',
      };
      batch.set(studentRef, stripUndefined(studentData as Record<string, unknown>) as Omit<Student, 'id'>);

      // 5. Guardian doc
      batch.set(guardianRef, {
        fullName: form.g1Name,
        email: form.g1Email,
        phone: form.g1Phone,
        relationship: form.g1Relationship,
        occupation: form.g1Occupation,
        homeAddress: form.g1Address || form.homeAddress,
        userId: form.linkExistingParent ? form.g1UserId : null,
        studentIds: [studentRef.id, ...siblingIds],
        createdAt: serverTimestamp(),
      } as Omit<Guardian, 'id'>);

      // 6. Update each sibling to add this new student to their siblingIds
      for (const sib of selectedSiblings) {
        if (!sib.id) continue;
        const currentSiblings = sib.siblingIds || [];
        if (!currentSiblings.includes(studentRef.id)) {
          batch.update(doc(db, 'students', sib.id), {
            siblingIds: [...currentSiblings, studentRef.id],
          });
        }
      }

      // 7. If linking existing parent user, update their profile with studentId
      if (form.linkExistingParent && form.g1UserId) {
        batch.update(doc(db, 'users', form.g1UserId), {
          linkedStudentIds: [studentRef.id, ...siblingIds],
        });
      }

      await batch.commit();
      onSuccess();
      onClose();
      toast.success(`Student admitted! ID: ${studentId}`);
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const stepTitles = ['Student Information', 'Guardian / Parent', 'Siblings & Class', 'Review & Submit'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-600" /> Direct Admission
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">Step {step} of 4 — {stepTitles[step - 1]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Step progress */}
        <div className="px-8 py-3 border-b border-slate-100">
          <div className="flex gap-2">
            {[1,2,3,4].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${s <= step ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-8 py-6 space-y-4">

          {/* ── Step 1: Student Information ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name *</label>
                  <input value={form.studentName} onChange={e => f('studentName', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="e.g. Amara Okafor" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date of Birth *</label>
                  <input type="date" value={form.dob} onChange={e => f('dob', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gender *</label>
                  <select value={form.gender} onChange={e => f('gender', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="student@email.com (optional)" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
                  <input value={form.phone} onChange={e => f('phone', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="+234..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">NIN</label>
                  <input value={form.nin} onChange={e => f('nin', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="11-digit NIN" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Blood Group</label>
                  <select value={form.bloodGroup} onChange={e => f('bloodGroup', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                    {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Religion</label>
                  <select value={form.religion} onChange={e => f('religion', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                    <option value="">Select...</option>
                    <option>Christianity</option>
                    <option>Islam</option>
                    <option>Traditional</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">State of Origin</label>
                  <input value={form.stateOfOrigin} onChange={e => f('stateOfOrigin', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="e.g. Lagos" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nationality</label>
                  <input value={form.nationality} onChange={e => f('nationality', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Home Address</label>
                  <input value={form.homeAddress} onChange={e => f('homeAddress', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Street, City, State" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Previous School</label>
                  <input value={form.previousSchool} onChange={e => f('previousSchool', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Medical Conditions</label>
                  <input value={form.medicalConditions} onChange={e => f('medicalConditions', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="None / specify" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Known Allergies</label>
                  <input value={form.allergies} onChange={e => f('allergies', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="None / specify" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Guardian / Parent ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
                <Heart className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                <p className="text-sm text-indigo-800">
                  Linking a guardian enables the <strong>Parent Portal</strong> — they can track grades, attendance, fees, and communicate with teachers.
                </p>
              </div>

              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Primary Guardian</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name *</label>
                  <input value={form.g1Name} onChange={e => f('g1Name', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone *</label>
                  <input value={form.g1Phone} onChange={e => f('g1Phone', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="+234..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={form.g1Email} onChange={e => f('g1Email', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Relationship</label>
                  <select value={form.g1Relationship} onChange={e => f('g1Relationship', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm capitalize">
                    {RELATIONSHIPS.map(r => <option key={r} className="capitalize">{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Occupation</label>
                  <input value={form.g1Occupation} onChange={e => f('g1Occupation', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Guardian Address (if different)</label>
                  <input value={form.g1Address} onChange={e => f('g1Address', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>

              {/* Link to existing parent account */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.linkExistingParent}
                    onChange={e => f('linkExistingParent', e.target.checked)}
                    className="w-4 h-4 accent-indigo-600" />
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-500" /> Link to existing parent portal account
                  </span>
                </label>
                {form.linkExistingParent && (
                  <div className="mt-3">
                    <select value={form.g1UserId} onChange={e => f('g1UserId', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                      <option value="">— Select parent account —</option>
                      {parentUsers.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Secondary Guardian */}
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-2">Secondary Guardian (Optional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                  <input value={form.g2Name} onChange={e => f('g2Name', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
                  <input value={form.g2Phone} onChange={e => f('g2Phone', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Relationship</label>
                  <select value={form.g2Relationship} onChange={e => f('g2Relationship', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm capitalize">
                    {RELATIONSHIPS.map(r => <option key={r} className="capitalize">{r}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={form.g2Email} onChange={e => f('g2Email', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Siblings & Class Assignment ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Assign to Class *</label>
                <select value={form.classApplyingFor} onChange={e => f('classApplyingFor', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value="">— Select a class —</option>
                  {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Baby className="w-4 h-4" /> Sibling Linking
                </p>
                <p className="text-sm text-slate-500 mb-3">
                  Search for existing students to mark as siblings. This automatically updates both records.
                </p>
                <input
                  value={form.siblingSearch}
                  onChange={e => f('siblingSearch', e.target.value)}
                  placeholder="Search by name or student ID..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
                {filteredSiblings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {filteredSiblings.map(s => {
                      const selected = !!selectedSiblings.find(x => x.id === s.id);
                      return (
                        <button key={s.id} onClick={() => toggleSibling(s)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all ${
                            selected ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-medium' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-200'
                          }`}>
                          <span>{s.studentName} <span className="text-slate-400 font-normal">({s.studentId})</span></span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                            {selected ? 'Linked ✓' : s.currentClass}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedSiblings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs font-bold text-slate-500 mb-2">Selected Siblings:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedSiblings.map(s => (
                        <span key={s.id} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-medium">
                          {s.studentName}
                          <button onClick={() => toggleSibling(s)} className="hover:text-indigo-600">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-100">
                <ReviewRow icon={<User className="w-4 h-4" />} label="Student Name" value={form.studentName} />
                <ReviewRow icon={<BookOpen className="w-4 h-4" />} label="Class" value={form.classApplyingFor} />
                <ReviewRow icon={<User className="w-4 h-4" />} label="D.O.B / Gender" value={`${formatDate(form.dob)} / ${form.gender}`} />
                <ReviewRow icon={<Phone className="w-4 h-4" />} label="Phone" value={form.phone || '—'} />
                <ReviewRow icon={<Heart className="w-4 h-4" />} label="Blood Group" value={form.bloodGroup} />
                <ReviewRow icon={<School className="w-4 h-4" />} label="Previous School" value={form.previousSchool || '—'} />
                <ReviewRow icon={<Users className="w-4 h-4" />} label="Primary Guardian" value={`${form.g1Name} (${form.g1Relationship})`} />
                <ReviewRow icon={<Phone className="w-4 h-4" />} label="Guardian Phone" value={form.g1Phone} />
                {selectedSiblings.length > 0 && (
                  <ReviewRow icon={<Baby className="w-4 h-4" />} label="Siblings Linked" value={selectedSiblings.map(s => s.studentName).join(', ')} />
                )}
                {form.linkExistingParent && form.g1UserId && (
                  <ReviewRow icon={<Link2 className="w-4 h-4" />} label="Parent Portal" value="Linked to existing account" />
                )}
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                Student will be admitted immediately with status <strong>Active</strong> and a unique Student ID will be generated.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 4 ? (
            <button onClick={next}
              className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm flex items-center gap-2">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all text-sm flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Admit Student
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="text-slate-400">{icon}</span>
      <span className="text-slate-500 w-36 shrink-0">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

// ─── Main Admissions Management Page ─────────────────────────────────────────

type TabType = 'pipeline' | 'all' | 'stats';

export default function AdmissionsManagement() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<TabType>('pipeline');
  const [showDirectAdmit, setShowDirectAdmit] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'applications'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setApplications(snap.docs.map(d => ({ id: d.id, ...(d.data() as Application) })));
      setLoading(false);
    });
    const unsub2 = onSnapshot(query(collection(db, 'students'), orderBy('enrolledAt', 'desc')), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...(d.data() as Student) })));
    });
    return () => { unsub(); unsub2(); };
  }, [refresh]);

  // KPI counts
  const counts = useMemo(() => ({
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    reviewing: applications.filter(a => a.status === 'reviewing').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
    enrolled: students.length,
  }), [applications, students]);

  // Filtered list
  const filtered = useMemo(() => {
    return applications.filter(a => {
      const matchSearch = !search ||
        a.applicantName.toLowerCase().includes(search.toLowerCase()) ||
        a.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchClass = classFilter === 'all' || a.classApplyingFor === classFilter;
      return matchSearch && matchStatus && matchClass;
    });
  }, [applications, search, statusFilter, classFilter]);

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Class', 'Status', 'Date'],
      ...filtered.map(a => [
        a.applicantName, a.email, a.classApplyingFor, a.status,
        a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000).toLocaleDateString() : ''
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a2 = document.createElement('a');
    a2.href = 'data:text/csv,' + encodeURIComponent(csv);
    a2.download = 'admissions.csv';
    a2.click();
  };

  // Class stats for pipeline
  const classCounts = useMemo(() => {
    const map: Record<string, number> = {};
    applications.filter(a => a.status === 'approved').forEach(a => {
      map[a.classApplyingFor] = (map[a.classApplyingFor] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [applications]);

  const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'pipeline', label: 'Pipeline', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'all', label: 'All Applications', icon: <Users className="w-4 h-4" /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" /> Admissions Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage the full student admission pipeline for {CURRENT_SESSION} session.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRefresh(r => r + 1)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowDirectAdmit(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
            <UserPlus className="w-4 h-4" /> Admit Student
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: 'Total Applications', value: counts.total, color: 'bg-slate-700', click: () => setStatusFilter('all') },
          { label: 'Pending', value: counts.pending, color: 'bg-amber-500', click: () => setStatusFilter('pending') },
          { label: 'Reviewing', value: counts.reviewing, color: 'bg-indigo-500', click: () => setStatusFilter('reviewing') },
          { label: 'Approved', value: counts.approved, color: 'bg-emerald-500', click: () => setStatusFilter('approved') },
          { label: 'Rejected', value: counts.rejected, color: 'bg-rose-500', click: () => setStatusFilter('rejected') },
          { label: 'Enrolled Students', value: counts.enrolled, color: 'bg-purple-500', click: () => {} },
        ].map(k => (
          <button key={k.label} onClick={k.click}
            className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-left hover:shadow-md transition-all hover:-translate-y-0.5">
            <div className={`w-7 h-7 ${k.color} rounded-lg mb-2 flex items-center justify-center`}>
              <ClipboardList className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{k.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{k.label}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Pipeline Tab ── */}
      {activeTab === 'pipeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {(['pending', 'reviewing', 'approved', 'rejected'] as ApplicationStatus[]).map(status => {
            const apps = applications.filter(a => a.status === status);
            const cfg = STATUS_CONFIG[status];
            return (
              <div key={status} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={`px-4 py-3 border-b ${cfg.bg} ${cfg.border} flex items-center justify-between`}>
                  <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                    {apps.length}
                  </span>
                </div>
                <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                  {apps.length === 0 && (
                    <p className="text-center text-slate-400 text-sm py-8">No applications</p>
                  )}
                  {apps.map(app => (
                    <button key={app.id} onClick={() => navigate(`/admin/application/${app.id}`)}
                      className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group">
                      <p className="font-bold text-slate-800 text-sm group-hover:text-indigo-700">
                        {app.applicantName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{app.classApplyingFor}</p>
                      {app.createdAt?.seconds && (
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(app.createdAt.seconds * 1000).toLocaleDateString('en-NG')}
                        </p>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── All Applications Tab ── */}
      {activeTab === 'all' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium">
              <option value="all">All Classes</option>
              {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Loading applications...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No applications found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th className="text-left px-5 py-3.5 font-bold text-slate-500 text-xs uppercase tracking-wider">Applicant</th>
                    <th className="text-left px-4 py-3.5 font-bold text-slate-500 text-xs uppercase tracking-wider">Class</th>
                    <th className="text-left px-4 py-3.5 font-bold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3.5 font-bold text-slate-500 text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3.5 font-bold text-slate-500 text-xs uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(app => (
                    <tr key={app.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                            {app.applicantName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{app.applicantName}</p>
                            <p className="text-xs text-slate-400">{app.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600 font-medium">{app.classApplyingFor}</td>
                      <td className="px-4 py-4"><StatusPill status={app.status} /></td>
                      <td className="px-4 py-4 text-slate-400 text-xs">
                        {app.createdAt?.seconds
                          ? new Date(app.createdAt.seconds * 1000).toLocaleDateString('en-NG')
                          : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          (app as any).directAdmission ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {(app as any).directAdmission ? 'Direct' : 'Online'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button onClick={() => navigate(`/admin/application/${app.id}`)}
                          className="flex items-center gap-1.5 ml-auto px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all opacity-0 group-hover:opacity-100">
                          <Eye className="w-3.5 h-3.5" /> Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Statistics Tab ── */}
      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversion funnel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-5 flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-indigo-600" /> Admission Funnel
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Applications Received', value: counts.total, max: counts.total, color: 'bg-slate-600' },
                { label: 'Under Review', value: counts.reviewing, max: counts.total, color: 'bg-indigo-500' },
                { label: 'Approved', value: counts.approved, max: counts.total, color: 'bg-emerald-500' },
                { label: 'Enrolled as Students', value: counts.enrolled, max: counts.total, color: 'bg-purple-500' },
                { label: 'Rejected', value: counts.rejected, max: counts.total, color: 'bg-rose-400' },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 font-medium">{row.label}</span>
                    <span className="font-bold text-slate-800">{row.value}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${row.color} rounded-full transition-all`}
                      style={{ width: row.max ? `${(row.value / row.max) * 100}%` : '0%' }} />
                  </div>
                </div>
              ))}
              {counts.total > 0 && (
                <p className="text-sm text-slate-500 pt-2 border-t border-slate-100">
                  Conversion rate: <strong className="text-indigo-700">{Math.round((counts.approved / counts.total) * 100)}%</strong> approval
                </p>
              )}
            </div>
          </div>

          {/* Class demand */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-5 flex items-center gap-2 text-sm">
              <School className="w-4 h-4 text-indigo-600" /> Approved by Class
            </h3>
            {classCounts.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-12">No approved applications yet.</p>
            ) : (
              <div className="space-y-2.5">
                {classCounts.map(([cls, count]) => {
                  const max = classCounts[0][1];
                  return (
                    <div key={cls} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-600 w-20 shrink-0">{cls}</span>
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                      <span className="text-sm font-bold text-slate-800 w-5 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Gender breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-5 flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-indigo-600" /> Gender Breakdown (Approved)
            </h3>
            {(() => {
              const approvedApps = applications.filter(a => a.status === 'approved');
              const male = approvedApps.filter(a => a.gender === 'male').length;
              const female = approvedApps.filter(a => a.gender === 'female').length;
              const total = approvedApps.length || 1;
              return (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-indigo-700 font-medium">Male</span>
                      <span className="font-bold">{male} ({Math.round(male/total*100)}%)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(male/total)*100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-pink-600 font-medium">Female</span>
                      <span className="font-bold">{female} ({Math.round(female/total*100)}%)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-pink-400 rounded-full" style={{ width: `${(female/total)*100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-5 flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-indigo-600" /> Recent Applications
            </h3>
            <div className="space-y-3">
              {applications.slice(0, 6).map(app => (
                <button key={app.id} onClick={() => navigate(`/admin/application/${app.id}`)}
                  className="w-full flex items-center justify-between text-left hover:bg-slate-50 rounded-xl p-2 -mx-2 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                      {app.applicantName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-700">{app.applicantName}</p>
                      <p className="text-xs text-slate-400">{app.classApplyingFor}</p>
                    </div>
                  </div>
                  <StatusPill status={app.status} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Direct Admit Modal */}
      <AnimatePresence>
        {showDirectAdmit && (
          <DirectAdmitModal
            onClose={() => setShowDirectAdmit(false)}
            onSuccess={() => setRefresh(r => r + 1)}
            existingStudents={students}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
