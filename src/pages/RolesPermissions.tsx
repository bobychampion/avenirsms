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
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { useSchool } from '../components/SchoolContext';
import { UserProfile } from '../types';
import {
  DEFAULT_ROLE_PERMISSIONS, grantablePermissions, type Permission,
} from '../utils/permissions';
import { logRoleChange, logPermissionChange, writeAuditLog } from '../utils/auditLog';
import { ShieldCheck, Search, Check, X, History } from 'lucide-react';
import toast from 'react-hot-toast';

const ASSIGNABLE_ROLES: UserProfile['role'][] = [
  'admin', 'School_admin', 'teacher', 'parent',
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function RolesPermissions() {
  const { profile: actor } = useAuth();
  const { schoolId } = useSchool();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

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
