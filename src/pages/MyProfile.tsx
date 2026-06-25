/**
 * MyProfile — self-service page where any logged-in account (admin, teacher,
 * parent, accountant, hr, librarian) can upload their own profile picture and
 * edit their display name. Reachable by every role via /profile.
 */
import React, { useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { useStorageSettings } from '../hooks/useStorageSettings';
import { uploadFile } from '../services/storage/uploadFile';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';
import { Camera, Loader2, CloudOff, Save, User as UserIcon } from 'lucide-react';

export default function MyProfile() {
  const { user, profile } = useAuth();
  const schoolId = useSchoolId();
  const { isConnected, loading: storageLoading } = useStorageSettings();
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
    </div>
  );
}
