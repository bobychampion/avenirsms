import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { useAuth } from '../components/FirebaseProvider';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Trash2, ArrowLeft, Loader2, CheckCircle2,
  ShieldAlert, ChevronDown, ChevronUp, RotateCcw, Info,
} from 'lucide-react';

// ─── Data Categories ──────────────────────────────────────────────────────────

interface DataCategory {
  id: string;
  label: string;
  description: string;
  collections: string[];
  warning?: string;
  docCount?: number;
}

const CATEGORIES: DataCategory[] = [
  {
    id: 'academic',
    label: 'Academic Records',
    description: 'Grades, attendance records, student skills, assignments, and behavioral notes.',
    collections: ['grades', 'attendance', 'student_skills', 'assignments', 'behavioral_records'],
  },
  {
    id: 'students',
    label: 'Students',
    description: 'All student profiles and lifecycle events. Does not delete user login accounts.',
    collections: ['students', 'lifecycle_events', 'promotions'],
    warning: 'This will remove all student records. Login accounts are not affected.',
  },
  {
    id: 'classes',
    label: 'Classes & Timetables',
    description: 'Class definitions, subject assignments, and weekly timetable schedules.',
    collections: ['classes', 'class_subjects', 'timetables'],
  },
  {
    id: 'exams',
    label: 'Exams & CBT',
    description: 'Exam schedules, seating arrangements, CBT exam sets, sessions, and question bank.',
    collections: ['exams', 'exam_seating', 'cbt_exams', 'cbt_sessions', 'question_bank'],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Invoices, fee payments, expenses, payroll records, and result PIN batches.',
    collections: ['invoices', 'fee_payments', 'expenses', 'payroll', 'pins'],
    warning: 'Deleting financial records cannot be undone.',
  },
  {
    id: 'admissions',
    label: 'Admissions',
    description: 'All application forms submitted through the public admission portal.',
    collections: ['applications'],
  },
  {
    id: 'staff',
    label: 'Staff & HR',
    description: 'Staff profiles, leave requests, and teacher check-in records. Does not delete login accounts.',
    collections: ['staff', 'leave_requests', 'attendance_checkins'],
  },
  {
    id: 'curriculum',
    label: 'Curriculum',
    description: 'Curriculum topics, uploaded curriculum documents, and question bank items.',
    collections: ['curriculum_items', 'curriculum_documents'],
  },
  {
    id: 'communication',
    label: 'Communication & Events',
    description: 'Notifications, WhatsApp logs, internal messages, and school calendar events.',
    collections: ['notifications', 'notification_broadcasts', 'messages', 'events', 'whatsapp_logs'],
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    description: 'Activity log that tracks who changed what and when across the system.',
    collections: ['audit_log'],
    warning: 'Clearing audit logs removes your compliance trail permanently.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function countDocs(col: string, schoolId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db, col), where('schoolId', '==', schoolId))
  );
  return snap.size;
}

async function deleteCollection(col: string, schoolId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db, col), where('schoolId', '==', schoolId))
  );
  if (snap.empty) return 0;

  // Firestore batch limit is 500; chunk at 400 to be safe
  const CHUNK = 400;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(CHUNK, snap.docs.length - i);
  }
  return deleted;
}

// ─── Component ────────────────────────────────────────────────────────────────

type PhaseState = 'idle' | 'counting' | 'confirming' | 'deleting' | 'done';

