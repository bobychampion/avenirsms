/**
 * Library Fines — track and manage overdue book fines.
 *
 * Fines are calculated from `library_circulation` records that are:
 *   - status === 'issued'
 *   - dueDate < today
 *
 * Fine rate is stored in school settings but defaults to ₦50/day.
 * Paying or waiving a fine marks the circulation record with a `fineStatus`
 * field ('paid' | 'waived') and records the amount collected.
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, updateDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSchool } from '../../components/SchoolContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle, CheckCircle2, MinusCircle, Loader2, Search,
  Calendar, User, DollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CirculationRecord {
  id?: string;
  bookId: string;
  bookTitle: string;
  borrowerName: string;
  borrowerType: 'student' | 'staff';
  issuedAt: string;
  dueDate: string;
  status: 'issued' | 'returned';
  fineStatus?: 'paid' | 'waived';
  fineAmount?: number;
  schoolId: string;
}

const FINE_PER_DAY = 50; // ₦50 default

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function LibraryFines() {
  const { schoolId, locale, currency } = useSchool();

  const [records, setRecords] = useState<CirculationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fineFilter, setFineFilter] = useState<'unpaid' | 'paid' | 'waived' | 'all'>('unpaid');
  const [saving, setSaving] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (!schoolId) return;
    // Only fetch overdue issued records AND returned records that have fines
    const q = query(
      collection(db, 'library_circulation'),
      where('schoolId', '==', schoolId),
    );
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as CirculationRecord));
      // Keep only records with fines (overdue or with fineAmount set)
      const fined = all.filter(r => {
        if (r.fineAmount && r.fineAmount > 0) return true;
        if (r.status === 'issued' && new Date(r.dueDate) < today) return true;
        return false;
      });
      setRecords(fined);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  const calcFine = (r: CirculationRecord) => {
    if (r.fineAmount != null) return r.fineAmount;
    const dueDate = new Date(r.dueDate);
    return daysBetween(dueDate, today) * FINE_PER_DAY;
  };

  const filtered = records.filter(r => {
    const fine = calcFine(r);
    if (fineFilter === 'unpaid' && r.fineStatus) return false;
    if (fineFilter === 'paid' && r.fineStatus !== 'paid') return false;
    if (fineFilter === 'waived' && r.fineStatus !== 'waived') return false;
    return (
      r.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
      r.bookTitle.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalFines = records.filter(r => !r.fineStatus).reduce((s, r) => s + calcFine(r), 0);
  const totalCollected = records.filter(r => r.fineStatus === 'paid').reduce((s, r) => s + (r.fineAmount ?? calcFine(r)), 0);

  const handleAction = async (rec: CirculationRecord, action: 'paid' | 'waived') => {
    if (!rec.id) return;
    setSaving(rec.id);
    const fine = calcFine(rec);
    try {
      await updateDoc(doc(db, 'library_circulation', rec.id), {
        fineStatus: action,
        fineAmount: fine,
        [`fineResolvedAt`]: new Date().toISOString().split('T')[0],
      });
      toast.success(action === 'paid' ? `${formatCurrency(fine, locale, currency)} fine collected.` : 'Fine waived.');
    } catch {
      toast.error('Failed to update fine status.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Library</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Fines Management</h1>
        <p className="text-xs text-slate-400 mt-0.5">Rate: {formatCurrency(FINE_PER_DAY, locale, currency)}/day per overdue book</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-600">Outstanding Fines</p>
          <p className="text-2xl font-extrabold text-rose-700 mt-1">
            {formatCurrency(totalFines, locale, currency)}
          </p>
          <p className="text-xs text-rose-500 mt-0.5">{records.filter(r => !r.fineStatus).length} borrowers</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Collected</p>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1">
            {formatCurrency(totalCollected, locale, currency)}
          </p>
          <p className="text-xs text-emerald-500 mt-0.5">{records.filter(r => r.fineStatus === 'paid').length} settled</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Waived</p>
          <p className="text-2xl font-extrabold text-slate-700 mt-1">
            {records.filter(r => r.fineStatus === 'waived').length}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">records</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search borrower or book…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['unpaid', 'paid', 'waived', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFineFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                fineFilter === f ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {fineFilter === 'unpaid' ? 'No outstanding fines.' : 'No records found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(rec => {
              const fine = calcFine(rec);
              const daysOver = daysBetween(new Date(rec.dueDate), today);
              const settled = !!rec.fineStatus;
              return (
                <motion.div
                  key={rec.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
                    settled ? 'border-slate-200 opacity-70' : 'border-rose-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    rec.fineStatus === 'paid' ? 'bg-emerald-50' :
                    rec.fineStatus === 'waived' ? 'bg-slate-50' : 'bg-rose-50'
                  }`}>
                    {rec.fineStatus === 'paid' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : rec.fineStatus === 'waived' ? (
                      <MinusCircle className="w-5 h-5 text-slate-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900">{rec.bookTitle}</p>
                      {rec.fineStatus && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          rec.fineStatus === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {rec.fineStatus}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{rec.borrowerName}</span>
                      <span className="flex items-center gap-1 text-rose-600 font-medium">
                        <Calendar className="w-3 h-3" />
                        {daysOver} day{daysOver !== 1 ? 's' : ''} overdue
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Fine</p>
                      <p className="font-extrabold text-rose-600 text-lg">{formatCurrency(fine, locale, currency)}</p>
                    </div>
                    {!settled && (
                      <div className="flex flex-col gap-1">
                        <button
                          disabled={saving === rec.id}
                          onClick={() => handleAction(rec, 'paid')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {saving === rec.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                          Paid
                        </button>
                        <button
                          disabled={saving === rec.id}
                          onClick={() => handleAction(rec, 'waived')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          <MinusCircle className="w-3 h-3" /> Waive
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
