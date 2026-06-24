import React, { useState } from 'react';
import { CloudOff, CloudUpload } from 'lucide-react';
import { useStorageSettings } from '../hooks/useStorageSettings';
import { useSchoolId } from '../hooks/useSchoolId';
import StorageConnectionWizard from './StorageConnectionWizard';

/**
 * Shown to admins when their school has no storage provider connected yet.
 * Renders nothing once connected (or while status is still loading), so it's
 * safe to drop into any admin page (e.g. the Dashboard) without extra guards.
 */
export default function StorageSetupBanner() {
  const schoolId = useSchoolId();
  const { isConnected, loading } = useStorageSettings();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (loading || isConnected || !schoolId) return null;

  return (
    <>
      <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
        <CloudOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">Your school storage is not connected</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Connect storage to upload student photos, admission documents, your school logo, certificates, assignments, and other files.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors whitespace-nowrap"
        >
          <CloudUpload className="w-3.5 h-3.5" /> Connect Cloudinary
        </button>
      </div>

      {wizardOpen && schoolId && (
        <StorageConnectionWizard
          schoolId={schoolId}
          onClose={() => setWizardOpen(false)}
          onConnected={() => setWizardOpen(false)}
        />
      )}
    </>
  );
}
