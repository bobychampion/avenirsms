import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import {
  collection, query, onSnapshot, where, addDoc, serverTimestamp,
  orderBy, updateDoc, doc, getDocs
} from 'firebase/firestore';
import { Student, Assignment, Message, Grade, Attendance, SchoolEvent, Invoice, Notification, TERMS, CURRENT_SESSION, calculateGrade, SKILL_LABELS, SKILL_RATING_LABELS, SkillRating } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Calendar, MessageSquare, Loader2, CheckCircle2, Clock,
  Bell, TrendingUp, AlertCircle, DollarSign, Receipt, Plus, Send,
  User, Award, Activity, X, BarChart2, FileText, Printer, CreditCard
} from 'lucide-react';
import PaystackButton from '../components/PaystackPayment';
import { DOCUMENT_TITLE_DEFAULT } from '../constants/appMeta';

const GRADE_COLORS: Record<string, string> = {
  A1: 'text-emerald-700 bg-emerald-50', B2: 'text-emerald-600 bg-emerald-50',
  B3: 'text-teal-700 bg-teal-50', C4: 'text-blue-700 bg-blue-50',
  C5: 'text-blue-600 bg-blue-50', C6: 'text-indigo-700 bg-indigo-50',
  D7: 'text-amber-700 bg-amber-50', E8: 'text-orange-700 bg-orange-50',
  F9: 'text-rose-700 bg-rose-50',
};

type TabType = 'progress' | 'attendance' | 'assignments' | 'finance' | 'messages' | 'notifications' | 'report_card';

