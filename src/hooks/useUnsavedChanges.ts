/**
 * useUnsavedChanges
 *
 * Detects unsaved form changes and:
 *  1. Intercepts browser back / close / refresh (beforeunload)
 *  2. Intercepts React Router v6 navigation (blocker API)
 *
 * Usage:
 *   const { blocker } = useUnsavedChanges(isDirty);
 *   // Then render <UnsavedChangesDialog blocker={blocker} /> in your JSX.
 */
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChanges(isDirty: boolean) {
  // 1. Native browser close / refresh guard
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 2. React Router navigation blocker
  const blocker = useBlocker(isDirty);

  return { blocker };
}
