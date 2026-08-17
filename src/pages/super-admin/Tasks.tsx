/**
 * Tasks — internal ops task tracker for the super admin Command Center.
 * Assignee is currently free-text (no Team/roster module yet — Phase 3);
 * everything else follows the CommandTask shape in src/types.ts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../components/FirebaseProvider';
import { CommandTask, TaskCategory, TaskPriority, TaskStatus, School } from '../../types';
import toast from 'react-hot-toast';
import {
  CheckSquare, Plus, X, Search, LayoutList, Columns3, Loader2, Trash2, Check,
  Calendar, Building2, User,
} from 'lucide-react';

const CATEGORIES: TaskCategory[] = ['Sales', 'Marketing', 'School Support', 'Onboarding', 'Billing', 'Technical', 'Content', 'Product', 'Internal'];
const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
const STATUSES: TaskStatus[] = ['Backlog', 'To Do', 'In Progress', 'Waiting', 'Completed'];

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  Low: 'bg-slate-100 text-slate-600', Medium: 'bg-blue-100 text-blue-700',
  High: 'bg-amber-100 text-amber-700', Urgent: 'bg-red-100 text-red-700',
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  'Backlog': 'bg-slate-100 text-slate-500', 'To Do': 'bg-slate-100 text-slate-700',
  'In Progress': 'bg-blue-100 text-blue-700', 'Waiting': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
};

export default function Tasks() {
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<CommandTask[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [modalTask, setModalTask] = useState<Partial<CommandTask> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')));
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommandTask)));
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    getDocs(collection(db, 'schools')).then(snap => setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() } as School)))).catch(() => {});
  }, []);

  const assignees = useMemo(() => [...new Set(tasks.map(t => t.assigneeName).filter(Boolean))] as string[], [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all' && t.assigneeName !== assigneeFilter) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, statusFilter, priorityFilter, assigneeFilter]);

  const today = new Date().toISOString().slice(0, 10);

  const openNew = () => setModalTask({
    title: '', category: 'Internal', priority: 'Medium', status: 'To Do',
    assigneeName: profile?.displayName || user?.email || '',
  });

  const saveTask = async () => {
    if (!modalTask?.title?.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      if (modalTask.id) {
        const { id, ...data } = modalTask;
        await updateDoc(doc(db, 'tasks', id), { ...data, updatedAt: Timestamp.now() });
        toast.success('Task updated');
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...modalTask,
          createdBy: profile?.displayName || user?.email || 'unknown',
          createdAt: Timestamp.now(),
        });
        toast.success('Task created');
      }
      setModalTask(null);
      fetchTasks();
    } catch {
      toast.error('Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (t: CommandTask) => {
    const nextStatus: TaskStatus = t.status === 'Completed' ? 'To Do' : 'Completed';
    try {
      await updateDoc(doc(db, 'tasks', t.id!), { status: nextStatus, completedAt: nextStatus === 'Completed' ? Timestamp.now() : null });
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: nextStatus } : x));
    } catch {
      toast.error('Failed to update task');
    }
  };

  const deleteTask = async (t: CommandTask) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'tasks', t.id!));
      setTasks(prev => prev.filter(x => x.id !== t.id));
      toast.success('Task deleted');
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  const TaskRow = ({ t }: { t: CommandTask }) => (
    <div className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={() => toggleComplete(t)}
          className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-colors ${
            t.status === 'Completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-indigo-400'
          }`}
        >
          {t.status === 'Completed' && <Check className="w-3 h-3 text-white" />}
        </button>
        <div className="min-w-0 cursor-pointer" onClick={() => setModalTask(t)}>
          <p className={`text-sm font-medium truncate ${t.status === 'Completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.title}</p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
            <span>{t.category}</span>
            {t.assigneeName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{t.assigneeName}</span>}
            {t.dueDate && <span className={`flex items-center gap-1 ${t.dueDate < today && t.status !== 'Completed' ? 'text-red-500 font-medium' : ''}`}><Calendar className="w-3 h-3" />{t.dueDate}</span>}
            {t.relatedSchoolName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{t.relatedSchoolName}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>{t.status}</span>
        <button onClick={() => deleteTask(t)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-600" /> Tasks
          </h1>
          <p className="text-slate-500 text-sm mt-1">Operations, sales, and support tasks across the platform.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as any)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
          <option value="all">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {assignees.length > 0 && (
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
            <option value="all">All assignees</option>
            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <div className="flex rounded-xl overflow-hidden border border-slate-200 text-xs font-semibold ml-auto">
          <button onClick={() => setView('list')} className={`px-3 py-2 flex items-center gap-1 ${view === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}><LayoutList className="w-3.5 h-3.5" /> List</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-2 flex items-center gap-1 ${view === 'kanban' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}><Columns3 className="w-3.5 h-3.5" /> Kanban</button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No tasks match these filters</p>
        </div>
      ) : view === 'list' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {filtered.map(t => <TaskRow key={t.id} t={t} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {STATUSES.map(status => (
            <div key={status} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 min-h-[8rem]">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">{status} <span className="font-normal text-slate-400">({filtered.filter(t => t.status === status).length})</span></p>
              <div className="space-y-2">
                {filtered.filter(t => t.status === status).map(t => (
                  <div key={t.id} onClick={() => setModalTask(t)} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors">
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                      {t.dueDate && <span className="text-[10px] text-slate-400">{t.dueDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalTask && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModalTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">{modalTask.id ? 'Edit Task' : 'New Task'}</h2>
              <button onClick={() => setModalTask(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-3">
              <input className={inputCls} placeholder="Title *" value={modalTask.title ?? ''} onChange={e => setModalTask({ ...modalTask, title: e.target.value })} />
              <textarea className={`${inputCls} h-20 resize-none`} placeholder="Description" value={modalTask.description ?? ''} onChange={e => setModalTask({ ...modalTask, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <select className={inputCls} value={modalTask.category} onChange={e => setModalTask({ ...modalTask, category: e.target.value as TaskCategory })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className={inputCls} value={modalTask.priority} onChange={e => setModalTask({ ...modalTask, priority: e.target.value as TaskPriority })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className={inputCls} value={modalTask.status} onChange={e => setModalTask({ ...modalTask, status: e.target.value as TaskStatus })}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="date" className={inputCls} value={modalTask.dueDate ?? ''} onChange={e => setModalTask({ ...modalTask, dueDate: e.target.value })} />
              </div>
              <input className={inputCls} placeholder="Assignee" value={modalTask.assigneeName ?? ''} onChange={e => setModalTask({ ...modalTask, assigneeName: e.target.value })} />
              <select className={inputCls} value={modalTask.relatedSchoolId ?? ''} onChange={e => {
                const school = schools.find(s => s.id === e.target.value);
                setModalTask({ ...modalTask, relatedSchoolId: e.target.value || undefined, relatedSchoolName: school?.name });
              }}>
                <option value="">— No related school —</option>
                {schools.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <textarea className={`${inputCls} h-16 resize-none`} placeholder="Notes" value={modalTask.notes ?? ''} onChange={e => setModalTask({ ...modalTask, notes: e.target.value })} />
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setModalTask(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button onClick={saveTask} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {modalTask.id ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
