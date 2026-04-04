import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import {
  collection, query, onSnapshot, where, addDoc, serverTimestamp,
  orderBy, updateDoc, doc, deleteDoc, getDocs, writeBatch
} from 'firebase/firestore';
import { Student, Assignment, Message, SUBJECTS, TERMS, CURRENT_SESSION, SCHOOL_CLASSES, Grade, calculateGrade, StudentSkills, SKILL_LABELS, SkillRating, StudentSkillRecord } from '../types';
import { batchUpsertAttendance } from '../services/firestoreService';
import { generateLessonNotes, generateExamQuestions } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { useSchool } from '../components/SchoolContext';
import {
  BookOpen, Users, MessageSquare, Plus, Send, Loader2,
  Calendar, CheckCircle2, Clock, Filter, Search,
  Edit2, Trash2, X, AlertCircle, ClipboardList, CheckSquare,
  Sparkles, FileText, Copy, ChevronDown, Star, Award,
} from 'lucide-react';

type TabType = 'students' | 'attendance' | 'assignments' | 'grades' | 'skills' | 'messages' | 'ai_tools';

interface AttendanceRow {
  studentId: string;
  studentName: string;
  studentIdCode: string;
  status: 'present' | 'absent' | 'late';
}

export default function TeacherPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('students');
  const [selectedClass, setSelectedClass] = useState(SCHOOL_CLASSES[0]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);

  // New Assignment Form
  const [newAssignment, setNewAssignment] = useState({
    title: '', description: '', subject: SUBJECTS[0], class: SCHOOL_CLASSES[0], dueDate: ''
  });

  // New Message Form
  const [newMessage, setNewMessage] = useState({ receiverId: '', content: '' });

  // AI Tools state
  const [aiTool, setAiTool] = useState<'lesson' | 'questions'>('lesson');
  const [aiSubject, setAiSubject] = useState(SUBJECTS[0]);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLevel, setAiLevel] = useState(SCHOOL_CLASSES[6]);
  const [aiQuestionCount, setAiQuestionCount] = useState(10);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState('');

  // Gradebook state
  const [gradeSubject, setGradeSubject] = useState(SUBJECTS[0]);
  const [gradeTerm, setGradeTerm] = useState<string>(TERMS[0]);
  const [gradeSession, setGradeSession] = useState(CURRENT_SESSION);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [savingGrades, setSavingGrades] = useState(false);
  const [gradeSavedIds, setGradeSavedIds] = useState<Set<string>>(new Set());

  // Skills state
  const [skillsTerm, setSkillsTerm] = useState<string>(TERMS[0]);
  const [skillsSession, setSkillsSession] = useState(CURRENT_SESSION);
  const [skills, setSkills] = useState<Record<string, StudentSkills>>({});
  const [savingSkills, setSavingSkills] = useState(false);

  useEffect(() => {
    if (!user) return;

    const qStudents = query(collection(db, 'students'), where('currentClass', '==', selectedClass));
    const unsubStudents = onSnapshot(qStudents, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(list);
      setLoading(false);
    });

    const qAssignments = query(collection(db, 'assignments'), where('teacherId', '==', user.uid));
    const unsubAssign = onSnapshot(qAssignments, snap => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    });

    const qMsgs = query(collection(db, 'messages'), where('receiverId', 'in', [user.uid, user.email]), orderBy('timestamp', 'desc'));
    const qSent = query(collection(db, 'messages'), where('senderId', '==', user.uid), orderBy('timestamp', 'desc'));

    const unsubMsgs = onSnapshot(qMsgs, snap => {
      const received = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(prev => {
        const sent = prev.filter(m => m.senderId === user.uid);
        const all = [...received, ...sent].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return Array.from(new Map(all.map(m => [m.id, m])).values());
      });
    });

    const unsubSent = onSnapshot(qSent, snap => {
      const sent = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(prev => {
        const received = prev.filter(m => m.receiverId === user.uid || m.receiverId === user.email);
        const all = [...received, ...sent].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return Array.from(new Map(all.map(m => [m.id, m])).values());
      });
    });

    return () => { unsubStudents(); unsubAssign(); unsubMsgs(); unsubSent(); };
  }, [user, selectedClass]);

  // Load existing attendance when class or date changes (in attendance tab)
  useEffect(() => {
    if (activeTab !== 'attendance' || students.length === 0) return;

    const fetchExisting = async () => {
      const q = query(
        collection(db, 'attendance'),
        where('class', '==', selectedClass),
        where('date', '==', attendanceDate)
      );
      const snap = await getDocs(q);
      const existingMap: Record<string, 'present' | 'absent' | 'late'> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        existingMap[data.studentId] = data.status;
      });

      setAttendanceRows(students.map(s => ({
        studentId: s.id!,
        studentName: s.studentName,
        studentIdCode: s.studentId,
        status: existingMap[s.id!] || 'present'
      })));
    };

    fetchExisting();
  }, [activeTab, students, selectedClass, attendanceDate]);

  const cycleStatus = (studentId: string) => {
    setAttendanceRows(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      const next: Record<string, 'present' | 'absent' | 'late'> = {
        present: 'absent', absent: 'late', late: 'present'
      };
      return { ...r, status: next[r.status] };
    }));
  };

  const setAllStatus = (status: 'present' | 'absent') => {
    setAttendanceRows(prev => prev.map(r => ({ ...r, status })));
  };

  const handleSaveAttendance = async () => {
    if (!user || attendanceRows.length === 0) return;
    setSavingAttendance(true);
    const records = attendanceRows.map(r => ({
      studentId: r.studentId,
      date: attendanceDate,
      status: r.status,
      class: selectedClass,
      recordedBy: user.uid
    }));
    const tid = toast.loading('Saving attendance…');
    try {
      await batchUpsertAttendance(records);
      toast.success('Attendance saved!', { id: tid });
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 3000);
    } catch (e: any) {
      toast.error('Failed to save attendance', { id: tid });
    } finally {
      setSavingAttendance(false);
    }
  };

  // ── Load existing grades when subject/class/term changes ──
  useEffect(() => {
    if (activeTab !== 'grades' || students.length === 0) return;
    const fetchGrades = async () => {
      const q = query(
        collection(db, 'grades'),
        where('class', '==', selectedClass),
        where('subject', '==', gradeSubject),
        where('term', '==', gradeTerm),
        where('session', '==', gradeSession)
      );
      const snap = await getDocs(q);
      const map: Record<string, Grade> = {};
      snap.docs.forEach(d => {
        const g = { id: d.id, ...d.data() } as Grade;
        map[g.studentId] = g;
      });
      students.forEach(s => {
        if (!map[s.id!]) {
          map[s.id!] = {
            studentId: s.id!,
            subject: gradeSubject,
            class: selectedClass,
            term: gradeTerm as Grade['term'],
            session: gradeSession,
            caScore: 0,
            examScore: 0,
            totalScore: 0,
            grade: 'F9',
            updatedAt: null,
          };
        }
      });
      setGrades(map);
    };
    fetchGrades();
  }, [activeTab, students, selectedClass, gradeSubject, gradeTerm, gradeSession]);

  // ── Load existing skills when class/term changes ──
  useEffect(() => {
    if (activeTab !== 'skills' || students.length === 0) return;
    const fetchSkillsData = async () => {
      const q = query(
        collection(db, 'student_skills'),
        where('class', '==', selectedClass),
        where('term', '==', skillsTerm),
        where('session', '==', skillsSession)
      );
      const snap = await getDocs(q);
      const map: Record<string, StudentSkills> = {};
      snap.docs.forEach(d => {
        const rec = d.data() as StudentSkillRecord;
        map[rec.studentId] = rec.skills;
      });
      const defaultSkills: StudentSkills = { punctuality: 'G', neatness: 'G', cooperation: 'G', honesty: 'G', sports: 'G', creativity: 'G' };
      students.forEach(s => { if (!map[s.id!]) map[s.id!] = { ...defaultSkills }; });
      setSkills(map);
    };
    fetchSkillsData();
  }, [activeTab, students, selectedClass, skillsTerm, skillsSession]);

  const updateGradeScore = (studentId: string, field: 'caScore' | 'examScore', val: number) => {
    setGrades(prev => {
      const g = { ...prev[studentId] };
      g[field] = Math.min(field === 'caScore' ? 40 : 60, Math.max(0, val));
      g.totalScore = g.caScore + g.examScore;
      g.grade = calculateGrade(g.totalScore);
      return { ...prev, [studentId]: g };
    });
  };

  const handleSaveGrades = async () => {
    setSavingGrades(true);
    const tid = toast.loading('Saving grades…');
    try {
      const sorted = [...students].sort((a, b) => (grades[b.id!]?.totalScore ?? 0) - (grades[a.id!]?.totalScore ?? 0));
      const posMap: Record<string, number> = {};
      sorted.forEach((s, i) => { posMap[s.id!] = i + 1; });

      const batch = writeBatch(db);
      for (const [studentId, g] of Object.entries(grades)) {
        const withPos = { ...g, subjectPosition: posMap[studentId] || 0 };
        if (g.id) {
          batch.update(doc(db, 'grades', g.id), { ...withPos, updatedAt: serverTimestamp() });
        } else {
          const ref = doc(collection(db, 'grades'));
          batch.set(ref, { ...withPos, updatedAt: serverTimestamp() });
        }
      }
      await batch.commit();
      toast.success(`Saved grades for ${Object.keys(grades).length} students!`, { id: tid });
      setGradeSavedIds(new Set(Object.keys(grades)));
      setTimeout(() => setGradeSavedIds(new Set()), 3000);
    } catch (e: any) {
      toast.error('Save failed: ' + (e.message || ''), { id: tid });
    } finally {
      setSavingGrades(false);
    }
  };

  const updateSkill = (studentId: string, key: keyof StudentSkills, value: SkillRating) => {
    setSkills(prev => ({ ...prev, [studentId]: { ...prev[studentId], [key]: value } }));
  };

  const handleSaveSkills = async () => {
    setSavingSkills(true);
    const tid = toast.loading('Saving skills…');
    try {
      const q = query(
        collection(db, 'student_skills'),
        where('class', '==', selectedClass),
        where('term', '==', skillsTerm),
        where('session', '==', skillsSession)
      );
      const snap = await getDocs(q);
      const existingMap: Record<string, string> = {};
      snap.docs.forEach(d => { existingMap[(d.data() as StudentSkillRecord).studentId] = d.id; });

      const batch = writeBatch(db);
      for (const [studentId, s] of Object.entries(skills)) {
        const payload: Omit<StudentSkillRecord, 'id'> = {
          studentId,
          class: selectedClass,
          term: skillsTerm as StudentSkillRecord['term'],
          session: skillsSession,
          skills: s,
          updatedAt: serverTimestamp(),
        };
        if (existingMap[studentId]) {
          batch.update(doc(db, 'student_skills', existingMap[studentId]), payload);
        } else {
          batch.set(doc(collection(db, 'student_skills')), payload);
        }
      }
      await batch.commit();
      toast.success('Skills saved!', { id: tid });
    } catch (e: any) {
      toast.error('Save failed: ' + (e.message || ''), { id: tid });
    } finally {
      setSavingSkills(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    if (!user) return;
    if (editingAssignment) {
      const ref = doc(db, 'assignments', editingAssignment.id!);
      await updateDoc(ref, { ...newAssignment, updatedAt: serverTimestamp() });
      setEditingAssignment(null);
    } else {
      await addDoc(collection(db, 'assignments'), {
        ...newAssignment, teacherId: user.uid, createdAt: serverTimestamp()
      });
    }
    setNewAssignment({ title: '', description: '', subject: SUBJECTS[0], class: SCHOOL_CLASSES[0], dueDate: '' });
  };

  const handleDeleteAssignment = async (id: string) => {
    await deleteDoc(doc(db, 'assignments', id));
    setShowDeleteConfirm(null);
  };

  const filteredAssignments = assignments.filter(a =>
    a.title.toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    a.subject.toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    a.class.toLowerCase().includes(assignmentSearch.toLowerCase())
  );

  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) { toast.error('Please enter a topic.'); return; }
    setAiLoading(true);
    setAiOutput('');
    const tid = toast.loading('Generating with AI…');
    try {
      let result: string | undefined;
      if (aiTool === 'lesson') {
        result = await generateLessonNotes(aiSubject, aiTopic, aiLevel);
      } else {
        result = await generateExamQuestions(aiSubject, aiTopic, aiQuestionCount);
      }
      setAiOutput(result || '');
      toast.success('Generated!', { id: tid });
    } catch (e: any) {
      toast.error('AI error: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setAiLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(aiOutput).then(() => toast.success('Copied to clipboard!'));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !newMessage.receiverId) return;
    await addDoc(collection(db, 'messages'), {
      ...newMessage, senderId: user.uid, senderName: profile.displayName,
      timestamp: serverTimestamp(), read: false
    });
    setNewMessage({ ...newMessage, content: '' });
  };

  const tabs: { id: TabType; label: string; Icon: React.ElementType }[] = [
    { id: 'students', label: 'My Students', Icon: Users },
    { id: 'attendance', label: 'Attendance', Icon: ClipboardList },
    { id: 'grades', label: 'Gradebook', Icon: Award },
    { id: 'skills', label: 'Skills', Icon: Star },
    { id: 'assignments', label: 'Assignments', Icon: BookOpen },
    { id: 'messages', label: 'Messages', Icon: MessageSquare },
    { id: 'ai_tools', label: 'AI Tools', Icon: Sparkles },
  ];

  const statusColor = (s: string) =>
    s === 'present' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    s === 'absent' ? 'bg-rose-50 text-rose-700 border-rose-200' :
    'bg-amber-50 text-amber-700 border-amber-200';

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Teacher Portal</h1>
        <p className="text-slate-500 mt-1">Welcome back, {profile?.displayName}. Manage your classes and communicate with parents.</p>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'My Students', value: students.length, color: 'indigo', Icon: Users, tab: 'students' as TabType },
          { label: 'Assignments', value: assignments.length, color: 'emerald', Icon: BookOpen, tab: 'assignments' as TabType },
          { label: 'Unread Messages', value: messages.filter(m => m.senderId !== user?.uid && !m.read).length, color: 'violet', Icon: MessageSquare, tab: 'messages' as TabType },
          { label: "Today's Roll", value: attendanceRows.filter(r => r.status === 'present').length + '/' + attendanceRows.length, color: 'amber', Icon: CheckSquare, tab: 'attendance' as TabType },
        ].map(card => (
          <button
            key={card.tab}
            onClick={() => setActiveTab(card.tab)}
            className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left group`}
          >
            <div className={`w-10 h-10 rounded-xl bg-${card.color}-50 flex items-center justify-center mb-3`}>
              <card.Icon className={`w-5 h-5 text-${card.color}-600`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <button
          onClick={() => navigate('/calendar')}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-indigo-600 transition-all flex items-center gap-2"
        >
          <Calendar className="w-4 h-4" />
          Calendar
        </button>
      </div>

      {/* ── STUDENTS TAB ── */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
            >
              {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-sm text-slate-400 font-medium">{students.length} students</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {students.map(student => (
              <div key={student.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg mr-3">
                    {student.studentName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{student.studentName}</h4>
                    <p className="text-xs text-slate-400 font-mono">{student.studentId}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-slate-600 mb-4">
                  <p><span className="text-slate-400 text-xs font-bold uppercase">Guardian:</span> {student.guardianName || '—'}</p>
                  <p><span className="text-slate-400 text-xs font-bold uppercase">Contact:</span> {student.guardianEmail || 'Not set'}</p>
                </div>
                <button
                  onClick={() => { setActiveTab('messages'); setNewMessage({ receiverId: student.guardianEmail || '', content: '' }); }}
                  className="w-full py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-colors text-xs"
                >
                  Message Parent
                </button>
              </div>
            ))}
            {students.length === 0 && (
              <div className="col-span-3 text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500">No students in {selectedClass}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ATTENDANCE TAB ── */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-indigo-600" />
                  Daily Roll Call
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">Click a status badge to cycle: Present → Absent → Late</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={e => setAttendanceDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <button onClick={() => setAllStatus('present')} className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> All Present
              </button>
              <button onClick={() => setAllStatus('absent')} className="px-4 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition-colors flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> All Absent
              </button>
              {attendanceSaved && (
                <span className="px-4 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
                </span>
              )}
            </div>

            {attendanceRows.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No students found in {selectedClass}. Switch to the Students tab to see the roster.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Stats row */}
                <div className="flex gap-4 text-xs font-bold mb-3">
                  <span className="text-emerald-600">{attendanceRows.filter(r => r.status === 'present').length} Present</span>
                  <span className="text-rose-600">{attendanceRows.filter(r => r.status === 'absent').length} Absent</span>
                  <span className="text-amber-600">{attendanceRows.filter(r => r.status === 'late').length} Late</span>
                  <span className="text-slate-400">/ {attendanceRows.length} Total</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">#</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Student</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Student ID</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {attendanceRows.map((row, i) => (
                        <tr key={row.studentId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 text-sm text-slate-400 font-medium">{i + 1}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-sm">
                                {row.studentName.charAt(0)}
                              </div>
                              <span className="text-sm font-medium text-slate-900">{row.studentName}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-400 font-mono">{row.studentIdCode}</td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => cycleStatus(row.studentId)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase border cursor-pointer transition-all hover:scale-105 ${statusColor(row.status)}`}
                            >
                              {row.status}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSaveAttendance}
                    disabled={savingAttendance}
                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-200"
                  >
                    {savingAttendance ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Save Attendance for {new Date(attendanceDate + 'T12:00:00').toLocaleDateString('en-GB')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GRADEBOOK TAB ── */}
      {activeTab === 'grades' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <select value={gradeSubject} onChange={e => setGradeSubject(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={gradeTerm} onChange={e => setGradeTerm(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
              <input value={gradeSession} onChange={e => setGradeSession(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 w-32" placeholder="Session" />
            </div>

            {students.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No students in {selectedClass}.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-5 py-3">Student</th>
                        <th className="px-4 py-3 text-center w-24">CA /40</th>
                        <th className="px-4 py-3 text-center w-24">Exam /60</th>
                        <th className="px-4 py-3 text-center w-20">Total</th>
                        <th className="px-4 py-3 text-center w-16">Grade</th>
                        <th className="px-4 py-3 text-center w-16">Pos.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {students.map((s, i) => {
                        const g = grades[s.id!];
                        const saved = gradeSavedIds.has(s.id!);
                        return (
                          <tr key={s.id} className={`transition-colors ${saved ? 'bg-emerald-50/40' : 'hover:bg-slate-50/50'}`}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">{i+1}</div>
                                <span className="text-sm font-medium text-slate-900">{s.studentName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="number" min={0} max={40} value={g?.caScore ?? 0}
                                onChange={e => updateGradeScore(s.id!, 'caScore', Number(e.target.value))}
                                className="w-16 text-center px-2 py-1 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="number" min={0} max={60} value={g?.examScore ?? 0}
                                onChange={e => updateGradeScore(s.id!, 'examScore', Number(e.target.value))}
                                className="w-16 text-center px-2 py-1 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-bold text-sm ${(g?.totalScore ?? 0) >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>{g?.totalScore ?? 0}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-xs font-bold text-slate-600">{g?.grade ?? 'F9'}</span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-slate-400">
                              {g?.subjectPosition ? `#${g.subjectPosition}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="pt-4">
                  <button onClick={handleSaveGrades} disabled={savingGrades}
                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-100">
                    {savingGrades ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Save All Grades
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SKILLS TAB ── */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <select value={skillsTerm} onChange={e => setSkillsTerm(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
              <input value={skillsSession} onChange={e => setSkillsSession(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none w-32" placeholder="Session" />
            </div>
            <p className="text-xs text-slate-400 mb-6">Rate each student's psychomotor & affective skills for the selected term. These appear on the report card.</p>

            {students.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No students in {selectedClass}.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase">Student</th>
                        {SKILL_LABELS.map(({ label }) => (
                          <th key={label} className="px-3 py-3 text-xs font-bold text-slate-500 uppercase text-center whitespace-nowrap">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {students.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">{s.studentName}</td>
                          {SKILL_LABELS.map(({ key }) => {
                            const val = skills[s.id!]?.[key] ?? 'G';
                            const colors: Record<SkillRating, string> = {
                              E: 'bg-emerald-600 text-white', VG: 'bg-emerald-100 text-emerald-800',
                              G: 'bg-blue-50 text-blue-700', F: 'bg-amber-50 text-amber-700',
                              P: 'bg-rose-50 text-rose-700',
                            };
                            return (
                              <td key={key} className="px-3 py-3 text-center">
                                <select value={val} onChange={e => updateSkill(s.id!, key, e.target.value as SkillRating)}
                                  className={`px-2 py-1 rounded-lg text-xs font-bold border-0 outline-none cursor-pointer ${colors[val]}`}>
                                  {(['E', 'VG', 'G', 'F', 'P'] as SkillRating[]).map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 pt-4">
                  <button onClick={handleSaveSkills} disabled={savingSkills}
                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2">
                    {savingSkills ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Save All Skills
                  </button>
                  <p className="text-xs text-slate-400">E=Excellent · VG=Very Good · G=Good · F=Fair · P=Poor</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ASSIGNMENTS TAB ── */}
      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <form onSubmit={handleCreateAssignment} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 sticky top-24">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  {editingAssignment ? <Edit2 className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
                  {editingAssignment ? 'Edit Assignment' : 'New Assignment'}
                </h3>
                {editingAssignment && (
                  <button type="button" onClick={() => { setEditingAssignment(null); setNewAssignment({ title: '', description: '', subject: SUBJECTS[0], class: SCHOOL_CLASSES[0], dueDate: '' }); }}>
                    <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>
              {[
                { label: 'Title', field: 'title', type: 'text', required: true },
              ].map(({ label, field, type, required }) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">{label}</label>
                  <input
                    required={required}
                    type={type}
                    value={(newAssignment as any)[field]}
                    onChange={e => setNewAssignment({ ...newAssignment, [field]: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Subject</label>
                <select value={newAssignment.subject} onChange={e => setNewAssignment({ ...newAssignment, subject: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm">
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Class</label>
                <select value={newAssignment.class} onChange={e => setNewAssignment({ ...newAssignment, class: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm">
                  {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Due Date</label>
                <input required type="date" value={newAssignment.dueDate}
                  onChange={e => setNewAssignment({ ...newAssignment, dueDate: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Description</label>
                <textarea value={newAssignment.description}
                  onChange={e => setNewAssignment({ ...newAssignment, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none resize-none text-sm" rows={3} />
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all">
                {editingAssignment ? 'Update Assignment' : 'Create Assignment'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-bold text-slate-900">Recent Assignments ({filteredAssignments.length})</h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search assignments..." value={assignmentSearch}
                  onChange={e => setAssignmentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <AnimatePresence mode="popLayout">
              {filteredAssignments.map(a => (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-bold text-slate-900">{a.title}</h4>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full">{a.subject}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1 mb-2">{a.description}</p>
                    <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase gap-3">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{a.class}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Due: {a.dueDate}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingAssignment(a); setNewAssignment({ title: a.title, description: a.description, subject: a.subject, class: a.class, dueDate: a.dueDate }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => setShowDeleteConfirm(a.id!)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredAssignments.length === 0 && (
              <div className="text-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No assignments found.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MESSAGES TAB ── */}
      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[600px]">
          <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-600" />Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <button onClick={() => setNewMessage({ receiverId: '', content: '' })}
                className="w-full p-3 text-left rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all text-sm font-bold flex items-center justify-center gap-2">
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
                          <div className={`flex items-center mt-2 text-[10px] gap-1 ${msg.senderId === user?.uid ? 'text-indigo-200' : 'text-slate-400'}`}>
                            <Clock className="w-3 h-3" />
                            {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white">
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
                <h3 className="text-lg font-bold text-slate-900 mb-2">Select a conversation</h3>
                <p className="text-slate-500 text-sm max-w-xs mb-6">Choose from the left or enter a parent email to start a new conversation.</p>
                <div className="w-full max-w-xs">
                  <input type="email" placeholder="Enter parent email..." onChange={e => setNewMessage({ ...newMessage, receiverId: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI TOOLS TAB ── */}
      {activeTab === 'ai_tools' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> AI Teaching Tools
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Generate lesson notes and exam questions powered by AI, aligned to the Nigerian NERDC curriculum.
              </p>

              {/* Tool selector */}
              <div className="flex gap-2">
                {[
                  { id: 'lesson', label: 'Lesson Notes', icon: <FileText className="w-3.5 h-3.5" /> },
                  { id: 'questions', label: 'Exam Questions', icon: <ClipboardList className="w-3.5 h-3.5" /> },
                ].map(t => (
                  <button key={t.id} onClick={() => setAiTool(t.id as 'lesson' | 'questions')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                      aiTool === t.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                    }`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Subject</label>
                <select value={aiSubject} onChange={e => setAiSubject(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm">
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Class Level</label>
                <select value={aiLevel} onChange={e => setAiLevel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm">
                  {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Topic *</label>
                <input value={aiTopic} onChange={e => setAiTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, Quadratic equations…"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm" />
              </div>

              {aiTool === 'questions' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Number of Questions</label>
                  <input type="number" min={5} max={30} value={aiQuestionCount}
                    onChange={e => setAiQuestionCount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm" />
                </div>
              )}

              <button onClick={handleAIGenerate} disabled={aiLoading || !aiTopic.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 shadow-sm">
                {aiLoading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating…</>
                  : <><Sparkles className="w-4 h-4" /> Generate</>}
              </button>
            </div>
          </div>

          {/* Output */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm">
                  {aiOutput ? `${aiTool === 'lesson' ? 'Lesson Notes' : 'Exam Questions'}: ${aiTopic}` : 'Output will appear here'}
                </h3>
                {aiOutput && (
                  <button onClick={copyToClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {aiLoading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
                    <span className="w-8 h-8 border-3 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
                    <p className="text-sm">AI is writing your content…</p>
                  </div>
                ) : aiOutput ? (
                  <div className="prose prose-sm max-w-none text-slate-700">
                    <ReactMarkdown>{aiOutput}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-300 gap-3">
                    <Sparkles className="w-12 h-12" />
                    <p className="text-sm text-slate-400">Select a subject, enter a topic, and click Generate.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-7 h-7 text-rose-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Delete Assignment?</h3>
              <p className="text-slate-500 text-center text-sm mb-7">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={() => handleDeleteAssignment(showDeleteConfirm)} className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
