/**
 * HR Policy Document Library — maintain the staff handbook and policy library.
 *
 * Documents are stored in `hr_policies` with a URL link to the actual file
 * (Google Drive, Cloudinary, or any external source). This keeps the Firestore
 * doc small while still providing a searchable, categorised index.
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSchool } from '../../components/SchoolContext';
import { useAuth } from '../../components/FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardList, Plus, Edit2, Trash2, ExternalLink,
  Search, X, Loader2, FileText, FolderOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface HrPolicy {
  id?: string;
  title: string;
  description: string;
  category: 'HR' | 'Finance' | 'Academic' | 'Safety' | 'General';
  fileUrl: string;
  version: string;
  schoolId: string;
  createdAt: any;
  updatedAt?: any;
  createdBy?: string;
}

const CATEGORIES: HrPolicy['category'][] = ['HR', 'Finance', 'Academic', 'Safety', 'General'];

const CATEGORY_COLORS: Record<HrPolicy['category'], string> = {
  HR: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Finance: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Academic: 'bg-violet-50 text-violet-700 border-violet-200',
  Safety: 'bg-rose-50 text-rose-700 border-rose-200',
  General: 'bg-slate-50 text-slate-700 border-slate-200',
};

const emptyPolicy = (): Omit<HrPolicy, 'id' | 'schoolId' | 'createdAt'> => ({
  title: '',
  description: '',
  category: 'HR',
  fileUrl: '',
  version: '1.0',
});

export default function HrPolicies() {
  const { schoolId } = useSchool();
  const { user, profile } = useAuth();

  const [policies, setPolicies] = useState<HrPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HrPolicy | null>(null);
  const [form, setForm] = useState(emptyPolicy());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'hr_policies'), where('schoolId', '==', schoolId));
    const unsub = onSnapshot(q, snap => {
      setPolicies(snap.docs.map(d => ({ id: d.id, ...d.data() } as HrPolicy)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  const filtered = policies.filter(p =>
    (catFilter === 'all' || p.category === catFilter) &&
    (p.title.toLowerCase().includes(search.toLowerCase()) ||
     p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPolicy());
    setShowForm(true);
  };

  const openEdit = (p: HrPolicy) => {
    setEditing(p);
    setForm({ title: p.title, description: p.description, category: p.category, fileUrl: p.fileUrl, version: p.version });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'hr_policies', editing.id), {
          ...form,
          updatedAt: serverTimestamp(),
        });
        toast.success('Policy updated.');
      } else {
        await addDoc(collection(db, 'hr_policies'), {
          ...form,
          schoolId,
          createdAt: serverTimestamp(),
          createdBy: profile?.displayName || user?.email,
        });
        toast.success('Policy added.');
      }
      setShowForm(false);
    } catch {
      toast.error('Failed to save policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hr_policies', id));
      toast.success('Policy deleted.');
      setDeleteConfirm(null);
    } catch {
      toast.error('Failed to delete.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Human Resources</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Policies & Documents</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Policy
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleSave}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-lg">
                  {editing ? 'Edit Policy' : 'Add Policy Document'}
                </h3>
                <button type="button" onClick={() => setShowForm(false)}>
                  <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                </button>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Title</label>
                <input
                  required
                  placeholder="e.g. Staff Leave Policy"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value as HrPolicy['category'] })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Version</label>
                  <input
                    placeholder="e.g. 1.0"
                    value={form.version}
                    onChange={e => setForm({ ...form, version: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Description</label>
                <textarea
                  placeholder="Brief summary of this policy…"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Document URL</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/…"
                  value={form.fileUrl}
                  onChange={e => setForm({ ...form, fileUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Paste a Google Drive, Dropbox, or any shareable link.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Update' : 'Add Policy'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search policies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {(['all', ...CATEGORIES] as const).map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                catFilter === c ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No policy documents found.</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Policy" to upload a document link.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map(p => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${CATEGORY_COLORS[p.category]}`}>
                    {p.category}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900 text-sm">{p.title}</p>
                  {p.version && <p className="text-[11px] text-slate-400">v{p.version}</p>}
                  {p.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  {p.fileUrl && (
                    <a
                      href={p.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </a>
                  )}
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(p.id!)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center"
            >
              <Trash2 className="w-10 h-10 text-rose-500 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 text-lg mb-2">Delete Policy?</h3>
              <p className="text-sm text-slate-500 mb-6">This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors text-sm">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
