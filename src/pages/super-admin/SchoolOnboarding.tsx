/**
 * SchoolOnboarding — 4-step wizard to create a new school on the platform.
 * Step 1: School basics
 * Step 2: Creates Firestore documents (schools + school_settings)
 * Step 3: Admin user creation
 * Step 4: Confirmation
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { useSuperAdmin } from '../../components/SuperAdminContext';
import { School } from '../../types';
import {
  Building2, User, CheckCircle2, ArrowRight, ArrowLeft, Loader2, LogIn
} from 'lucide-react';
import toast from 'react-hot-toast';

// Generate a URL-safe school ID from the school name
function generateSchoolId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 30) + '_' + Date.now().toString(36);
}

type Step = 1 | 2 | 3 | 4;

interface SchoolForm {
  name: string;
  adminEmail: string;
  country: string;
  timezone: string;
  subscriptionPlan: School['subscriptionPlan'];
}

interface AdminForm {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
}

export default function SchoolOnboarding() {
  const navigate = useNavigate();
  const { enterSchool } = useSuperAdmin();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [createdSchoolId, setCreatedSchoolId] = useState('');
  const [createdSchoolName, setCreatedSchoolName] = useState('');

  const [school, setSchool] = useState<SchoolForm>({
    name: '', adminEmail: '', country: 'NG', timezone: 'Africa/Lagos',
    subscriptionPlan: 'pro',
  });
  const [admin, setAdmin] = useState<AdminForm>({
    adminName: '', adminEmail: '', adminPassword: '', confirmPassword: '',
  });
  const [adminCreated, setAdminCreated] = useState(false);

  // Step 1 → 2: Create school documents
  const handleCreateSchool = async () => {
    if (!school.name.trim()) { toast.error('School name is required'); return; }
    setSaving(true);
    try {
      const schoolId = generateSchoolId(school.name);
      // Create schools/{schoolId}
      await setDoc(doc(db, 'schools', schoolId), {
        id: schoolId,
        name: school.name.trim(),
        adminEmail: school.adminEmail.trim(),
        status: 'trial',
        subscriptionPlan: school.subscriptionPlan,
        subscriptionExpiresAt: null,
        maxStudents: 0,
        maxStaff: 0,
        createdAt: serverTimestamp(),
        createdBy: 'super_admin',
        country: school.country,
        timezone: school.timezone,
        notes: '',
      } as Omit<School, 'id'> & { id: string });

      // Create school_settings/{schoolId} with defaults
      await setDoc(doc(db, 'school_settings', schoolId), {
        schoolName: school.name.trim(),
        currentSession: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
        currentTerm: '1st Term',
        termStructure: '3-term',
        schoolLevels: [],
        periodTimes: [],
        customSubjects: [],
        currency: 'NGN',
        locale: 'en',
        country: school.country,
        timezone: school.timezone,
        gradingSystem: 'percentage',
        taxModel: 'none',
        schoolId,
      });

      setCreatedSchoolId(schoolId);
      setCreatedSchoolName(school.name.trim());
      // Pre-fill admin email from school form
      setAdmin(a => ({ ...a, adminEmail: school.adminEmail || a.adminEmail }));
      setStep(3);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create school');
    } finally {
      setSaving(false);
    }
  };

  // Step 3: Create admin user
  const handleCreateAdmin = async () => {
    if (!admin.adminName.trim() || !admin.adminEmail.trim() || !admin.adminPassword) {
      toast.error('All fields are required');
      return;
    }
    if (admin.adminPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (admin.adminPassword !== admin.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, admin.adminEmail, admin.adminPassword);
      await updateProfile(result.user, { displayName: admin.adminName });
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        email: admin.adminEmail,
        displayName: admin.adminName,
        role: 'admin',
        schoolId: createdSchoolId,
        disabled: false,
        createdAt: serverTimestamp(),
      });
      // Update the school's adminEmail
      await setDoc(doc(db, 'schools', createdSchoolId), { adminEmail: admin.adminEmail }, { merge: true });
      setAdminCreated(true);
      setStep(4);
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        toast.error('An account with this email already exists. The school was still created.');
        setStep(4);
      } else {
        toast.error(err?.message || 'Failed to create admin user');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSkipAdmin = () => setStep(4);

  const handleEnterSchool = () => {
    enterSchool(createdSchoolId, createdSchoolName);
    navigate('/admin');
  };

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
  const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add New School</h1>
        <p className="text-slate-500 text-sm mt-1">Set up a new school on the Avenir platform</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step > s ? 'bg-emerald-500 text-white' :
              step === s ? 'bg-indigo-600 text-white' :
              'bg-slate-100 text-slate-400'
            }`}>
              {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {i < 3 && <div className={`flex-1 h-1 rounded-full ${step > s ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-400 font-medium -mt-2">
        <span>School Details</span>
        <span>Review</span>
        <span>Admin User</span>
        <span>Done</span>
      </div>

      {/* Step 1: School basics */}
      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">School Information</h2>
          </div>
          <div>
            <label className={labelCls}>School Name *</label>
            <input className={inputCls} placeholder="e.g. Bright Future Academy" value={school.name} onChange={e => setSchool(s => ({ ...s, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Admin Email</label>
            <input className={inputCls} type="email" placeholder="admin@school.edu" value={school.adminEmail} onChange={e => setSchool(s => ({ ...s, adminEmail: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Country</label>
              <input className={inputCls} placeholder="e.g. NG" value={school.country} onChange={e => setSchool(s => ({ ...s, country: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <input className={inputCls} placeholder="e.g. Africa/Lagos" value={school.timezone} onChange={e => setSchool(s => ({ ...s, timezone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Subscription Plan</label>
            <select className={inputCls} value={school.subscriptionPlan} onChange={e => setSchool(s => ({ ...s, subscriptionPlan: e.target.value as School['subscriptionPlan'] }))}>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!school.name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2: Review & Create */}
      {step === 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Review School Details</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['School Name', school.name],
              ['Admin Email', school.adminEmail || '—'],
              ['Country', school.country],
              ['Timezone', school.timezone],
              ['Plan', school.subscriptionPlan],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-32 font-medium text-slate-500 flex-shrink-0">{label}</dt>
                <dd className="text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(1)} className="flex-1 flex items-center justify-center gap-2 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleCreateSchool}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create School'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Create admin user */}
      {step === 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Create School Admin</h2>
          </div>
          <p className="text-sm text-slate-500">This creates a Firebase Auth account for the school's admin user.</p>
          <div>
            <label className={labelCls}>Full Name *</label>
            <input className={inputCls} placeholder="e.g. John Obi" value={admin.adminName} onChange={e => setAdmin(a => ({ ...a, adminName: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Email *</label>
            <input className={inputCls} type="email" placeholder="admin@school.edu" value={admin.adminEmail} onChange={e => setAdmin(a => ({ ...a, adminEmail: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Password *</label>
            <input className={inputCls} type="password" placeholder="Min. 8 characters" value={admin.adminPassword} onChange={e => setAdmin(a => ({ ...a, adminPassword: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Confirm Password *</label>
            <input className={inputCls} type="password" placeholder="Repeat password" value={admin.confirmPassword} onChange={e => setAdmin(a => ({ ...a, confirmPassword: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSkipAdmin} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors text-sm">
              Skip for now
            </button>
            <button
              onClick={handleCreateAdmin}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Admin'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">School Created!</h2>
          <p className="text-slate-500 text-sm">
            <strong>{createdSchoolName}</strong> is now live on the platform.
            {adminCreated && ' The admin account has been created.'}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={handleEnterSchool}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              <LogIn className="w-4 h-4" /> Enter School
            </button>
            <button
              onClick={() => navigate('/super-admin/schools')}
              className="flex items-center gap-2 border border-slate-200 text-slate-700 font-semibold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Back to Schools
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
