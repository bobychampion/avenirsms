import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import {
  collection, query, onSnapshot, where, addDoc, serverTimestamp,
  orderBy, updateDoc, doc, getDocs
} from 'firebase/firestore';
import { Student, Assignment, AssignmentSubmission, Message, Grade, Attendance, SchoolEvent, Invoice, Notification, TERMS, CURRENT_SESSION, calculateGrade, SKILL_LABELS, SKILL_RATING_LABELS, SkillRating } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Calendar, MessageSquare, Loader2, CheckCircle2, Clock,
  Bell, TrendingUp, AlertCircle, DollarSign, Receipt, Plus, Send,
  User, Award, Activity, X, BarChart2, FileText, Printer, CreditCard,
  Upload, ExternalLink, GraduationCap, CalendarOff,
} from 'lucide-react';
import PaymentMethodModal from '../components/PaymentMethodModal';
import { initFCMForUser, onForegroundMessage, showFcmPushNotification } from '../services/notificationService';
import { DOCUMENT_TITLE_DEFAULT } from '../constants/appMeta';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import { formatCurrency } from '../utils/formatCurrency';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';

const GRADE_COLORS: Record<string, string> = {
  A1: 'text-emerald-700 bg-emerald-50', B2: 'text-emerald-600 bg-emerald-50',
  B3: 'text-teal-700 bg-teal-50', C4: 'text-blue-700 bg-blue-50',
  C5: 'text-blue-600 bg-blue-50', C6: 'text-indigo-700 bg-indigo-50',
  D7: 'text-amber-700 bg-amber-50', E8: 'text-orange-700 bg-orange-50',
  F9: 'text-rose-700 bg-rose-50',
};

type TabType = 'progress' | 'attendance' | 'assignments' | 'absences' | 'finance' | 'messages' | 'notifications' | 'report_card';

