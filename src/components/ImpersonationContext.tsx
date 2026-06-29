/**
 * ImpersonationContext — Super Admin "View As" (read-only impersonation).
 *
 * Mirrors the shape of SuperAdminContext: a transient, client-side session
 * that lets a super_admin preview a non-admin user's dashboard. It never
 * mints a Firebase custom auth token and never changes request.auth.uid —
 * the super_admin remains the real authenticated identity for every
 * Firestore rule evaluation.
 *
 * No Cloud Function is involved (this needs to work on the free Spark
 * plan, which cannot deploy Cloud Functions at all). Instead, the client
 * writes its own audit entry directly to impersonation_logs, and
 * firestore.rules is the sole server-side enforcement: it rejects sessions
 * naming an admin/super_admin/disabled target, requires the actor field to
 * match the real signed-in uid, and only allows the owning super_admin to
 * flip endedAt/endReason once. A forged client (e.g. via the browser
 * console) cannot bypass this — the rules, not this file, are the
 * authority.
 *
 * Sessions are time-boxed (30 min) and persisted to sessionStorage so a
 * page refresh doesn't silently drop the audit trail, while a closed tab
 * naturally ends the session.
 *
 * SPARK-PLAN-TODO: once this project is on the Blaze plan, consider moving
 * start/end back to onCall Cloud Functions (startImpersonation/
 * endImpersonation, removed in this commit — see git history). Worth it if
 * this ever grows beyond "read-only view as" into something needing the
 * Admin SDK (e.g. minting a real custom token for a full "Act As" mode).
 * Not required for correctness — firestore.rules is fully sufficient for
 * the current read-only design.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types';
import { useAuth } from './FirebaseProvider';
import { setImpersonationActive } from '../utils/impersonationGuard';

const BLOCKED_TARGET_ROLES = new Set(['admin', 'School_admin', 'super_admin']);

const SESSION_DURATION_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'avenir_impersonation_session';

export interface ImpersonatedProfile {
  uid: string;
  role: UserProfile['role'];
  schoolId: string | null;
  displayName: string;
  email: string;
}

interface StoredSession {
  logId: string;
  expiresAt: number;
  targetProfile: ImpersonatedProfile;
}

interface ImpersonationContextType {
  impersonatedProfile: ImpersonatedProfile | null;
  isImpersonating: boolean;
  expiresAt: number | null;
  startImpersonation: (targetUid: string) => Promise<void>;
  endImpersonation: (reason: 'manual' | 'timeout') => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredSession = JSON.parse(raw);
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { user, profile, isSuperAdmin } = useAuth();
  const [session, setSession] = useState<StoredSession | null>(readStoredSession);

  useEffect(() => {
    setImpersonationActive(!!session);
  }, [session]);

  // Defensive: if the real signed-in user is ever not a super_admin while a
  // session is active (e.g. logout/login as a different account), drop it.
  useEffect(() => {
    if (!isSuperAdmin && session) {
      sessionStorage.removeItem(STORAGE_KEY);
      setSession(null);
    }
  }, [isSuperAdmin, session]);

  const endImpersonation = useCallback(async (reason: 'manual' | 'timeout') => {
    const current = session;
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
    if (!current) return;
    try {
      await updateDoc(doc(db, 'impersonation_logs', current.logId), {
        endedAt: serverTimestamp(),
        endReason: reason,
      });
    } catch (error) {
      console.error('Failed to record impersonation end:', error);
    }
  }, [session]);

  // Auto-expiry timer
  useEffect(() => {
    if (!session) return;
    const msLeft = session.expiresAt - Date.now();
    if (msLeft <= 0) {
      endImpersonation('timeout');
      return;
    }
    const timer = setTimeout(() => endImpersonation('timeout'), msLeft);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const startImpersonation = useCallback(async (targetUid: string) => {
    if (!user || !profile) throw new Error('Sign-in required.');

    const targetSnap = await getDoc(doc(db, 'users', targetUid));
    const target = targetSnap.data();
    if (!target) throw new Error('User profile not found.');
    if (BLOCKED_TARGET_ROLES.has(target.role)) {
      throw new Error('Admin and super admin accounts cannot be impersonated.');
    }
    if (target.disabled) {
      throw new Error('Cannot view as a disabled account.');
    }

    // The client-side checks above are a fast-fail UX nicety only — the
    // authoritative check is firestore.rules' targetIsImpersonatable(),
    // which re-reads the target doc server-side before allowing this write.
    const logRef = await addDoc(collection(db, 'impersonation_logs'), {
      superAdminUid: user.uid,
      superAdminEmail: profile.email ?? null,
      targetUid,
      targetEmail: target.email ?? null,
      targetRole: target.role ?? null,
      targetSchoolId: target.schoolId ?? null,
      startedAt: serverTimestamp(),
      endedAt: null,
      endReason: null,
    });

    const targetProfile: ImpersonatedProfile = {
      uid: targetUid,
      role: target.role,
      schoolId: target.schoolId ?? null,
      displayName: target.displayName ?? '',
      email: target.email ?? '',
    };
    const newSession: StoredSession = {
      logId: logRef.id,
      expiresAt: Date.now() + SESSION_DURATION_MS,
      targetProfile,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
  }, [user, profile]);

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedProfile: session?.targetProfile ?? null,
        isImpersonating: !!session,
        expiresAt: session?.expiresAt ?? null,
        startImpersonation,
        endImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return ctx;
}
