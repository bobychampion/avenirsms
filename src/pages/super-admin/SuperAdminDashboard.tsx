/**
 * SuperAdminDashboard — Platform-level overview for super_admin users.
 * Shows total schools, active schools, total students, subscriptions.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { School } from '../../types';
import {
  Building2, Users, CheckCircle2, CreditCard, Plus, ArrowRight,
  TrendingUp, AlertCircle, Clock
} from 'lucide-react';

interface PlatformStats {
  totalSchools: number;
  activeSchools: number;
  suspendedSchools: number;
  trialSchools: number;
  totalStudents: number;
  loading: boolean;
}

export default function SuperAdminDashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalSchools: 0, activeSchools: 0, suspendedSchools: 0,
    trialSchools: 0, totalStudents: 0, loading: true,
  });

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

  const kpiCards = [
    {
      label: 'Total Schools',
      value: stats.totalSchools,
      icon: Building2,
      color: 'bg-indigo-600',
      sub: `${stats.activeSchools} active`,
    },
    {
      label: 'Active Schools',
      value: stats.activeSchools,
      icon: CheckCircle2,
      color: 'bg-emerald-600',
      sub: `${stats.suspendedSchools} suspended`,
    },
    {
      label: 'Trial Schools',
      value: stats.trialSchools,
      icon: Clock,
      color: 'bg-amber-500',
      sub: 'Pending conversion',
    },
    {
      label: 'Total Students',
      value: stats.totalStudents,
      icon: Users,
      color: 'bg-purple-600',
      sub: 'Across all schools',
    },
  ];

  const planBadge = (plan: School['subscriptionPlan']) => {
    const colors: Record<string, string> = {
      free: 'bg-slate-100 text-slate-600',
      starter: 'bg-blue-100 text-blue-700',
      pro: 'bg-indigo-100 text-indigo-700',
      enterprise: 'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[plan] ?? colors.free}`}>
        {plan}
      </span>
    );
  };

  const statusBadge = (status: School['status']) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      suspended: 'bg-red-100 text-red-700',
      trial: 'bg-amber-100 text-amber-700',
      demo: 'bg-slate-100 text-slate-600',
    };
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.demo}`}>
        {status}
      </span>
    );
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
          <Plus className="w-4 h-4" />
          Add School
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
            <p className="text-3xl font-bold text-slate-900">
              {stats.loading ? '—' : card.value.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
          </div>
        ))}
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
            <Link
              to="/super-admin/schools/new"
              className="inline-flex items-center gap-2 mt-4 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add School
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">School</th>
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
                    <td className="px-4 py-3">{statusBadge(school.status)}</td>
                    <td className="px-4 py-3">{planBadge(school.subscriptionPlan)}</td>
                    <td className="px-4 py-3 text-slate-500">{school.adminEmail || '—'}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/super-admin/schools/${school.id}`}
                        className="text-indigo-600 hover:text-indigo-700 font-medium text-xs"
                      >
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
