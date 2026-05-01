/**
 * SuperAdminDashboard — Platform-level overview for super_admin users.
 * Shows total schools, active schools, total students, subscriptions,
 * and incoming demo requests from the landing page.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, doc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { School } from '../../types';
import {
  Building2, Users, CheckCircle2, CreditCard, Plus, ArrowRight,
  TrendingUp, AlertCircle, Clock, FileText, Zap, Bell, Mail,
  Phone, BookOpen, ChevronDown, CheckCheck, X, Inbox,
} from 'lucide-react';

interface DemoRequest {
  id: string;
  schoolName: string;
  contactName: string;
  email: string;
  phone: string;
  studentCount?: string;
  plan?: string;
  message?: string;
  status: 'pending' | 'contacted' | 'converted' | 'dismissed';
  createdAt: any;
}

interface PlatformStats {
  totalSchools: number;
  activeSchools: number;
  suspendedSchools: number;
  trialSchools: number;
  totalStudents: number;
  loading: boolean;
}

const DEMO_STATUS_CONFIG: Record<DemoRequest['status'], { label: string; color: string }> = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700' },
  contacted: { label: 'Contacted', color: 'bg-blue-100 text-blue-700' },
  converted: { label: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  dismissed: { label: 'Dismissed', color: 'bg-slate-100 text-slate-500' },
};

export default function SuperAdminDashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalSchools: 0, activeSchools: 0, suspendedSchools: 0,
    trialSchools: 0, totalStudents: 0, loading: true,
  });
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoFilter, setDemoFilter] = useState<DemoRequest['status'] | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        const schoolList = schoolsSnap.docs.map(d => ({ id: d.id, ...d.data() } as School));
        setSchools(schoolList);
        const studentsSnap = await getDocs(collection(db, 'students'));
        setStats({
          totalSchools: schoolList.length,
          activeSchools: schoolList.filter(s => s.status === 'active').length,
          suspendedSchools: schoolList.filter(s => s.status === 'suspended').length,
          trialSchools: schoolList.filter(s => s.status === 'trial').length,
          totalStudents: studentsSnap.size,
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

  const pendingCount = demoRequests.filter(r => r.status === 'pending').length;

  const filteredDemos = demoFilter === 'all'
    ? demoRequests
    : demoRequests.filter(r => r.status === demoFilter);

  const kpiCards = [
    { label: 'Total Schools',   value: stats.totalSchools,   icon: Building2,    color: 'bg-indigo-600', sub: `${stats.activeSchools} active` },
    { label: 'Active Schools',  value: stats.activeSchools,  icon: CheckCircle2, color: 'bg-emerald-600', sub: `${stats.suspendedSchools} suspended` },
    { label: 'Trial Schools',   value: stats.trialSchools,   icon: Clock,        color: 'bg-amber-500',  sub: 'Pending conversion' },
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
          <div className="flex gap-1">
            {(['all', 'pending', 'contacted', 'converted', 'dismissed'] as const).map(f => (
              <button key={f} onClick={() => setDemoFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors capitalize ${
                  demoFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >{f}</button>
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
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{req.contactName}</span>
                      <a href={`mailto:${req.email}`} className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
                        <Mail className="w-3 h-3" />{req.email}
                      </a>
                      <a href={`tel:${req.phone}`} className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
                        <Phone className="w-3 h-3" />{req.phone}
                      </a>
                      {req.studentCount && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{req.studentCount} students</span>}
                      <span className="text-slate-400">{formatDate(req.createdAt)}</span>
                    </div>
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
                    {req.status === 'converted' && (
                      <Link to="/super-admin/schools/new"
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors">
                        Onboard →
                      </Link>
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
    </div>
  );
}

