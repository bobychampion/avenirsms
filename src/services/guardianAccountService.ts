/**
 * guardianAccountService — single implementation of "find (or create) the
 * portal account for a guardian, and attach a child to it".
 *
 * This logic previously existed in three near-identical copies
 * (ApplicationDetail, AdmissionsManagement, StudentProfile), which is how the
 * secondary guardian ended up with no account-creation path at all and how
 * guardian2Email ended up stored un-lowercased while guardianEmail was
 * normalised.
 *
 * Account creation is deliberately OPT-IN (`allowCreate`). A guardian with no
 * email, or one the admin has merely recorded as a contact, must never have
 * Firebase Auth credentials generated for them as a side effect — creation
 * happens only where a human explicitly asked for it (the "Link to portal
 * account" button). At admission we therefore link to an already-existing
 * account when one matches, and otherwise leave the guardian unlinked for
 * someone to link later.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import {
  collection, query, where, getDocs, doc, setDoc, updateDoc,
  arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { assertNotSuperAdminEmail } from '../utils/superAdminGuard';

export interface ResolveGuardianAccountOptions {
  email: string;
  schoolId: string;
  /** Used only when creating: seeds the temp password and the profile name. */
  phone?: string;
  displayName?: string;
  /** When false (the default) an account is never created — only matched. */
  allowCreate?: boolean;
}

export interface ResolvedGuardianAccount {
  /** undefined when no account exists (and none was created). */
  uid?: string;
  /** Only set when this call created the account — show it to the admin once. */
  tempPassword?: string;
  created: boolean;
  /** Human-readable reason the account could not be resolved/created. */
  warning?: string;
}

/** `Parent@<last 4 digits of phone><year>` — matches the long-standing admission format. */
export function makeGuardianTempPassword(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '').slice(-4) || '0000';
  return `Parent@${digits}${new Date().getFullYear()}`;
}

export function normalizeGuardianEmail(email?: string): string {
  return (email || '').trim().toLowerCase();
}

export async function resolveGuardianAccount(
  opts: ResolveGuardianAccountOptions,
): Promise<ResolvedGuardianAccount> {
  const email = normalizeGuardianEmail(opts.email);
  if (!email || !opts.schoolId) return { created: false };

  // A reserved super-admin address must never be turned into a parent account.
  assertNotSuperAdminEmail(email, 'parent');

  const existing = await getDocs(query(
    collection(db, 'users'),
    where('schoolId', '==', opts.schoolId),
    where('email', '==', email),
  ));
  if (!existing.empty) return { uid: existing.docs[0].id, created: false };

  if (!opts.allowCreate) {
    return { created: false, warning: 'No existing portal account for this email.' };
  }

  // Create through a secondary Firebase app so the admin's own session is not
  // replaced by the newly created user's session.
  const tempPassword = makeGuardianTempPassword(opts.phone);
  try {
    const secondaryApp = getApps().find(a => a.name === 'parent-creator')
      || initializeApp(firebaseConfig as any, 'parent-creator');
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    await firebaseSignOut(secondaryAuth);
    return { uid: cred.user.uid, tempPassword, created: true };
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      // Auth credential exists but no users/ profile in this school — we can't
      // read the uid client-side, so surface it rather than failing silently.
      return {
        created: false,
        warning: `A login already exists for ${email} but it has no parent profile in this school. Ask a super admin to link it.`,
      };
    }
    return { created: false, warning: err?.message || 'Could not create the portal account.' };
  }
}

/**
 * Ensures users/{uid} lists this child.
 *
 * `isNew` comes from resolveGuardianAccount().created and tells us whether the
 * profile doc exists yet — deliberately avoiding a getDoc() probe, because a
 * get() on a non-existent users/ doc evaluates the read rule against a null
 * `resource` and can be denied outright rather than returning "not found".
 * When an account was matched (not created) we know the doc exists, because
 * that is exactly what we queried the users collection for.
 */
export async function attachChildToGuardianProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  schoolId: string;
  isNew: boolean;
  student: { id: string; studentName: string; currentClass: string };
}): Promise<void> {
  const { uid, email, displayName, schoolId, isNew, student } = params;
  const childEntry = {
    studentId: student.id,
    studentName: student.studentName,
    currentClass: student.currentClass,
  };
  const ref = doc(db, 'users', uid);
  if (isNew) {
    await setDoc(ref, {
      uid,
      email: normalizeGuardianEmail(email),
      role: 'parent',
      displayName: displayName || email,
      schoolId,
      linkedStudentIds: [student.id],
      linkedChildren: [childEntry],
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      linkedStudentIds: arrayUnion(student.id),
      linkedChildren: arrayUnion(childEntry),
    });
  }
}
