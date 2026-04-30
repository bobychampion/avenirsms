/**
 * useOnboarding
 *
 * Detects whether the school has completed onboarding.
 * Onboarding is considered incomplete when:
 *   - school_settings doc doesn't exist yet, OR
 *   - onboardingComplete !== true AND schoolName is still the default
 *
 * Exposes helpers to advance / complete the wizard.
 */
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { defaultSettings } from '../pages/SchoolSettings';

export type OnboardingStep = 'settings' | 'import' | 'done';

export interface OnboardingState {
  needed: boolean;
  loading: boolean;
  currentStep: OnboardingStep;
  settingsDone: boolean;
  importDone: boolean;
  markSettingsDone: () => Promise<void>;
  markImportDone: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  dismiss: () => void;
}

export function useOnboarding(schoolId: string | null): OnboardingState {
  const [needed, setNeeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsDone, setSettingsDone] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }

    // Check session-level dismiss first (don't re-show after user closes)
    const sessionKey = `onboarding_dismissed_${schoolId}`;
    if (sessionStorage.getItem(sessionKey)) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'school_settings', schoolId));
        if (!snap.exists()) {
          setNeeded(true);
        } else {
          const data = snap.data();
          if (data.onboardingComplete) {
            setNeeded(false);
          } else {
            // Still default name = hasn't been configured
            const isDefault = !data.schoolName || data.schoolName === defaultSettings.schoolName;
            setNeeded(isDefault || !data.onboardingComplete);
            setSettingsDone(!!data.onboardingSettingsDone);
            setImportDone(!!data.onboardingImportDone);
          }
        }
      } catch {
        // If we can't read, don't block the user
        setNeeded(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId]);

  const currentStep: OnboardingStep = !settingsDone ? 'settings' : !importDone ? 'import' : 'done';

  const markSettingsDone = async () => {
    if (!schoolId) return;
    await updateDoc(doc(db, 'school_settings', schoolId), {
      onboardingSettingsDone: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    setSettingsDone(true);
  };

  const markImportDone = async () => {
    if (!schoolId) return;
    await updateDoc(doc(db, 'school_settings', schoolId), {
      onboardingImportDone: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    setImportDone(true);
  };

  const completeOnboarding = async () => {
    if (!schoolId) return;
    await updateDoc(doc(db, 'school_settings', schoolId), {
      onboardingComplete: true,
      onboardingSettingsDone: true,
      onboardingImportDone: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    setNeeded(false);
  };

  const dismiss = () => {
    if (schoolId) sessionStorage.setItem(`onboarding_dismissed_${schoolId}`, '1');
    setDismissed(true);
    setNeeded(false);
  };

  return {
    needed: needed && !dismissed,
    loading,
    currentStep,
    settingsDone,
    importDone,
    markSettingsDone,
    markImportDone,
    completeOnboarding,
    dismiss,
  };
}
