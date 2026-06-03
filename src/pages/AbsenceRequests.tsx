/**
 * Absence Requests — admin review queue for parent-submitted future absences.
 *
 * Parents submit requests from ParentPortal (Absence tab).
 * Admin/form-tutors approve or reject here with an optional note.
 * On approval the attendance system can reference `absence_requests` when
 * recording the relevant dates as "Authorised Absence".
 *
 * Data model (`absence_requests`):
 *   studentId, studentName, class, parentId, parentName,
 *   startDate, endDate, reason,
 *   type: 'medical' | 'holiday' | 'family' | 'other'
 *   status: 'pending' | 'approved' | 'rejected'
 *   reviewedBy?, reviewNote?, reviewedAt?, schoolId, createdAt
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, updateDoc,
  doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { useAuth } from '../components/FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarOff, CheckCircle2, XCircle, Clock, Search,
  ChevronDown, Loader2, User, Calendar, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface AbsenceRequest {
  id?: string;
  studentId: string;
  studentName: string;
  class: string;
  parentId: string;
  parentName: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: 'medical' | 'holiday' | 'family' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNote?: string;
  reviewedAt?: any;
  schoolId: string;
  createdAt: any;
}

const TYPE_COLORS: Record<string, string> = {
  medical: 'bg-rose-50 text-rose-700 border-rose-200',
  holiday: 'bg-amber-50 text-amber-700 border-amber-200',
  family: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-50 text-slate-600 border-slate-200',
};

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  pending: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending' },
  approved: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Approved' },
  rejected: { cls: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Rejected' },
};

function dayCount(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

type Tab = 'pending' | 'history';

export default function AbsenceRequests() {
  const { schoolId } = useSchool();
  const { user, profile } = useAuth();

  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'absence_requests'),
      where('schoolId', '==', schoolId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsenceRequest)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  const pending = requests.filter(r =>
    r.status === 'pending' &&
    (r.studentName.toLowerCase().includes(search.toLowerCase()) ||
     r.parentName.toLowerCase().includes(search.toLowerCase()))
  );

  const history = requests.filter(r =>
    r.status !== 'pending' &&
    (r.studentName.toLowerCase().includes(search.toLowerCase()) ||
     r.parentName.toLowerCase().includes(search.toLowerCase()))
  );

  const handleReview = async (id: string, decision: 'approved' | 'rejected') => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'absence_requests', id), {
        status: decision,
        reviewedBy: profile?.displayName || user?.email,
        reviewNote,
        reviewedAt: serverTimestamp(),
      });
      toast.success(`Request ${decision}.`);
      setReviewingId(null);
      setReviewNote('');
    } catch { toast.error('Failed to update.'); }
    finally { setSubmitting(false); }
  };

  const displayList = tab === 'pending' ? pending : history;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Administration</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Absence Requests</h1>
        <p className="text-xs text-slate-400 mt-0.5">Parent-submitted requests for planned future absences</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['pending', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all capitalize ${
                tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t === 'pending' ? `Pending (${requests.filter(r => r.status === 'pending').length})` : 'History'}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input placeholder="Search student or parent…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <CalendarOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {tab === 'pending' ? 'No pending absence requests.' : 'No history found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {displayList.map(req => (
              <motion.div key={req.id} layout
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900">{req.studentName}</p>
                      <span className="text-xs text-slate-500">{req.class}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${TYPE_COLORS[req.type]}`}>
                        {req.type}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_CONFIG[req.status].cls}`}>
                        {STATUS_CONFIG[req.status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{req.startDate} → {req.endDate} ({dayCount(req.startDate, req.endDate)} day{dayCount(req.startDate, req.endDate) !== 1 ? 's' : ''})</span>
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />by {req.parentName}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{req.reason}</p>
                    {req.reviewedBy && <p className="text-xs text-slate-400 mt-0.5">Reviewed by {req.reviewedBy}{req.reviewNote ? ` — "${req.reviewNote}"` : ''}</p>}
                  </div>
                  {req.status === 'pending' && (
                    <button onClick={() => setReviewingId(reviewingId === req.id ? null : req.id!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors shrink-0">
                      <ChevronDown className={`w-3 h-3 transition-transform ${reviewingId === req.id ? 'rotate-180' : ''}`} />
                      Review
                    </button>
                  )}
                  {req.status !== 'pending' && (
                    req.status === 'approved'
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      : <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                </div>

                <AnimatePresence>
                  {reviewingId === req.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-5 pb-5 border-t border-slate-100">
                        <textarea placeholder="Optional note to parent…" value={reviewNote}
                          onChange={e => setReviewNote(e.target.value)}
                          className="w-full mt-4 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} />
                        <div className="flex gap-2 mt-3 justify-end">
                          <button onClick={() => { setReviewingId(null); setReviewNote(''); }}
                            className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                          <button disabled={submitting} onClick={() => handleReview(req.id!, 'rejected')}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors">
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                          <button disabled={submitting} onClick={() => handleReview(req.id!, 'approved')}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
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
