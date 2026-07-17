import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './FirebaseProvider';
import {
  validateDeletion,
  deleteSchool,
  type ValidationResult,
  type DeletionResult,
} from '../services/schoolDeletionService';

interface Props {
  schoolId: string;
  schoolName: string;
  onClose: () => void;
  /** Called once the school has been fully deleted, so the caller can navigate away / refresh its list. */
  onDeleted: () => void;
}

/**
 * Confirmation + progress modal for permanently deleting a school.
 * Deletion itself runs as a single server-side Cloud Function call (it also
 * removes Firebase Auth accounts, which the client SDK cannot do), so there's
 * no live per-collection progress — just a spinner while it runs, then a
 * summary or error.
 */
export default function DeleteSchoolModal({ schoolId, schoolName, onClose, onDeleted }: Props) {
  const { user } = useAuth();
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [preserveFinancial, setPreserveFinancial] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<DeletionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    validateDeletion(schoolId).then((v) => {
      if (!cancelled) {
        setValidation(v);
        setValidating(false);
      }
    });
    return () => { cancelled = true; };
  }, [schoolId]);

  const canDelete =
    !!validation?.isValid &&
    confirmText.trim() === schoolName.trim() &&
    understood &&
    !deleting;

  const handleDelete = async () => {
    if (!canDelete || !user) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteSchool({ schoolId, preserveFinancial, performedBy: user.uid });
      setResult(res);
      if (res.success) {
        toast.success(`${schoolName} has been permanently deleted.`);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to delete school.');
    } finally {
      setDeleting(false);
    }
  };

  const docEntries: Array<[string, number]> = validation ? Object.entries(validation.estimatedDocumentCounts) : [];
  const totalDocs = docEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" /> Delete School
            </h2>
            {!deleting && (
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>

          <div className="p-5 space-y-4">
            {result ? (
              // ── Result screen ──────────────────────────────────────────────
              <div className="space-y-3">
                {result.success ? (
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-5 h-5" /> Deletion complete
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-rose-700 font-semibold">
                    <XCircle className="w-5 h-5" /> Completed with errors
                  </div>
                )}
                <div className="text-sm text-slate-600 space-y-1">
                  <p>{result.summary.totalDocumentsDeleted} document(s) deleted across {Object.keys(result.summary.deletionsByCollection).length} collection(s).</p>
                  <p>{result.summary.authAccountsDeleted} login account(s) removed.</p>
                  {result.summary.preservedCollections.length > 0 && (
                    <p>Financial records preserved (marked deleted, not removed).</p>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 space-y-1">
                    {result.errors.map((e, i) => (
                      <p key={i}><strong>{e.collection}:</strong> {e.error}</p>
                    ))}
                  </div>
                )}
                <button
                  onClick={onDeleted}
                  className="w-full mt-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              // ── Confirmation screen ────────────────────────────────────────
              <>
                <p className="text-sm text-slate-600">
                  This permanently deletes <strong>{schoolName}</strong> — all students, staff, records, and
                  login accounts. This <strong>cannot be undone</strong>.
                </p>

                {validating ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Checking school data…
                  </div>
                ) : validation && !validation.isValid ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700 space-y-1">
                    {validation.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-800 mb-1">{totalDocs} document(s) will be removed:</p>
                    <div className="max-h-28 overflow-y-auto space-y-0.5 text-xs">
                      {docEntries.map(([col, count]) => (
                        <div key={col} className="flex justify-between">
                          <span>{col}</span><span className="font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={preserveFinancial}
                    onChange={(e) => setPreserveFinancial(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Preserve financial records (invoices, payments, expenses) for audit purposes
                </label>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Type <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{schoolName}</span> to confirm
                  </label>
                  <input
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    disabled={deleting}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    disabled={deleting}
                    className="rounded border-slate-300"
                  />
                  I understand this action is irreversible
                </label>

                {error && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">{error}</div>
                )}

                <button
                  onClick={handleDelete}
                  disabled={!canDelete}
                  className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  {deleting ? 'Deleting…' : 'Permanently Delete School'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
