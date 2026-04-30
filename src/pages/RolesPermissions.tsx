/**
 * Admin UI for managing user roles and per-user permission overrides.
 *
 * Phase 4b: lists all users in the admin's school, lets them change a user's
 * role and toggle individual permission grants. Every change is recorded in
 * the audit_log via auditLog.ts.
 *
 * Mounted at /admin/roles. Visible only to admin / school_admin (route guard
 * in App.tsx). Super admin can use it cross-school via SuperAdminContext.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, query, where, onSnapshot, updateDoc, arrayUnion, arrayRemove,
  setDoc, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { useSchool } from '../components/SchoolContext';
import { UserProfile } from '../types';
import {
  DEFAULT_ROLE_PERMISSIONS, grantablePermissions, type Permission,
} from '../utils/permissions';
import { logRoleChange, logPermissionChange, writeAuditLog } from '../utils/auditLog';
import {
  buildStudentLoginEmail, generateStudentTempPassword, upsertStudentLoginIndex,
} from '../utils/studentAccount';
import { useSchoolSettings } from './SchoolSettings';
import { ShieldCheck, Search, Check, X, History, KeyRound, Copy, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const ASSIGNABLE_ROLES: UserProfile['role'][] = [
  'admin', 'School_admin', 'teacher', 'parent', 'student',
  'accountant', 'hr', 'librarian', 'staff', 'applicant',
];

// ── Confirm + Credentials modals ──────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700">Confirm</button>
        </div>
      </div>
    </div>
  );
}

interface CredentialsModalProps {
  displayName: string;
  login: string;
  password: string;
  onClose: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="ml-2 p-1 rounded hover:bg-indigo-100 text-indigo-600 transition-colors" title="Copy">
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CredentialsModal({ displayName, login, password, onClose }: CredentialsModalProps) {
  const full = `Login: ${login}\nTemporary password: ${password}`;
  const [copiedAll, setCopiedAll] = useState(false);
  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(full);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">Login re-provisioned</h2>
        </div>
        <p className="text-sm text-slate-600">
          New credentials for <strong>{displayName}</strong>. Share these with the student/family —
          they'll be prompted to set a new password on first sign-in.
        </p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">New login</p>
              <p className="text-sm font-mono text-slate-900 select-all break-all">{login}</p>
            </div>
            <CopyButton value={login} />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Temporary password</p>
              <p className="text-sm font-mono text-slate-900 select-all">{password}</p>
            </div>
            <CopyButton value={password} />
          </div>
        </div>
        <div className="flex justify-between items-center pt-1">
          <button onClick={handleCopyAll} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline">
            {copiedAll ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedAll ? 'Copied!' : 'Copy both'}
          </button>
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RolesPermissions() {
  const { profile: actor } = useAuth();
  const { schoolId } = useSchool();
  const { settings: schoolSettings } = useSchoolSettings();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [credentialsModal, setCredentialsModal] = useState<{ displayName: string; login: string; password: string } | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('schoolId', '==', schoolId)),
      snap => setUsers(snap.docs.map(d => ({ uid: d.id, ...(d.data() as UserProfile) }))),
      err => console.error('Users subscription error:', err),
    );
    return () => unsub();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, 'audit_log'), where('schoolId', '==', schoolId)),
      snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setAuditEntries(rows.slice(0, 50));
      },
      () => setAuditEntries([]),
    );
    return () => unsub();
  }, [schoolId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.email?.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const selectedUser = users.find(u => u.uid === selectedUid) ?? null;

  const changeRole = async (target: UserProfile, newRole: UserProfile['role']) => {
    if (!actor || target.role === newRole) return;
    if (target.role === 'super_admin' || newRole === 'super_admin') {
      toast.error('Super admin promotions must be done from the platform dashboard.');
      return;
    }
    setConfirmModal({
      title: 'Change role',
      message: `Change ${target.email}'s role from ${target.role} to ${newRole}?`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await updateDoc(doc(db, 'users', target.uid), { role: newRole });
          await logRoleChange(actor, { uid: target.uid, email: target.email, schoolId: target.schoolId }, target.role, newRole);
          toast.success(`Role updated: ${target.email} → ${newRole}`);
        } catch (err: any) {
          toast.error(`Could not update role: ${err.message || err.code}`);
        }
      },
    });
  };

  /**
   * Re-provision approach: creates a fresh Firebase Auth account with a new
   * synthetic email (timestamp suffix keeps it unique), updates the user's
   * Firestore profile to point to the new UID, then shows the admin the new
   * credentials. Works entirely client-side — no Cloud Functions needed.
   * The old Auth account becomes orphaned (harmless; clean from Firebase
   * Console occasionally).
   */
  const resetPassword = (target: UserProfile) => {
    if (!actor || !target.syntheticLogin) return;
    const studentIdHint = target.linkedStudentIds?.[0] ?? target.uid;
    const newPassword = generateStudentTempPassword(studentIdHint + Date.now());
    const suffix = Date.now().toString(36);
    const newEmail = buildStudentLoginEmail(`${studentIdHint}-${suffix}`, schoolSettings);

    setConfirmModal({
      title: `Re-provision login for ${target.displayName || target.email}?`,
      message:
        `New login:\n  ${newEmail}\n\nNew temporary password:\n  ${newPassword}\n\n` +
        `Share these with the student/family. They'll be prompted to set a new password on first sign-in.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const secondaryApp = getApps().find(a => a.name === 'reset-creator')
            || initializeApp(firebaseConfig as any, 'reset-creator');
          const secondaryAuth = getAuth(secondaryApp);
          const cred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
          const newUid = cred.user.uid;
          await firebaseSignOut(secondaryAuth);

          // Write new users/{newUid} profile mirroring the old one
          const { uid: _old, email: _oldEmail, ...rest } = target;
          await setDoc(doc(db, 'users', newUid), {
            ...rest,
            uid: newUid,
            email: newEmail,
            mustChangePassword: true,
            syntheticLogin: true,
            createdAt: serverTimestamp(),
          });

          // Mark old profile disabled so it can't be used
          await updateDoc(doc(db, 'users', target.uid), { disabled: true });

          // Update linked student doc(s) so the login lookup works
          const linkedId = target.linkedStudentIds?.[0];
          if (linkedId) {
            // Try direct doc update first (if we know the Firestore student doc ID)
            try {
              await updateDoc(doc(db, 'students', linkedId), { loginEmail: newEmail });
            } catch {
              // Fallback: query by studentId field
              const snap = await getDocs(
                query(collection(db, 'students'), where('studentId', '==', linkedId))
              );
              for (const d of snap.docs) {
                await updateDoc(d.ref, { loginEmail: newEmail });
              }
            }
            // Keep student_logins index in sync
            if (target.schoolId) {
              await upsertStudentLoginIndex(db, target.schoolId, linkedId, newEmail).catch(console.warn);
            }
          }

          await writeAuditLog(actor, {
            action: 'password.reset',
            targetUserId: target.uid,
            targetUserEmail: target.email,
            schoolId: target.schoolId,
            details: { newUid, newEmail },
          });

          toast.success('Credentials re-provisioned.');
          setCredentialsModal({
            displayName: target.displayName || target.email || target.uid,
            login: newEmail,
            password: newPassword,
          });
        } catch (err: any) {
          console.error('Password reset failed:', err);
          toast.error(err.message || 'Could not re-provision login.');
        }
      },
    });
  };

  const togglePermission = async (target: UserProfile, perm: Permission) => {
    if (!actor) return;
    const has = target.permissions?.includes(perm) ?? false;
    try {
      await updateDoc(doc(db, 'users', target.uid), {
        permissions: has ? arrayRemove(perm) : arrayUnion(perm),
      });
      await logPermissionChange(actor, { uid: target.uid, email: target.email, schoolId: target.schoolId }, perm, !has);
      toast.success(has ? `Revoked ${perm}` : `Granted ${perm}`);
    } catch (err: any) {
      toast.error(`Could not update permission: ${err.message || err.code}`);
    }
  };

  return (
    <>
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {credentialsModal && (
        <CredentialsModal
          displayName={credentialsModal.displayName}
          login={credentialsModal.login}
          password={credentialsModal.password}
          onClose={() => setCredentialsModal(null)}
        />
      )}
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Administration</p>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-indigo-600" /> Roles & Permissions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Change a user's role or grant extra capabilities beyond the role default.
          Every change is recorded in the audit log.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User list */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search users by name, email or role..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">User</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-right px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.uid} className={`border-t border-slate-100 hover:bg-slate-50 ${selectedUid === u.uid ? 'bg-indigo-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{u.displayName || u.email}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={e => changeRole(u, e.target.value as UserProfile['role'])}
                        className="px-2 py-1 rounded-md border border-slate-200 text-xs font-bold bg-white"
                        disabled={u.role === 'super_admin'}
                      >
                        {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        {u.role === 'super_admin' && <option value="super_admin">super_admin</option>}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedUid(u.uid)}
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        Permissions
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-12 text-sm text-slate-400 italic">No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Permission editor */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900">Permission Overrides</h2>
          {!selectedUser ? (
            <p className="mt-2 text-xs text-slate-500">Select a user to edit their permissions.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <p className="text-sm font-bold text-indigo-900">{selectedUser.displayName || selectedUser.email}</p>
                <p className="text-xs text-indigo-700">Role: <strong>{selectedUser.role}</strong></p>
                {selectedUser.syntheticLogin && (
                  <p className="mt-1 text-[11px] text-indigo-700/80">
                    School-issued login (no real inbox) — reset below if they forget their password.
                  </p>
                )}
                {selectedUser.syntheticLogin && (
                  <button
                    onClick={() => resetPassword(selectedUser)}
                    className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Re-provision login
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Inherited from role</p>
                <div className="flex flex-wrap gap-1">
                  {(DEFAULT_ROLE_PERMISSIONS[selectedUser.role] ?? []).map(p => (
                    <span key={p} className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{p}</span>
                  ))}
                  {(DEFAULT_ROLE_PERMISSIONS[selectedUser.role] ?? []).length === 0 && (
                    <span className="text-xs text-slate-400 italic">No defaults.</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Extra grants</p>
                <ul className="space-y-1.5">
                  {grantablePermissions(selectedUser.role).map(p => {
                    const granted = selectedUser.permissions?.includes(p) ?? false;
                    return (
                      <li key={p}>
                        <button
                          onClick={() => togglePermission(selectedUser, p)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                            granted
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'
                          }`}
                        >
                          <span className="text-xs font-mono font-bold">{p}</span>
                          {granted ? <Check className="w-4 h-4" /> : <X className="w-4 h-4 opacity-30" />}
                        </button>
                      </li>
                    );
                  })}
                  {grantablePermissions(selectedUser.role).length === 0 && (
                    <li className="text-xs text-slate-400 italic">This role already has all available permissions.</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Audit log */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Recent RBAC changes</h2>
          <span className="text-xs text-slate-400">(last 50)</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {auditEntries.length === 0 ? (
            <li className="p-6 text-center text-xs text-slate-400 italic">No audit entries yet.</li>
          ) : auditEntries.map(e => (
            <li key={e.id} className="px-4 py-3 text-sm flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                e.action.startsWith('role') ? 'bg-indigo-100 text-indigo-700'
                : e.action.startsWith('permission.grant') ? 'bg-emerald-100 text-emerald-700'
                : e.action.startsWith('permission.revoke') ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-600'
              }`}>{e.action}</span>
              <p className="flex-1 text-slate-700">
                <strong>{e.actorEmail}</strong> → {e.targetUserEmail || e.targetUserId}
                {e.details?.from && e.details?.to && (
                  <span className="text-slate-500"> ({e.details.from} → {e.details.to})</span>
                )}
                {e.details?.permission && (
                  <span className="text-slate-500"> ({e.details.permission})</span>
                )}
              </p>
              <span className="text-[10px] text-slate-400">
                {e.createdAt?.toDate?.().toLocaleString() ?? ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
    </>
  );
}
