import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection, query, where, getDocs, onSnapshot,
  writeBatch, doc, serverTimestamp, orderBy,
  updateDoc, deleteDoc
} from 'firebase/firestore';
import { Student, CURRENT_SESSION } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../components/Toast';
import { useSchool, useClassSelectOptions } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import {
  GraduationCap, ArrowRight, RotateCcw, ChevronDown,
  Users, CheckCircle2, XCircle, AlertTriangle, History
} from 'lucide-react';

type Decision = 'P' | 'D' | 'G' | '';

interface PromotionRecord {
  id?: string;
  studentId: string;
  studentName: string;
  fromClass: string;
  toClass: string;
  decision: 'P' | 'D' | 'G';
  fromSession: string;
  toSession: string;
  createdAt: any;
}

const DECISION_LABELS: Record<string, { label: string; desc: string; color: string; icon: React.ReactNode }> = {
  P: { label: 'Promote', desc: 'Move to next class', color: 'bg-emerald-50 border-emerald-400 text-emerald-700', icon: <ArrowRight className="w-4 h-4" /> },
  D: { label: 'Detain', desc: 'Repeat current class', color: 'bg-amber-50 border-amber-400 text-amber-700', icon: <RotateCcw className="w-4 h-4" /> },
  G: { label: 'Graduate', desc: 'Mark as graduated', color: 'bg-indigo-50 border-indigo-400 text-indigo-700', icon: <GraduationCap className="w-4 h-4" /> },
};

// Determine the next class for a given class (uses dynamic list)
function getNextClass(current: string, classList: string[]): string {
  const idx = classList.indexOf(current);
  if (idx === -1 || idx >= classList.length - 1) return current;
  return classList[idx + 1];
}

// Compute next session string e.g. "2025/2026" → "2026/2027"
function getNextSession(session: string): string {
  const parts = session.split('/');
  if (parts.length !== 2) return session;
  const start = parseInt(parts[0], 10);
  return `${start + 1}/${start + 2}`;
}

