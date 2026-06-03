/**
 * HR Leave Requests — full approve/reject queue for the HR role.
 *
 * - Pending tab: review and act on open requests with an optional comment.
 * - History tab: browse approved/rejected requests with date filtering.
 * - "New Request" panel: allows HR staff to submit their own leave application.
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, getDoc,
  doc, serverTimestamp, orderBy, setDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSchool } from '../../components/SchoolContext';
import { useAuth } from '../../components/FirebaseProvider';
import { LeaveRequest } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarOff, CheckCircle2, XCircle, Clock, Plus, X,
  ChevronDown, Loader2, Search, User, BarChart3, Edit2, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';

const LEAVE_TYPES: { value: LeaveRequest['type']; label: string }[] = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'other', label: 'Other' },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

type Tab = 'pending' | 'history' | 'balances';

interface LeaveEntitlement {
  id?: string;
  staffId: string;
  staffName: string;
  year: string;
  annual: number;
  sick: number;
  maternity: number;
  paternity: number;
  schoolId: string;
}

const DEFAULT_ENTITLEMENTS = { annual: 21, sick: 10, maternity: 90, paternity: 5 };

function daysBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

export default function HrLeave() {
  const { schoolId } = useSchool();
  const { user, profile } = useAuth();

  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showNewForm, setShowNewForm] = useState(false);

  // Balances tab state
  const [entitlements, setEntitlements] = useState<LeaveEntitlement[]>([]);
  const [editingEntitlement, setEditingEntitlement] = useState<string | null>(null);
  const [entForm, setEntForm] = useState(DEFAULT_ENTITLEMENTS);
  const [entSaving, setEntSaving] = useState(false);
  const currentYear = new Date().getFullYear().toString();

  const [newReq, setNewReq] = useState({
    staffId: user?.uid ?? '',
    staffName: profile?.displayName ?? '',
    type: 'annual' as LeaveRequest['type'],
    startDate: '',
    endDate: '',
    reason: '',
  });

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'leave_requests'),
      where('schoolId', '==', schoolId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'leave_entitlements'),
      where('schoolId', '==', schoolId),
      where('year', '==', currentYear),
    );
    const unsub = onSnapshot(q, snap => {
      setEntitlements(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveEntitlement)));
    });
    return unsub;
  }, [schoolId, currentYear]);

  const saveEntitlement = async (staffId: string, staffName: string) => {
    if (!schoolId) return;
    setEntSaving(true);
    try {
      const existing = entitlements.find(e => e.staffId === staffId);
      if (existing?.id) {
        await updateDoc(doc(db, 'leave_entitlements', existing.id), { ...entForm });
      } else {
        await addDoc(collection(db, 'leave_entitlements'), {
          staffId, staffName, year: currentYear, schoolId, ...entForm,
        });
      }
      toast.success('Entitlements saved.');
      setEditingEntitlement(null);
    } catch { toast.error('Failed to save.'); }
    finally { setEntSaving(false); }
  };

  // Compute used days per staff from approved requests
  const usedByStaff = (staffId: string): Record<LeaveRequest['type'], number> => {
    const result: Record<string, number> = { annual: 0, sick: 0, maternity: 0, paternity: 0, other: 0 };
    requests
      .filter(r => r.staffId === staffId && r.status === 'approved' && r.startDate?.startsWith(currentYear))
      .forEach(r => { result[r.type] = (result[r.type] || 0) + daysBetween(r.startDate, r.endDate); });
    return result as any;
  };

  // Unique staff members who appear in requests this year
  const staffInRequests = Array.from(
    new Map(
      requests
        .filter(r => r.startDate?.startsWith(currentYear))
        .map(r => [r.staffId, { staffId: r.staffId, staffName: r.staffName }])
    ).values()
  );

  const pending = requests.filter(r =>
    r.status === 'pending' &&
    (typeFilter === 'all' || r.type === typeFilter) &&
    r.staffName.toLowerCase().includes(search.toLowerCase())
  );

  const history = requests.filter(r =>
    r.status !== 'pending' &&
    (typeFilter === 'all' || r.type === typeFilter) &&
    r.staffName.toLowerCase().includes(search.toLowerCase())
  );

  const handleReview = async (id: string, decision: 'approved' | 'rejected') => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'leave_requests', id), {
        status: decision,
        reviewedBy: profile?.displayName || user?.email,
        reviewComment,
        reviewedAt: serverTimestamp(),
      });
      toast.success(`Request ${decision}.`);
      setReviewingId(null);
      setReviewComment('');
    } catch (e) {
      toast.error('Failed to update request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (!newReq.startDate || !newReq.endDate) { toast.error('Please fill in all dates.'); return; }
    if (new Date(newReq.endDate) < new Date(newReq.startDate)) {
      toast.error('End date must be after start date.'); return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'leave_requests'), {
        ...newReq,
        staffId: user?.uid,
        staffName: profile?.displayName || 'HR Staff',
        status: 'pending',
        schoolId,
        createdAt: serverTimestamp(),
      });
      toast.success('Leave request submitted.');
      setShowNewForm(false);
      setNewReq({ staffId: user?.uid ?? '', staffName: profile?.displayName ?? '', type: 'annual', startDate: '', endDate: '', reason: '' });
    } catch (e) {
      toast.error('Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayList = tab === 'pending' ? pending : history;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Human Resources</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Leave Requests</h1>
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Request
        </button>
      </div>

      {/* New Request Form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.form
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleSubmitRequest}
            className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 space-y-4"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-slate-900">Submit Leave Request</h3>
              <button type="button" onClick={() => setShowNewForm(false)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Leave Type</label>
                <select
                  value={newReq.type}
                  onChange={e => setNewReq({ ...newReq, type: e.target.value as LeaveRequest['type'] })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Your Name</label>
                <input
                  required
                  value={newReq.staffName}
                  onChange={e => setNewReq({ ...newReq, staffName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Start Date</label>
                <input
                  required type="date" value={newReq.startDate}
                  onChange={e => setNewReq({ ...newReq, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">End Date</label>
                <input
                  required type="date" value={newReq.endDate}
                  onChange={e => setNewReq({ ...newReq, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Reason</label>
                <textarea
                  required value={newReq.reason}
                  onChange={e => setNewReq({ ...newReq, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowNewForm(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Submit
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Tabs + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['pending', 'history', 'balances'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all capitalize ${
                tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'pending' ? `Pending (${requests.filter(r => r.status === 'pending').length})` : t === 'history' ? 'History' : 'Balances'}
            </button>
          ))}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              placeholder="Search staff name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All types</option>
            {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── BALANCES TAB ── */}
      {tab === 'balances' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" /> Leave Balances — {currentYear}
            </h2>
            <p className="text-xs text-slate-400">Click a row to edit entitlements for that staff member.</p>
          </div>
          {staffInRequests.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No leave requests recorded for {currentYear} yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Staff Member</th>
                    {(['annual', 'sick', 'maternity', 'paternity'] as const).map(type => (
                      <th key={type} className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">{type}</th>
                    ))}
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffInRequests.map(({ staffId, staffName }) => {
                    const ent = entitlements.find(e => e.staffId === staffId) ?? { ...DEFAULT_ENTITLEMENTS };
                    const used = usedByStaff(staffId);
                    const isEditing = editingEntitlement === staffId;
                    return (
                      <React.Fragment key={staffId}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-bold text-slate-900">{staffName}</td>
                          {(['annual', 'sick', 'maternity', 'paternity'] as const).map(type => {
                            const entitled = ent[type] ?? DEFAULT_ENTITLEMENTS[type];
                            const usedDays = used[type] || 0;
                            const remaining = entitled - usedDays;
                            return (
                              <td key={type} className="px-4 py-3 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={`text-xs font-bold ${remaining < 0 ? 'text-rose-600' : remaining === 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                                    {remaining}d left
                                  </span>
                                  <span className="text-[10px] text-slate-400">{usedDays}/{entitled}</span>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-3">
                            <button onClick={() => { setEditingEntitlement(isEditing ? null : staffId); setEntForm({ annual: ent.annual ?? 21, sick: ent.sick ?? 10, maternity: ent.maternity ?? 90, paternity: ent.paternity ?? 5 }); }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr>
                            <td colSpan={6} className="px-4 pb-4 bg-indigo-50">
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {(['annual', 'sick', 'maternity', 'paternity'] as const).map(type => (
                                  <div key={type}>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">{type} (days)</label>
                                    <input type="number" min="0" value={(entForm as any)[type]}
                                      onChange={e => setEntForm(prev => ({ ...prev, [type]: parseInt(e.target.value) || 0 }))}
                                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2 mt-3">
                                <button onClick={() => setEditingEntitlement(null)}
                                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">Cancel</button>
                                <button disabled={entSaving} onClick={() => saveEntitlement(staffId, staffName)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                                  {entSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* List */}
      {tab !== 'balances' && loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : tab !== 'balances' && displayList.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <CalendarOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {tab === 'pending' ? 'No pending leave requests.' : 'No leave history yet.'}
          </p>
        </div>
      ) : tab !== 'balances' && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {displayList.map(req => (
              <motion.div
                key={req.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-indigo-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{req.staffName}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_CONFIG[req.status]?.cls}`}>
                          {STATUS_CONFIG[req.status]?.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {LEAVE_TYPES.find(t => t.value === req.type)?.label} · {req.startDate} → {req.endDate}
                      </p>
                      <p className="text-sm text-slate-600 mt-1">{req.reason}</p>
                      {req.reviewedBy && (
                        <p className="text-xs text-slate-400 mt-1">Reviewed by {req.reviewedBy}</p>
                      )}
                    </div>
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setReviewingId(reviewingId === req.id ? null : req.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${reviewingId === req.id ? 'rotate-180' : ''}`} />
                        Review
                      </button>
                    </div>
                  )}

                  {req.status !== 'pending' && (
                    <div className="shrink-0">
                      {req.status === 'approved'
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        : <XCircle className="w-5 h-5 text-rose-500" />
                      }
                    </div>
                  )}
                </div>

                {/* Review Panel */}
                <AnimatePresence>
                  {reviewingId === req.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-0 border-t border-slate-100">
                        <textarea
                          placeholder="Optional comment (visible to staff)…"
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          className="w-full mt-4 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          rows={2}
                        />
                        <div className="flex gap-2 mt-3 justify-end">
                          <button
                            onClick={() => { setReviewingId(null); setReviewComment(''); }}
                            className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={submitting}
                            onClick={() => handleReview(req.id!, 'rejected')}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                          <button
                            disabled={submitting}
                            onClick={() => handleReview(req.id!, 'approved')}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Approve
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
