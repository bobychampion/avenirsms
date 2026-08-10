/**
 * SuperAdminDashboard — Platform-level overview for super_admin users.
 * Shows total schools, active schools, total students, subscriptions,
 * and incoming demo requests from the landing page.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, getDoc, query, orderBy, doc, updateDoc, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase';
import { School } from '../../types';
import toast from 'react-hot-toast';
import {
  Building2, Users, CheckCircle2, CreditCard, Plus, ArrowRight,
  TrendingUp, AlertCircle, Clock, FileText, Zap, Bell, Mail,
  Phone, BookOpen, ChevronDown, CheckCheck, X, Inbox, Eye, EyeOff, Copy, KeyRound, Send, Loader2,
  Image as ImageIcon, AlertTriangle,
} from 'lucide-react';
import { sendDemoProvisioned, sendPlatformBroadcast, sendRaw } from '../../services/emailService';
import { buildStaffBroadcastEmail } from '../../utils/staffBroadcastEmail';

interface DemoRequest {
  id: string;
  schoolName: string;
  adminName?: string;
  contactName?: string;
  email: string;
  adminEmail?: string;
  phone: string;
  phone2?: string;
  reportEmail?: string;
  studentCount?: string;
  plan?: string;
  message?: string;
  status: 'pending' | 'provisioned' | 'contacted' | 'conversion_requested' | 'converted' | 'dismissed';
  schoolId?: string;
  adminUid?: string;
  /** One-time temp password generated at signup — stored so it can be recovered if lost (no email delivery on Spark plan). */
  tempPassword?: string;
  provisionedAt?: any;
  conversionRequestedAt?: any;
  finalSchoolName?: string;
  urlSlug?: string;
  review?: string;
  createdAt: any;
}

interface PlatformStats {
  totalSchools: number;
  activeSchools: number;
  suspendedSchools: number;
  trialSchools: number;
  demoSchools: number;
  totalStudents: number;
  loading: boolean;
}

const DEMO_STATUS_CONFIG: Record<DemoRequest['status'], { label: string; color: string }> = {
  pending:               { label: 'Pending',              color: 'bg-amber-100 text-amber-700' },
  provisioned:           { label: 'Demo Active',          color: 'bg-indigo-100 text-indigo-700' },
  contacted:             { label: 'Contacted',            color: 'bg-blue-100 text-blue-700' },
  conversion_requested:  { label: 'Wants to Convert →',   color: 'bg-violet-100 text-violet-700' },
  converted:             { label: 'Converted',            color: 'bg-emerald-100 text-emerald-700' },
  dismissed:             { label: 'Dismissed',            color: 'bg-slate-100 text-slate-500' },
};

