import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Staff, LeaveRequest, SUBJECTS } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Briefcase, Plus, X, Edit2, Trash2, Mail, Phone, DollarSign, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import { formatNaira } from '../types';

const ROLES: Staff['role'][] = ['teacher', 'admin_staff', 'support'];
const ROLE_LABELS: Record<string, string> = { teacher: 'Teacher', admin_staff: 'Admin Staff', support: 'Support Staff' };
const ROLE_COLORS: Record<string, string> = { teacher: 'bg-indigo-50 text-indigo-700 border-indigo-200', admin_staff: 'bg-amber-50 text-amber-700 border-amber-200', support: 'bg-slate-50 text-slate-700 border-slate-200' };

const emptyForm: Partial<Staff> = { staffName: '', email: '', phone: '', role: 'teacher', basicSalary: 0, allowances: 0, bankName: '', accountNumber: '', subject: '', qualification: '', department: '' };
const emptyLeave: Partial<LeaveRequest> = { type: 'annual', startDate: '', endDate: '', reason: '' };

export default function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModal, setIsModal] = useState(false);
  const [isLeaveModal, setIsLeaveModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<Partial<Staff>>(emptyForm);
  const [leaveForm, setLeaveForm] = useState<Partial<LeaveRequest>>(emptyLeave);
  const [selectedLeaveStaff, setSelectedLeaveStaff] = useState<Staff | null>(null);
  const [filterRole, setFilterRole] = useState<Staff['role'] | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'staff' | 'leaves'>('staff');

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'staff'), orderBy('staffName', 'asc')), snap => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
      setLoading(false);
    });
    const unsub2 = onSnapshot(query(collection(db, 'leave_requests'), orderBy('createdAt', 'desc')), snap => {
      setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const saveStaff = async () => {
    if (!form.staffName || !form.email) return;
    if (editingStaff?.id) {
      await updateDoc(doc(db, 'staff', editingStaff.id), { ...form, updatedAt: serverTimestamp() }).catch(console.error);
    } else {
      await addDoc(collection(db, 'staff'), { ...form, employedAt: serverTimestamp() }).catch(console.error);
    }
    setIsModal(false);
    setEditingStaff(null);
    setForm(emptyForm);
  };

  const deleteStaff = async (id: string) => {
    if (!confirm('Delete this staff member?')) return;
    await deleteDoc(doc(db, 'staff', id)).catch(console.error);
  };

  const submitLeave = async () => {
    if (!selectedLeaveStaff || !leaveForm.startDate || !leaveForm.endDate) return;
    await addDoc(collection(db, 'leave_requests'), {
      ...leaveForm,
      staffId: selectedLeaveStaff.id,
      staffName: selectedLeaveStaff.staffName,
      status: 'pending',
      createdAt: serverTimestamp(),
    }).catch(console.error);
    setIsLeaveModal(false);
    setLeaveForm(emptyLeave);
  };

  const updateLeaveStatus = async (leaveId: string, status: 'approved' | 'rejected') => {
    await updateDoc(doc(db, 'leave_requests', leaveId), { status, updatedAt: serverTimestamp() }).catch(console.error);
  };

  const filtered = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-indigo-600" />
            Staff Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Manage staff records, roles, and leave requests.</p>
        </div>
        <button onClick={() => { setEditingStaff(null); setForm(emptyForm); setIsModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 mb-6">
        {(['staff', 'leaves'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize rounded-t-lg border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {tab === 'staff' ? `Staff (${staff.length})` : `Leave Requests (${leaves.filter(l => l.status === 'pending').length})`}
          </button>
        ))}
      </div>

      {activeTab === 'staff' && (
        <>
          {/* Filter */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(['all', ...ROLES] as const).map(r => (
              <button key={r} onClick={() => setFilterRole(r)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors capitalize ${filterRole === r ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                {r === 'all' ? 'All' : ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <Briefcase className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500">No staff found. Add your first staff member.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(s => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {s.staffName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{s.staffName}</p>
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ${ROLE_COLORS[s.role]}`}>{ROLE_LABELS[s.role]}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingStaff(s); setForm(s); setIsModal(true); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteStaff(s.id!)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600 mb-4">
                    <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400" />{s.email}</div>
                    {s.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" />{s.phone}</div>}
                    {s.subject && <div className="flex items-center gap-2"><span className="text-slate-400">📚</span> {s.subject}</div>}
                    <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 text-slate-400" />{formatNaira(s.basicSalary)}/mo</div>
                  </div>
                  <button onClick={() => { setSelectedLeaveStaff(s); setIsLeaveModal(true); }}
                    className="w-full py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors">
                    Request Leave
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'leaves' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Leave Requests</h2>
          </div>
          {leaves.length === 0 ? (
            <div className="py-16 text-center text-slate-400">No leave requests yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {leaves.map(leave => (
                <div key={leave.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{leave.staffName}</p>
                    <p className="text-xs text-slate-500">{leave.type} · {leave.startDate} to {leave.endDate}</p>
                    <p className="text-xs text-slate-500 mt-0.5 italic">"{leave.reason}"</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {leave.status === 'pending' ? (
                      <>
                        <button onClick={() => updateLeaveStatus(leave.id!, 'approved')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => updateLeaveStatus(leave.id!, 'rejected')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 hover:bg-rose-100 transition-colors">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    ) : (
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${leave.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} capitalize`}>{leave.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Staff Modal */}
      <AnimatePresence>
        {isModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={e => e.target === e.currentTarget && setIsModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-4">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900">{editingStaff ? 'Edit Staff' : 'Add Staff Member'}</h2>
                <button onClick={() => setIsModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Full Name', key: 'staffName', type: 'text', col: 2 },
                  { label: 'Email', key: 'email', type: 'email', col: 2 },
                  { label: 'Phone', key: 'phone', type: 'text' },
                  { label: 'Qualification', key: 'qualification', type: 'text' },
                  { label: 'Basic Salary (₦)', key: 'basicSalary', type: 'number' },
                  { label: 'Allowances (₦)', key: 'allowances', type: 'number' },
                  { label: 'Bank Name', key: 'bankName', type: 'text' },
                  { label: 'Account Number', key: 'accountNumber', type: 'text' },
                ].map(f => (
                  <div key={f.key} className={f.col === 2 ? 'col-span-2' : ''}>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">{f.label}</label>
                    <input type={f.type} value={(form as any)[f.key] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as Staff['role'] }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                {form.role === 'teacher' && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                    <select value={form.subject || ''} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      <option value="">Select subject</option>
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={saveStaff} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave Modal */}
      <AnimatePresence>
        {isLeaveModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setIsLeaveModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900">Leave Request — {selectedLeaveStaff?.staffName}</h2>
                <button onClick={() => setIsLeaveModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Leave Type</label>
                  <select value={leaveForm.type} onChange={e => setLeaveForm(p => ({ ...p, type: e.target.value as any }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                    {['annual', 'sick', 'maternity', 'paternity', 'other'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Start Date</label>
                    <input type="date" value={leaveForm.startDate || ''} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">End Date</label>
                    <input type="date" value={leaveForm.endDate || ''} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Reason</label>
                  <textarea value={leaveForm.reason || ''} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setIsLeaveModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={submitLeave} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Submit</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