export default function StudentPromotion() {
  const schoolId = useSchoolId();
  const { classNames } = useSchool();
  const classSelectOptions = useClassSelectOptions();
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'promote' | 'history'>('promote');
  const [promotionHistory, setPromotionHistory] = useState<PromotionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nextClass = getNextClass(selectedClass, classNames);
  const isLastClass = selectedClass === classNames[classNames.length - 1];
  const nextSession = getNextSession(CURRENT_SESSION);

  // Load students for selected class
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    setDecisions({});
    const q = query(
      collection(db, 'students'),
      where('schoolId', '==', schoolId!),
      where('currentClass', '==', selectedClass),
      where('admissionStatus', '!=', 'graduated')
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(data.sort((a, b) => a.studentName.localeCompare(b.studentName)));
      // Default all to Promote
      const defaultDecisions: Record<string, Decision> = {};
      data.forEach(s => { defaultDecisions[s.id!] = 'P'; });
      setDecisions(defaultDecisions);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedClass, schoolId]);

  // Load promotion history
  useEffect(() => {
    if (!schoolId) return;
    if (activeTab !== 'history') return;
    setHistoryLoading(true);
    const q = query(collection(db, 'promotions'), where('schoolId', '==', schoolId!), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setPromotionHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as PromotionRecord)));
      setHistoryLoading(false);
    });
    return () => unsub();
  }, [activeTab, schoolId]);

  const setAllDecisions = (decision: Decision) => {
    const updated: Record<string, Decision> = {};
    students.forEach(s => { updated[s.id!] = decision; });
    setDecisions(updated);
  };

  const promoteCount = Object.values(decisions).filter(d => d === 'P').length;
  const detainCount = Object.values(decisions).filter(d => d === 'D').length;
  const graduateCount = Object.values(decisions).filter(d => d === 'G').length;
  const undecidedCount = Object.values(decisions).filter(d => d === '').length;

  const handleExecute = async () => {
    if (undecidedCount > 0) {
      toast.error(`${undecidedCount} students have no decision set.`);
      return;
    }
    setSaving(true);
    const tid = toast.loading('Processing promotions…');
    try {
      const batch = writeBatch(db);
      const promotionDocs: Omit<PromotionRecord, 'id'>[] = [];

      for (const student of students) {
        const decision = decisions[student.id!];
        if (!decision) continue;

        const studentRef = doc(db, 'students', student.id!);
        const toClass =
          decision === 'P' ? nextClass
          : decision === 'D' ? selectedClass
          : selectedClass; // Graduate stays in same class record, just status changes

        if (decision === 'P') {
          batch.update(studentRef, {
            currentClass: toClass,
            admissionStatus: 'active',
          });
        } else if (decision === 'D') {
          batch.update(studentRef, {
            currentClass: toClass,
            admissionStatus: 'active',
          });
        } else if (decision === 'G') {
          batch.update(studentRef, {
            admissionStatus: 'graduated',
          });
        }

        promotionDocs.push({
          studentId: student.id!,
          studentName: student.studentName,
          fromClass: selectedClass,
          toClass: decision === 'G' ? 'GRADUATED' : toClass,
          decision,
          fromSession: CURRENT_SESSION,
          toSession: nextSession,
          createdAt: serverTimestamp(),
          schoolId: schoolId ?? undefined,
        });
      }

      await batch.commit();

      // Write promotion log records atomically in a second batch
      // (Firestore batch limit is 500 — schools typically have < 500 students per class)
      const logBatch = writeBatch(db);
      for (const rec of promotionDocs) {
        logBatch.set(doc(collection(db, 'promotions')), rec);
      }
      await logBatch.commit();

      toast.success(
        `Done! ${promoteCount} promoted · ${detainCount} detained · ${graduateCount} graduated`,
        { id: tid, duration: 5000 }
      );
      setConfirmOpen(false);
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Unknown error'), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (record: PromotionRecord) => {
    const tid = toast.loading('Rolling back promotion…');
    try {
      const studentRef = doc(db, 'students', record.studentId);
      await updateDoc(studentRef, {
        currentClass: record.fromClass,
        admissionStatus: 'active',
      });
      await deleteDoc(doc(db, 'promotions', record.id!));
      toast.success(`Rolled back ${record.studentName} to ${record.fromClass}`, { id: tid });
    } catch (e: any) {
      toast.error('Rollback failed: ' + (e.message || 'Unknown'), { id: tid });
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-indigo-600" />
          Student Promotion
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          End-of-year promotion — mark each student as Promoted, Detained (repeat), or Graduated.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'promote', label: 'Run Promotion', icon: <ArrowRight className="w-4 h-4" /> },
          { id: 'history', label: 'History / Rollback', icon: <History className="w-4 h-4" /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── PROMOTE TAB ── */}
      {activeTab === 'promote' && (
        <>
          {/* Class selector + summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Source Class</label>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px] bg-slate-50 rounded-xl border border-slate-200 px-4 py-2.5">
                <p className="text-xs text-slate-500 font-semibold">Promoted students go to</p>
                <p className="text-sm font-bold text-indigo-700 mt-0.5">
                  {isLastClass ? 'GRADUATED' : nextClass}
                </p>
              </div>
              <div className="flex gap-2">
                {(['P', 'D', 'G'] as Decision[]).map(d => (
                  <button key={d} onClick={() => setAllDecisions(d)}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${DECISION_LABELS[d].color}`}>
                    All → {DECISION_LABELS[d].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Counter pills */}
            {students.length > 0 && (
              <div className="flex gap-3 mt-4 flex-wrap">
                {[
                  { label: 'Promote', count: promoteCount, color: 'bg-emerald-100 text-emerald-700' },
                  { label: 'Detain', count: detainCount, color: 'bg-amber-100 text-amber-700' },
                  { label: 'Graduate', count: graduateCount, color: 'bg-indigo-100 text-indigo-700' },
                  { label: 'Undecided', count: undecidedCount, color: 'bg-rose-100 text-rose-700' },
                ].map(item => (
                  <span key={item.label} className={`px-3 py-1 rounded-full text-xs font-bold ${item.color}`}>
                    {item.count} {item.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Students table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            {loading ? (
              <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                <span className="w-8 h-8 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm">Loading students…</p>
              </div>
            ) : students.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                <Users className="w-12 h-12 opacity-20" />
                <p className="text-sm">No active students found in {selectedClass}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-5 py-3">Student</th>
                      <th className="text-left px-4 py-3">Student ID</th>
                      <th className="text-center px-4 py-3">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map(student => (
                      <motion.tr key={student.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{student.studentName}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{student.studentId}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 justify-center flex-wrap">
                            {(['P', 'D', 'G'] as Decision[]).map(d => (
                              <button key={d}
                                onClick={() => setDecisions(prev => ({ ...prev, [student.id!]: d }))}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                                  decisions[student.id!] === d
                                    ? DECISION_LABELS[d].color + ' shadow-sm'
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                }`}>
                                {DECISION_LABELS[d].icon}
                                {DECISION_LABELS[d].label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Execute button */}
          {students.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={saving || undecidedCount > 0}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50 text-sm"
              >
                <GraduationCap className="w-4 h-4" />
                Execute Promotion ({students.length} students)
              </button>
            </div>
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="font-bold text-slate-800 text-sm">Promotion Log</p>
            <p className="text-xs text-slate-500 mt-0.5">Click Rollback to reverse a promotion and restore the student to their previous class.</p>
          </div>
          {historyLoading ? (
            <div className="py-16 flex justify-center">
              <span className="w-6 h-6 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : promotionHistory.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <History className="w-10 h-10 mx-auto opacity-20 mb-2" />
              <p className="text-sm">No promotion records yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">Student</th>
                    <th className="text-center px-4 py-3">Decision</th>
                    <th className="text-left px-4 py-3">From</th>
                    <th className="text-left px-4 py-3">To</th>
                    <th className="text-left px-4 py-3">Session</th>
                    <th className="text-center px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {promotionHistory.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{rec.studentName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${DECISION_LABELS[rec.decision]?.color || 'text-slate-500'}`}>
                          {DECISION_LABELS[rec.decision]?.label || rec.decision}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{rec.fromClass}</td>
                      <td className="px-4 py-3 text-slate-600">{rec.toClass}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{rec.fromSession} → {rec.toSession}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleRollback(rec)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all mx-auto"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Rollback
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleExecute}
        title="Execute Promotion"
        message={`This will update ${students.length} student records:\n• ${promoteCount} promoted to ${isLastClass ? 'Graduate' : nextClass}\n• ${detainCount} detained in ${selectedClass}\n• ${graduateCount} marked as graduated\n\nThis action can be rolled back from the History tab.`}
        confirmLabel="Execute"
        danger
        loading={saving}
      />
    </div>
  );
}