export default function SuperAdminDashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalSchools: 0, activeSchools: 0, suspendedSchools: 0,
    trialSchools: 0, demoSchools: 0, totalStudents: 0, loading: true,
  });
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoFilter, setDemoFilter] = useState<DemoRequest['status'] | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [sendingCredentials, setSendingCredentials] = useState<string | null>(null);
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState<'all' | 'active' | 'trial' | 'demo'>('all');
  const [broadcasting, setBroadcasting] = useState(false);

  // Staff broadcast (admins/teachers, personalized with each recipient's own school logo)
  const [staffAudience, setStaffAudience] = useState<{ admin: boolean; teacher: boolean }>({ admin: true, teacher: false });
  const [staffSubject, setStaffSubject] = useState('');
  const [staffMessage, setStaffMessage] = useState('');
  type StaffRecipient = { uid: string; email: string; name: string; role: string; schoolId: string | null; school: string; hasLogo: boolean; branding: Record<string, any> };
  const [staffPreview, setStaffPreview] = useState<{ recipients: StaffRecipient[]; bySchool: Record<string, { count: number; hasLogo: boolean }> } | null>(null);
  const [staffPreviewLoading, setStaffPreviewLoading] = useState(false);
  const [staffSending, setStaffSending] = useState(false);
  const [staffProgress, setStaffProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [staffFailures, setStaffFailures] = useState<{ email: string; error: string }[]>([]);

  // Any change to who's targeted invalidates the last preview — the Send button
  // stays locked until a fresh preview is pulled for the current selection.
  useEffect(() => { setStaffPreview(null); }, [staffAudience.admin, staffAudience.teacher]);

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copyPassword = (password: string) => {
    navigator.clipboard.writeText(password).then(() => toast.success('Password copied.'));
  };

  useEffect(() => {
    const load = async () => {
      try {
        // Full document read is unavoidable here — every field (status, plan, etc.)
        // is used to build the school list/table below, not just a count.
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        const schoolList = schoolsSnap.docs.map(d => ({ id: d.id, ...d.data() } as School));
        setSchools(schoolList);
        // Total students is a pure count for one KPI tile — use a server-side
        // aggregation query instead of downloading every student document from
        // every school. This used to scan the entire `students` collection on
        // every dashboard load/refresh, which is what drove the read spike.
        const countSnap = await getCountFromServer(
          query(collection(db, 'students'), where('admissionStatus', '!=', 'withdrawn'))
        );
        setStats({
          totalSchools: schoolList.length,
          activeSchools: schoolList.filter(s => s.status === 'active').length,
          suspendedSchools: schoolList.filter(s => s.status === 'suspended').length,
          trialSchools: schoolList.filter(s => s.status === 'trial').length,
          demoSchools: schoolList.filter(s => s.status === 'demo').length,
          totalStudents: countSnap.data().count,
          loading: false,
        });
      } catch {
        setStats(s => ({ ...s, loading: false }));
      }
    };
    load();
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, 'demo_requests'), orderBy('createdAt', 'desc')))
      .then(snap => {
        setDemoRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as DemoRequest)));
        setDemoLoading(false);
      })
      .catch(() => setDemoLoading(false));
  }, []);

  const updateDemoStatus = async (id: string, status: DemoRequest['status']) => {
    setUpdatingId(id);
    try {
      await updateDoc(doc(db, 'demo_requests', id), { status });
      setDemoRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = demoRequests.filter(r => r.status === 'pending' || r.status === 'conversion_requested').length;

  const filteredDemos = demoFilter === 'all'
    ? demoRequests
    : demoRequests.filter(r => r.status === demoFilter);

  const activateDemoSchool = async (req: DemoRequest) => {
    if (!req.schoolId) return;
    setUpdatingId(req.id);
    try {
      await updateDoc(doc(db, 'schools', req.schoolId), { status: 'active', subscriptionExpiresAt: null });
      await updateDoc(doc(db, 'demo_requests', req.id), { status: 'converted' });
      setDemoRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'converted' } : r));
    } finally {
      setUpdatingId(null);
    }
  };

  const sendDemoCredentials = async (req: DemoRequest) => {
    const email = req.adminEmail || req.email;
    if (!email || !req.tempPassword) return;
    setSendingCredentials(req.id);
    try {
      await sendDemoProvisioned({
        to: email,
        branding: { schoolName: req.schoolName },
        adminName: req.adminName || req.contactName || 'Administrator',
        loginEmail: email,
        temporaryPassword: req.tempPassword,
        expiresInDays: 7,
      });
      toast.success('Demo credentials sent to ' + email);
    } catch {
      toast.error('Failed to send credentials email');
    } finally {
      setSendingCredentials(null);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    const recipients = schools
      .filter(s => broadcastFilter === 'all' || s.status === broadcastFilter)
      .map(s => s.adminEmail)
      .filter((e): e is string => !!e && e.trim() !== '');
    if (recipients.length === 0) {
      toast.error('No schools with email addresses match the selected filter');
      return;
    }
    setBroadcasting(true);
    try {
      const BATCH = 50;
      for (let i = 0; i < recipients.length; i += BATCH) {
        await sendPlatformBroadcast({
          to: recipients.slice(i, i + BATCH),
          subject: broadcastSubject,
          message: broadcastMessage,
        });
      }
      toast.success(`Announcement sent to ${recipients.length} school${recipients.length !== 1 ? 's' : ''}`);
      setBroadcastSubject('');
      setBroadcastMessage('');
    } catch {
      toast.error('Failed to send broadcast email');
    } finally {
      setBroadcasting(false);
    }
  };

  const fetchStaffPreview = async () => {
    const roles: string[] = [];
    if (staffAudience.admin) roles.push('admin', 'School_admin');
    if (staffAudience.teacher) roles.push('teacher');
    if (roles.length === 0) {
      toast.error('Select at least one audience (Admins or Teachers)');
      return;
    }

    setStaffPreviewLoading(true);
    try {
      const usersSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', roles)));
      const seen = new Set<string>();
      const users = usersSnap.docs
        .map(d => ({ uid: d.id, ...d.data() } as any))
        .filter(u => u.email && !u.disabled && !u.deletedAt)
        .filter(u => {
          const key = String(u.email).toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const schoolIds = [...new Set(users.map(u => u.schoolId).filter(Boolean))] as string[];
      const brandingMap: Record<string, any> = {};
      await Promise.all(schoolIds.map(async sid => {
        try {
          const snap = await getDoc(doc(db, 'school_settings', sid));
          brandingMap[sid] = snap.exists() ? snap.data() : {};
        } catch {
          brandingMap[sid] = {};
        }
      }));

      const recipients: StaffRecipient[] = users.map(u => {
        const branding = (u.schoolId && brandingMap[u.schoolId]) || {};
        return {
          uid: u.uid,
          email: u.email,
          name: u.displayName || u.email,
          role: u.role,
          schoolId: u.schoolId ?? null,
          school: branding.schoolName || '(no school)',
          hasLogo: /^https:\/\//i.test(branding.logoUrl || ''),
          branding,
        };
      });

      const bySchool: Record<string, { count: number; hasLogo: boolean }> = {};
      for (const r of recipients) {
        bySchool[r.school] ??= { count: 0, hasLogo: r.hasLogo };
        bySchool[r.school].count++;
      }

      setStaffPreview({ recipients, bySchool });
    } catch {
      toast.error('Failed to load recipients');
    } finally {
      setStaffPreviewLoading(false);
    }
  };

  const sendStaffBroadcast = async () => {
    if (!staffPreview) return;
    if (!staffSubject.trim() || !staffMessage.trim()) {
      toast.error('Subject and message are required');
      return;
    }

    setStaffSending(true);
    setStaffFailures([]);
    const total = staffPreview.recipients.length;
    setStaffProgress({ sent: 0, failed: 0, total });

    let sent = 0, failed = 0;
    const failures: { email: string; error: string }[] = [];

    for (const r of staffPreview.recipients) {
      const { subject, html } = buildStaffBroadcastEmail(
        { displayName: r.name, email: r.email },
        r.branding,
        { subject: staffSubject, message: staffMessage },
      );
      try {
        await sendRaw({ to: r.email, subject, html });
        sent++;
      } catch (e: any) {
        failed++;
        failures.push({ email: r.email, error: e?.message ?? 'Send failed' });
      }
      setStaffProgress({ sent, failed, total });
      // Stay under Resend's rate limit.
      await new Promise(res => setTimeout(res, 600));
    }

    setStaffFailures(failures);
    setStaffSending(false);
    if (failed === 0) {
      toast.success(`Sent to all ${sent} recipient${sent !== 1 ? 's' : ''}`);
      setStaffSubject('');
      setStaffMessage('');
      setStaffPreview(null);
    } else {
      toast.error(`Sent ${sent}, failed ${failed} — see details below`);
    }
  };

  const kpiCards = [
    { label: 'Total Schools',   value: stats.totalSchools,   icon: Building2,    color: 'bg-indigo-600', sub: `${stats.activeSchools} active` },
    { label: 'Active Schools',  value: stats.activeSchools,  icon: CheckCircle2, color: 'bg-emerald-600', sub: `${stats.suspendedSchools} suspended` },
    { label: 'Trial Schools',   value: stats.trialSchools,   icon: Clock,        color: 'bg-amber-500',  sub: 'Pending conversion' },
    { label: 'Demo Schools',    value: stats.demoSchools,    icon: Zap,          color: 'bg-violet-500', sub: '7-day auto-provisioned' },
    { label: 'Total Students',  value: stats.totalStudents,  icon: Users,        color: 'bg-purple-600', sub: 'Across all schools' },
  ];

  const planBadge = (plan: School['subscriptionPlan']) => {
    const colors: Record<string, string> = {
      free: 'bg-slate-100 text-slate-600', starter: 'bg-blue-100 text-blue-700',
      pro: 'bg-indigo-100 text-indigo-700', enterprise: 'bg-purple-100 text-purple-700',
    };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[plan] ?? colors.free}`}>{plan}</span>;
  };

  const statusBadge = (status: School['status']) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700', suspended: 'bg-red-100 text-red-700',
      trial: 'bg-amber-100 text-amber-700', demo: 'bg-slate-100 text-slate-600',
    };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.demo}`}>{status}</span>;
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Manage all schools on the Avenir platform</p>
        </div>
        <Link
          to="/super-admin/schools/new"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-200 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Add School
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(card => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <div className={`${card.color} p-2 rounded-xl`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">{stats.loading ? '—' : card.value.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { to: '/super-admin/schools',     icon: Building2, color: 'bg-indigo-50 text-indigo-600', label: 'Manage Schools',    desc: 'View, edit, suspend or enter any school' },
          { to: '/super-admin/invoices',    icon: FileText,  color: 'bg-emerald-50 text-emerald-600', label: 'Invoice Generator', desc: 'Create, bulk-generate & track subscription invoices' },
          { to: '/super-admin/schools/new', icon: Plus,      color: 'bg-amber-50 text-amber-600',   label: 'Onboard School',    desc: 'Register a new school on the platform' },
        ].map(action => (
          <Link key={action.to} to={action.to}
            className="flex items-start gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
          >
            <div className={`${action.color} p-3 rounded-xl shrink-0`}><action.icon className="w-5 h-5" /></div>
            <div>
              <p className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">{action.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{action.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Demo Requests ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Demo Requests</h2>
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount} new</span>
            )}
          </div>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1">
            {(['all', 'pending', 'provisioned', 'conversion_requested', 'contacted', 'converted', 'dismissed'] as const).map(f => (
              <button key={f} onClick={() => setDemoFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  demoFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >{DEMO_STATUS_CONFIG[f as DemoRequest['status']]?.label ?? 'All'}</button>
            ))}
          </div>
        </div>

        {demoLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : filteredDemos.length === 0 ? (
          <div className="p-10 text-center">
            <Inbox className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">{demoFilter === 'all' ? 'No demo requests yet.' : `No ${demoFilter} requests.`}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredDemos.map(req => (
              <div key={req.id} className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-slate-900">{req.schoolName}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DEMO_STATUS_CONFIG[req.status]?.color}`}>
                        {DEMO_STATUS_CONFIG[req.status]?.label}
                      </span>
                      {req.plan && (
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">{req.plan}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{req.adminName || req.contactName}</span>
                      <a href={`mailto:${req.adminEmail || req.email}`} className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
                        <Mail className="w-3 h-3" />{req.adminEmail || req.email}
                      </a>
                      <a href={`tel:${req.phone}`} className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
                        <Phone className="w-3 h-3" />{req.phone}
                      </a>
                      {req.phone2 && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{req.phone2}</span>}
                      {req.reportEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{req.reportEmail} (reports)</span>}
                      {req.plan && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{req.plan}</span>}
                      <span className="text-slate-400">{formatDate(req.createdAt)}</span>
                    </div>
                    {req.status === 'provisioned' && req.schoolId && (
                      <p className="mt-1.5 text-xs text-indigo-600 font-medium">
                        Demo active · School ID: {req.schoolId.slice(0, 10)}…
                      </p>
                    )}
                    {req.tempPassword && (
                      <div className="mt-2 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-fit">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500">Admin login password:</span>
                        <span className="text-xs font-mono font-bold text-slate-800">
                          {revealedPasswords.has(req.id) ? req.tempPassword : '••••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePasswordReveal(req.id)}
                          title={revealedPasswords.has(req.id) ? 'Hide' : 'Reveal'}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
                        >
                          {revealedPasswords.has(req.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyPassword(req.tempPassword!)}
                          title="Copy password"
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {req.status === 'conversion_requested' && (
                      <div className="mt-2 p-2 bg-violet-50 rounded-lg border border-violet-100 text-xs space-y-0.5">
                        <p className="font-bold text-violet-800">Wants to convert:</p>
                        {req.finalSchoolName && <p className="text-violet-700">School name: {req.finalSchoolName}</p>}
                        {req.urlSlug && <p className="text-violet-700">Slug: /{req.urlSlug}</p>}
                        {req.review && <p className="text-violet-700 italic">Review: "{req.review}"</p>}
                      </div>
                    )}
                    {req.message && (
                      <p className="mt-1.5 text-xs text-slate-500 italic line-clamp-2">"{req.message}"</p>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {req.status === 'pending' && (
                      <button onClick={() => updateDemoStatus(req.id, 'contacted')} disabled={updatingId === req.id}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50">
                        Mark Contacted
                      </button>
                    )}
                    {req.tempPassword && (req.status === 'provisioned' || req.status === 'contacted') && (
                      <button
                        onClick={() => sendDemoCredentials(req)}
                        disabled={sendingCredentials === req.id}
                        title="Email login credentials to school admin"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {sendingCredentials === req.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Mail className="w-3 h-3" />}
                        Send Credentials
                      </button>
                    )}
                    {(req.status === 'conversion_requested' || req.status === 'provisioned') && req.schoolId && (
                      <button onClick={() => activateDemoSchool(req)} disabled={updatingId === req.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50">
                        ✓ Activate School
                      </button>
                    )}
                    {req.status === 'contacted' && (
                      <button onClick={() => updateDemoStatus(req.id, 'converted')} disabled={updatingId === req.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50">
                        Converted
                      </button>
                    )}
                    {req.status !== 'dismissed' && req.status !== 'converted' && (
                      <button onClick={() => updateDemoStatus(req.id, 'dismissed')} disabled={updatingId === req.id}
                        title="Dismiss"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Platform Broadcast Email ──────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-600" />
          <h2 className="font-semibold text-slate-800">Send Announcement to Schools</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'trial', 'demo'] as const).map(f => (
              <button key={f} onClick={() => setBroadcastFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  broadcastFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'all' ? `All schools (${schools.filter(s => s.adminEmail).length})` : `${f} (${schools.filter(s => s.status === f && s.adminEmail).length})`}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject</label>
            <input
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. Important Platform Update — Action Required"
              value={broadcastSubject}
              onChange={e => setBroadcastSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Message</label>
            <textarea
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-28 resize-none"
              placeholder="Write your announcement message here…"
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
            />
          </div>
          <button
            onClick={sendBroadcast}
            disabled={broadcasting || !broadcastSubject.trim() || !broadcastMessage.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            {broadcasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {broadcasting ? 'Sending…' : 'Send Announcement'}
          </button>
        </div>
      </div>

      {/* ── Staff Broadcast (admins/teachers, personalized with each school's own logo) ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          <h2 className="font-semibold text-slate-800">Staff Broadcast</h2>
          <span className="text-xs text-slate-400 font-normal">— sent to each admin/teacher's own inbox, branded with their school's logo</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Audience</label>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'admin' as const, label: 'Admins' },
                { key: 'teacher' as const, label: 'Teachers' },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setStaffAudience(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    staffAudience[opt.key] ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject</label>
            <input
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. Happy Summer Break!"
              value={staffSubject}
              onChange={e => setStaffSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Message</label>
            <textarea
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-28 resize-none"
              placeholder="Write your message here — each recipient sees their own name and school branding automatically…"
              value={staffMessage}
              onChange={e => setStaffMessage(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchStaffPreview}
              disabled={staffPreviewLoading || staffSending}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
            >
              {staffPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {staffPreviewLoading ? 'Loading recipients…' : staffPreview ? 'Refresh recipients' : 'Preview recipients'}
            </button>

            <button
              onClick={sendStaffBroadcast}
              disabled={!staffPreview || staffPreview.recipients.length === 0 || staffSending || !staffSubject.trim() || !staffMessage.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              {staffSending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              {staffSending
                ? `Sending… ${staffProgress?.sent ?? 0}/${staffProgress?.total ?? 0}`
                : staffPreview
                  ? `Send to ${staffPreview.recipients.length} recipient${staffPreview.recipients.length !== 1 ? 's' : ''}`
                  : 'Preview recipients first'}
            </button>
          </div>

          {staffPreview && !staffSending && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  {staffPreview.recipients.length} recipient{staffPreview.recipients.length !== 1 ? 's' : ''} across {Object.keys(staffPreview.bySchool).length} school{Object.keys(staffPreview.bySchool).length !== 1 ? 's' : ''}
                </span>
                {staffPreview.recipients.some(r => !r.hasLogo) && (
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {staffPreview.recipients.filter(r => !r.hasLogo).length} without a renderable logo (school name used instead)
                  </span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                {Object.entries(staffPreview.bySchool).map(([school, info]: [string, { count: number; hasLogo: boolean }]) => (
                  <div key={school} className="px-4 py-2 flex items-center justify-between text-xs">
                    <span className="text-slate-700">{school}</span>
                    <span className="flex items-center gap-2 text-slate-500">
                      {info.count} recipient{info.count !== 1 ? 's' : ''}
                      {!info.hasLogo && <span className="text-amber-600">no logo</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {staffFailures.length > 0 && (
            <div className="border border-red-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs font-semibold text-red-700">
                <AlertTriangle className="w-3.5 h-3.5" />
                {staffFailures.length} failed to send
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-red-100">
                {staffFailures.map(f => (
                  <div key={f.email} className="px-4 py-2 flex items-center justify-between text-xs">
                    <span className="text-slate-700">{f.email}</span>
                    <span className="text-red-600">{f.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent schools table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">All Schools</h2>
          <Link to="/super-admin/schools" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {stats.loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : schools.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No schools yet</p>
            <p className="text-slate-400 text-sm mt-1">Create your first school to get started</p>
            <Link to="/super-admin/schools/new"
              className="inline-flex items-center gap-2 mt-4 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> Add School
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">School</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Slug</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Plan</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Admin Email</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {schools.slice(0, 10).map(school => (
                  <tr key={school.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{school.name}</p>
                      <p className="text-xs text-slate-400">{school.country}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{school.urlSlug || school.id}</span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(school.status)}</td>
                    <td className="px-4 py-3">{planBadge(school.subscriptionPlan)}</td>
                    <td className="px-4 py-3 text-slate-500">{school.adminEmail || '—'}</td>
                    <td className="px-4 py-3">
                      <Link to={`/super-admin/schools/${school.id}`} className="text-indigo-600 hover:text-indigo-700 font-medium text-xs">
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