export default function ParentPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const schoolId = useSchoolId();
  const { getGradingForClass, locale, currency, schoolName, logoUrl, reportShowLogo, reportFooterText } = useSchool();
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
  const [attendanceMonth, setAttendanceMonth] = useState<string>(''); // '' = all months
  const [newMessage, setNewMessage] = useState({ receiverId: '', content: '' });
  const [reportCardTerm, setReportCardTerm] = useState<string>(TERMS[0]);
  const [reportCardSkills, setReportCardSkills] = useState<any>(null);

  // Assignment submission state
  const [mySubmissions, setMySubmissions] = useState<AssignmentSubmission[]>([]);
  const [submittingFor, setSubmittingFor] = useState<Assignment | null>(null);
  const [submitForm, setSubmitForm] = useState({ note: '', fileUrl: '' });
  const [submitSaving, setSubmitSaving] = useState(false);

  // Absence request state
  const [myAbsenceRequests, setMyAbsenceRequests] = useState<any[]>([]);
  const [absenceForm, setAbsenceForm] = useState({ startDate: '', endDate: '', reason: '', type: 'other' as const });
  const [absenceSaving, setAbsenceSaving] = useState(false);

  // Fee payment modal
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  // Messaging: staff directory (for name resolution + search) and suggested contacts
  const [staffDirectory, setStaffDirectory] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [suggestedContacts, setSuggestedContacts] = useState<{ id: string; name: string; role: string }[]>([]);
  const [contactQuery, setContactQuery] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const contactNameMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    staffDirectory.forEach(s => { map[s.id] = s.name; });
    suggestedContacts.forEach(s => { if (!map[s.id]) map[s.id] = s.name; });
    return map;
  }, [staffDirectory, suggestedContacts]);

  // Load the searchable staff directory for this school (teachers, admins, etc.)
  useEffect(() => {
    if (!schoolId) return;
    getDocs(query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', 'in', ['teacher', 'admin', 'School_admin', 'accountant', 'hr', 'staff', 'librarian']),
    )).then(snap => {
      setStaffDirectory(snap.docs.map(d => ({
        id: d.id,
        name: (d.data().displayName as string) || (d.data().email as string) || d.id,
        email: (d.data().email as string) || '',
        role: (d.data().role as string) || 'staff',
      })));
    }).catch(() => {});
  }, [schoolId]);

  // Build "quick dial" suggestions: each child's class teacher, plus school admin/bursar
  useEffect(() => {
    if (!schoolId || children.length === 0) { setSuggestedContacts([]); return; }
    let cancelled = false;
    (async () => {
      const suggestions: { id: string; name: string; role: string }[] = [];
      const seen = new Set<string>();
      for (const child of children) {
        if (!child.currentClass) continue;
        try {
          const classSnap = await getDocs(query(
            collection(db, 'classes'),
            where('schoolId', '==', schoolId),
            where('name', '==', child.currentClass),
          ));
          const classData = classSnap.docs[0]?.data();
          const tutorId = classData?.formTutorId as string | undefined;
          const tutorName = classData?.formTutorName as string | undefined;
          if (tutorId && !seen.has(tutorId)) {
            seen.add(tutorId);
            suggestions.push({ id: tutorId, name: tutorName || 'Class Teacher', role: `${child.studentName}'s Teacher` });
          }
        } catch { /* non-fatal */ }
      }
      try {
        const adminSnap = await getDocs(query(
          collection(db, 'users'), where('schoolId', '==', schoolId), where('role', 'in', ['admin', 'School_admin']),
        ));
        adminSnap.docs.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            suggestions.push({ id: d.id, name: (d.data().displayName as string) || (d.data().email as string), role: 'School Admin' });
          }
        });
        const acctSnap = await getDocs(query(
          collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'accountant'),
        ));
        acctSnap.docs.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            suggestions.push({ id: d.id, name: (d.data().displayName as string) || (d.data().email as string), role: 'Bursar' });
          }
        });
      } catch { /* non-fatal */ }
      if (!cancelled) setSuggestedContacts(suggestions);
    })();
    return () => { cancelled = true; };
  }, [schoolId, children]);

  // ─── FCM Initialisation ──────────────────────────────────────────────────────
  // Parents are the actual target of fee/absence reminder pushes, but this
  // was previously only wired up in AdminDashboard — so parents never had a
  // token registered and never received anything.
  useEffect(() => {
    if (!user?.uid) return;
    initFCMForUser(user.uid).catch(() => {/* non-fatal */});
    let unsub: (() => void) | undefined;
    onForegroundMessage(({ title, body }) => {
      if (title) showFcmPushNotification(title, body ?? '');
    }).then(fn => { unsub = fn; });
    return () => unsub?.();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    if (!schoolId) return;

    // ── Strategy 1: match by guardianEmail (email typed by admin during enrollment)
    const qByEmail = query(
      collection(db, 'students'),
      where('schoolId', '==', schoolId!),
      where('guardianEmail', '==', user.email)
    );

    // ── Strategy 2: match by guardianUserId (UID written when admin selected "Link to existing parent account")
    const qByUid = query(
      collection(db, 'students'),
      where('schoolId', '==', schoolId!),
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
        updateChildren();
      },
      err => {
        handleFirestoreError(err, OperationType.LIST, 'students[guardianEmail]');
        setLoading(false);
      }
    );

    const unsubByUid = onSnapshot(
      qByUid,
      snap => {
        uidResults = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        updateChildren();
      },
      err => {
        // Non-fatal: email query may still return results
      }
    );

    const qNotif = query(
      collection(db, 'notifications'),
      where('schoolId', '==', schoolId!),
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
      where('schoolId', '==', schoolId!),
      where('receiverId', 'in', [user.uid, user.email!]),
      orderBy('timestamp', 'desc')
    );
    const qSent = query(
      collection(db, 'messages'),
      where('schoolId', '==', schoolId!),
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
  }, [user, schoolId]);

  useEffect(() => {
    if (!selectedChild) return;
    if (!schoolId) return;

    // Clear stale data immediately when switching children
    setGrades([]);
    setAttendance([]);
    setAssignments([]);
    setInvoices([]);
    setMySubmissions([]);
    setMyAbsenceRequests([]);

    const qGrades = query(collection(db, 'grades'), where('schoolId', '==', schoolId!), where('studentId', '==', selectedChild.id));
    const unsubGrades = onSnapshot(
      qGrades,
      snap => setGrades(snap.docs.map(d => ({ id: d.id, ...d.data() } as Grade))),
      err => console.error('[ParentPortal] grades query failed:', err.code, err.message)
    );

    const qAtt = query(collection(db, 'attendance'), where('schoolId', '==', schoolId!), where('studentId', '==', selectedChild.id), orderBy('date', 'desc'));
    const unsubAtt = onSnapshot(
      qAtt,
      snap => setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance))),
      err => console.error('[ParentPortal] attendance query failed:', err.code, err.message)
    );

    const qAssign = query(collection(db, 'assignments'), where('schoolId', '==', schoolId!), where('class', '==', selectedChild.currentClass));
    const unsubAssign = onSnapshot(
      qAssign,
      snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment))),
      err => console.error('[ParentPortal] assignments query failed:', err.code, err.message)
    );

    const qSubs = query(
      collection(db, 'assignment_submissions'),
      where('schoolId', '==', schoolId!),
      where('studentId', '==', selectedChild.id),
    );
    const unsubSubs = onSnapshot(
      qSubs,
      snap => setMySubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentSubmission))),
      err => console.error('[ParentPortal] submissions query failed:', err.code, err.message)
    );

    const qInv = query(collection(db, 'invoices'), where('schoolId', '==', schoolId!), where('studentId', '==', selectedChild.id), orderBy('createdAt', 'desc'));
    const unsubInv = onSnapshot(
      qInv,
      snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice))),
      err => {
        console.error('[ParentPortal] invoices query failed:', err.code, err.message);
        toast.error('Could not load fee invoices — please refresh or contact the school.');
      }
    );

    const qAbsence = query(
      collection(db, 'absence_requests'),
      where('schoolId', '==', schoolId!),
      where('studentId', '==', selectedChild.id),
    );
    const unsubAbsence = onSnapshot(qAbsence,
      snap => setMyAbsenceRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('[ParentPortal] absence_requests query failed:', err.code, err.message)
    );

    return () => { unsubGrades(); unsubAtt(); unsubAssign(); unsubSubs(); unsubInv(); unsubAbsence(); };
  }, [selectedChild, schoolId]);

  const handleSubmitAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild?.id || !schoolId) return;
    if (!absenceForm.startDate || !absenceForm.reason.trim()) { toast.error('Please fill in all required fields.'); return; }
    const end = absenceForm.endDate || absenceForm.startDate;
    if (new Date(end) < new Date(absenceForm.startDate)) { toast.error('End date must be on or after start date.'); return; }
    setAbsenceSaving(true);
    try {
      await addDoc(collection(db, 'absence_requests'), {
        studentId: selectedChild.id,
        studentName: selectedChild.studentName,
        class: selectedChild.currentClass,
        parentId: user?.uid,
        parentName: profile?.displayName || 'Parent',
        startDate: absenceForm.startDate,
        endDate: end,
        reason: absenceForm.reason,
        type: absenceForm.type,
        status: 'pending',
        schoolId,
        createdAt: serverTimestamp(),
      });

      // Notify the class's form tutor so the request doesn't go unnoticed.
      try {
        const classSnap = await getDocs(query(
          collection(db, 'classes'),
          where('schoolId', '==', schoolId),
          where('name', '==', selectedChild.currentClass),
        ));
        const formTutorId = classSnap.docs[0]?.data()?.formTutorId as string | undefined;
        if (formTutorId) {
          await addDoc(collection(db, 'notifications'), {
            recipientId: formTutorId,
            title: `Absence request — ${selectedChild.studentName}`,
            body: `${profile?.displayName || 'A parent'} requested leave for ${selectedChild.studentName} from ${absenceForm.startDate} to ${end} (${absenceForm.type}).`,
            type: 'attendance',
            read: false,
            schoolId,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) { console.error('[ParentPortal] failed to notify form tutor:', e); }

      toast.success('Absence request submitted.');
      setAbsenceForm({ startDate: '', endDate: '', reason: '', type: 'other' });
    } catch { toast.error('Failed to submit absence request.'); }
    finally { setAbsenceSaving(false); }
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingFor?.id || !selectedChild?.id || !schoolId) return;
    setSubmitSaving(true);
    try {
      await addDoc(collection(db, 'assignment_submissions'), {
        assignmentId: submittingFor.id,
        assignmentTitle: submittingFor.title,
        studentId: selectedChild.id,
        studentName: selectedChild.studentName,
        submittedBy: user?.uid,
        submitterName: profile?.displayName || 'Parent',
        note: submitForm.note,
        fileUrl: submitForm.fileUrl || null,
        status: 'submitted',
        schoolId,
        submittedAt: serverTimestamp(),
      } as Omit<AssignmentSubmission, 'id'>);
      toast.success('Assignment submitted successfully!');
      setSubmittingFor(null);
      setSubmitForm({ note: '', fileUrl: '' });
    } catch {
      toast.error('Failed to submit assignment.');
    } finally {
      setSubmitSaving(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !newMessage.receiverId) return;
    try {
      await addDoc(collection(db, 'messages'), {
        ...newMessage, senderId: user.uid, senderName: profile.displayName,
        timestamp: serverTimestamp(), read: false, schoolId: schoolId ?? 'main',
      });
      await addDoc(collection(db, 'notifications'), {
        recipientId: newMessage.receiverId,
        title: `New message from ${profile.displayName}`,
        body: newMessage.content.slice(0, 120),
        type: 'message',
        read: false,
        schoolId: schoolId ?? 'main',
        createdAt: serverTimestamp(),
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
    { id: 'absences', label: 'Absence Requests', Icon: CalendarOff },
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Parent Portal</h1>
          <p className="text-slate-500 mt-1 text-sm md:text-base">
            Welcome back, {profile?.displayName}.
            {children.length === 1
              ? ` Monitoring ${children[0].studentName}'s progress.`
              : ` You have ${children.length} children enrolled.`}
          </p>
        </div>
      </div>

      {/* ── MY CHILDREN — always visible when multiple children ── */}
      {children.length > 1 && (
        <div className="mb-5">
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
              { label: 'Outstanding Fees', value: formatCurrency(unpaidInvoices.reduce((s, i) => s + i.amount, 0), locale, currency), Icon: DollarSign, color: unpaidInvoices.length > 0 ? 'rose' : 'emerald' },
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

      {/* ── Desktop Tab Bar (hidden on mobile) ── */}
      <div className="hidden md:flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl mb-8">
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

      {/* ── Mobile Bottom Tab Bar (fixed, shown only on mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-2px_16px_rgba(0,0,0,0.06)]">
        <div className="flex overflow-x-auto scrollbar-none">
          {tabs.map(({ id, label, Icon, badge }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 min-w-[56px] flex flex-col items-center justify-center gap-0.5 py-2 px-1 relative transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  {badge && badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </div>
                <span className={`text-[9px] font-bold leading-none whitespace-nowrap`}>{label}</span>
                {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-600 rounded-full" />}
              </button>
            );
          })}
          <button
            onClick={() => navigate('/calendar')}
            className="flex-1 min-w-[56px] flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-slate-400 transition-colors"
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Calendar</span>
          </button>
        </div>
      </nav>

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
      {activeTab === 'attendance' && (() => {
        // Unique months with data, newest first
        const availableMonths = Array.from(
          new Set<string>(attendance.map(a => a.date.slice(0, 7)))
        ).sort((a, b) => b.localeCompare(a));

        // Always show a specific month in the grid; default to most recent with data
        const displayMonth = attendanceMonth || availableMonths[0] || new Date().toISOString().slice(0, 7);
        const [gridYear, gridMonth] = displayMonth.split('-').map(Number);
        const daysInMonth = new Date(gridYear, gridMonth, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        // date string → status lookup for this month
        const dateMap: Record<string, 'present' | 'absent' | 'late'> = {};
        attendance.forEach(a => {
          if (a.date.startsWith(displayMonth)) dateMap[a.date] = a.status as 'present' | 'absent' | 'late';
        });

        const fmtMonth = (ym: string) => {
          const [y, m] = ym.split('-');
          return new Date(Number(y), Number(m) - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        };

        const isWeekend = (d: number) => {
          const dow = new Date(gridYear, gridMonth - 1, d).getDay();
          return dow === 0 || dow === 6;
        };

        const dateStr = (d: number) => `${displayMonth}-${String(d).padStart(2, '0')}`;

        const presentCount = days.filter(d => dateMap[dateStr(d)] === 'present').length;
        const absentCount  = days.filter(d => dateMap[dateStr(d)] === 'absent').length;
        const lateCount    = days.filter(d => dateMap[dateStr(d)] === 'late').length;
        const recordedDays = days.filter(d => !!dateMap[dateStr(d)]).length;
        const monthRate    = recordedDays > 0 ? Math.round((presentCount / recordedDays) * 100) : 0;

        const dotClass = (status: string | undefined) => {
          if (status === 'present') return 'bg-emerald-400';
          if (status === 'absent')  return 'bg-rose-300';
          if (status === 'late')    return 'bg-amber-300';
          return 'bg-slate-200';
        };

        return (
          <div className="space-y-4">

            {/* ── Header card: class label + month picker + legend ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Class + month label */}
                <p className="text-sm font-bold text-slate-800 flex items-center gap-2 shrink-0">
                  <User className="w-4 h-4 text-indigo-500" />
                  {selectedChild?.currentClass} — {fmtMonth(displayMonth)}
                </p>

                {/* Month selector */}
                <select
                  value={displayMonth}
                  onChange={e => setAttendanceMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {availableMonths.length === 0
                    ? <option value={displayMonth}>No records yet</option>
                    : availableMonths.map(ym => <option key={ym} value={ym}>{fmtMonth(ym)}</option>)
                  }
                </select>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-auto text-xs text-slate-500">
                  {[
                    { label: 'Present',   dot: 'bg-emerald-400' },
                    { label: 'Absent',    dot: 'bg-rose-300'    },
                    { label: 'Late',      dot: 'bg-amber-300'   },
                    { label: 'No record', dot: 'bg-slate-200'   },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 font-medium">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.dot}`} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Calendar grid ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {attendance.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                  <p className="text-sm">No attendance records found for this student.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left">
                    {/* Day-number header row */}
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="sticky left-0 bg-white z-10 px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide min-w-[9rem] border-r border-slate-100">
                          Student
                        </th>
                        {days.map(d => (
                          <th
                            key={d}
                            className={`w-7 py-3 text-center text-xs font-semibold select-none ${
                              isWeekend(d) ? 'text-slate-300 bg-slate-50' : 'text-slate-400'
                            }`}
                          >
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {/* Student dot row */}
                      <tr className="border-b border-slate-50">
                        <td className="sticky left-0 bg-white z-10 px-4 py-3 text-sm font-semibold text-slate-800 border-r border-slate-100 truncate max-w-[9rem]">
                          {selectedChild?.studentName}
                        </td>
                        {days.map(d => {
                          const ds = dateStr(d);
                          const st = dateMap[ds];
                          return (
                            <td
                              key={d}
                              title={st ? `${ds}: ${st}` : `${ds}: no record`}
                              className={`py-3 text-center ${isWeekend(d) ? 'bg-slate-50' : ''}`}
                            >
                              <span className={`inline-block w-4 h-4 rounded-full ${dotClass(st)}`} />
                            </td>
                          );
                        })}
                      </tr>

                      {/* Total row */}
                      <tr className="bg-slate-50/70">
                        <td className="sticky left-0 bg-slate-50 z-10 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wide border-r border-slate-100">
                          Total
                        </td>
                        {days.map(d => {
                          const st = dateMap[dateStr(d)];
                          return (
                            <td key={d} className={`py-2 text-center text-xs font-bold ${isWeekend(d) ? 'bg-slate-50' : ''}`}>
                              {st === 'present'
                                ? <span className="text-emerald-500">1</span>
                                : st === 'absent'
                                  ? <span className="text-rose-400">·</span>
                                  : st === 'late'
                                    ? <span className="text-amber-400">·</span>
                                    : null}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Summary stat cards ── */}
            {recordedDays > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Present',         value: presentCount,  dot: 'bg-emerald-400', textColor: 'text-emerald-600' },
                  { label: 'Absent',          value: absentCount,   dot: 'bg-rose-300',    textColor: 'text-rose-500'    },
                  { label: 'Late',            value: lateCount,     dot: 'bg-amber-300',   textColor: 'text-amber-500'   },
                  { label: 'Attendance Rate', value: `${monthRate}%`, dot: '',
                    textColor: monthRate >= 75 ? 'text-emerald-600' : monthRate >= 50 ? 'text-amber-500' : 'text-rose-500' },
                ].map(s => (
                  <div key={s.label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                    {s.dot && <span className={`w-3 h-3 rounded-full shrink-0 ${s.dot}`} />}
                    <div>
                      <p className={`text-xl font-extrabold ${s.textColor}`}>{s.value}</p>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Low-attendance warning */}
            {monthRate > 0 && monthRate < 75 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium">
                  Attendance is below 75% for {fmtMonth(displayMonth)}. Please contact the school if there are any concerns.
                </p>
              </div>
            )}

          </div>
        );
      })()}

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
            const submission = mySubmissions.find(s => s.assignmentId === a.id);
            return (
              <div key={a.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOverdue && !submission ? 'bg-rose-50' : submission ? 'bg-emerald-50' : 'bg-indigo-50'}`}>
                      <BookOpen className={`w-5 h-5 ${isOverdue && !submission ? 'text-rose-600' : submission ? 'text-emerald-600' : 'text-indigo-600'}`} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{a.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{a.subject} · {a.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-bold uppercase tracking-wider ${isOverdue && !submission ? 'text-rose-600' : 'text-slate-400'}`}>
                      {isOverdue ? 'Overdue' : 'Due'}
                    </p>
                    <p className="text-sm font-medium text-slate-700 mt-0.5">{a.dueDate}</p>
                  </div>
                </div>

                {/* Submission status / action */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  {submission ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                        submission.status === 'graded'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        {submission.status === 'graded' ? 'Graded' : 'Submitted'}
                      </span>
                      {submission.grade && (
                        <span className="text-xs font-bold bg-indigo-600 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" /> {submission.grade}
                        </span>
                      )}
                      {submission.feedback && (
                        <p className="text-xs text-slate-500 italic">"{submission.feedback}"</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Not yet submitted</p>
                  )}
                  <button
                    onClick={() => { setSubmittingFor(a); setSubmitForm({ note: '', fileUrl: '' }); }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {submission ? 'Resubmit' : 'Submit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SUBMIT ASSIGNMENT MODAL ── */}
      <AnimatePresence>
        {submittingFor && (
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
              onSubmit={handleSubmitAssignment}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Upload className="w-5 h-5 text-indigo-600" />
                  Submit Assignment
                </h3>
                <button type="button" onClick={() => setSubmittingFor(null)}>
                  <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                </button>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-sm font-bold text-slate-900">{submittingFor.title}</p>
                <p className="text-xs text-slate-500">{submittingFor.subject} · {submittingFor.class} · Due {submittingFor.dueDate}</p>
                <p className="text-xs text-indigo-600 mt-1">For: {selectedChild?.studentName}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notes / Answer *</label>
                <textarea
                  required
                  placeholder="Write the answer or add notes about the submission…"
                  value={submitForm.note}
                  onChange={e => setSubmitForm({ ...submitForm, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={4}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  File Link (optional)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/… or similar"
                  value={submitForm.fileUrl}
                  onChange={e => setSubmitForm({ ...submitForm, fileUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Paste a Google Drive or photo link if the work is in a file.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSubmittingFor(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {submitSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ABSENCE REQUESTS ── */}
      {activeTab === 'absences' && (
        <div className="space-y-6">
          {/* Submit form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CalendarOff className="w-5 h-5 text-indigo-600" /> Request Planned Absence
            </h3>
            <form onSubmit={handleSubmitAbsence} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Start Date *</label>
                <input required type="date" value={absenceForm.startDate}
                  onChange={e => setAbsenceForm({ ...absenceForm, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">End Date (if multi-day)</label>
                <input type="date" value={absenceForm.endDate}
                  onChange={e => setAbsenceForm({ ...absenceForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Type</label>
                <select value={absenceForm.type}
                  onChange={e => setAbsenceForm({ ...absenceForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="medical">Medical</option>
                  <option value="holiday">Holiday / Travel</option>
                  <option value="family">Family Event</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Reason *</label>
                <input required placeholder="Brief reason for absence" value={absenceForm.reason}
                  onChange={e => setAbsenceForm({ ...absenceForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={absenceSaving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {absenceSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>

          {/* Past requests */}
          <div>
            <h3 className="font-bold text-slate-900 mb-3">Past Requests ({myAbsenceRequests.length})</h3>
            {myAbsenceRequests.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                <CalendarOff className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No absence requests submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myAbsenceRequests.map((req: any) => (
                  <div key={req.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      req.status === 'approved' ? 'bg-emerald-50' :
                      req.status === 'rejected' ? 'bg-rose-50' : 'bg-amber-50'
                    }`}>
                      {req.status === 'approved'
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        : req.status === 'rejected'
                        ? <X className="w-5 h-5 text-rose-600" />
                        : <Clock className="w-5 h-5 text-amber-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-sm">{req.startDate}{req.endDate && req.endDate !== req.startDate ? ` → ${req.endDate}` : ''}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          req.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>{req.status}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 capitalize">{req.type} · {req.reason}</p>
                      {req.reviewNote && <p className="text-xs text-slate-400 mt-0.5 italic">"{req.reviewNote}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                  {formatCurrency(card.value, locale, currency)}
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
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(inv.amount, locale, currency)}</p>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                      inv.status === 'awaiting_confirmation' ? 'bg-indigo-50 text-indigo-700' :
                      inv.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                    }`}>{inv.status === 'awaiting_confirmation' ? 'awaiting confirmation' : inv.status}</span>
                    {inv.status !== 'paid' && inv.status !== 'awaiting_confirmation' && (
                      <button
                        onClick={() => setPayingInvoice(inv)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Pay Now
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {payingInvoice && schoolId && (
        <PaymentMethodModal
          invoice={payingInvoice}
          schoolId={schoolId}
          payerEmail={user?.email || ''}
          payerName={profile?.displayName || ''}
          locale={locale}
          currency={currency}
          onClose={() => setPayingInvoice(null)}
        />
      )}

      {/* ── MESSAGES ── */}
      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[600px]">
          <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-600" />Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <button onClick={() => { setNewMessage({ receiverId: '', content: '' }); setContactQuery(''); setShowContactDropdown(true); }}
                className="w-full p-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all text-sm font-bold flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> New Conversation
              </button>
              {Array.from(new Set(messages.map(m => m.senderId === user?.uid ? m.receiverId : m.senderId))).map(otherId => {
                const lastMsg = messages.find(m => m.senderId === otherId || m.receiverId === otherId);
                const unread = messages.filter(m => m.senderId === otherId && !m.read).length;
                const displayName = lastMsg?.senderId === otherId ? lastMsg.senderName : (contactNameMap[otherId] || otherId);
                return (
                  <button key={otherId}
                    onClick={() => { setNewMessage({ receiverId: otherId, content: '' }); messages.filter(m => m.senderId === otherId && !m.read).forEach(async m => { await updateDoc(doc(db, 'messages', m.id!), { read: true }); }); }}
                    className={`w-full p-4 text-left rounded-2xl transition-all border ${newMessage.receiverId === otherId ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-slate-900 text-sm truncate max-w-[120px]">{displayName}</p>
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
                  <h3 className="font-bold text-slate-900">{contactNameMap[newMessage.receiverId] || newMessage.receiverId}</h3>
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
                <div className="w-full max-w-xs relative text-left">
                  <input
                    type="text"
                    value={contactQuery}
                    onChange={e => { setContactQuery(e.target.value); setShowContactDropdown(true); }}
                    onFocus={() => setShowContactDropdown(true)}
                    onBlur={() => setTimeout(() => setShowContactDropdown(false), 150)}
                    placeholder="Search teacher, staff, or email..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  {showContactDropdown && (() => {
                    const q = contactQuery.trim().toLowerCase();
                    const matches = q
                      ? staffDirectory.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
                      : [];
                    const isEmail = /\S+@\S+\.\S+/.test(contactQuery.trim());
                    const pick = (id: string) => { setNewMessage({ receiverId: id, content: '' }); setContactQuery(''); setShowContactDropdown(false); };
                    return (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                        {!q && suggestedContacts.length > 0 && (
                          <div className="p-2">
                            <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Suggested</p>
                            {suggestedContacts.map(c => (
                              <button key={c.id} type="button" onClick={() => pick(c.id)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-indigo-50 text-left">
                                <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                                <span className="text-xs text-slate-400">{c.role}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!q && suggestedContacts.length === 0 && (
                          <p className="px-4 py-3 text-xs text-slate-400">Start typing a name or email to search staff.</p>
                        )}
                        {q && matches.length > 0 && (
                          <div className="p-2">
                            {matches.map(s => (
                              <button key={s.id} type="button" onClick={() => pick(s.id)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-indigo-50 text-left">
                                <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                                <span className="text-xs text-slate-400 capitalize">{s.role}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {q && matches.length === 0 && !isEmail && (
                          <p className="px-4 py-3 text-xs text-slate-400">No staff found matching "{contactQuery}".</p>
                        )}
                        {q && isEmail && (
                          <button type="button" onClick={() => pick(contactQuery.trim())}
                            className="w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 font-medium">
                            Message "{contactQuery.trim()}" directly
                          </button>
                        )}
                      </div>
                    );
                  })()}
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
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 print:hidden">
              <input
                type="checkbox"
                checked={profile?.reportCardShowPhoto !== false}
                onChange={async e => {
                  if (!user) return;
                  try {
                    await updateDoc(doc(db, 'users', user.uid), { reportCardShowPhoto: e.target.checked });
                  } catch (err: any) {
                    toast.error(err.message || 'Could not update preference.');
                  }
                }}
                className="w-4 h-4 accent-indigo-600 rounded"
              />
              Show photo on report card
            </label>
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
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 overflow-hidden">
                {reportShowLogo && logoUrl ? (
                  <img src={logoUrl} alt={schoolName} className="w-full h-full object-contain" />
                ) : (
                  <Award className="w-8 h-8 text-white" />
                )}
              </div>
              <h2 className="text-xl font-black tracking-wide uppercase">{schoolName}</h2>
              <p className="text-indigo-200 text-xs font-medium mt-0.5">Student Report Card</p>
            </div>

            {/* Student info band */}
            <div className="flex items-stretch border-b border-slate-200">
              {profile?.reportCardShowPhoto !== false && (
                <div className="flex items-center justify-center px-4 py-3 border-r border-slate-100">
                  <Avatar photoUrl={selectedChild.photoUrl} name={selectedChild.studentName} size="sm" />
                </div>
              )}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-slate-100">
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
                        {(() => { const g = getGradingForClass(selectedChild.currentClass); return calculateGrade(reportCardAvg, g.gradingSystem, g.customGradingScale); })()} — <span className="text-xs text-slate-500">{CURRENT_SESSION}</span>
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
                  {reportFooterText || 'This is a computer-generated report. For questions, contact the school administration.'}
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
