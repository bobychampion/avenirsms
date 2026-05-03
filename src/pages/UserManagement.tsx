import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, orderBy, serverTimestamp, setDoc, where, addDoc, getDocs } from 'firebase/firestore';
import { useSchoolId } from '../hooks/useSchoolId';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Users, Search, Filter, User as UserIcon, CheckCircle2,
  X, AlertCircle, Ban, Power, Loader2, Plus, ChevronRight, Key, UserCheck
} from 'lucide-react';
import { assertNotSuperAdminEmail } from '../utils/superAdminGuard';

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-rose-50 text-rose-700 border-rose-100',
  School_admin: 'bg-purple-50 text-purple-700 border-purple-100',
  teacher: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  parent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  accountant: 'bg-teal-50 text-teal-700 border-teal-100',
  applicant: 'bg-slate-50 text-slate-700 border-slate-100',
};

interface RoleChangeConfirm {
  uid: string;
  displayName: string;
  currentRole: string;
  newRole: string;
}

export default function UserManagement() {
  const schoolId = useSchoolId();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [staffWithoutAccount, setStaffWithoutAccount] = useState<{ id: string; staffName: string; email: string; role: string; pendingPassword: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [roleConfirm, setRoleConfirm] = useState<RoleChangeConfirm | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', displayName: '', role: 'teacher', password: '', confirmPassword: '' });
  const [syncingLinks, setSyncingLinks] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'users'), where('schoolId', '==', schoolId!), orderBy('email'));
    const unsub = onSnapshot(q, snap => {
      const loadedUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      setUsers(loadedUsers);
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'users'));

    // Watch staff — find those without a linked login account
    const qStaff = query(collection(db, 'staff'), where('schoolId', '==', schoolId!));
    const unsubStaff = onSnapshot(qStaff, snap => {
      const orphans = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((s: any) => !s.userId);
      setStaffWithoutAccount(orphans.map((s: any) => ({
        id: s.id,
        staffName: s.staffName,
        email: s.email,
        role: s.role,
        pendingPassword: s.pendingPassword || '',
      })));
    });

    return () => { unsub(); unsubStaff(); };
  }, [schoolId]);

  // Auto-link staff records to existing user accounts by email match.
  // Handles the case where accounts were created manually without going through
  // the "Create login" flow (so userId was never written back to the staff doc).
  const handleSyncLinks = async () => {
    if (!schoolId || !staffWithoutAccount.length) return;
    setSyncingLinks(true);
    const tid = toast.loading('Linking staff to existing accounts…');
    try {
      // Build email → uid map from loaded users
      const emailToUid: Record<string, string> = {};
      users.forEach(u => { if (u.email) emailToUid[u.email.toLowerCase()] = u.uid; });

      let linked = 0;
      for (const s of staffWithoutAccount) {
        const uid = emailToUid[s.email?.toLowerCase() ?? ''];
        if (uid) {
          await updateDoc(doc(db, 'staff', s.id), {
            userId: uid,
            pendingPassword: null,
            updatedAt: serverTimestamp(),
          });
          linked++;
        }
      }
      if (linked > 0) {
        toast.success(`Linked ${linked} staff member${linked > 1 ? 's' : ''} to existing accounts`, { id: tid });
      } else {
        toast('No matching accounts found — use "Create login" for remaining staff', { id: tid });
      }
    } catch (e: any) {
      toast.error('Sync failed: ' + e.message, { id: tid });
    } finally {
      setSyncingLinks(false);
    }
  };

  const handleRoleChange = (u: UserProfile, newRole: string) => {
    if (newRole === u.role) return;
    setRoleConfirm({ uid: u.uid, displayName: u.displayName || u.email, currentRole: u.role, newRole });
  };

  const confirmRoleChange = async () => {
    if (!roleConfirm) return;
    setSavingId(roleConfirm.uid);
    await updateDoc(doc(db, 'users', roleConfirm.uid), { role: roleConfirm.newRole, updatedAt: serverTimestamp() });
    // Update sidebar selection if same user
    if (selectedUser?.uid === roleConfirm.uid) setSelectedUser(prev => prev ? { ...prev, role: roleConfirm.newRole as any } : null);
    setRoleConfirm(null);
    setSavingId(null);
  };

  const toggleDisabled = async (u: UserProfile) => {
    setSavingId(u.uid);
    await updateDoc(doc(db, 'users', u.uid), { disabled: !u.disabled, updatedAt: serverTimestamp() });
    if (selectedUser?.uid === u.uid) setSelectedUser(prev => prev ? { ...prev, disabled: !u.disabled } : null);
    setSavingId(null);
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteForm.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (inviteForm.password !== inviteForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    // Block super-admin emails from being used as school-scoped roles
    try { assertNotSuperAdminEmail(inviteForm.email, inviteForm.role); }
    catch (guardErr: any) { toast.error(guardErr.message); return; }

    setCreatingUser(true);
    const tid = toast.loading(`Creating ${inviteForm.role} account…`);
    try {
      const cred = await createUserWithEmailAndPassword(auth, inviteForm.email, inviteForm.password);
      await updateProfile(cred.user, { displayName: inviteForm.displayName });
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: inviteForm.email,
        displayName: inviteForm.displayName,
        role: inviteForm.role,
        disabled: false,
        schoolId: schoolId ?? 'main',
        createdAt: serverTimestamp(),
      });

      // Check if a staff record already exists with this email — link it instead of duplicating
      const staffRoles = ['teacher', 'admin_staff', 'support', 'accountant'];
      const isStaffRole = staffRoles.includes(inviteForm.role) || inviteForm.role === 'teacher';

      if (isStaffRole) {
        const existingStaffSnap = await getDocs(
          query(collection(db, 'staff'), where('schoolId', '==', schoolId ?? 'main'), where('email', '==', inviteForm.email))
        );

        if (!existingStaffSnap.empty) {
          // Link the existing staff record and clear the stored pending password
          await updateDoc(doc(db, 'staff', existingStaffSnap.docs[0].id), {
            userId: cred.user.uid,
            pendingPassword: null,
            updatedAt: serverTimestamp(),
          });
        } else {
          // No staff record exists — create one
          const staffRole = inviteForm.role === 'teacher' ? 'teacher'
            : inviteForm.role === 'accountant' ? 'admin_staff'
            : inviteForm.role as 'teacher' | 'admin_staff' | 'support';
          await addDoc(collection(db, 'staff'), {
            staffName: inviteForm.displayName,
            email: inviteForm.email,
            role: staffRole,
            basicSalary: 0,
            allowances: 0,
            bankName: '',
            accountNumber: '',
            subject: '',
            qualification: '',
            department: '',
            photoUrl: '',
            userId: cred.user.uid,
            schoolId: schoolId ?? 'main',
            employedAt: serverTimestamp(),
          });
        }
      }

      toast.success(`${inviteForm.role.charAt(0).toUpperCase() + inviteForm.role.slice(1)} account created for ${inviteForm.displayName}!`, { id: tid });
      setShowInviteModal(false);
      setInviteForm({ email: '', displayName: '', role: 'teacher', password: '', confirmPassword: '' });
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use' ? 'Email already in use' :
                  e.code === 'auth/invalid-email' ? 'Invalid email address' :
                  e.message || 'Failed to create account';
      toast.error(msg, { id: tid });
    } finally {
      setCreatingUser(false);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.email.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (filterRole === 'all' || u.role === filterRole)
  );

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">User Management</h1>
          <p className="text-slate-500 mt-1">Manage user accounts, roles and access permissions.</p>
        </div>
        <button onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
          <Plus className="w-4 h-4" /> Create User
        </button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { role: 'all', label: 'All Users', count: users.length },
          { role: 'admin', label: 'Admins', count: roleCounts['admin'] || 0 },
          { role: 'teacher', label: 'Teachers', count: roleCounts['teacher'] || 0 },
          { role: 'parent', label: 'Parents', count: roleCounts['parent'] || 0 },
          { role: 'accountant', label: 'Accountants', count: roleCounts['accountant'] || 0 },
          { role: 'applicant', label: 'Applicants', count: roleCounts['applicant'] || 0 },
        ].map(s => (
          <button key={s.role} onClick={() => setFilterRole(s.role)}
            className={`p-4 rounded-2xl border text-left transition-all ${filterRole === s.role ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <p className={`text-2xl font-bold ${filterRole === s.role ? 'text-indigo-700' : 'text-slate-900'}`}>{s.count}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by name or email..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
        </div>
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white font-medium text-slate-700 text-sm">
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="School_admin">School Admin</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
            <option value="accountant">Accountant</option>
            <option value="applicant">Applicant</option>
          </select>
        </div>
        <p className="text-sm text-slate-400 ml-auto font-medium">{filteredUsers.length} / {users.length} users</p>
      </div>

      {/* Staff without login accounts */}
      {staffWithoutAccount.length > 0 && (() => {
        // Split into: those with a matching user account (just need linking) vs truly no account
        const userEmailSet = new Set(users.map(u => u.email?.toLowerCase()));
        const canAutoLink = staffWithoutAccount.filter(s => userEmailSet.has(s.email?.toLowerCase()));
        const needNewAccount = staffWithoutAccount.filter(s => !userEmailSet.has(s.email?.toLowerCase()));
        return (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm font-bold text-amber-800">
                  {staffWithoutAccount.length} staff member{staffWithoutAccount.length > 1 ? 's' : ''} without a linked login
                </p>
              </div>
              {canAutoLink.length > 0 && (
                <button
                  onClick={handleSyncLinks}
                  disabled={syncingLinks}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {syncingLinks
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <UserCheck className="w-3.5 h-3.5" />}
                  Link {canAutoLink.length} existing account{canAutoLink.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
            {canAutoLink.length > 0 && (
              <p className="text-xs text-amber-700 mb-3">
                <strong>{canAutoLink.length}</strong> staff already have a login account — click "Link" to connect them.
                {needNewAccount.length > 0 && <> <strong>{needNewAccount.length}</strong> still need a new account created.</>}
              </p>
            )}
            {needNewAccount.length > 0 && canAutoLink.length === 0 && (
              <p className="text-xs text-amber-700 mb-3">These staff have no system login. Create an account for them to grant portal access.</p>
            )}
            {needNewAccount.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {needNewAccount.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setInviteForm({
                        email: s.email || '',
                        displayName: s.staffName,
                        role: s.role === 'teacher' ? 'teacher' : s.role === 'admin_staff' ? 'accountant' : 'teacher',
                        password: s.pendingPassword || '',
                        confirmPassword: s.pendingPassword || '',
                      });
                      setShowInviteModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-800 text-xs font-semibold rounded-xl hover:bg-amber-100 transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {s.staffName}
                    <span className="text-amber-500">· Create login</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Table */}
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">User</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" /></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No users found.</td></tr>
                ) : filteredUsers.map(u => (
                  <motion.tr key={u.uid} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => setSelectedUser(u)}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer group ${selectedUser?.uid === u.uid ? 'bg-indigo-50/50' : ''} ${u.disabled ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${u.disabled ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-700'}`}>
                          {u.displayName?.charAt(0) || <UserIcon className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate max-w-[120px]">{u.displayName || 'Unnamed'}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${ROLE_COLORS[u.role] || ROLE_COLORS['applicant']}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {u.disabled
                        ? <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600"><Ban className="w-3 h-3" />Disabled</span>
                        : <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="w-3 h-3" />Active</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <select onClick={e => e.stopPropagation()} value={u.role}
                          onChange={e => handleRoleChange(u, e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                          <option value="applicant">Applicant</option>
                          <option value="teacher">Teacher</option>
                          <option value="parent">Parent</option>
                          <option value="accountant">Accountant</option>
                          <option value="admin">Admin</option>
                          <option value="School_admin">School Admin</option>
                        </select>
                        <button onClick={e => { e.stopPropagation(); toggleDisabled(u); }} title={u.disabled ? 'Enable' : 'Disable'}
                          className={`p-1.5 rounded-lg transition-all ${u.disabled ? 'text-emerald-500 hover:bg-emerald-50' : 'text-rose-400 hover:bg-rose-50'}`}>
                          {savingId === u.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Detail Panel */}
        <div className="lg:col-span-1">
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div key={selectedUser.uid} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 p-6 sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-900">User Details</h3>
                  <button onClick={() => setSelectedUser(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-center mb-6">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-3 ${selectedUser.disabled ? 'bg-slate-100 text-slate-400' : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'}`}>
                    {selectedUser.displayName?.charAt(0) || '?'}
                  </div>
                  <h4 className="font-bold text-slate-900 text-lg">{selectedUser.displayName || 'Unnamed User'}</h4>
                  <p className="text-sm text-slate-500 mt-0.5">{selectedUser.email}</p>
                  {selectedUser.disabled && (
                    <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-full border border-rose-100">
                      <Ban className="w-3 h-3" /> Account Disabled
                    </span>
                  )}
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs text-slate-400 font-bold uppercase">UID</span>
                    <span className="text-xs font-mono text-slate-600 truncate max-w-[140px]">{selectedUser.uid}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs text-slate-400 font-bold uppercase">Role</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${ROLE_COLORS[selectedUser.role] || ROLE_COLORS['applicant']}`}>
                      {selectedUser.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-slate-400 font-bold uppercase">Status</span>
                    <span className={`text-xs font-bold ${selectedUser.disabled ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {selectedUser.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Change Role</label>
                    <select value={selectedUser.role} onChange={e => handleRoleChange(selectedUser, e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium">
                      <option value="applicant">Applicant</option>
                      <option value="teacher">Teacher</option>
                      <option value="parent">Parent</option>
                      <option value="accountant">Accountant</option>
                      <option value="admin">Admin</option>
                      <option value="School_admin">School Admin</option>
                    </select>
                  </div>
                  <button onClick={() => toggleDisabled(selectedUser)}
                    className={`w-full py-2.5 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${
                      selectedUser.disabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    }`}>
                    {savingId === selectedUser.uid ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : selectedUser.disabled ? (
                      <><Power className="w-4 h-4" /> Enable Account</>
                    ) : (
                      <><Ban className="w-4 h-4" /> Disable Account</>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-white rounded-3xl border border-slate-200 border-dashed p-8 text-center">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <UserIcon className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-slate-400 text-sm">Click on a user to view their details and manage access.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Role Change Confirmation Modal */}
      <AnimatePresence>
        {roleConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <Key className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Change Role?</h3>
              <p className="text-slate-500 text-center text-sm mb-2">
                You are changing <span className="font-bold text-slate-800">{roleConfirm.displayName}</span>'s role:
              </p>
              <div className="flex items-center justify-center gap-3 mb-6">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${ROLE_COLORS[roleConfirm.currentRole] || ROLE_COLORS['applicant']}`}>
                  {roleConfirm.currentRole}
                </span>
                <span className="text-slate-400 text-sm">→</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${ROLE_COLORS[roleConfirm.newRole] || ROLE_COLORS['applicant']}`}>
                  {roleConfirm.newRole}
                </span>
              </div>
              <p className="text-xs text-slate-400 text-center mb-6">This will change what the user can access in the system.</p>
              <div className="flex gap-3">
                <button onClick={() => setRoleConfirm(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={confirmRoleChange}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  {savingId ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Change'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create User Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">Create User Account</h3>
                <button onClick={() => setShowInviteModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Full Name</label>
                  <input required type="text" value={inviteForm.displayName}
                    onChange={e => setInviteForm({ ...inviteForm, displayName: e.target.value })}
                    placeholder="e.g. Amaka Okonkwo"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Email Address</label>
                  <input required type="email" value={inviteForm.email}
                    onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Role</label>
                  <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium">
                    <option value="teacher">Teacher</option>
                    <option value="parent">Parent</option>
                    <option value="admin">Admin</option>
                    <option value="School_admin">School Admin</option>
                    <option value="accountant">Accountant</option>
                    <option value="applicant">Applicant</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Password</label>
                  {inviteForm.password && inviteForm.password === inviteForm.confirmPassword && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 mb-2">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      Password pre-filled from bulk import — you can change it if needed
                    </div>
                  )}
                  <input required type="password" value={inviteForm.password}
                    onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Confirm Password</label>
                  <input required type="password" value={inviteForm.confirmPassword}
                    onChange={e => setInviteForm({ ...inviteForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${
                      inviteForm.confirmPassword && inviteForm.password !== inviteForm.confirmPassword
                        ? 'border-rose-300 bg-rose-50'
                        : 'border-slate-200'
                    }`} />
                  {inviteForm.confirmPassword && inviteForm.password !== inviteForm.confirmPassword && (
                    <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Passwords do not match
                    </p>
                  )}
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-700">A Firebase Auth account will be created immediately. Share the credentials with the user.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all">Cancel</button>
                  <button type="submit" disabled={creatingUser || !inviteForm.displayName || inviteForm.password !== inviteForm.confirmPassword}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-60 flex items-center justify-center gap-2">
                    {creatingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create Account
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
