/**
 * MyProfile — self-service page where any logged-in account (admin, teacher,
 * parent, accountant, hr, librarian) can upload their own profile picture and
 * edit their display name. Reachable by every role via /profile.
 */
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { useStorageSettings } from '../hooks/useStorageSettings';
import { uploadFile } from '../services/storage/uploadFile';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';
import { Camera, Loader2, CloudOff, Save, User as UserIcon, ArrowLeft, KeyRound, Bell, CheckCircle, MapPin } from 'lucide-react';
import StaffClockWidget from '../components/StaffClockWidget';
import ParentCheckInWidget from '../components/ParentCheckInWidget';

export default function MyProfile() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const schoolId = useSchoolId();
  const { isConnected, loading: storageLoading } = useStorageSettings();
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefs, setPrefs] = useState({
    attendance: profile?.notificationPrefs?.attendance !== false,
    fees: profile?.notificationPrefs?.fees !== false,
    general: profile?.notificationPrefs?.general !== false,
  });

  if (!user || !profile) return null;

  const canUpload = isConnected && !!schoolId;

  const handlePhotoUpload = async (file: File) => {
    if (!canUpload) {
      toast.error('Ask your admin to connect storage in School Settings first.');
      return;
    }
    setUploading(true);
    const tid = toast.loading('Uploading photo…');
    try {
      const result = await uploadFile({ schoolId: schoolId!, file, folder: 'avatars' });
      await updateDoc(doc(db, 'users', user.uid), { photoUrl: result.url });
      toast.success('Photo updated!', { id: tid });
    } catch (e: any) {
      toast.error(e.message || 'Upload failed', { id: tid });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === profile.displayName) return;
    setSavingName(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { displayName: trimmed });
      toast.success('Name updated!');
    } catch (e: any) {
      toast.error(e.message || 'Could not update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (newPass !== confirmPass) { toast.error('Passwords do not match.'); return; }
    setSavingPassword(true);
    try {
      if (user.email && currentPass) {
        const cred = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(user, cred);
      }
      await updatePassword(user, newPass);
      toast.success('Password updated.');
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (err: any) {
      const msg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : err.code === 'auth/weak-password'
        ? 'Password is too weak. Try a longer one with numbers and letters.'
        : err.message || 'Could not update password.';
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleTogglePref = async (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { notificationPrefs: next });
    } catch (e: any) {
      setPrefs(prefs);
      toast.error(e.message || 'Could not save preference.');
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-indigo-600" /> My Profile
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Manage your profile picture and display name.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8">
          <div className="relative shadow-xl shadow-indigo-100 flex-shrink-0 w-fit">
            <Avatar photoUrl={profile.photoUrl} name={profile.displayName} size="xl" rounded="3xl" />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading || !canUpload}
              title={canUpload ? 'Change photo' : 'Connect storage to enable photo uploads'}
              className="absolute inset-0 rounded-3xl bg-black/40 opacity-0 hover:opacity-100 disabled:hover:opacity-0 transition-opacity flex items-center justify-center"
            >
              {uploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-5 h-5 text-white" />}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{profile.displayName}</p>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-indigo-100 capitalize">
              {profile.role.replace('_', ' ')}
            </span>
          </div>
        </div>

        {!storageLoading && !canUpload && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <CloudOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Photo uploads aren't available yet — ask your school admin to connect storage in Settings.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Display Name</label>
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || !displayName.trim() || displayName.trim() === profile.displayName}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-indigo-600" /> Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current password</label>
            <input
              type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">New password</label>
            <input
              type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
              minLength={8} autoComplete="new-password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Confirm new password</label>
            <input
              type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
              autoComplete="new-password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword || !newPass || !confirmPass}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Attendance / Check-In — a GPS-geofenced work clock-in for staff roles,
          or a simple drop-off/pickup log for parents. Doesn't apply to student/applicant. */}
      {profile.role === 'parent' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-sky-600" /> Drop-off / Pickup
          </h2>
          <ParentCheckInWidget />
        </div>
      ) : profile.role !== 'student' && profile.role !== 'applicant' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-emerald-600" /> Attendance Clock-In
          </h2>
          <StaffClockWidget />
        </div>
      ) : null}

      {/* Notification Preferences */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-indigo-600" /> Notification Preferences
        </h2>
        <div className="space-y-3">
          {([
            { key: 'attendance' as const, label: 'Attendance alerts', desc: 'Low attendance and absence-request updates.' },
            { key: 'fees' as const, label: 'Fee reminders', desc: 'Invoice due dates and payment confirmations.' },
            { key: 'general' as const, label: 'General announcements', desc: 'School-wide notices and broadcasts.' },
          ]).map(item => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => handleTogglePref(item.key)}
                disabled={savingPrefs}
                role="switch"
                aria-checked={prefs[item.key]}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                  prefs[item.key] ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  prefs[item.key] ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
