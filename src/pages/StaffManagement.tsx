import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where, getDocs } from 'firebase/firestore';
import { Staff, LeaveRequest, UserProfile } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Briefcase, Plus, X, Edit2, Trash2, Mail, Phone, DollarSign, ChevronDown, CheckCircle, XCircle, Upload, Camera, ChevronLeft, ChevronRight as ChevronRightIcon, Link2, UserCheck } from 'lucide-react';
import { useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';
import { formatCurrency } from '../utils/formatCurrency';
import toast from 'react-hot-toast';
import { assertNotSuperAdminEmail } from '../utils/superAdminGuard';

const PAGE_SIZE = 20;

const ROLES: Staff['role'][] = ['teacher', 'admin_staff', 'support'];
const ROLE_LABELS: Record<string, string> = { teacher: 'Teacher', admin_staff: 'Admin Staff', support: 'Support Staff' };
const ROLE_COLORS: Record<string, string> = { teacher: 'bg-indigo-50 text-indigo-700 border-indigo-200', admin_staff: 'bg-amber-50 text-amber-700 border-amber-200', support: 'bg-slate-50 text-slate-700 border-slate-200' };

const emptyForm: Partial<Staff> = { staffName: '', email: '', phone: '', role: 'teacher', basicSalary: 0, allowances: 0, bankName: '', accountNumber: '', subject: '', qualification: '', department: '', photoUrl: '' };
const emptyLeave: Partial<LeaveRequest> = { type: 'annual', startDate: '', endDate: '', reason: '' };

export default function StaffManagement() {
  const schoolId = useSchoolId();
  const { subjects: allSubjects, locale, currency, cloudinaryConfig } = useSchool();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [usersByEmail, setUsersByEmail] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [isModal, setIsModal] = useState(false);
  const [isLeaveModal, setIsLeaveModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<Partial<Staff>>(emptyForm);
  const [leaveForm, setLeaveForm] = useState<Partial<LeaveRequest>>(emptyLeave);
  const [selectedLeaveStaff, setSelectedLeaveStaff] = useState<Staff | null>(null);
  const [filterRole, setFilterRole] = useState<Staff['role'] | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'staff' | 'leaves'>('staff');
  const [currentPage, setCurrentPage] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!schoolId) return;
    const unsub1 = onSnapshot(query(collection(db, 'staff'), where('schoolId', '==', schoolId!), orderBy('staffName', 'asc')), snap => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
      setLoading(false);
    });
    const unsub2 = onSnapshot(query(collection(db, 'leave_requests'), where('schoolId', '==', schoolId!), orderBy('createdAt', 'desc')), snap => {
      setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    });
    const unsub3 = onSnapshot(query(collection(db, 'users'), where('schoolId', '==', schoolId!)), snap => {
      const map: Record<string, UserProfile> = {};
      snap.docs.forEach(d => {
        const u = { uid: d.id, ...d.data() } as UserProfile;
        if (u.email) map[u.email.toLowerCase()] = u;
      });
      setUsersByEmail(map);
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [schoolId]);

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(0); }, [filterRole]);

  const saveStaff = async () => {
    if (!form.staffName || !form.email) return;
    try { assertNotSuperAdminEmail(form.email, 'staff member'); }
    catch (e: any) { toast.error(e.message); return; }
    // Auto-link userId if a user account exists with this email
    const linkedUser = usersByEmail[form.email.toLowerCase()];
    const dataToSave = linkedUser ? { ...form, userId: linkedUser.uid } : form;

    if (editingStaff?.id) {
      await updateDoc(doc(db, 'staff', editingStaff.id), { ...dataToSave, updatedAt: serverTimestamp() }).catch(console.error);
    } else {
      await addDoc(collection(db, 'staff'), { ...dataToSave, employedAt: serverTimestamp(), schoolId: schoolId ?? 'main' }).catch(console.error);
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
      schoolId: schoolId ?? 'main',
    }).catch(console.error);
    setIsLeaveModal(false);
    setLeaveForm(emptyLeave);
  };

  const updateLeaveStatus = async (leaveId: string, status: 'approved' | 'rejected') => {
    await updateDoc(doc(db, 'leave_requests', leaveId), { status, updatedAt: serverTimestamp() }).catch(console.error);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
      toast.error('Configure Cloudinary in School Settings → Media & Uploads first.');
      return;
    }
    setUploadingPhoto(true);
    const tid = toast.loading('Uploading photo…');
    try {
      const url = await uploadToCloudinary(file, cloudinaryConfig.cloudName, cloudinaryConfig.uploadPreset);
      setForm(p => ({ ...p, photoUrl: url }));
      toast.success('Photo uploaded!', { id: tid });
    } catch (e: any) {
      toast.error(e.message || 'Upload failed', { id: tid });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const filtered = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedStaff = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
        <div className="flex items-center gap-2">
          <Link
            to="/admin/bulk-staff-import"
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm"
          >
            <Upload className="w-4 h-4" /> Bulk Import
          </Link>
          <button onClick={() => { setEditingStaff(null); setForm(emptyForm); setIsModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
            <Plus className="w-4 h-4" /> Add Staff
          </button>
        </div>
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
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedStaff.map(s => {
                  const linkedUser = usersByEmail[s.email?.toLowerCase() ?? ''];
                  const hasAccount = !!(s.userId || linkedUser);
                  return (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                          {s.photoUrl ? (
                            <img src={s.photoUrl} alt={s.staffName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                              {s.staffName.charAt(0)}
                            </div>
                          )}
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
                      <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 text-slate-400" />{formatCurrency(s.basicSalary, locale, currency)}/mo</div>
                    </div>

                    {/* Login account status */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold mb-3 ${hasAccount ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {hasAccount ? <UserCheck className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                      {hasAccount ? `Login account linked` : 'No login account — create one in User Management'}
                    </div>

                    <button onClick={() => { setSelectedLeaveStaff(s); setIsLeaveModal(true); }}
                      className="w-full py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors">
                      Request Leave
                    </button>
                  </motion.div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500">
                    Page {currentPage + 1} of {totalPages} &nbsp;·&nbsp; {filtered.length} staff
                  </p>
                  <div className="flex gap-2">
                    <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Next <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
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

              {/* Photo upload area */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  {form.photoUrl ? (
                    <img src={form.photoUrl} alt="Staff" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                      {form.staffName?.charAt(0) || '?'}
                    </div>
                  )}
                </div>
                <div>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors disabled:opacity-50">
                    {uploadingPhoto ? (
                      <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    {form.photoUrl ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1">JPG, PNG or WebP, max 5MB</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Full Name', key: 'staffName', type: 'text', col: 2 },
                  { label: 'Email', key: 'email', type: 'email', col: 2 },
                  { label: 'Phone', key: 'phone', type: 'text' },
                  { label: 'Qualification', key: 'qualification', type: 'text' },
                  { label: 'Basic Salary', key: 'basicSalary', type: 'number' },
                  { label: 'Allowances', key: 'allowances', type: 'number' },
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
                      {allSubjects.map(s => <option key={s}>{s}</option>)}
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
