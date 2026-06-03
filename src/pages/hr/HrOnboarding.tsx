/**
 * HR Onboarding Tracker — manage new-hire checklists.
 *
 * Each record in `onboarding_records` represents one new staff member with
 * an embedded array of tasks. HR can create records, add custom tasks, and
 * tick items off as the onboarding progresses.
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
  UserPlus, CheckCircle2, Circle, Plus, Trash2, ChevronDown,
  ChevronRight, Loader2, Search, X, User,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface OnboardingTask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

interface OnboardingRecord {
  id?: string;
  staffName: string;
  position: string;
  department: string;
  startDate: string;
  status: 'active' | 'completed';
  tasks: OnboardingTask[];
  schoolId: string;
  createdAt: any;
  createdBy?: string;
}

const DEFAULT_TASKS: Omit<OnboardingTask, 'id'>[] = [
  { title: 'Submit required identity documents', completed: false },
  { title: 'Complete staff ID/photo registration', completed: false },
  { title: 'School orientation and tour', completed: false },
  { title: 'Review and sign staff handbook', completed: false },
  { title: 'Set up school email and portal access', completed: false },
  { title: 'Meet department head and team', completed: false },
  { title: 'Complete HR induction session', completed: false },
];

const genId = () => Math.random().toString(36).slice(2, 10);

export default function HrOnboarding() {
  const { schoolId } = useSchool();
  const { user, profile } = useAuth();

  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showForm, setShowForm] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newRecord, setNewRecord] = useState({
    staffName: '',
    position: '',
    department: '',
    startDate: '',
  });
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'onboarding_records'),
      where('schoolId', '==', schoolId),
    );
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as OnboardingRecord)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  const filtered = records.filter(r =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    r.staffName.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    const tasks: OnboardingTask[] = DEFAULT_TASKS.map(t => ({ ...t, id: genId() }));
    try {
      await addDoc(collection(db, 'onboarding_records'), {
        ...newRecord,
        status: 'active',
        tasks,
        schoolId,
        createdAt: serverTimestamp(),
        createdBy: profile?.displayName || user?.email,
      });
      toast.success('Onboarding record created.');
      setShowForm(false);
      setNewRecord({ staffName: '', position: '', department: '', startDate: '' });
    } catch {
      toast.error('Failed to create record.');
    }
  };

  const toggleTask = async (record: OnboardingRecord, taskId: string) => {
    if (!record.id) return;
    setSavingId(record.id);
    const updatedTasks = record.tasks.map(t =>
      t.id === taskId
        ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString().split('T')[0] : undefined }
        : t
    );
    const allDone = updatedTasks.every(t => t.completed);
    try {
      await updateDoc(doc(db, 'onboarding_records', record.id), {
        tasks: updatedTasks,
        status: allDone ? 'completed' : 'active',
      });
    } catch {
      toast.error('Failed to update task.');
    } finally {
      setSavingId(null);
    }
  };

  const addTask = async (record: OnboardingRecord) => {
    const title = (newTaskTitle[record.id!] || '').trim();
    if (!title || !record.id) return;
    const updatedTasks = [...record.tasks, { id: genId(), title, completed: false }];
    setSavingId(record.id);
    try {
      await updateDoc(doc(db, 'onboarding_records', record.id), { tasks: updatedTasks });
      setNewTaskTitle(prev => ({ ...prev, [record.id!]: '' }));
    } catch {
      toast.error('Failed to add task.');
    } finally {
      setSavingId(null);
    }
  };

  const deleteRecord = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'onboarding_records', id));
      toast.success('Record deleted.');
      if (expandedId === id) setExpandedId(null);
    } catch {
      toast.error('Failed to delete.');
    }
  };

  const completionPct = (tasks: OnboardingTask[]) =>
    tasks.length === 0 ? 0 : Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Human Resources</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Onboarding Tracker</h1>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Hire
        </button>
      </div>

      {/* New Record Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleCreate}
            className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 space-y-4"
          >
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">New Hire Details</h3>
              <button type="button" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Staff Name', field: 'staffName', placeholder: 'Full name' },
                { label: 'Position / Title', field: 'position', placeholder: 'e.g. Maths Teacher' },
                { label: 'Department', field: 'department', placeholder: 'e.g. Science, Administration' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{label}</label>
                  <input
                    required
                    placeholder={placeholder}
                    value={(newRecord as any)[field]}
                    onChange={e => setNewRecord({ ...newRecord, [field]: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Start Date</label>
                <input
                  required type="date" value={newRecord.startDate}
                  onChange={e => setNewRecord({ ...newRecord, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              A default checklist of {DEFAULT_TASKS.length} tasks will be created. You can add custom tasks after saving.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors">
                Create
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search staff name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'active', 'completed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                statusFilter === s ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <UserPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No onboarding records found.</p>
          <p className="text-xs text-slate-400 mt-1">Click "New Hire" to add one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(record => {
            const pct = completionPct(record.tasks);
            const expanded = expandedId === record.id;
            return (
              <motion.div
                key={record.id}
                layout
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Card Header */}
                <button
                  className="w-full text-left p-5 flex items-center gap-4"
                  onClick={() => setExpandedId(expanded ? null : record.id!)}
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{record.staffName}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        record.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {record.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{record.position} · {record.department} · Started {record.startDate}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-400 shrink-0">{pct}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); deleteRecord(record.id!); }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {expanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400" />
                      : <ChevronRight className="w-4 h-4 text-slate-400" />
                    }
                  </div>
                </button>

                {/* Expanded Tasks */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 border-t border-slate-100">
                        <ul className="mt-4 space-y-2">
                          {record.tasks.map(task => (
                            <li key={task.id} className="flex items-center gap-3">
                              <button
                                disabled={savingId === record.id}
                                onClick={() => toggleTask(record, task.id)}
                                className="shrink-0"
                              >
                                {task.completed
                                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                  : <Circle className="w-5 h-5 text-slate-300 hover:text-indigo-400 transition-colors" />
                                }
                              </button>
                              <span className={`text-sm ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                {task.title}
                              </span>
                              {task.completed && task.completedAt && (
                                <span className="text-[10px] text-slate-400 ml-auto">{task.completedAt}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {/* Add custom task */}
                        <div className="mt-4 flex gap-2">
                          <input
                            placeholder="Add a custom task…"
                            value={newTaskTitle[record.id!] || ''}
                            onChange={e => setNewTaskTitle(prev => ({ ...prev, [record.id!]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTask(record))}
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={() => addTask(record)}
                            disabled={!newTaskTitle[record.id!]?.trim()}
                            className="px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
