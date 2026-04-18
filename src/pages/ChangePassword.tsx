/**
 * Force-change-password screen. Mounted at /change-password and reached via
 * the ProtectedRoute gate whenever `profile.mustChangePassword` is true —
 * e.g. right after a student's synthetic login is provisioned, or after an
 * admin-triggered reset. Clears the flag on success and lets the user
 * continue to their role's dashboard.
 */
import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { getPostAuthHomePath } from '../utils/postAuthRedirect';
import { KeyRound, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChangePassword() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (newPass.length < 8) return toast.error('Password must be at least 8 characters.');
    if (newPass !== confirmPass) return toast.error('Passwords do not match.');

    setSaving(true);
    try {
      if (user.email && currentPass) {
        const cred = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(user, cred);
      }
      await updatePassword(user, newPass);
      await updateDoc(doc(db, 'users', user.uid), { mustChangePassword: false });
      toast.success('Password updated.');
      // Full reload so FirebaseProvider re-fetches the profile with mustChangePassword: false,
      // preventing ProtectedRoute from redirecting back here in a loop.
      const dest = getPostAuthHomePath(isAdmin, { ...profile, mustChangePassword: false });
      window.location.href = dest;
    } catch (err: any) {
      console.error('Password change failed:', err);
      const msg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : err.code === 'auth/weak-password'
        ? 'Password is too weak. Try a longer one with numbers and letters.'
        : err.message || 'Could not update password.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!user || !profile) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Set a new password</h1>
            <p className="text-xs text-slate-500">You must change your temporary password before continuing.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current (temporary) password</label>
            <input
              type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)}
              required autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">New password</label>
            <input
              type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
              required minLength={8} autoComplete="new-password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-400">At least 8 characters.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Confirm new password</label>
            <input
              type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
              required autoComplete="new-password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <button
            type="submit" disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
