/**
 * Self-service leave request panel — lets any staff member (teacher,
 * accountant, librarian, HR, etc.) submit and track their own leave
 * requests, mirroring the self-submit flow HR already had in HrLeave.tsx.
 *
 * Requests are written with staffId: user.uid so the firestore.rules
 * isOwner(staffId) check resolves correctly for read/cancel.
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './FirebaseProvider';
import { LeaveRequest } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarOff, Plus, X, Loader2, Clock, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const LEAVE_TYPES: { value: LeaveRequest['type']; label: string }[] = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'other', label: 'Other' },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
};

function daysBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

export default function MyLeaveRequests({ schoolId }: { schoolId: string | null | undefined }) {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ type: 'annual' as LeaveRequest['type'], startDate: '', endDate: '', reason: '' });

  useEffect(() => {
    if (!schoolId || !user) { setRequests([]); setLoading(false); return; }
    const q = query(
      collection(db, 'leave_requests'),
      where('schoolId', '==', schoolId),
      where('staffId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      snap => { setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest))); setLoading(false); },
      err => { console.error('[MyLeaveRequests] query failed:', err.code, err.message); setLoading(false); },
    );
    return () => unsub();
  }, [schoolId, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !user) return;
    if (!form.startDate || !form.endDate) { toast.error('Please fill in both dates.'); return; }
    if (new Date(form.endDate) < new Date(form.startDate)) { toast.error('End date must be after start date.'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'leave_requests'), {
        ...form,
        staffId: user.uid,
        staffName: profile?.displayName || user.email || 'Staff',
        status: 'pending',
        schoolId,
        createdAt: serverTimestamp(),
      });
      toast.success('Leave request submitted.');
      setShowForm(false);
      setForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
    } catch (err) {
      toast.error('Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this leave request?')) return;
    try {
      await deleteDoc(doc(db, 'leave_requests', id));
      toast.success('Request cancelled.');
    } catch (err) {
      toast.error('Failed to cancel request.');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarOff className="w-5 h-5 text-indigo-600" /> My Leave Requests
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Submit and track your own leave applications.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Request Leave'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Leave Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as LeaveRequest['type'] })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Start Date</label>
                  <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">End Date</label>
                  <input type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>
            </div>
            {form.startDate && form.endDate && new Date(form.endDate) >= new Date(form.startDate) && (
              <p className="text-xs text-slate-400">{daysBetween(form.startDate, form.endDate)} day(s) requested</p>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Short Message</label>
              <textarea required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Request'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : requests.length === 0 ? (
          <div className="text-center py-10 bg-white border border-dashed border-slate-200 rounded-2xl">
            <CalendarOff className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">You haven't submitted any leave requests yet.</p>
          </div>
        ) : (
          requests.map(r => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = cfg.Icon;
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900 text-sm capitalize">{LEAVE_TYPES.find(t => t.value === r.type)?.label ?? r.type}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.cls}`}>
                      <StatusIcon className="w-3 h-3" /> {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{r.startDate} → {r.endDate} ({daysBetween(r.startDate, r.endDate)} day(s))</p>
                  <p className="text-sm text-slate-600 mt-1.5">{r.reason}</p>
                  {r.status !== 'pending' && r.reviewComment && (
                    <p className="text-xs text-slate-400 mt-1.5 italic">Reviewer note: {r.reviewComment}</p>
                  )}
                </div>
                {r.status === 'pending' && (
                  <button onClick={() => handleCancel(r.id!)} title="Cancel request"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
