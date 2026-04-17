/**
 * SchoolDetail — View and edit a single school's platform-level metadata.
 * Super admin can update name, plan, status, and view basic stats.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { School, UserProfile } from '../../types';
import { useSuperAdmin } from '../../components/SuperAdminContext';
import {
  Building2, ArrowLeft, Save, Loader2, LogIn, Users, GraduationCap, CheckCircle2, XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SchoolDetail() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { enterSchool } = useSuperAdmin();

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [status, setStatus] = useState<School['status']>('active');
  const [plan, setPlan] = useState<School['subscriptionPlan']>('pro');
  const [notes, setNotes] = useState('');

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
    </div>
  );
}
