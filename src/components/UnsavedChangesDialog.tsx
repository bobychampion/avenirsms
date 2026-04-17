/**
 * UnsavedChangesDialog
 *
 * A confirmation modal rendered when the user tries to navigate away
 * from a page that has unsaved changes.  Pair with useUnsavedChanges().
 *
 * Usage:
 *   import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
 *   import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
 *
 *   const { blocker } = useUnsavedChanges(isDirty);
 *   // …
 *   <UnsavedChangesDialog blocker={blocker} />
 */
import React from 'react';
import { Blocker } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Save } from 'lucide-react';

interface Props {
  blocker: Blocker;
  /** Override the default heading */
  title?: string;
  /** Override the default body text */
  message?: string;
  /** Label for the "leave anyway" button */
  discardLabel?: string;
  /** Label for the "stay" button */
  stayLabel?: string;
}

export default function UnsavedChangesDialog({
  blocker,
  title = 'Unsaved Changes',
  message = 'You have unsaved changes on this page. If you leave now they will be lost.',
  discardLabel = 'Leave without saving',
  stayLabel = 'Stay and continue editing',
}: Props) {
  if (blocker.state !== 'blocked') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Icon + heading */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Tip */}
        <div className="flex items-start gap-2 bg-slate-50 rounded-xl px-4 py-3 mb-6 border border-slate-100">
          <Save className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Tip:</strong> Use the <strong className="text-slate-700">Save</strong> button
            on the page before navigating away to keep your changes.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => blocker.proceed?.()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {discardLabel}
          </button>
          <button
            onClick={() => blocker.reset?.()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            {stayLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