export default function ParentPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChild, setSelectedChild] = useState<Student | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('progress');
  const [filterTerm, setFilterTerm] = useState<string>(TERMS[0]);
  const [newMessage, setNewMessage] = useState({ receiverId: '', content: '' });
  const [reportCardTerm, setReportCardTerm] = useState<string>(TERMS[0]);
  const [reportCardSkills, setReportCardSkills] = useState<any>(null);

  useEffect(() => {
    if (!user) return;

    // ── Strategy 1: match by guardianEmail (email typed by admin during enrollment)
    const qByEmail = query(
      collection(db, 'students'),
      where('guardianEmail', '==', user.email)
    );

    // ── Strategy 2: match by guardianUserId (UID written when admin selected "Link to existing parent account")
    const qByUid = query(
      collection(db, 'students'),
      where('guardianUserId', '==', user.uid)
    );

    // Merge both result sets, de-duplicate by student document ID
    const mergeChildren = (byEmail: Student[], byUid: Student[]): Student[] => {
      const map = new Map<string, Student>();
      [...byEmail, ...byUid].forEach(s => { if (s.id) map.set(s.id, s); });
      return Array.from(map.values());
    };

    let emailResults: Student[] = [];
    let uidResults: Student[] = [];

    const updateChildren = () => {
      const merged = mergeChildren(emailResults, uidResults);
      setChildren(merged);
      if (merged.length > 0) {
        setSelectedChild(prev => {
          // Keep current selection if still in the list; else pick first
          if (prev && merged.find(s => s.id === prev.id)) return prev;
          return merged[0];
        });
      }
      setLoading(false);
    };

    const unsubByEmail = onSnapshot(
      qByEmail,
      snap => {
        emailResults = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        console.debug('[ParentPortal] guardianEmail match:', emailResults.length, 'student(s)');
        updateChildren();
      },
      err => {
        console.error('[ParentPortal] guardianEmail query failed:', err.code, err.message);
        handleFirestoreError(err, OperationType.LIST, 'students[guardianEmail]');
        setLoading(false);
      }
    );

    const unsubByUid = onSnapshot(
      qByUid,
      snap => {
        uidResults = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        console.debug('[ParentPortal] guardianUserId match:', uidResults.length, 'student(s)');
        updateChildren();
      },
      err => {
        console.error('[ParentPortal] guardianUserId query failed:', err.code, err.message);
        // Non-fatal: email query may still return results
      }
    );

    const qNotif = query(
      collection(db, 'notifications'),
      where('recipientId', 'in', [user.uid, 'all']),
      orderBy('createdAt', 'desc')
    );
    const unsubNotif = onSnapshot(
      qNotif,
      snap => {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
      },
      err => {
        console.error('[ParentPortal] notifications query failed:', err.code, err.message);
      }
    );

    const qMsgs = query(
      collection(db, 'messages'),
      where('receiverId', 'in', [user.uid, user.email!]),
      orderBy('timestamp', 'desc')
    );
    const qSent = query(
      collection(db, 'messages'),
      where('senderId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubMsgs = onSnapshot(
      qMsgs,
      snap => {
        const received = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
        setMessages(prev => {
          const sent = prev.filter(m => m.senderId === user.uid);
          const all = [...received, ...sent].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          return Array.from(new Map(all.map(m => [m.id, m])).values());
        });
      },
      err => {
        console.error('[ParentPortal] messages(received) query failed:', err.code, err.message);
      }
    );

    const unsubSent = onSnapshot(
      qSent,
      snap => {
        const sent = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
        setMessages(prev => {
          const received = prev.filter(m => m.receiverId === user.uid || m.receiverId === user.email);
          const all = [...received, ...sent].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          return Array.from(new Map(all.map(m => [m.id, m])).values());
        });
      },
      err => {
        console.error('[ParentPortal] messages(sent) query failed:', err.code, err.message);
      }
    );

    return () => { unsubByEmail(); unsubByUid(); unsubNotif(); unsubMsgs(); unsubSent(); };
  }, [user]);

  useEffect(() => {
    if (!selectedChild) return;

    // Clear stale data immediately when switching children
    setGrades([]);
    setAttendance([]);
    setAssignments([]);
    setInvoices([]);

    const qGrades = query(collection(db, 'grades'), where('studentId', '==', selectedChild.id));
    const unsubGrades = onSnapshot(
      qGrades,
      snap => setGrades(snap.docs.map(d => ({ id: d.id, ...d.data() } as Grade))),
      err => console.error('[ParentPortal] grades query failed:', err.code, err.message)
    );

    const qAtt = query(collection(db, 'attendance'), where('studentId', '==', selectedChild.id), orderBy('date', 'desc'));
    const unsubAtt = onSnapshot(
      qAtt,
      snap => setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance))),
      err => console.error('[ParentPortal] attendance query failed:', err.code, err.message)
    );

    const qAssign = query(collection(db, 'assignments'), where('class', '==', selectedChild.currentClass));
    const unsubAssign = onSnapshot(
      qAssign,
      snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment))),
      err => console.error('[ParentPortal] assignments query failed:', err.code, err.message)
    );

    const qInv = query(collection(db, 'invoices'), where('studentId', '==', selectedChild.id), orderBy('createdAt', 'desc'));
    const unsubInv = onSnapshot(
      qInv,
      snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice))),
      err => console.error('[ParentPortal] invoices query failed:', err.code, err.message)
    );

    return () => { unsubGrades(); unsubAtt(); unsubAssign(); unsubInv(); };
  }, [selectedChild]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !newMessage.receiverId) return;
    try {
      await addDoc(collection(db, 'messages'), {
        ...newMessage, senderId: user.uid, senderName: profile.displayName,
        timestamp: serverTimestamp(), read: false
      });
      setNewMessage({ ...newMessage, content: '' });
    } catch (err: any) {
      console.error('[ParentPortal] sendMessage failed:', err.code, err.message);
    }
  };

  const markNotifRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err: any) {
      console.error('[ParentPortal] markNotifRead failed:', err.code, err.message);
    }
  };

  // Derived stats
  const filteredGrades = grades.filter(g => g.term === filterTerm && g.session === CURRENT_SESSION);
  const avgScore = filteredGrades.length > 0
    ? Math.round(filteredGrades.reduce((s, g) => s + (g.totalScore || (g.caScore + g.examScore)), 0) / filteredGrades.length)
    : 0;
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const unreadNotifs = notifications.filter(n => !n.read).length;
  const unreadMsgs = messages.filter(m => m.senderId !== user?.uid && !m.read).length;

  // Report card derived data
  const reportCardGrades = grades.filter(g => g.term === reportCardTerm && g.session === CURRENT_SESSION);
  const reportCardAvg = reportCardGrades.length > 0
    ? Math.round(reportCardGrades.reduce((s, g) => s + (g.totalScore || (g.caScore + g.examScore)), 0) / reportCardGrades.length)
    : 0;

  // Fetch skills record when report card tab is active
  useEffect(() => {
    if (!selectedChild || activeTab !== 'report_card') return;
    const fetchSkills = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'student_skills'),
          where('studentId', '==', selectedChild.id),
          where('term', '==', reportCardTerm),
          where('session', '==', CURRENT_SESSION)
        ));
        if (!snap.empty) setReportCardSkills(snap.docs[0].data().skills);
        else setReportCardSkills(null);
      } catch (err: any) {
        console.error('[ParentPortal] student_skills fetch failed:', err.code, err.message);
        setReportCardSkills(null);
      }
    };
    fetchSkills();
  }, [selectedChild, activeTab, reportCardTerm]);

  const tabs: { id: TabType; label: string; Icon: React.ElementType; badge?: number }[] = [
    { id: 'progress', label: 'Academic', Icon: TrendingUp },
    { id: 'report_card', label: 'Report Card', Icon: FileText },
    { id: 'attendance', label: 'Attendance', Icon: CheckCircle2 },
    { id: 'assignments', label: 'Assignments', Icon: BookOpen },
    { id: 'finance', label: 'Fees', Icon: DollarSign },
    { id: 'messages', label: 'Messages', Icon: MessageSquare, badge: unreadMsgs },
    { id: 'notifications', label: 'Notifications', Icon: Bell, badge: unreadNotifs },
  ];

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  if (children.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-16 h-16 text-slate-200 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-slate-900">No student records found</h2>
        <p className="text-slate-500 mt-2 mb-4">
          No enrolled student is linked to your account. This can happen if:
        </p>
        <ul className="text-slate-400 text-sm text-left max-w-md mx-auto space-y-1.5 mb-6 list-disc list-inside">
          <li>Your email <span className="font-mono text-indigo-500">{user?.email}</span> does not match the <em>Guardian Email</em> entered during enrollment</li>
          <li>The school administrator has not yet linked your account to your child's record</li>
          <li>Your child's admission is still pending approval</li>
        </ul>
        <p className="text-slate-400 text-sm">Please contact the school administration to resolve this.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Parent Portal</h1>
          <p className="text-slate-500 mt-1">
            Welcome back, {profile?.displayName}.
            {children.length === 1
              ? ` Monitoring ${children[0].studentName}'s progress.`
              : ` You have ${children.length} children enrolled.`}
          </p>
        </div>
      </div>

      {/* ── MY CHILDREN — always visible when multiple children ── */}
      {children.length > 1 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> My Children ({children.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {children.map(child => {
              const isSelected = selectedChild?.id === child.id;
              return (
                <button
                  key={child.id}
                  onClick={() => setSelectedChild(child)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600' : 'bg-slate-100'}`}>
                      <User className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>{child.studentName}</p>
                      <p className="text-xs text-slate-500 truncate">{child.currentClass}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{child.studentId}</p>
                    </div>
                    {isSelected && (
                      <div className="ml-auto shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Child Overview Cards */}
      {selectedChild && (
        <>
          {/* Selected child name badge (only when multiple children) */}
          {children.length > 1 && (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <p className="text-sm font-bold text-slate-700">
                Viewing: <span className="text-indigo-600">{selectedChild.studentName}</span>
                <span className="ml-2 text-xs font-normal text-slate-400">({selectedChild.currentClass} · {selectedChild.studentId})</span>
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Class', value: selectedChild.currentClass, Icon: User, color: 'indigo' },
              { label: `${filterTerm} Avg Score`, value: avgScore ? `${avgScore}%` : 'N/A', Icon: Award, color: 'emerald' },
              { label: 'Attendance Rate', value: `${attendanceRate}%`, Icon: Activity, color: attendanceRate >= 75 ? 'emerald' : 'amber' },
              { label: 'Outstanding Fees', value: `₦${unpaidInvoices.reduce((s, i) => s + i.amount, 0).toLocaleString()}`, Icon: DollarSign, color: unpaidInvoices.length > 0 ? 'rose' : 'emerald' },
            ].map(card => (
              <div key={card.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className={`w-9 h-9 rounded-xl bg-${card.color}-50 flex items-center justify-center mb-3`}>
                  <card.Icon className={`w-5 h-5 text-${card.color}-600`} />
                </div>
                <p className="text-xl font-bold text-slate-900">{card.value}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl mb-8">
        {tabs.map(({ id, label, Icon, badge }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 relative whitespace-nowrap ${
              activeTab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
            {badge && badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        ))}
        <button onClick={() => navigate('/calendar')}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-indigo-600 transition-all flex items-center gap-2">
          <Calendar className="w-4 h-4" />Calendar
        </button>
      </div>

      {/* ── ACADEMIC PROGRESS ── */}
      {activeTab === 'progress' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-bold text-slate-500">Term:</label>
            <select value={filterTerm} onChange={e => setFilterTerm(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-xs text-slate-400">{CURRENT_SESSION} Session</span>
          </div>

          {filteredGrades.length === 0 ? (
            <div className="py-16 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No grades recorded for {filterTerm} yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">{filterTerm} Results — {selectedChild?.studentName}</h3>
                {avgScore > 0 && (
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                    <BarChart2 className="w-4 h-4 text-indigo-500" />
                    Average: <span className={`px-2 py-0.5 rounded-lg font-bold ${avgScore >= 70 ? 'text-emerald-700 bg-emerald-50' : avgScore >= 50 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50'}`}>{avgScore}%</span>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Subject</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase text-center">CA (40)</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase text-center">Exam (60)</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase text-center">Total (100)</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase text-center">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredGrades.map(g => {
                      const total = g.totalScore ?? (g.caScore + g.examScore);
                      return (
                        <tr key={g.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-3 font-medium text-slate-900 text-sm">{g.subject}</td>
                          <td className="px-6 py-3 text-center text-sm text-slate-600">{g.caScore}</td>
                          <td className="px-6 py-3 text-center text-sm text-slate-600">{g.examScore}</td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-24 bg-slate-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${total >= 70 ? 'bg-emerald-500' : total >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${total}%` }} />
                              </div>
                              <span className="text-sm font-bold text-slate-900">{total}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${GRADE_COLORS[g.grade] || 'bg-slate-50 text-slate-700'}`}>
                              {g.grade}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredGrades.length > 0 && (
                <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Grade Scale: A1 (75–100) · B2 (70–74) · B3 (65–69) · C4 (60–64) · C5 (55–59) · C6 (50–54) · D7 (45–49) · E8 (40–44) · F9 (0–39)</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ATTENDANCE ── */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Days', value: attendance.length, color: 'slate' },
              { label: 'Present', value: attendance.filter(a => a.status === 'present').length, color: 'emerald' },
              { label: 'Absent', value: attendance.filter(a => a.status === 'absent').length, color: 'rose' },
              { label: 'Late', value: attendance.filter(a => a.status === 'late').length, color: 'amber' },
            ].map(s => (
              <div key={s.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Rate bar */}
          {attendance.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-700">Overall Attendance Rate</span>
                <span className={`text-sm font-bold ${attendanceRate >= 75 ? 'text-emerald-600' : attendanceRate >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {attendanceRate}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${attendanceRate >= 75 ? 'bg-emerald-500' : attendanceRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>
              {attendanceRate < 75 && (
                <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Attendance below 75%. Please contact the school if there are any concerns.
                </p>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Date</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.slice(0, 50).map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 text-sm text-slate-900 font-medium">{r.date}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          r.status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                          r.status === 'absent' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500">{r.class}</td>
                    </tr>
                  ))}
                  {attendance.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">No attendance records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGNMENTS ── */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-100">
              <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No assignments posted for {selectedChild?.currentClass}.</p>
            </div>
          ) : assignments.map(a => {
            const isOverdue = new Date(a.dueDate) < new Date();
            return (
              <div key={a.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOverdue ? 'bg-rose-50' : 'bg-indigo-50'}`}>
                    <BookOpen className={`w-5 h-5 ${isOverdue ? 'text-rose-600' : 'text-indigo-600'}`} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{a.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{a.subject} · {a.description}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-bold uppercase tracking-wider ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>
                    {isOverdue ? 'Overdue' : 'Due'}
                  </p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{a.dueDate}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FINANCE ── */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Total Invoiced', value: invoices.reduce((s, i) => s + i.amount, 0), color: 'slate' },
              { label: 'Total Paid', value: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0), color: 'emerald' },
              { label: 'Outstanding', value: unpaidInvoices.reduce((s, i) => s + i.amount, 0), color: 'rose' },
            ].map(card => (
              <div key={card.label} className={`bg-white p-6 rounded-2xl border ${card.color === 'rose' && unpaidInvoices.length > 0 ? 'border-rose-200 shadow-rose-50' : 'border-slate-200'} shadow-sm`}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{card.label}</p>
                <h3 className={`text-2xl font-bold text-${card.color === 'slate' ? 'slate-900' : card.color + '-600'}`}>
                  ₦{card.value.toLocaleString()}
                </h3>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Fee Invoices</h3>
              <Receipt className="w-5 h-5 text-slate-400" />
            </div>
            <div className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <div className="px-6 py-10 text-center text-slate-400">No invoices found.</div>
              ) : invoices.map(inv => (
                <div key={inv.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{inv.description}</p>
                    <p className="text-xs text-slate-500">{inv.term} · {inv.session} · Due: {inv.dueDate}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="text-sm font-bold text-slate-900">₦{inv.amount.toLocaleString()}</p>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                      inv.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                    }`}>{inv.status}</span>
                    {inv.status !== 'paid' && (
                      <PaystackButton
                        invoice={inv}
                        payerEmail={user?.email || ''}
                        payerName={profile?.displayName || ''}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MESSAGES ── */}
      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[600px]">
          <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-600" />Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <button onClick={() => setNewMessage({ receiverId: '', content: '' })}
                className="w-full p-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all text-sm font-bold flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> New Conversation
              </button>
              {Array.from(new Set(messages.map(m => m.senderId === user?.uid ? m.receiverId : m.senderId))).map(otherId => {
                const lastMsg = messages.find(m => m.senderId === otherId || m.receiverId === otherId);
                const unread = messages.filter(m => m.senderId === otherId && !m.read).length;
                return (
                  <button key={otherId}
                    onClick={() => { setNewMessage({ receiverId: otherId, content: '' }); messages.filter(m => m.senderId === otherId && !m.read).forEach(async m => { await updateDoc(doc(db, 'messages', m.id!), { read: true }); }); }}
                    className={`w-full p-4 text-left rounded-2xl transition-all border ${newMessage.receiverId === otherId ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-slate-900 text-sm truncate max-w-[120px]">{lastMsg?.senderId === otherId ? lastMsg.senderName : otherId}</p>
                      {unread > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{unread}</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{lastMsg?.content}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {newMessage.receiverId ? (
              <>
                <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-slate-900">{newMessage.receiverId}</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Communication Log</p>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/30">
                  {messages.filter(m => m.senderId === newMessage.receiverId || m.receiverId === newMessage.receiverId)
                    .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
                    .map(msg => (
                      <div key={msg.id} className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${msg.senderId === user?.uid ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'}`}>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                          <p className={`mt-2 text-[10px] flex items-center gap-1 ${msg.senderId === user?.uid ? 'text-indigo-200' : 'text-slate-400'}`}>
                            <Clock className="w-3 h-3" />
                            {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100">
                  <div className="flex gap-2">
                    <input required type="text" value={newMessage.content} onChange={e => setNewMessage({ ...newMessage, content: e.target.value })}
                      placeholder="Type your message..." className="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    <button type="submit" className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"><Send className="w-4 h-4" /></button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-5">
                  <MessageSquare className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Send a message</h3>
                <p className="text-slate-500 text-sm max-w-xs mb-6">Contact your child's teacher or school administration.</p>
                <div className="w-full max-w-xs">
                  <input type="email" placeholder="Enter teacher or staff email..." onChange={e => setNewMessage({ ...newMessage, receiverId: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REPORT CARD ── */}
      {activeTab === 'report_card' && selectedChild && (
        <div className="space-y-6 max-w-3xl">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-slate-500">Term:</label>
              <select value={reportCardTerm} onChange={e => setReportCardTerm(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <span className="text-xs text-slate-400">{CURRENT_SESSION}</span>
            <button
              onClick={() => {
                document.title = `Report-Card-${selectedChild.studentName}-${reportCardTerm}`;
                window.print();
                document.title = DOCUMENT_TITLE_DEFAULT;
              }}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm print:hidden">
              <Printer className="w-4 h-4" /> Print Report Card
            </button>
          </div>

          {/* Report Card */}
          <div id="report-card-parent" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
            {/* School header */}
            <div className="bg-gradient-to-r from-indigo-700 to-violet-700 p-6 text-white text-center print:bg-indigo-700">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Award className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-black tracking-wide uppercase">Avenir School</h2>
              <p className="text-indigo-200 text-xs font-medium mt-0.5">Student Report Card</p>
            </div>

            {/* Student info band */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-slate-200 divide-x divide-slate-100">
              {[
                { label: 'Student', value: selectedChild.studentName },
                { label: 'Class', value: selectedChild.currentClass },
                { label: 'Term', value: reportCardTerm },
                { label: 'Session', value: CURRENT_SESSION },
              ].map(item => (
                <div key={item.label} className="px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Grades table */}
            <div className="p-5">
              {reportCardGrades.length === 0 ? (
                <div className="py-12 text-center">
                  <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No grades recorded for {reportCardTerm} yet.</p>
                  <p className="text-xs text-slate-400 mt-1">Grades will appear here once your child's teacher has entered them.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase">Subject</th>
                      <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase">CA /40</th>
                      <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase">Exam /60</th>
                      <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase">Total</th>
                      <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase">Grade</th>
                      <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase">Pos.</th>
                      <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase hidden sm:table-cell">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportCardGrades.map(g => {
                      const total = g.totalScore ?? (g.caScore + g.examScore);
                      const gradeInfo = GRADE_COLORS[g.grade];
                      return (
                        <tr key={g.subject}>
                          <td className="py-2.5 font-medium text-slate-800">{g.subject}</td>
                          <td className="py-2.5 text-center text-slate-600">{g.caScore}</td>
                          <td className="py-2.5 text-center text-slate-600">{g.examScore}</td>
                          <td className="py-2.5 text-center font-bold text-slate-900">{total}</td>
                          <td className="py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${gradeInfo || 'bg-slate-50 text-slate-700'}`}>{g.grade}</span>
                          </td>
                          <td className="py-2.5 text-center text-xs text-slate-500">
                            {g.subjectPosition ? `#${g.subjectPosition}` : '—'}
                          </td>
                          <td className={`py-2.5 text-xs hidden sm:table-cell ${gradeInfo?.split(' ')[0] || 'text-slate-500'}`}>
                            {g.grade === 'A1' ? 'Excellent' : g.grade === 'B2' || g.grade === 'B3' ? 'Very Good' : g.grade === 'C4' || g.grade === 'C5' || g.grade === 'C6' ? 'Credit' : g.grade === 'D7' || g.grade === 'E8' ? 'Pass' : 'Fail'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={2} className="py-3 font-bold text-slate-700 text-sm pl-1">Overall Average</td>
                      <td colSpan={2} className="py-3 text-center font-black text-indigo-700 text-lg">{reportCardAvg}%</td>
                      <td colSpan={3} className="py-3 text-left pl-2 font-bold text-slate-700 text-sm">
                        {calculateGrade(reportCardAvg)} — <span className="text-xs text-slate-500">{CURRENT_SESSION}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Psychomotor Skills */}
            {reportCardSkills && (
              <div className="px-5 pb-5">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Psychomotor / Affective Skills Assessment</p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-100">
                    {SKILL_LABELS.map(({ key, label }) => {
                      const rating: SkillRating = reportCardSkills[key] ?? 'G';
                      return (
                        <div key={key} className="p-3 text-center">
                          <p className="text-xs font-semibold text-slate-600 mb-1">{label}</p>
                          <p className={`text-sm font-black ${rating === 'E' || rating === 'VG' ? 'text-emerald-600' : rating === 'P' ? 'text-rose-600' : 'text-slate-700'}`}>
                            {rating}
                          </p>
                          <p className="text-[10px] text-slate-400">{SKILL_RATING_LABELS[rating]}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
                    <p className="text-[10px] text-slate-400">E = Excellent &nbsp;|&nbsp; VG = Very Good &nbsp;|&nbsp; G = Good &nbsp;|&nbsp; F = Fair &nbsp;|&nbsp; P = Poor</p>
                  </div>
                </div>
              </div>
            )}

            {/* Attendance summary on report card */}
            {reportCardGrades.length > 0 && (
              <div className="px-5 pb-5">
                <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Times Present</p>
                    <p className="text-lg font-black text-emerald-600">{attendance.filter(a => a.status === 'present').length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Times Absent</p>
                    <p className="text-lg font-black text-rose-600">{attendance.filter(a => a.status === 'absent').length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Attendance Rate</p>
                    <p className={`text-lg font-black ${attendanceRate >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>{attendanceRate}%</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Student ID</p>
                    <p className="text-sm font-black text-slate-700 font-mono">{selectedChild.studentId}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer note */}
            <div className="px-5 pb-5">
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <p className="text-[10px] text-indigo-600 font-medium text-center">
                  This is a computer-generated report. For questions, contact the school administration.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {activeTab === 'notifications' && (
        <div className="space-y-4 max-w-2xl">
          {notifications.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-100">
              <Bell className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No notifications yet.</p>
            </div>
          ) : (
            notifications.map(n => {
              const typeColor = n.type === 'fee_due' ? 'amber' : n.type === 'exam' ? 'indigo' : n.type === 'attendance' ? 'rose' : 'slate';
              return (
                <motion.div key={n.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`bg-white p-5 rounded-2xl border ${n.read ? 'border-slate-200' : 'border-indigo-200 shadow-md shadow-indigo-50'} shadow-sm flex items-start gap-4`}>
                  <div className={`w-10 h-10 rounded-xl bg-${typeColor}-50 flex items-center justify-center shrink-0 mt-0.5`}>
                    <Bell className={`w-5 h-5 text-${typeColor}-600`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-bold text-slate-900 text-sm ${!n.read ? 'text-indigo-900' : ''}`}>{n.title}</h4>
                      {!n.read && <span className="w-2 h-2 bg-indigo-500 rounded-full shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-2">
                      {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-GB') : ''}
                    </p>
                  </div>
                  {!n.read && (
                    <button onClick={() => markNotifRead(n.id!)} title="Mark as read"
                      className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
