import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import {
  collection, query, onSnapshot, addDoc, serverTimestamp,
  orderBy, deleteDoc, doc, getDocs, where, writeBatch
} from 'firebase/firestore';
import { Notification, Student, CURRENT_SESSION } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { useSchool } from '../components/SchoolContext';
import {
  Bell, Plus, Send, Trash2, Users, User, BookOpen,
  ArrowLeft, Loader2, ChevronDown, CheckCircle2, AlertCircle,
  Megaphone, X
} from 'lucide-react';

type NotifType = 'general' | 'fee_due' | 'exam' | 'attendance';

const TYPE_COLORS: Record<NotifType, string> = {
  general: 'bg-slate-100 text-slate-700',
  fee_due: 'bg-amber-50 text-amber-700',
  exam: 'bg-indigo-50 text-indigo-700',
  attendance: 'bg-rose-50 text-rose-700',
};

const TYPE_ICONS: Record<NotifType, React.ElementType> = {
  general: Bell,
  fee_due: AlertCircle,
  exam: BookOpen,
  attendance: Users,
};

export default function NotificationsManagement() {
  const { profile } = useAuth();
  const { classNames } = useSchool();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Compose form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notifType, setNotifType] = useState<NotifType>('general');
  const [targetMode, setTargetMode] = useState<'all' | 'class' | 'student'>('all');
  const [targetClass, setTargetClass] = useState('');
  const [targetStudentId, setTargetStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  useEffect(() => {
    const unsubNotif = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc')),
      snap => {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
        setLoading(false);
      },
      e => handleFirestoreError(e, OperationType.LIST, 'notifications')
    );
    const unsubStudents = onSnapshot(collection(db, 'students'), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    });
    return () => { unsubNotif(); unsubStudents(); };
  }, []);

  const filteredStudents = students.filter(s =>
    studentSearch.length > 1 &&
    (s.studentName.toLowerCase().includes(studentSearch.toLowerCase()) ||
     s.studentId.toLowerCase().includes(studentSearch.toLowerCase()))
  ).slice(0, 8);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSending(true);
    const tid = toast.loading('Sending notification…');
    try {
      let recipients: string[] = [];

      if (targetMode === 'all') {
        // Write one notification with recipientId = 'all'
        recipients = ['all'];
      } else if (targetMode === 'class') {
        const snap = await getDocs(query(collection(db, 'students'), where('currentClass', '==', targetClass)));
        const uids = snap.docs.map(d => d.data().guardianUserId).filter(Boolean) as string[];
        recipients = uids.length > 0 ? uids : ['all'];
      } else if (targetMode === 'student') {
        if (!targetStudentId) { toast.error('Please select a student.', { id: tid }); setSending(false); return; }
        const student = students.find(s => s.id === targetStudentId);
        if (student?.guardianUserId) recipients = [student.guardianUserId];
        else { toast.error('This student has no linked parent account.', { id: tid }); setSending(false); return; }
      }

      const batch = writeBatch(db);
      recipients.forEach(recipientId => {
        const ref = doc(collection(db, 'notifications'));
        const payload: Omit<Notification, 'id'> = {
          recipientId,
          title: title.trim(),
          body: body.trim(),
          type: notifType,
          read: false,
          createdAt: serverTimestamp() as any,
        };
        batch.set(ref, payload);
      });
      await batch.commit();

      toast.success(`Notification sent to ${targetMode === 'all' ? 'everyone' : targetMode === 'class' ? targetClass : 'student'}!`, { id: tid });
      setTitle('');
      setBody('');
    } catch (e: any) {
      toast.error('Failed to send: ' + (e.message || 'Unknown'), { id: tid });
      handleFirestoreError(e, OperationType.WRITE, 'notifications');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      toast.success('Notification deleted.');
    } catch (e: any) {
      toast.error('Delete failed.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center">
              <Megaphone className="w-6 h-6 text-amber-600" />
            </div>
            Notifications
          </h1>
          <p className="text-slate-500 mt-1">Broadcast announcements to parents, classes, or individual students.</p>
        </div>
        <div className="flex gap-3 text-sm font-bold">
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-500" />
            {notifications.length} total sent
          </div>
          <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {notifications.filter(n => !n.read).length} unread
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Compose Panel ── */}
        <div className="lg:col-span-1">
          <form onSubmit={handleSend} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 sticky top-24">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" /> Compose Notification
            </h3>

            {/* Type */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['general', 'fee_due', 'exam', 'attendance'] as NotifType[]).map(t => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <button key={t} type="button" onClick={() => setNotifType(t)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                        notifType === t ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      <Icon className="w-3.5 h-3.5" />
                      {t === 'fee_due' ? 'Fee Due' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Send To</label>
              <div className="flex gap-2">
                {[
                  { id: 'all', label: 'Everyone', Icon: Users },
                  { id: 'class', label: 'A Class', Icon: BookOpen },
                  { id: 'student', label: 'Student', Icon: User },
                ].map(({ id, label, Icon }) => (
                  <button key={id} type="button" onClick={() => setTargetMode(id as any)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${
                      targetMode === id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>

              {targetMode === 'class' && (
                <select value={targetClass} onChange={e => setTargetClass(e.target.value)}
                  className="w-full mt-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  {classNames.map(c => <option key={c}>{c}</option>)}
                </select>
              )}

              {targetMode === 'student' && (
                <div className="mt-2 relative">
                  <input
                    type="text"
                    placeholder="Search student by name or ID…"
                    value={studentSearch}
                    onChange={e => { setStudentSearch(e.target.value); setTargetStudentId(''); }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {filteredStudents.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredStudents.map(s => (
                        <button key={s.id} type="button"
                          onClick={() => { setTargetStudentId(s.id!); setStudentSearch(s.studentName); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-medium text-slate-900 flex justify-between items-center">
                          {s.studentName}
                          <span className="text-xs text-slate-400">{s.currentClass}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {targetStudentId && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold text-indigo-700">{studentSearch} selected</span>
                      <button type="button" onClick={() => { setTargetStudentId(''); setStudentSearch(''); }}
                        className="ml-auto text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Title *</label>
              <input required value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. 2nd Term Fees Reminder"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Message *</label>
              <textarea required value={body} onChange={e => setBody(e.target.value)}
                rows={4} placeholder="Write your notification message here…"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none" />
              <p className="text-[10px] text-slate-400 text-right">{body.length} characters</p>
            </div>

            <button type="submit" disabled={sending || !title.trim() || !body.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send Notification'}
            </button>
          </form>
        </div>

        {/* ── Notification Log ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent Notifications ({notifications.length})</h3>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <Bell className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500">No notifications sent yet.</p>
              <p className="text-xs text-slate-400 mt-1">Use the compose panel to send your first notification.</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {notifications.map(n => {
                const Icon = TYPE_ICONS[n.type as NotifType] || Bell;
                return (
                  <motion.div key={n.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${TYPE_COLORS[n.type as NotifType] || 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm">{n.title}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TYPE_COLORS[n.type as NotifType] || 'bg-slate-100 text-slate-600'}`}>
                          {n.type?.replace('_', ' ')}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 bg-indigo-500 rounded-full" title="Unread" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {n.recipientId === 'all' ? 'All parents' : `UID: ${n.recipientId.slice(0, 10)}…`}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Just now'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(n.id!)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