export default function SchoolDataReset() {
  const schoolId = useSchoolId();
  const { schoolName } = useSchool();
  const { profile } = useAuth();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedWarnings, setExpandedWarnings] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<PhaseState>('idle');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmInput, setConfirmInput] = useState('');
  const [progress, setProgress] = useState<{ current: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ deleted: number; errors: string[] } | null>(null);

  const selectedCategories = CATEGORIES.filter(c => selected.has(c.id));
  const totalSelected = selectedCategories.reduce(
    (sum, cat) => sum + (counts[cat.id] ?? 0), 0
  );

  function toggleCategory(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === CATEGORIES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(CATEGORIES.map(c => c.id)));
    }
  }

  async function handlePreview() {
    if (!schoolId || selected.size === 0) return;
    setPhase('counting');
    const newCounts: Record<string, number> = {};
    for (const cat of selectedCategories) {
      let total = 0;
      for (const col of cat.collections) {
        try {
          total += await countDocs(col, schoolId);
        } catch {
          // collection may not exist yet — treat as 0
        }
      }
      newCounts[cat.id] = total;
    }
    setCounts(newCounts);
    setPhase('confirming');
  }

  async function handleDelete() {
    if (!schoolId || confirmInput !== schoolName) return;

    setPhase('deleting');
    let totalDeleted = 0;
    const errors: string[] = [];
    const allCollections = selectedCategories.flatMap(c => c.collections);

    setProgress({ current: '', done: 0, total: allCollections.length });

    for (let i = 0; i < allCollections.length; i++) {
      const col = allCollections[i];
      setProgress({ current: col, done: i, total: allCollections.length });
      try {
        const deleted = await deleteCollection(col, schoolId);
        totalDeleted += deleted;
      } catch (err: any) {
        errors.push(`${col}: ${err?.message ?? 'unknown error'}`);
      }
    }

    setProgress({ current: '', done: allCollections.length, total: allCollections.length });

    // Write audit log (best-effort — collection may have been cleared too)
    try {
      await addDoc(collection(db, 'audit_log'), {
        schoolId,
        actorId: profile?.uid ?? null,
        actorEmail: profile?.email ?? null,
        actorRole: profile?.role ?? null,
        action: 'school.data_reset',
        details: {
          categories: selectedCategories.map(c => c.id),
          collectionsCleared: allCollections,
          totalDeleted,
          errors,
        },
        createdAt: serverTimestamp(),
      });
    } catch {
      // silently swallow — audit log itself may have been cleared
    }

    setResult({ deleted: totalDeleted, errors });
    setPhase('done');

    if (errors.length === 0) {
      toast.success(`${totalDeleted.toLocaleString()} records deleted successfully.`);
    } else {
      toast.error(`Completed with ${errors.length} error(s). Check the result summary.`);
    }
  }

  function handleReset() {
    setPhase('idle');
    setSelected(new Set());
    setCounts({});
    setConfirmInput('');
    setProgress(null);
    setResult(null);
  }

  if (!schoolId) return null;

  // ── Done state ──
  if (phase === 'done' && result) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className={`rounded-2xl border p-6 text-center space-y-3 ${result.errors.length === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <CheckCircle2 className={`w-10 h-10 mx-auto ${result.errors.length === 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
          <h2 className="text-lg font-bold text-slate-800">Reset Complete</h2>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{result.deleted.toLocaleString()}</span> records deleted across {selectedCategories.length} category{selectedCategories.length !== 1 ? 'ies' : 'y'}.
          </p>
          {result.errors.length > 0 && (
            <div className="text-left bg-white border border-amber-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-amber-700">Errors ({result.errors.length}):</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-slate-500 font-mono">{e}</p>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={handleReset} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">
            <RotateCcw size={15} /> Reset Again
          </button>
          <Link to="/admin" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ── Deleting state ──
  if (phase === 'deleting' && progress) {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-5">
          <Loader2 className="w-10 h-10 animate-spin text-red-500 mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-slate-800">Deleting Records…</h2>
            <p className="text-sm text-slate-500 mt-1">Do not close this tab.</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            {progress.done} / {progress.total} collections
            {progress.current ? ` — clearing ${progress.current}` : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/admin/settings" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Data Reset</h1>
            <p className="text-sm text-slate-500">Permanently remove records from <span className="font-medium text-slate-700">{schoolName}</span>.</p>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span>
          <strong>This action is irreversible.</strong> Deleted records cannot be recovered. Use this only to remove test or demo data before going live, or to clear specific modules for a fresh start.
        </span>
      </div>

      {/* Category Selection */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-slate-700 text-sm">Select data to delete</span>
          <button
            onClick={toggleAll}
            disabled={phase === 'counting' || phase === 'confirming'}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-40"
          >
            {selected.size === CATEGORIES.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {CATEGORIES.map(cat => {
            const isChecked = selected.has(cat.id);
            const showWarning = expandedWarnings.has(cat.id);
            const count = counts[cat.id];

            return (
              <div key={cat.id} className={`px-6 py-4 transition-colors ${isChecked ? 'bg-red-50/40' : ''}`}>
                <label className="flex items-start gap-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={phase === 'counting' || phase === 'confirming'}
                    onChange={() => toggleCategory(cat.id)}
                    className="mt-0.5 w-4 h-4 accent-red-500 cursor-pointer disabled:opacity-40"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800 text-sm">{cat.label}</span>
                      {count !== undefined && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${count > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                          {count.toLocaleString()} record{count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Collections: <span className="font-mono">{cat.collections.join(', ')}</span>
                    </p>

                    {cat.warning && (
                      <button
                        type="button"
                        onClick={e => {
                          e.preventDefault();
                          setExpandedWarnings(prev => {
                            const next = new Set(prev);
                            next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                            return next;
                          });
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 transition-colors"
                      >
                        <AlertTriangle size={11} />
                        Warning
                        {showWarning ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                    )}
                    {cat.warning && showWarning && (
                      <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        {cat.warning}
                      </p>
                    )}
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action bar */}
      {phase === 'idle' && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4">
          <div className="text-sm text-slate-500">
            {selected.size === 0
              ? 'Select at least one category to continue.'
              : `${selected.size} category${selected.size !== 1 ? 'ies' : 'y'} selected`}
          </div>
          <button
            onClick={handlePreview}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={15} />
            Preview & Continue
          </button>
        </div>
      )}

      {phase === 'counting' && (
        <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin text-indigo-400" />
          Counting records…
        </div>
      )}

      {/* Confirmation panel */}
      {phase === 'confirming' && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-600" />
            <span className="font-semibold text-red-700 text-sm">Confirm Deletion</span>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Summary */}
            <div className="space-y-2">
              {selectedCategories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{cat.label}</span>
                  <span className={`font-semibold ${(counts[cat.id] ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {(counts[cat.id] ?? 0).toLocaleString()} records
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-slate-700">Total</span>
                <span className="text-red-600">{totalSelected.toLocaleString()} records</span>
              </div>
            </div>

            {totalSelected === 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <Info size={13} />
                No records found for the selected categories. Nothing will be deleted.
              </div>
            )}

            {/* Confirm input */}
            <div className="space-y-2">
              <label className="text-sm text-slate-600">
                Type the school name <span className="font-semibold text-slate-800">"{schoolName}"</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                placeholder={schoolName}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={confirmInput !== schoolName}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} />
                Delete {totalSelected.toLocaleString()} Record{totalSelected !== 1 ? 's' : ''}
              </button>
              <button
                onClick={() => { setPhase('idle'); setConfirmInput(''); }}
                className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety note */}
      {phase === 'idle' && (
        <div className="flex items-start gap-2 text-xs text-slate-400 px-1">
          <Info size={13} className="mt-0.5 shrink-0" />
          User accounts, login credentials, school settings, subscriptions, and Google integrations are never affected by data reset.
        </div>
      )}
    </div>
  );
}
