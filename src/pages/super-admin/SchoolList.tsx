/**
 * SchoolList — Full paginated table of all schools in the platform.
 * Allows super_admin to enter, suspend/activate, or manage any school.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection, getDocs, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import { School } from '../../types';
import { useSuperAdmin } from '../../components/SuperAdminContext';
import {
  Building2, Plus, LogIn, Pencil, CheckCircle2, XCircle, Search
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SchoolList() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { enterSchool } = useSuperAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    getDocs(collection(db, 'schools'))
      .then(snap => {
        setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() } as School)));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleEnterSchool = (school: School) => {
    if (!school.id) return;
    enterSchool(school.id, school.name);
    navigate('/admin');
  };

  const handleToggleStatus = async (school: School) => {
    if (!school.id) return;
    const newStatus: School['status'] = school.status === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'schools', school.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, status: newStatus } : s));
      toast.success(`School ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch {
      toast.error('Failed to update school status');
    }
  };

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.adminEmail || '').toLowerCase().includes(search.toLowerCase())
  );

  const planBadge = (plan: School['subscriptionPlan']) => {
    const colors: Record<string, string> = {
      free: 'bg-slate-100 text-slate-600',
      starter: 'bg-blue-100 text-blue-700',
      pro: 'bg-indigo-100 text-indigo-700',
      enterprise: 'bg-purple-100 text-purple-700',
    };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[plan] ?? colors.free}`}>{plan}</span>;
  };

  const statusBadge = (status: School['status']) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      suspended: 'bg-red-100 text-red-700',
      trial: 'bg-amber-100 text-amber-700',
      demo: 'bg-slate-100 text-slate-600',
    };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.demo}`}>{status}</span>;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schools</h1>
          <p className="text-slate-500 text-sm mt-1">{schools.length} school{schools.length !== 1 ? 's' : ''} on the platform</p>
        </div>
        <Link
          to="/super-admin/schools/new"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-200 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Add School
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search schools…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading schools…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">{search ? 'No schools match your search' : 'No schools yet'}</p>
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
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Country</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(school => (
                  <tr key={school.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{school.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{school.urlSlug || school.id}</span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(school.status)}</td>
                    <td className="px-4 py-3">{planBadge(school.subscriptionPlan)}</td>
                    <td className="px-4 py-3 text-slate-500">{school.adminEmail || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{school.country || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEnterSchool(school)}
                          title="Enter school"
                          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <LogIn className="w-3.5 h-3.5" /> Enter
                        </button>
                        <Link
                          to={`/super-admin/schools/${school.id}`}
                          title="Edit school"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => handleToggleStatus(school)}
                          title={school.status === 'active' ? 'Suspend school' : 'Activate school'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            school.status === 'active'
                              ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {school.status === 'active' ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
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
