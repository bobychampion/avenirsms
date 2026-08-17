/**
 * SuperAdminDashboard — Platform-level overview for super_admin users.
 * Shows total schools, active schools, total students, subscriptions,
 * and incoming demo requests from the landing page.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, addDoc, query, orderBy, doc, updateDoc, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { School, CommandTask } from '../../types';
import { useAuth } from '../../components/FirebaseProvider';
import { PLAN_PRICES } from '../../utils/pricing';
import toast from 'react-hot-toast';
import {
  Building2, Users, CheckCircle2, Plus, ArrowRight,
  TrendingUp, AlertCircle, Clock, FileText, Mail,
  Phone, BookOpen, CheckCheck, X, Inbox, Eye, EyeOff, Copy, KeyRound, Send, Loader2,
  MessageSquare, Target, CheckSquare, DollarSign, ChevronRight,
} from 'lucide-react';
import { sendDemoProvisioned } from '../../services/emailService';

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
  // CRM extensions (see Leads.tsx) — optional, undefined on older records.
  source?: string;
  nextFollowUpAt?: string;
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
  const { user, profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [tasks, setTasks] = useState<CommandTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [quickAddLead, setQuickAddLead] = useState(false);
  const [quickAddTask, setQuickAddTask] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [leadForm, setLeadForm] = useState({ schoolName: '', contactName: '', email: '', phone: '', source: 'Direct' });
  const [taskForm, setTaskForm] = useState({ title: '', category: 'Internal' as CommandTask['category'], priority: 'Medium' as CommandTask['priority'], dueDate: '' });
  const [stats, setStats] = useState<PlatformStats>({
    totalSchools: 0, activeSchools: 0, suspendedSchools: 0,
    trialSchools: 0, demoSchools: 0, totalStudents: 0, loading: true,
  });
  const [lastAdminLoginBySchool, setLastAdminLoginBySchool] = useState<Record<string, Date | null>>({});
  const [healthLoading, setHealthLoading] = useState(true);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoFilter, setDemoFilter] = useState<DemoRequest['status'] | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [sendingCredentials, setSendingCredentials] = useState<string | null>(null);

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

        // Last admin login per school, for the School Health panel — one query
        // for all admins/School_admins, grouped client-side, instead of one
        // query per school.
        getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'School_admin'])))
          .then(usersSnap => {
            const lastLogin: Record<string, Date | null> = {};
            for (const d of usersSnap.docs) {
              const u = d.data() as any;
              if (!u.schoolId) continue;
              const login = u.lastLoginAt?.toDate?.() ?? null;
              if (!login) continue;
              if (!lastLogin[u.schoolId] || login > lastLogin[u.schoolId]!) lastLogin[u.schoolId] = login;
            }
            setLastAdminLoginBySchool(lastLogin);
            setHealthLoading(false);
          })
          .catch(() => setHealthLoading(false));

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

  useEffect(() => {
    getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')))
      .then(snap => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommandTask)));
        setTasksLoading(false);
      })
      .catch(() => setTasksLoading(false));
  }, []);

  const quickAddLeadSubmit = async () => {
    if (!leadForm.schoolName.trim() || !leadForm.email.trim()) { toast.error('School name and email are required'); return; }
    setQuickSaving(true);
    try {
      await addDoc(collection(db, 'demo_requests'), {
        schoolName: leadForm.schoolName.trim(), contactName: leadForm.contactName.trim(),
        email: leadForm.email.trim(), phone: leadForm.phone.trim(),
        source: leadForm.source, status: 'pending', createdAt: Timestamp.now(),
      });
      toast.success('Lead added');
      setQuickAddLead(false);
      setLeadForm({ schoolName: '', contactName: '', email: '', phone: '', source: 'Direct' });
      getDocs(query(collection(db, 'demo_requests'), orderBy('createdAt', 'desc')))
        .then(snap => setDemoRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as DemoRequest))));
    } catch {
      toast.error('Failed to add lead');
    } finally {
      setQuickSaving(false);
    }
  };

  const quickAddTaskSubmit = async () => {
    if (!taskForm.title.trim()) { toast.error('Title is required'); return; }
    setQuickSaving(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        title: taskForm.title.trim(), category: taskForm.category, priority: taskForm.priority,
        status: 'To Do', dueDate: taskForm.dueDate || undefined,
        assigneeName: profile?.displayName || user?.email || '',
        createdBy: profile?.displayName || user?.email || 'unknown', createdAt: Timestamp.now(),
      });
      toast.success('Task created');
      setQuickAddTask(false);
      setTaskForm({ title: '', category: 'Internal', priority: 'Medium', dueDate: '' });
      getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')))
        .then(snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommandTask))));
    } catch {
      toast.error('Failed to create task');
    } finally {
      setQuickSaving(false);
    }
  };

  const toggleTaskComplete = async (t: CommandTask) => {
    const nextStatus: CommandTask['status'] = t.status === 'Completed' ? 'To Do' : 'Completed';
    try {
      await updateDoc(doc(db, 'tasks', t.id!), { status: nextStatus, completedAt: nextStatus === 'Completed' ? Timestamp.now() : null });
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: nextStatus } : x));
    } catch {
      toast.error('Failed to update task');
    }
  };

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

  // ── Business KPIs — every number here is computed from real data already
  // loaded (schools + demo_requests); nothing fabricated. Estimated MRR is
  // explicitly labeled as an estimate (active schools' plan tier x published
  // pricing), not actual collected revenue — that requires platform_invoices
  // data, which is Phase 3 (Finance).
  const newLeads30d = demoRequests.filter(r => {
    const created = r.createdAt?.toDate?.();
    return created && (Date.now() - created.getTime()) <= 30 * 86400000;
  }).length;
  const convertedCount = demoRequests.filter(r => r.status === 'converted').length;
  const conversionRate = demoRequests.length > 0 ? Math.round((convertedCount / demoRequests.length) * 100) : null;
  const estimatedMRR = schools
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + (PLAN_PRICES[s.subscriptionPlan]?.yearly ?? 0) / 12, 0);

  const kpiCards = [
    { label: 'Total Schools',    value: stats.totalSchools,   icon: Building2,    color: 'bg-indigo-600',  sub: `${stats.activeSchools} active`, fmt: 'int' as const },
    { label: 'Active Schools',   value: stats.activeSchools,  icon: CheckCircle2, color: 'bg-emerald-600', sub: `${stats.suspendedSchools} suspended`, fmt: 'int' as const },
    { label: 'Total Students',   value: stats.totalStudents,  icon: Users,        color: 'bg-purple-600',  sub: 'Across all schools', fmt: 'int' as const },
    { label: 'New Leads',        value: newLeads30d,          icon: Target,       color: 'bg-blue-600',    sub: 'Last 30 days', fmt: 'int' as const },
    { label: 'Active Trials',    value: stats.trialSchools,   icon: Clock,        color: 'bg-amber-500',   sub: `+${stats.demoSchools} in demo`, fmt: 'int' as const },
    {
      label: 'Conversion Rate', value: conversionRate, icon: TrendingUp, color: 'bg-violet-500',
      sub: `${convertedCount} of ${demoRequests.length} leads`, fmt: 'pct' as const,
    },
    {
      label: 'Estimated MRR', value: estimatedMRR, icon: DollarSign, color: 'bg-emerald-700',
      sub: 'Active plans x list price — not billed revenue', fmt: 'ngn' as const,
    },
  ];

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const firstName = (profile?.displayName || '').split(' ')[0] || null;

  // ── My Tasks widget ────────────────────────────────────────────────────────
  const myTasks = tasks.filter(t => t.assigneeName === (profile?.displayName || user?.email));
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueTasks = myTasks.filter(t => t.status !== 'Completed' && t.dueDate && t.dueDate < todayStr);
  const dueTodayTasks = myTasks.filter(t => t.status !== 'Completed' && t.dueDate === todayStr);
  const upcomingTasks = myTasks.filter(t => t.status !== 'Completed' && t.dueDate && t.dueDate > todayStr);
  const recentlyCompletedTasks = myTasks.filter(t => t.status === 'Completed').slice(0, 5);

  // All overdue tasks platform-wide (not just mine) feed Needs Attention.
  const allOverdueTasks = tasks.filter(t => t.status !== 'Completed' && t.dueDate && t.dueDate < todayStr);
  const leadsNeedingFollowUp = demoRequests.filter(r => r.nextFollowUpAt && r.nextFollowUpAt <= todayStr && r.status !== 'converted' && r.status !== 'dismissed');

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

  const formatDateTime = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ── School Health: computed signal per school, not just a status field ────
  type HealthLevel = 'healthy' | 'watch' | 'at-risk' | 'never-logged-in' | 'expiring-soon';
  const HEALTH_CONFIG: Record<HealthLevel, { label: string; color: string; dot: string }> = {
    'healthy':          { label: 'Healthy',           color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
    'watch':            { label: 'Watch',              color: 'text-amber-700 bg-amber-50',     dot: 'bg-amber-500' },
    'at-risk':          { label: 'At risk',             color: 'text-red-700 bg-red-50',         dot: 'bg-red-500' },
    'never-logged-in':  { label: 'Never logged in',     color: 'text-slate-600 bg-slate-100',    dot: 'bg-slate-400' },
    'expiring-soon':    { label: 'Expiring soon',       color: 'text-violet-700 bg-violet-50',   dot: 'bg-violet-500' },
  };

  const schoolHealth = (school: School): { level: HealthLevel; reason: string; daysSinceLogin: number | null } => {
    const lastLogin = lastAdminLoginBySchool[school.id!] ?? null;
    const daysSinceLogin = lastLogin ? Math.floor((Date.now() - lastLogin.getTime()) / 86400000) : null;
    const expiresAt = school.subscriptionExpiresAt?.toDate?.() ?? null;
    const daysUntilExpiry = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86400000) : null;

    if (daysSinceLogin === null) {
      return { level: 'never-logged-in', reason: 'No admin login recorded yet', daysSinceLogin: null };
    }
    if ((school.status === 'trial' || school.status === 'demo') && daysUntilExpiry !== null && daysUntilExpiry <= 3) {
      return { level: 'expiring-soon', reason: `${school.status} expires in ${Math.max(daysUntilExpiry, 0)} day${daysUntilExpiry !== 1 ? 's' : ''}`, daysSinceLogin };
    }
    if (daysSinceLogin > 30) {
      return { level: 'at-risk', reason: `No admin login in ${daysSinceLogin} days`, daysSinceLogin };
    }
    if (daysSinceLogin > 14) {
      return { level: 'watch', reason: `Last admin login ${daysSinceLogin} days ago`, daysSinceLogin };
    }
    return { level: 'healthy', reason: `Last admin login ${daysSinceLogin} day${daysSinceLogin !== 1 ? 's' : ''} ago`, daysSinceLogin };
  };

  const activeSchoolsForHealth = schools.filter(s => s.status !== 'suspended');
  const healthEntries = activeSchoolsForHealth.map(s => ({ school: s, ...schoolHealth(s) }));
  const healthCounts = healthEntries.reduce((acc, e) => {
    acc[e.level] = (acc[e.level] ?? 0) + 1;
    return acc;
  }, {} as Record<HealthLevel, number>);
  const needsAttention = healthEntries
    .filter(e => e.level !== 'healthy')
    .sort((a, b) => (b.daysSinceLogin ?? 9999) - (a.daysSinceLogin ?? 9999));

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting}{firstName ? `, ${firstName}` : ''} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">Here's what's happening across Avenir today.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setQuickAddTask(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
          >
            <CheckSquare className="w-4 h-4" /> Create Task
          </button>
          <button onClick={() => setQuickAddLead(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
          >
            <Target className="w-4 h-4" /> Add Lead
          </button>
          <Link
            to="/super-admin/schools/new"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-200 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> Add School
          </Link>
        </div>
      </div>

      {/* Needs Attention — aggregates school health issues, leads overdue for
          follow-up, and overdue tasks. Each item is clickable to its record. */}
      {(needsAttention.length > 0 || leadsNeedingFollowUp.length > 0 || allOverdueTasks.length > 0) && (
        <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-slate-800 text-sm">Needs Attention</h2>
          </div>
          <div className="space-y-1.5">
            {needsAttention.slice(0, 3).map(({ school, reason }) => (
              <Link key={school.id} to={`/super-admin/schools/${school.id}`}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-amber-50 transition-colors group">
                <span className="text-sm text-slate-700">🔴 <strong>{school.name}</strong> — {reason}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 shrink-0" />
              </Link>
            ))}
            {leadsNeedingFollowUp.slice(0, 3).map(lead => (
              <Link key={lead.id} to="/super-admin/leads"
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-amber-50 transition-colors group">
                <span className="text-sm text-slate-700">🟡 Follow up with <strong>{lead.schoolName}</strong> — due {lead.nextFollowUpAt}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 shrink-0" />
              </Link>
            ))}
            {allOverdueTasks.slice(0, 3).map(t => (
              <Link key={t.id} to="/super-admin/tasks"
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-amber-50 transition-colors group">
                <span className="text-sm text-slate-700">🔴 Overdue task: <strong>{t.title}</strong>{t.assigneeName ? ` (${t.assigneeName})` : ''}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 shrink-0" />
              </Link>
            ))}
            {(needsAttention.length + leadsNeedingFollowUp.length + allOverdueTasks.length) > 9 && (
              <p className="text-xs text-slate-400 px-3 pt-1">
                +{needsAttention.length + leadsNeedingFollowUp.length + allOverdueTasks.length - 9} more across schools, leads, and tasks
              </p>
            )}
          </div>
        </div>
      )}

      {/* Business KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(card => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <div className={`${card.color} p-2 rounded-xl`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {stats.loading || card.value === null ? '—' :
                card.fmt === 'pct' ? `${card.value}%` :
                card.fmt === 'ngn' ? `₦${Math.round(card.value).toLocaleString()}` :
                card.value.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* My Tasks + Sales Pipeline snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-slate-800 text-sm">My Tasks</h2>
            </div>
            <Link to="/super-admin/tasks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          {tasksLoading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">
                <span className={overdueTasks.length > 0 ? 'text-red-600 font-semibold' : ''}>{overdueTasks.length} overdue</span>
                {' · '}{dueTodayTasks.length} due today{' · '}{upcomingTasks.length} upcoming
              </p>
              {[...overdueTasks, ...dueTodayTasks, ...upcomingTasks].slice(0, 5).length === 0 && recentlyCompletedTasks.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No tasks assigned to you yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {[...overdueTasks, ...dueTodayTasks, ...upcomingTasks].slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-2.5 px-1 py-1">
                      <button onClick={() => toggleTaskComplete(t)} className="w-4 h-4 rounded border border-slate-300 hover:border-indigo-400 shrink-0" />
                      <span className="text-sm text-slate-700 truncate flex-1">{t.title}</span>
                      {t.dueDate && <span className={`text-xs shrink-0 ${t.dueDate < todayStr ? 'text-red-500 font-medium' : 'text-slate-400'}`}>{t.dueDate}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-slate-800 text-sm">Sales Pipeline</h2>
            </div>
            <Link to="/super-admin/leads" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          {demoLoading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
          ) : demoRequests.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No leads yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(['pending', 'contacted', 'provisioned', 'conversion_requested', 'converted', 'dismissed'] as const).map(s => (
                <div key={s} className="text-center bg-slate-50 rounded-xl py-2.5">
                  <p className="text-xl font-bold text-slate-800">{demoRequests.filter(r => r.status === s).length}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{DEMO_STATUS_CONFIG[s].label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* School Health */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {healthLoading ? (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            ) : needsAttention.length === 0 ? (
              <CheckCheck className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            )}
            <h2 className="font-semibold text-slate-800 text-sm">School Health</h2>
            <span className="text-xs text-slate-400">— admin login activity &amp; trial/demo expiry</span>
          </div>
        </div>

        {!healthLoading && (
          <div className="flex flex-wrap gap-2 mb-4">
            {(Object.keys(HEALTH_CONFIG) as HealthLevel[]).map(level => {
              const count = healthCounts[level] ?? 0;
              if (count === 0) return null;
              const cfg = HEALTH_CONFIG[level];
              return (
                <span key={level} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {count} {cfg.label}
                </span>
              );
            })}
          </div>
        )}

        {healthLoading ? (
          <div className="py-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : needsAttention.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-sm">Every active school looks healthy — no action needed.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {needsAttention.slice(0, 8).map(({ school, level, reason }) => {
              const cfg = HEALTH_CONFIG[level];
              return (
                <div key={school.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{school.name}</p>
                      <p className="text-xs text-slate-500">{reason}</p>
                    </div>
                  </div>
                  <Link to={`/super-admin/schools/${school.id}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0">
                    Manage →
                  </Link>
                </div>
              );
            })}
            {needsAttention.length > 8 && (
              <div className="pt-3 text-center">
                <Link to="/super-admin/schools" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  +{needsAttention.length - 8} more — view all schools
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { to: '/super-admin/schools',        icon: Building2,     color: 'bg-indigo-50 text-indigo-600', label: 'Manage Schools',    desc: 'View, edit, suspend or enter any school' },
          { to: '/super-admin/communications', icon: MessageSquare, color: 'bg-blue-50 text-blue-600',     label: 'Communications',    desc: 'Email & push announcements, templates, scheduling' },
          { to: '/super-admin/invoices',       icon: FileText,      color: 'bg-emerald-50 text-emerald-600', label: 'Invoice Generator', desc: 'Create, bulk-generate & track subscription invoices' },
          { to: '/super-admin/schools/new',    icon: Plus,          color: 'bg-amber-50 text-amber-600',   label: 'Onboard School',    desc: 'Register a new school on the platform' },
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

      {quickAddLead && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setQuickAddLead(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2"><Target className="w-5 h-5 text-indigo-500" /> Add Lead</h2>
              <button onClick={() => setQuickAddLead(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-3">
              <input className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="School name *" value={leadForm.schoolName} onChange={e => setLeadForm({ ...leadForm, schoolName: e.target.value })} />
              <input className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="Contact name" value={leadForm.contactName} onChange={e => setLeadForm({ ...leadForm, contactName: e.target.value })} />
              <input className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="Email *" value={leadForm.email} onChange={e => setLeadForm({ ...leadForm, email: e.target.value })} />
              <input className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="Phone" value={leadForm.phone} onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })} />
              <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" value={leadForm.source} onChange={e => setLeadForm({ ...leadForm, source: e.target.value })}>
                {['Direct', 'Website', 'Referral', 'WhatsApp', 'Facebook', 'Instagram', 'Google', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setQuickAddLead(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button onClick={quickAddLeadSubmit} disabled={quickSaving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2">
                {quickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Add Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {quickAddTask && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setQuickAddTask(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2"><CheckSquare className="w-5 h-5 text-indigo-500" /> Create Task</h2>
              <button onClick={() => setQuickAddTask(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-3">
              <input className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="Title *" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" value={taskForm.category} onChange={e => setTaskForm({ ...taskForm, category: e.target.value as CommandTask['category'] })}>
                  {(['Sales', 'Marketing', 'School Support', 'Onboarding', 'Billing', 'Technical', 'Content', 'Product', 'Internal'] as const).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value as CommandTask['priority'] })}>
                  {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input type="date" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" value={taskForm.dueDate} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setQuickAddTask(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button onClick={quickAddTaskSubmit} disabled={quickSaving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2">
                {quickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

