/**
 * Toast.tsx — Global toast provider & reusable ConfirmDialog
 *
 * Usage:
 *   import toast from 'react-hot-toast';
 *   toast.success('Saved!');
 *   toast.error('Something went wrong.');
 *
 *   <ConfirmDialog open={...} title="..." message="..." onConfirm={fn} onCancel={fn} danger />
 */
import React from 'react';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

// ─── Global Toaster ───────────────────────────────────────────────────────────

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '14px',
          fontWeight: 600,
          fontSize: '0.8125rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          maxWidth: '380px',
        },
        success: {
          style: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
          iconTheme: { primary: '#22c55e', secondary: '#f0fdf4' },
        },
        error: {
          style: { background: '#fff1f2', color: '#9f1239', border: '1px solid #fecdd3' },
          iconTheme: { primary: '#f43f5e', secondary: '#fff1f2' },
        },
        loading: {
          style: { background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe' },
        },
      }}
    />
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, danger = false, loading = false,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl z-10"
          >
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 ${danger ? 'bg-rose-50' : 'bg-amber-50'}`}>
              <AlertTriangle className={`w-7 h-7 ${danger ? 'text-rose-500' : 'text-amber-500'}`} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">{title}</h3>
            <p className="text-slate-500 text-sm text-center leading-relaxed mb-7">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 py-3 text-white font-bold rounded-xl transition-all disabled:opacity-50 ${
                  danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
