/**
 * SchoolDetail — View and edit a single school's platform-level metadata.
 * Super admin can update name, plan, status, and view basic stats.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { School, UserProfile } from '../../types';
import { useSuperAdmin } from '../../components/SuperAdminContext';
import DeleteSchoolModal from '../../components/DeleteSchoolModal';
import {
  Building2, ArrowLeft, Save, Loader2, LogIn, Users, GraduationCap, CheckCircle2, XCircle, Trash2, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SchoolDetail() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { enterSchool, exitSchool } = useSuperAdmin();

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [status, setStatus] = useState<School['status']>('active');
  const [plan, setPlan] = useState<School['subscriptionPlan']>('pro');
  const [notes, setNotes] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [domainSaving, setDomainSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'schools', schoolId));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as School;
          setSchool(data);
          setName(data.name);
          setAdminEmail(data.adminEmail || '');
          setStatus(data.status);
          setPlan(data.subscriptionPlan);
          setNotes(data.notes || '');
          setCustomDomain(data.customDomain || '');
          setDomainInput(data.customDomain || '');
        }
        // Load stats
        const [students, staff, users] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId))),
          getDocs(query(collection(db, 'staff'), where('schoolId', '==', schoolId))),
          getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId))),
        ]);
        setStudentCount(students.size);
        setStaffCount(staff.size);
        setUserCount(users.size);
      } catch (e) {
        toast.error('Failed to load school');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [schoolId]);

  const handleSave = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'schools', schoolId), {
        name, adminEmail, status, subscriptionPlan: plan, notes,
        updatedAt: serverTimestamp(),
      });
      toast.success('School updated');
      setSchool(s => s ? { ...s, name, adminEmail, status, subscriptionPlan: plan, notes } : s);
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const normalizeDomain = (raw: string) =>
    raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const handleSaveDomain = async () => {
    if (!schoolId) return;
    const hostname = normalizeDomain(domainInput);

    if (!hostname) {
      // Clear the domain
      if (customDomain) {
        setDomainSaving(true);
        try {
          await deleteDoc(doc(db, 'school_domains', customDomain));
          await updateDoc(doc(db, 'schools', schoolId), { customDomain: '', updatedAt: serverTimestamp() });
          setCustomDomain('');
          toast.success('Custom domain removed');
        } catch (e: any) {
          toast.error(e.message || 'Failed to remove domain');
        } finally {
          setDomainSaving(false);
        }
      }
      return;
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname)) {
      toast.error('Enter a plain hostname, e.g. portal.yourschool.com (no https:// or path)');
      return;
    }

    setDomainSaving(true);
    const tid = toast.loading('Saving custom domain…');
    try {
      const existing = await getDoc(doc(db, 'school_domains', hostname));
      if (existing.exists() && existing.data()?.schoolId !== schoolId) {
        toast.error('This domain is already linked to another school', { id: tid });
        return;
      }
      if (customDomain && customDomain !== hostname) {
        await deleteDoc(doc(db, 'school_domains', customDomain));
      }
      await setDoc(doc(db, 'school_domains', hostname), {
        schoolId, schoolName: school?.name ?? name, updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'schools', schoolId), { customDomain: hostname, updatedAt: serverTimestamp() });
      setCustomDomain(hostname);
      setDomainInput(hostname);
      toast.success('Custom domain saved — now connect it in Firebase Hosting (see instructions below)', { id: tid, duration: 6000 });
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setDomainSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none";
  const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!school) return <div className="p-8 text-center text-slate-500">School not found.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/super-admin/schools')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{school.name}</h1>
          <p className="text-xs text-slate-400 font-mono">{school.id}</p>
        </div>
        <button
          onClick={() => { enterSchool(schoolId!, school.name); navigate('/admin'); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <LogIn className="w-4 h-4" /> Enter School
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={school.status === 'active'}
          title={school.status === 'active' ? 'Suspend school before deleting' : 'Permanently delete this school'}
          className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed text-rose-600 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Students', value: studentCount, icon: GraduationCap, color: 'text-indigo-600' },
          { label: 'Staff', value: staffCount, icon: Users, color: 'text-emerald-600' },
          { label: 'Portal Users', value: userCount, icon: Users, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1`} />
            <p className="text-2xl font-bold text-slate-900">{s.value ?? '—'}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Edit form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-600" /> School Settings
        </h2>
        <div>
          <label className={labelCls}>School Name</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Admin Email</label>
          <input className={inputCls} type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as School['status'])}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="trial">Trial</option>
              <option value="demo">Demo</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Subscription Plan</label>
            <select className={inputCls} value={plan} onChange={e => setPlan(e.target.value as School['subscriptionPlan'])}>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Internal Notes</label>
          <textarea className={inputCls + ' h-20 resize-none'} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes visible only to super admins…" />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Custom Domain */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-600" /> Custom Domain
        </h2>
        <p className="text-sm text-slate-500">
          Let this school access their whole portal from their own domain instead of the default URL.
        </p>
        <div className="flex items-center gap-2">
          {customDomain ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Linked to this school
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
              <XCircle className="w-3.5 h-3.5" /> Not set
            </span>
          )}
        </div>
        <div>
          <label className={labelCls}>Domain</label>
          <input
            className={inputCls}
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            placeholder="portal.theirschool.com"
          />
        </div>
        <button
          onClick={handleSaveDomain}
          disabled={domainSaving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          {domainSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {domainSaving ? 'Saving…' : customDomain ? 'Update Domain' : 'Save Domain'}
        </button>

        {customDomain && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800">Two steps left to go live:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                The school's DNS admin adds a <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">CNAME</span> record:{' '}
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{customDomain}</span>
                {' '}&rarr;{' '}
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">avenir-33ab7.web.app</span>
              </li>
              <li>
                In the Firebase Console &rarr; Hosting &rarr; Add custom domain, add{' '}
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{customDomain}</span> and complete the
                TXT-record ownership check Firebase gives you. SSL is issued automatically once verified — this step can't be automated via CLI.
              </li>
              <li>
                Also add <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{customDomain}</span> under
                Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains — otherwise Google Sign-In will fail with
                an "unauthorized domain" error on this domain even after Hosting is connected.
              </li>
            </ol>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <DeleteSchoolModal
          schoolId={schoolId!}
          schoolName={school.name}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => {
            setShowDeleteModal(false);
            exitSchool();
            toast.success(`${school.name} was deleted`);
            navigate('/super-admin/schools');
          }}
        />
      )}
    </div>
  );
}
