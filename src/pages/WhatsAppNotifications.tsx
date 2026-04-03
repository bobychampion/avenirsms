import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { useAuth } from '../components/FirebaseProvider';
import { Student, Invoice, CURRENT_SESSION, TERMS, formatNaira } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { generateFeeReminderDraft } from '../services/geminiService';
import { useSchool } from '../components/SchoolContext';
import {
  MessageSquare, Send, Users, Filter, CheckCircle2, Loader2,
  Sparkles, Phone, ArrowLeft, RefreshCw, AlertCircle, ExternalLink,
  Bell, DollarSign, GraduationCap, Calendar, X
} from 'lucide-react';
import { Link } from 'react-router-dom';

type MessageType = 'fee_reminder' | 'general' | 'exam_notice' | 'attendance_alert' | 'custom';

interface WhatsAppLog {
  id?: string;
  messageType: MessageType;
  message: string;
  recipients: string[];
  recipientCount: number;
  sentBy: string;
  sentAt: any;
}

const MESSAGE_TYPES: { type: MessageType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'fee_reminder', label: 'Fee Reminder', icon: <DollarSign className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { type: 'exam_notice', label: 'Exam Notice', icon: <GraduationCap className="w-4 h-4" />, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { type: 'attendance_alert', label: 'Attendance Alert', icon: <Bell className="w-4 h-4" />, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { type: 'general', label: 'General Announcement', icon: <MessageSquare className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { type: 'custom', label: 'Custom Message', icon: <Send className="w-4 h-4" />, color: 'text-slate-600 bg-slate-50 border-slate-200' },
];

const TEMPLATES: Record<MessageType, string> = {
  fee_reminder: `Dear Parent/Guardian,

This is a reminder that the school fees for {{studentName}} ({{class}}) for {{term}} {{session}} are due on {{dueDate}}.

Amount Due: {{amount}}

Please make payment promptly to avoid any disruption to your child's education. You may pay via bank transfer, card payment through our parent portal, or visit the school bursar.

For inquiries, please contact the school office.

Thank you,
{{schoolName}} Administration`,

  exam_notice: `Dear Parent/Guardian,

Please be informed that {{term}} examinations for {{session}} academic session will commence on {{examDate}}.

We advise all students to:
• Complete all assignments before the exam period
• Review class notes and past questions
• Get adequate rest before exam days
• Come with all required stationery

Please ensure {{studentName}} is fully prepared.

Regards,
{{schoolName}} Examinations Office`,

  attendance_alert: `Dear Parent/Guardian of {{studentName}} ({{class}}),

We wish to inform you that your ward has been absent from school recently. Regular attendance is crucial for academic success.

Please contact the school if your child is facing any challenges.

{{schoolName}} Attendance Office`,

  general: `Dear Parents/Guardians,

Greetings from {{schoolName}}.

[Your message here]

Thank you for your continued support.

{{schoolName}} Administration`,

  custom: '',
};

function openWhatsApp(phone: string, message: string) {
  // Clean phone: remove spaces, dashes, ensure country code
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0')) cleaned = '234' + cleaned.slice(1);
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${cleaned.replace('+', '')}?text=${encoded}`, '_blank');
}

export default function WhatsAppNotifications() {
  const { profile } = useAuth();
  const { classNames } = useSchool();
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

  // Filters
  const [classFilter, setClassFilter] = useState('all');
  const [msgType, setMsgType] = useState<MessageType>('general');
  const [message, setMessage] = useState(TEMPLATES['general']);
  const [aiLoading, setAiLoading] = useState(false);

  // Sending
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'students'));
    const unsub = onSnapshot(q, snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
      setLoading(false);
    });
    const qI = query(collection(db, 'invoices'), where('status', 'in', ['pending', 'overdue']));
    const unsubI = onSnapshot(qI, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });
    return () => { unsub(); unsubI(); };
  }, []);

  useEffect(() => {
    if (activeTab !== 'history') return;
    const q = query(collection(db, 'whatsapp_logs'), orderBy('sentAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppLog)));
    });
    return () => unsub();
  }, [activeTab]);

  const filteredStudents = students.filter(s => {
    if (classFilter !== 'all' && s.currentClass !== classFilter) return false;
    if (msgType === 'fee_reminder') {
      const owes = invoices.some(inv => inv.studentId === s.id);
      if (!owes) return false;
    }
    return true;
  });

  const recipients = filteredStudents.filter(s => s.guardianPhone?.trim());

  const handleTypeChange = (type: MessageType) => {
    setMsgType(type);
    setMessage(TEMPLATES[type]);
  };

  const handleAIGenerate = async () => {
    setAiLoading(true);
    try {
      const draft = await generateFeeReminderDraft('Student', 'Parent/Guardian', 0, 'School Fees', new Date().toLocaleDateString());
      setMessage(draft);
    } catch {
      toast.error('AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendAll = async () => {
    if (recipients.length === 0) {
      toast.error('No recipients with phone numbers');
      return;
    }
    setSending(true);
    setSentCount(0);
    let count = 0;
    const phones: string[] = [];

    for (const student of recipients) {
      const phone = student.guardianPhone!;
      const personalised = message
        .replace(/\{\{studentName\}\}/g, student.studentName)
        .replace(/\{\{class\}\}/g, student.currentClass)
        .replace(/\{\{schoolName\}\}/g, 'Avenir School');

      openWhatsApp(phone, personalised);
      phones.push(phone);
      count++;
      setSentCount(count);

      // Small delay to avoid browser blocking multiple popups
      await new Promise(r => setTimeout(r, 800));
    }

    // Log
    await addDoc(collection(db, 'whatsapp_logs'), {
      messageType: msgType,
      message,
      recipients: phones,
      recipientCount: count,
      sentBy: profile?.displayName || 'Admin',
      sentAt: serverTimestamp(),
    } as Omit<WhatsAppLog, 'id'>);

    toast.success(`Opened WhatsApp for ${count} recipients`);
    setSending(false);
    setShowConfirm(false);
  };

  const handleSendOne = (student: Student) => {
    if (!student.guardianPhone) {
      toast.error(`No phone number for ${student.studentName}'s guardian`);
      return;
    }
    const personalised = message
      .replace(/\{\{studentName\}\}/g, student.studentName)
      .replace(/\{\{class\}\}/g, student.currentClass)
      .replace(/\{\{schoolName\}\}/g, 'Avenir School');
    openWhatsApp(student.guardianPhone, personalised);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin" className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-green-600" />
            WhatsApp Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Send messages to parents via WhatsApp</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        {(['compose', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
              activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Compose */}
          <div className="space-y-5">
            {/* Message type */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Message Type</label>
              <div className="grid grid-cols-1 gap-2">
                {MESSAGE_TYPES.map(mt => (
                  <button
                    key={mt.type}
                    onClick={() => handleTypeChange(mt.type)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                      msgType === mt.type ? mt.color + ' border-current' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {mt.icon}
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target class */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Target Recipients</label>
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="all">All Classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">Message</label>
                <button
                  onClick={handleAIGenerate}
                  disabled={aiLoading}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Polish
                </button>
              </div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={12}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                placeholder="Type your message here…"
              />
              <p className="text-xs text-slate-400 mt-1">
                Use {`{{studentName}}`}, {`{{class}}`}, {`{{schoolName}}`} as placeholders
              </p>
            </div>
          </div>

          {/* Right: Recipients */}
          <div>
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h3 className="font-semibold text-slate-900">Recipients</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {recipients.length} of {filteredStudents.length} have phone numbers
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Users className="w-4 h-4" />
                  {recipients.length}
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No students match filters</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {filteredStudents.map(student => (
                    <div key={student.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{student.studentName}</p>
                        <p className="text-xs text-slate-500">{student.currentClass} · {student.guardianPhone || 'No phone'}</p>
                      </div>
                      {student.guardianPhone ? (
                        <button
                          onClick={() => handleSendOne(student)}
                          className="flex-shrink-0 ml-2 flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          Send
                        </button>
                      ) : (
                        <span className="flex-shrink-0 ml-2 text-xs text-slate-300">No phone</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={recipients.length === 0 || !message.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send to All {recipients.length} Recipients
                </button>
                <p className="text-xs text-slate-400 text-center mt-2">
                  WhatsApp will open for each recipient individually
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 font-semibold text-slate-900">Message History</div>
          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No messages sent yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize">
                          {log.messageType.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-400">
                          {log.sentAt?.toDate ? log.sentAt.toDate().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2">{log.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Sent to {log.recipientCount} recipients · by {log.sentBy}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => !sending && setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900 mb-2">Send WhatsApp Messages</h3>
              <p className="text-sm text-slate-600 mb-1">
                This will open WhatsApp for each of the <strong>{recipients.length} recipients</strong>.
              </p>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 mb-5">
                Your browser may block multiple pop-ups. Please allow pop-ups for this site, or use the individual Send buttons instead.
              </p>

              {sending && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
                    <span>Opening WhatsApp…</span>
                    <span>{sentCount} / {recipients.length}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${(sentCount / recipients.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSendAll}
                  disabled={sending}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending…' : 'Confirm Send'}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={sending}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
