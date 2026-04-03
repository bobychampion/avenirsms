import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import {
  collection, query, onSnapshot, addDoc, serverTimestamp,
  orderBy, getDocs, writeBatch, doc, where
} from 'firebase/firestore';
import { Student, SCHOOL_CLASSES } from '../types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell, Send, Users, Loader2, ArrowLeft, CheckCircle2,
  MessageSquare, AlertTriangle, Info, GraduationCap, Filter,
  Clock, ChevronRight, X
} from 'lucide-react';

type NotifType = 'fee_due' | 'exam' | 'attendance' | 'general';
type TargetType = 'all' | 'class' | 'student';

interface SentNotification {
  id?: string;
  title: string;
  body: string;
  type: NotifType;
  target: TargetType;
  targetClass?: string;
  recipientCount: number;
  sentBy: string;
  createdAt: any;
}

const TYPE_CONFIG: Record<NotifType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  general:    { label: 'General',    icon: Info,           color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  fee_due:    { label: 'Fee Due',    icon: AlertTriangle,  color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  exam:       { label: 'Exam',       icon: GraduationCap,  color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
  attendance: { label: 'Attendance', icon: CheckCircle2,   color: 'text-rose-600',   bg: 'bg-rose-50 border-rose-200' },
};

export default function NotificationComposer() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<SentNotification[]>([]);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'general' as NotifType,
    target: 'all' as TargetType,
    targetClass: SCHOOL_CLASSES[0],
    studentId: '',
  });

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'students'), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    });
    const unsubHistory = onSnapshot(
      query(collection(db, 'notification_broadcasts'), orderBy('createdAt', 'desc')),
      snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as SentNotification))),
      err => handleFirestoreError(err, OperationType.LIST, 'notification_broadcasts')
    );
    return () => { unsubStudents(); unsubHistory(); };
  }, []);

  // Preview recipient count
  const recipientCount = () => {
    if (form.target === 'all') return students.length;
    if (form.target === 'class') return students.filter(s => s.currentClass === form.targetClass).length;
    return form.studentId ? 1 : 0;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { toast.error('Title and message are required.'); return; }
    if (form.target === 'student' && !form.studentId) { toast.error('Please select a student.'); return; }

    setSending(true);
    const tid = toast.loading('Sending notifications…');
    try {
      // Determine recipient IDs
      let recipients: { id: string; name: string }[] = [];
      if (form.target === 'all') {
        recipients = students
          .filter(s => s.guardianUserId)
          .map(s => ({ id: s.guardianUserId!, name: s.studentName }));
        // Also send to students themselves via guardianEmail (broadcast)
      } else if (form.target === 'class') {
        recipients = students
          .filter(s => s.currentClass === form.targetClass && s.guardianUserId)
          .map(s => ({ id: s.guardianUserId!, name: s.studentName }));
      } else {
        const s = students.find(st => st.id === form.studentId);
        if (s?.guardianUserId) recipients = [{ id: s.guardianUserId, name: s.studentName }];
      }

      // Batch write individual notification docs
      const batch = writeBatch(db);
      for (const r of recipients) {
        const ref = doc(collection(db, 'notifications'));
        batch.set(ref, {
          recipientId: r.id,
          title: form.title,
          body: form.body,
          type: form.type,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      // Also write a broadcast record
      const broadcastRef = doc(collection(db, 'notification_broadcasts'));
      batch.set(broadcastRef, {
        title: form.title,
        body: form.body,
        type: form.type,
        target: form.target,
        targetClass: form.target === 'class' ? form.targetClass : null,
        recipientCount: recipients.length,
        sentBy: profile?.displayName || 'Admin',
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      toast.success(`Sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}!`, { id: tid });
      setForm({ title: '', body: '', type: 'general', target: 'all', targetClass: SCHOOL_CLASSES[0], studentId: '' });
      setActiveTab('history');
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Unknown'), { id: tid });
      handleFirestoreError(e, OperationType.WRITE, 'notifications');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <Bell className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 text-sm">Send announcements to parents, by class, or individual students.</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
        {(['compose', 'history'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 capitalize ${
              activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t === 'compose' ? <Send className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            {t === 'compose' ? 'Compose' : 'Sent History'}
            {t === 'history' && history.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] rounded-full font-bold">{history.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSend} className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                New Notification
              </h3>

              {/* Type selector */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TYPE_CONFIG) as NotifType[]).map(t => {
                    const cfg = TYPE_CONFIG[t];
                    return (
                      <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          form.type === t ? `${cfg.bg} ${cfg.color}` : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}>
                        <cfg.icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Send To</label>
                <div className="flex gap-2">
                  {([
                    { val: 'all', label: 'All Parents', icon: Users },
                    { val: 'class', label: 'A Class', icon: GraduationCap },
                    { val: 'student', label: 'One Student', icon: Filter },
                  ] as { val: TargetType; label: string; icon: React.ElementType }[]).map(opt => (
                    <button key={opt.val} type="button" onClick={() => setForm(f => ({ ...f, target: opt.val }))}
                      className={`flex-1 flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        form.target === opt.val ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>

                {form.target === 'class' && (
                  <select value={form.targetClass} onChange={e => setForm(f => ({ ...f, targetClass: e.target.value }))}
                    className="mt-3 w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
                {form.target === 'student' && (
                  <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}
                    className="mt-3 w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select a student…</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.studentName} ({s.currentClass})</option>)}
                  </select>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Title</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Fee Reminder — 2nd Term" maxLength={100}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Message</label>
                <textarea required value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Write your notification message here…" rows={5} maxLength={500}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-slate-400 text-right mt-1">{form.body.length}/500</p>
              </div>

              <button type="submit" disabled={sending}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : `Send to ${recipientCount()} recipient${recipientCount() !== 1 ? 's' : ''}`}
              </button>
            </form>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h4 className="font-bold text-slate-700 text-sm mb-4">Preview</h4>
              <div className={`p-4 rounded-xl border ${TYPE_CONFIG[form.type].bg}`}>
                <div className="flex items-start gap-3">
                  {React.createElement(TYPE_CONFIG[form.type].icon, { className: `w-5 h-5 mt-0.5 ${TYPE_CONFIG[form.type].color} shrink-0` })}
                  <div>
                    <p className={`font-bold text-sm ${TYPE_CONFIG[form.type].color}`}>{form.title || 'Notification Title'}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">{form.body || 'Your message will appear here…'}</p>
                    <p className="text-[10px] text-slate-400 mt-2">Just now · {TYPE_CONFIG[form.type].label}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Recipient Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target</span>
                  <span className="font-bold text-slate-800 capitalize">{form.target === 'class' ? form.targetClass : form.target === 'student' ? 'Single student' : 'All parents'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipients</span>
                  <span className="font-bold text-indigo-600">{recipientCount()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-bold text-slate-800">{TYPE_CONFIG[form.type].label}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
              <Bell className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No notifications sent yet.</p>
            </div>
          ) : history.map(n => {
            const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general;
            return (
              <div key={n.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${cfg.bg} border flex items-center justify-center shrink-0`}>
                      {React.createElement(cfg.icon, { className: `w-4 h-4 ${cfg.color}` })}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 uppercase font-bold">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{n.recipientCount} recipients</span>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Filter className="w-3 h-3" />{n.target === 'class' ? n.targetClass : n.target}</span>
                        <span>·</span>
                        <span>{n.sentBy}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.color} border`}>{cfg.label}</span>
                    {n.createdAt?.seconds && (
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt.seconds * 1000).toLocaleDateString('en-GB')}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
