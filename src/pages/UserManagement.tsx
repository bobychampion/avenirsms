import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, orderBy, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Search, Filter, Mail, User as UserIcon, CheckCircle2,
  X, AlertCircle, Ban, Power, Edit2, Loader2, Plus, Trash2, ChevronRight, Key
} from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-rose-50 text-rose-700 border-rose-100',
  School_admin: 'bg-purple-50 text-purple-700 border-purple-100',
  teacher: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  parent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  applicant: 'bg-slate-50 text-slate-700 border-slate-100',
};

interface RoleChangeConfirm {
  uid: string;
  displayName: string;
  currentRole: string;
  newRole: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [roleConfirm, setRoleConfirm] = useState<RoleChangeConfirm | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', displayName: '', role: 'teacher' });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('email'));
    const unsub = onSnapshot(q, snap => {
      // FIX: use doc.id for uid
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'users'));
    return () => unsub();
  }, []);

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
    // Creates a placeholder profile; actual auth would be done via Firebase Admin SDK or email invite
    await addDoc(collection(db, 'user_invites'), {
      ...inviteForm,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    setShowInviteModal(false);
    setInviteForm({ email: '', displayName: '', role: 'teacher' });
    alert(`Invitation queued for ${inviteForm.email}. They will receive an email to set up their account.`);
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
          <Plus className="w-4 h-4" /> Invite User
        </button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { role: 'all', label: 'All Users', count: users.length },
          { role: 'admin', label: 'Admins', count: roleCounts['admin'] || 0 },
          { role: 'teacher', label: 'Teachers', count: roleCounts['teacher'] || 0 },
          { role: 'parent', label: 'Parents', count: roleCounts['parent'] || 0 },
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
            <option value="applicant">Applicant</option>
          </select>
        </div>
        <p className="text-sm text-slate-400 ml-auto font-medium">{filteredUsers.length} / {users.length} users</p>
      </div>

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

      {/* Invite User Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">Invite New User</h3>
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
                    <option value="applicant">Applicant</option>
                  </select>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">An invitation record will be queued. Full email invite requires Firebase Auth Admin SDK setup on the backend.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all">Cancel</button>
                  <button type="submit"
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                    Send Invitation
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
