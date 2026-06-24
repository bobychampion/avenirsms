/**
 * useStorageSettings — live connection status for the active school's
 * storage provider (storage_settings/{schoolId}). Never exposes any secret —
 * that document intentionally only contains non-sensitive metadata.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { StorageSettings } from '../types';
import { useSchoolId } from './useSchoolId';

export function useStorageSettings() {
  const schoolId = useSchoolId();
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) { setSettings(null); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'storage_settings', schoolId),
      snap => {
        setSettings(snap.exists() ? (snap.data() as StorageSettings) : null);
        setLoading(false);
      },
      () => { setSettings(null); setLoading(false); }
    );
    return () => unsub();
  }, [schoolId]);

  const isConnected = settings?.status === 'connected';
  return { settings, isConnected, loading };
}
