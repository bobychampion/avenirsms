/**
 * Admin view of all parent/guardian accounts in the school.
 * Shows each parent's contact info, linked children, and quick actions.
 * Mounted at /admin/parents.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail as sendReset } from 'firebase/auth';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { UserProfile } from '../types';
import { Users, Search, Mail, Phone, ArrowLeft, Baby, SendHorizonal, KeyRound, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface ParentRow extends UserProfile {
  // linkedChildren comes from UserProfile already
}

export default function ParentList() {
  const { schoolId } = useSchool();
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'parent')),
      snap => {
        setParents(snap.docs.map(d => ({ uid: d.id, ...(d.data() as UserProfile) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [schoolId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return parents;
    return parents.filter(p =>
      p.displayName?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  }, [parents, search]);

  const sendPasswordReset = async (parent: ParentRow) => {
    try {
      await sendReset(getAuth(), parent.email);
      toast.success(`Password reset email sent to ${parent.email}`);
    } catch (err: any) {
      toast.error(err.message || 'Could not send reset email.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Administration</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" /> Parent & Guardian Directory
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All parent accounts in this school, with their linked children. Password reset is via email.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-extrabold text-slate-900">{parents.length}</p>
          <p className="text-xs text-slate-500">total parents</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full max-w-md pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading parents...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search ? 'No parents match your search.' : 'No parent accounts yet. They are created automatically when a student is enrolled.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(parent => (
            <div key={parent.uid} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-lg shrink-0">
                  {(parent.displayName || parent.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{parent.displayName || '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{parent.email}</p>
                </div>
              </div>

              {/* Linked children */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <Baby className="w-3 h-3" /> Linked children
                </p>
                {parent.linkedChildren && parent.linkedChildren.length > 0 ? (
                  <ul className="space-y-1">
                    {parent.linkedChildren.map(child => (
                      <li key={child.studentId} className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 font-medium">{child.studentName}</span>
                        <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                          {child.currentClass}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 italic">No children linked yet.</p>
                )}
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => sendPasswordReset(parent)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Reset Password
                </button>
                <a
                  href={`mailto:${parent.email}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
