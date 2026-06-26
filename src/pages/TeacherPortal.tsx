import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import {
  collection, query, onSnapshot, where, addDoc, serverTimestamp,
  orderBy, updateDoc, doc, deleteDoc, getDocs, writeBatch, setDoc, getDoc,
} from 'firebase/firestore';
import { Student, Assignment, AssignmentSubmission, Message, SUBJECTS, TERMS, Grade, calculateGrade, StudentSkills, SKILL_LABELS, SkillRating, StudentSkillRecord, Timetable, DAYS_OF_WEEK, GeoFence, TeacherCheckIn, CurriculumDocument, ClassSubject, SchoolClass } from '../types';
import { getCurrentPosition, isWithinFence, isAccuracyAcceptable, isSpoofedVelocity } from '../services/geofenceService';
import { batchUpsertAttendance } from '../services/firestoreService';
import { generateLessonNotes, generateExamQuestions, generateQuestionsFromCurriculum } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import Avatar from '../components/Avatar';
import {
  BookOpen, Users, MessageSquare, Plus, Send, Loader2,
  Calendar, CheckCircle2, Clock, Filter, Search,
  Edit2, Trash2, X, AlertCircle, ClipboardList, CheckSquare,
  Sparkles, FileText, Copy, ChevronDown, Star, Award,
  MapPin, Navigation, LogIn, LogOut, ShieldAlert, Lock,
  ChevronRight, Inbox, GraduationCap, Home, BookMarked,
} from 'lucide-react';
import ProfileHeader from './TeacherPortal/ProfileHeader';
import ClockInHero from './TeacherPortal/ClockInHero';
import TeacherOverview from './TeacherPortal/TeacherOverview';
import CurriculumPage from './TeacherPortal/CurriculumPage';

type TabType = 'home' | 'students' | 'attendance' | 'assignments' | 'grades' | 'skills' | 'messages' | 'ai_tools' | 'timetable' | 'absences' | 'curriculum';

interface AttendanceRow {
  studentId: string;
  studentName: string;
  studentIdCode: string;
  photoUrl?: string;
  status: 'present' | 'absent' | 'late';
}

export default function TeacherPortal() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { classNames, subjects, currentSession, currentTerm, getGradingForClass, terms, schoolName } = useSchool();
  const schoolId = useSchoolId();

  // Derived helpers (safe fallbacks)
  const allClasses = classNames.length > 0 ? classNames : ['—'];
  const allSubjects = subjects.length > 0 ? subjects : SUBJECTS;

  // ── Teacher assignment state ─────────────────────────────────────────────────
  // myAssignedClasses: classes this teacher is assigned to (as form tutor OR subject teacher)
  // myAssignedSubjectsByClass: for each class, which subjects this teacher can grade
  const [myAssignedClasses, setMyAssignedClasses] = useState<string[]>([]);
  const [myAssignedSubjectsByClass, setMyAssignedSubjectsByClass] = useState<Record<string, string[]>>({});
  const [assignmentLoading, setAssignmentLoading] = useState(true);

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myTimetables, setMyTimetables] = useState<Timetable[]>([]);
  const [loading, setLoading] = useState(true);

  // Derive activeTab from URL query param
  const tabFromUrl = (searchParams.get('tab') as TabType) || 'home';
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl);

  // Keep activeTab in sync with URL changes (e.g. sidebar navigation)
  useEffect(() => {
    const t = (searchParams.get('tab') as TabType) || 'home';
    setActiveTab(t);
  }, [searchParams]);

  const navigateTab = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams(tab === 'home' ? {} : { tab });
  };

  const [selectedClass, setSelectedClass] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Submission viewer state
  const [viewingSubmissions, setViewingSubmissions] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [gradingSubmission, setGradingSubmission] = useState<AssignmentSubmission | null>(null);
  const [gradeForm, setGradeForm] = useState({ grade: '', feedback: '' });
  const [savingGrade, setSavingGrade] = useState(false);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);

  // Absence requests for this teacher's classes
  const [absenceRequests, setAbsenceRequests] = useState<any[]>([]);
  const [absenceReviewingId, setAbsenceReviewingId] = useState<string | null>(null);
  const [absenceReviewNote, setAbsenceReviewNote] = useState('');
  const [absenceSubmitting, setAbsenceSubmitting] = useState(false);

  // New Assignment Form
  const [newAssignment, setNewAssignment] = useState({
    title: '', description: '', subject: allSubjects[0], class: allClasses[0], dueDate: ''
  });

  // New Message Form
  const [newMessage, setNewMessage] = useState({ receiverId: '', content: '' });

  // AI Tools state
  const [aiTool, setAiTool] = useState<'lesson' | 'questions'>('lesson');
  const [aiSubject, setAiSubject] = useState(allSubjects[0]);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLevel, setAiLevel] = useState(allClasses[Math.min(6, allClasses.length - 1)]);
  const [aiQuestionCount, setAiQuestionCount] = useState(10);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState('');
  const [curriculumDocs, setCurriculumDocs] = useState<CurriculumDocument[]>([]);
  const [selectedCurriculumDocId, setSelectedCurriculumDocId] = useState<string>('');

  // Gradebook state
  const [gradeSubject, setGradeSubject] = useState(allSubjects[0]);
  const [gradeTerm, setGradeTerm] = useState<string>(terms[0] ?? TERMS[0]);
  const [gradeSession, setGradeSession] = useState(currentSession);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [savingGrades, setSavingGrades] = useState(false);
  const [gradeSavedIds, setGradeSavedIds] = useState<Set<string>>(new Set());

  // Skills state
  const [skillsTerm, setSkillsTerm] = useState<string>(terms[0] ?? TERMS[0]);
  const [skillsSession, setSkillsSession] = useState(currentSession);
  const [skills, setSkills] = useState<Record<string, StudentSkills>>({});
  const [savingSkills, setSavingSkills] = useState(false);

  // GPS check-in state
  const [geofence, setGeofence] = useState<GeoFence | null>(null);
  const [todayCheckIn, setTodayCheckIn] = useState<TeacherCheckIn | null>(null);
  const [todayCheckOut, setTodayCheckOut] = useState<TeacherCheckIn | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [autoTracking, setAutoTracking] = useState(false);
  const [currentlyInFence, setCurrentlyInFence] = useState<boolean | null>(null);

  // Refs so watchPosition callback always sees latest state
  const geofenceRef     = useRef<GeoFence | null>(null);
  const checkInRef      = useRef<TeacherCheckIn | null>(null);
  const checkOutRef     = useRef<TeacherCheckIn | null>(null);
  const prevInsideRef   = useRef<boolean | null>(null);
  const watchIdRef      = useRef<number | null>(null);
  const processingRef   = useRef(false); // prevent double-fire

  useEffect(() => { geofenceRef.current  = geofence;      }, [geofence]);
  useEffect(() => { checkInRef.current   = todayCheckIn;  }, [todayCheckIn]);
  useEffect(() => { checkOutRef.current  = todayCheckOut; }, [todayCheckOut]);

  // ── Load teacher's assigned classes from Firestore ───────────────────────────
  // A teacher is assigned to a class if:
  //   A) They appear as teacherId in any class_subjects document for that class
  //   B) They are the formTutorId of that class
  useEffect(() => {
    if (!user || !schoolId) return;
    setAssignmentLoading(true);

    const loadAssignments = async () => {
      try {
        const [subjectSnap, tutorSnap, classSnap] = await Promise.all([
          getDocs(query(collection(db, 'class_subjects'), where('schoolId', '==', schoolId), where('teacherId', '==', user.uid))),
          getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId), where('formTutorId', '==', user.uid))),
          getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
        ]);

        const idToName: Record<string, string> = {};
        classSnap.docs.forEach(d => { idToName[d.id] = (d.data().name as string) || ''; });

        // className -> subjects this teacher can grade
        // '__all__' means form tutor (access to all subjects)
        const finalByName: Record<string, string[]> = {};

        subjectSnap.docs.forEach(d => {
          const sa = d.data() as ClassSubject;
          const name = idToName[sa.classId];
          if (!name) return;
          if (!finalByName[name]) finalByName[name] = [];
          if (sa.subjectName && !finalByName[name].includes(sa.subjectName)) {
            finalByName[name].push(sa.subjectName);
          }
        });

        tutorSnap.docs.forEach(d => {
          const name = (d.data().name as string) || '';
          if (name) finalByName[name] = ['__all__'];
        });

        const allAssigned = Object.keys(finalByName).sort();
        setMyAssignedClasses(allAssigned);
        setMyAssignedSubjectsByClass(finalByName);
        setSelectedClass(prev => allAssigned.includes(prev) ? prev : (allAssigned[0] ?? ''));
      } catch (e) {
        console.warn('Failed to load teacher assignments:', e);
      } finally {
        setAssignmentLoading(false);
      }
    };

    loadAssignments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, schoolId]);

  // ── Absence requests for this teacher's classes ───────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'absence_requests'), where('schoolId', '==', schoolId), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAbsenceRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => console.error('[TeacherPortal] absence_requests query failed:', e));
    return () => unsub();
  }, [schoolId]);

  const myAbsenceRequests = absenceRequests.filter(r => myAssignedClasses.includes(r.class));
  const myPendingAbsences = myAbsenceRequests.filter(r => r.status === 'pending');

  // Quick lookup: studentId -> covering absence request for the date currently being marked
  const absenceForStudentOnDate = (studentId: string) => myAbsenceRequests.find(r =>
    r.studentId === studentId && r.status !== 'rejected' &&
    r.startDate <= attendanceDate && r.endDate >= attendanceDate
  );

  // Approved (not just requested) leave covering a given date — used to default attendance to "absent".
  const isOnApprovedLeave = (studentId: string, date: string) => myAbsenceRequests.some(r =>
    r.studentId === studentId && r.status === 'approved' &&
    r.startDate <= date && r.endDate >= date
  );

  const handleReviewAbsence = async (id: string, decision: 'approved' | 'rejected') => {
    setAbsenceSubmitting(true);
    try {
      await updateDoc(doc(db, 'absence_requests', id), {
        status: decision,
        reviewedBy: profile?.displayName || user?.email,
        reviewNote: absenceReviewNote,
        reviewedAt: serverTimestamp(),
      });
      const req = absenceRequests.find(r => r.id === id);
      if (req) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: req.parentId,
          title: `Absence request ${decision}`,
          body: `Your request for ${req.studentName} (${req.startDate} → ${req.endDate}) was ${decision}.${absenceReviewNote ? ` Note: ${absenceReviewNote}` : ''}`,
          type: 'attendance',
          read: false,
          schoolId: req.schoolId,
          createdAt: serverTimestamp(),
        });
      }
      toast.success(`Request ${decision}.`);
      setAbsenceReviewingId(null);
      setAbsenceReviewNote('');
    } catch { toast.error('Failed to update.'); }
    finally { setAbsenceSubmitting(false); }
  };

  useEffect(() => {
    if (!user) return;
    if (!schoolId) return;

    const qStudents = query(collection(db, 'students'), where('schoolId', '==', schoolId!), where('currentClass', '==', selectedClass));
    const unsubStudents = onSnapshot(qStudents, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(list);
      setLoading(false);
    });

    const qAssignments = query(collection(db, 'assignments'), where('schoolId', '==', schoolId!), where('teacherId', '==', user.uid));
    const unsubAssign = onSnapshot(qAssignments, snap => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    });

    const qMsgs = query(collection(db, 'messages'), where('schoolId', '==', schoolId!), where('receiverId', 'in', [user.uid, user.email]), orderBy('timestamp', 'desc'));
    const qSent = query(collection(db, 'messages'), where('schoolId', '==', schoolId!), where('senderId', '==', user.uid), orderBy('timestamp', 'desc'));

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

    // Fetch all timetables and filter client-side for periods assigned to this teacher
    const unsubTimetables = onSnapshot(query(collection(db, 'timetables'), where('schoolId', '==', schoolId!)), snap => {
      const teacherName = profile?.displayName;
      if (!teacherName) return;
      const matched = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Timetable))
        .filter(tt =>
          DAYS_OF_WEEK.some(day =>
            (tt.schedule[day] || []).some(p => p.teacher === teacherName)
          )
        );
      setMyTimetables(matched);
    });

    // Subscribe to geo-fence config
    const unsubFence = onSnapshot(doc(db, 'geofences', schoolId ?? 'main'), snap => {
      setGeofence(snap.exists() ? ({ id: snap.id, ...snap.data() } as GeoFence) : null);
    });

    // Subscribe to today's check-in / check-out events for this teacher
    const today = new Date().toISOString().split('T')[0];
    const qCheckins = query(
      collection(db, 'attendance_checkins'),
      where('schoolId', '==', schoolId!),
      where('teacherId', '==', user.uid),
      where('date', '==', today),
    );
    const unsubCheckins = onSnapshot(qCheckins, snap => {
      snap.docs.forEach(d => {
        const ev = { id: d.id, ...d.data() } as TeacherCheckIn;
        if (ev.type === 'check_in') setTodayCheckIn(ev);
        if (ev.type === 'check_out') setTodayCheckOut(ev);
      });
    });

    return () => {
      unsubStudents(); unsubAssign(); unsubMsgs(); unsubSent();
      unsubTimetables(); unsubFence(); unsubCheckins();
    };
  }, [user, selectedClass, profile?.displayName, schoolId]);

  // Load submissions for the currently-viewed assignment
  useEffect(() => {
    if (!viewingSubmissions?.id || !schoolId) {
      setSubmissions([]);
      return;
    }
    const q = query(
      collection(db, 'assignment_submissions'),
      where('schoolId', '==', schoolId),
      where('assignmentId', '==', viewingSubmissions.id),
    );
    const unsub = onSnapshot(q, snap => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentSubmission)));
    });
    return unsub;
  }, [viewingSubmissions?.id, schoolId]);

  // Load curriculum documents for AI context injection
  useEffect(() => {
    if (!schoolId) return;
    getDocs(query(
      collection(db, 'curriculum_documents'),
      where('schoolId', '==', schoolId),
      orderBy('uploadedAt', 'desc'),
    )).then(snap => {
      setCurriculumDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumDocument)));
    }).catch(() => {});
  }, [schoolId]);

  // ── Auto geo-fence crossing detection via watchPosition ─────────────────────
  useEffect(() => {
    if (!user || !profile) return;
    if (!navigator.geolocation) return;

    const recordAutoEvent = async (
      type: 'check_in' | 'check_out',
      lat: number, lng: number, accuracy: number, ts: number,
    ) => {
      if (processingRef.current) return;
      processingRef.current = true;
      try {
        const today = new Date().toISOString().split('T')[0];
        const docId = `${user.uid}_${today}_${type}`;
        await setDoc(doc(db, 'attendance_checkins', docId), {
          teacherId: user.uid,
          teacherName: profile.displayName,
          type,
          date: today,
          timestamp: serverTimestamp(),
          lat, lng,
          accuracy: Math.round(accuracy),
          withinFence: type === 'check_in', // check_in only fires inside fence
          spoofDetected: false,
          autoDetected: true,
          schoolId: schoolId ?? 'main',
        });

        // Browser notification so teacher knows it fired
        if ('Notification' in window && Notification.permission === 'granted') {
          const timeStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          new Notification(
            type === 'check_in' ? '✅ Auto checked in' : '👋 Auto checked out',
            { body: `Recorded at ${timeStr}`, icon: '/favicon.svg', tag: type, silent: true },
          );
        }
      } catch (e) {
        console.warn('Auto check-in write failed:', e);
      } finally {
        processingRef.current = false;
      }
    };

    const startWatch = () => {
      if (watchIdRef.current !== null) return; // already watching

      setAutoTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          const fence = geofenceRef.current;

          // Skip inaccurate readings
          if (accuracy > 150) return;
          if (!fence) return;

          const inside = isWithinFence(lat, lng, fence);
          const prev   = prevInsideRef.current;

          setCurrentlyInFence(inside);

          // ── Crossed IN → auto check-in ──────────────────────────────────────
          if (inside && prev === false && !checkInRef.current) {
            void recordAutoEvent('check_in', lat, lng, accuracy, pos.timestamp);
          }

          // ── Crossed OUT → auto check-out ────────────────────────────────────
          if (!inside && prev === true && checkInRef.current && !checkOutRef.current) {
            void recordAutoEvent('check_out', lat, lng, accuracy, pos.timestamp);
          }

          prevInsideRef.current = inside;
        },
        err => console.warn('watchPosition error:', err.message),
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
      );
    };

    const stopWatch = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setAutoTracking(false);
    };

    // Start watching if work is not done for today
    if (!todayCheckIn || !todayCheckOut) {
      startWatch();
    } else {
      stopWatch();
    }

    return stopWatch;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.displayName, todayCheckIn?.id, todayCheckOut?.id]);

  // Load existing attendance when class or date changes (in attendance tab)
  useEffect(() => {
    if (activeTab !== 'attendance' || students.length === 0) return;

    const fetchExisting = async () => {
      const q = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId!),
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
        photoUrl: s.photoUrl,
        status: existingMap[s.id!] || (isOnApprovedLeave(s.id!, attendanceDate) ? 'absent' : 'present')
      })));
    };

    fetchExisting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, students, selectedClass, attendanceDate, myAbsenceRequests]);

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
    if (!schoolId) return;
    const fetchGrades = async () => {
      const q = query(
        collection(db, 'grades'),
        where('schoolId', '==', schoolId!),
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
    if (!schoolId) return;
    const fetchSkillsData = async () => {
      const q = query(
        collection(db, 'student_skills'),
        where('schoolId', '==', schoolId!),
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
      const grading = getGradingForClass(selectedClass);
      g.grade = calculateGrade(g.totalScore, grading.gradingSystem, grading.customGradingScale);
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
          batch.set(ref, { ...withPos, schoolId: schoolId ?? 'main', updatedAt: serverTimestamp() });
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
        where('schoolId', '==', schoolId!),
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
          schoolId: schoolId ?? 'main',
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
    e.preventDefault();
    if (!user) return;
    if (editingAssignment) {
      const ref = doc(db, 'assignments', editingAssignment.id!);
      await updateDoc(ref, { ...newAssignment, updatedAt: serverTimestamp() });
      setEditingAssignment(null);
    } else {
      await addDoc(collection(db, 'assignments'), {
        ...newAssignment, teacherId: user.uid, schoolId: schoolId ?? 'main', createdAt: serverTimestamp()
      });
    }
    setNewAssignment({ title: '', description: '', subject: allSubjects[0], class: allClasses[0], dueDate: '' });
  };

  const handleDeleteAssignment = async (id: string) => {
    await deleteDoc(doc(db, 'assignments', id));
    setShowDeleteConfirm(null);
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSubmission?.id) return;
    setSavingGrade(true);
    try {
      await updateDoc(doc(db, 'assignment_submissions', gradingSubmission.id), {
        grade: gradeForm.grade,
        feedback: gradeForm.feedback,
        status: 'graded',
        gradedAt: serverTimestamp(),
        gradedBy: profile?.displayName || user?.email,
      });
      toast.success('Submission graded.');
      setGradingSubmission(null);
      setGradeForm({ grade: '', feedback: '' });
    } catch {
      toast.error('Failed to save grade.');
    } finally {
      setSavingGrade(false);
    }
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
        const selectedDoc = curriculumDocs.find(d => d.id === selectedCurriculumDocId);
        const curriculumContext = selectedDoc?.summary?.rawSummary;
        if (curriculumContext) {
          const raw = await generateQuestionsFromCurriculum(aiSubject, aiTopic, aiQuestionCount, aiLevel, curriculumContext);
          result = raw.map((q, i) =>
            `**${i + 1}. ${q.questionText}**\n${q.options.map(o => `  ${o.label}. ${o.text}`).join('\n')}\n*Answer: ${q.correctAnswer}*`
          ).join('\n\n');
        } else {
          result = await generateExamQuestions(aiSubject, aiTopic, aiQuestionCount);
        }
      }
      setAiOutput(result || '');
      toast.success('Generated!', { id: tid });
    } catch (e: any) {
      toast.error('AI error: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setAiLoading(false);
    }
  };

  const handleGpsEvent = async (type: 'check_in' | 'check_out') => {
    if (!user || !profile) return;
    setCheckInLoading(true);
    const tid = toast.loading(type === 'check_in' ? 'Verifying your location…' : 'Recording check-out…');
    try {
      const gps = await getCurrentPosition();

      // ── 1. GPS accuracy gate ────────────────────────────────────────────────
      if (!isAccuracyAcceptable(gps.accuracy)) {
        toast.error(
          `GPS signal too weak (±${Math.round(gps.accuracy)} m). Step outside or move away from buildings and try again.`,
          { id: tid },
        );
        return;
      }

      // ── 2. Geo-fence boundary check — HARD BLOCK ────────────────────────────
      // Check-in is only allowed from within the school boundary.
      // Check-out is always allowed (teacher may leave and forget to check out).
      if (geofence && type === 'check_in') {
        const within = isWithinFence(gps.lat, gps.lng, geofence);
        if (!within) {
          const dist = Math.round(
            // haversine re-used inline to show distance
            (() => {
              const R = 6_371_000;
              const toRad = (d: number) => (d * Math.PI) / 180;
              const dLat = toRad(gps.lat - geofence.lat);
              const dLng = toRad(gps.lng - geofence.lng);
              const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(geofence.lat)) * Math.cos(toRad(gps.lat)) * Math.sin(dLng / 2) ** 2;
              return 2 * R * Math.asin(Math.sqrt(a));
            })()
          );
          toast.error(
            `Check-in blocked — you are ${dist} m outside the school boundary. You must be on school premises to check in.`,
            { id: tid, duration: 6000 },
          );
          return;
        }
      }

      // ── 3. Velocity / spoof check ───────────────────────────────────────────
      // Compare against today's previous check-in to detect impossible movement.
      const previous = todayCheckIn
        ? {
            lat: todayCheckIn.lat,
            lng: todayCheckIn.lng,
            timestamp: todayCheckIn.timestamp?.toMillis?.() ?? Date.now(),
          }
        : null;

      const spoofed = isSpoofedVelocity(
        { lat: gps.lat, lng: gps.lng, timestamp: gps.timestamp },
        previous,
      );

      const today = new Date().toISOString().split('T')[0];
      const docId = `${user.uid}_${today}_${type}`;

      await setDoc(doc(db, 'attendance_checkins', docId), {
        teacherId: user.uid,
        teacherName: profile.displayName,
        type,
        date: today,
        timestamp: serverTimestamp(),
        lat: gps.lat,
        lng: gps.lng,
        accuracy: Math.round(gps.accuracy),
        withinFence: true,   // only reachable for check_in if within fence (check_out skips fence check)
        spoofDetected: spoofed,
        schoolId: schoolId ?? 'main',
      } satisfies Omit<TeacherCheckIn, 'id'>);

      if (spoofed) {
        // Record it but flag it — let admin investigate
        toast(
          'Check-in recorded but flagged: your location changed unusually fast. An admin will review.',
          { id: tid, icon: '⚠️', duration: 6000 },
        );
      } else {
        toast.success(
          type === 'check_in' ? 'Checked in — welcome!' : 'Checked out — see you tomorrow!',
          { id: tid },
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Location error. Please try again.', { id: tid });
    } finally {
      setCheckInLoading(false);
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
      timestamp: serverTimestamp(), read: false, schoolId: schoolId ?? 'main',
    });
    setNewMessage({ ...newMessage, content: '' });
  };

  const tabs: { id: TabType; label: string; Icon: React.ElementType; badge?: number }[] = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'students', label: 'My Students', Icon: Users },
    { id: 'timetable', label: 'My Timetable', Icon: Clock },
    { id: 'attendance', label: 'Attendance', Icon: ClipboardList },
    { id: 'absences', label: 'Absence Requests', Icon: AlertCircle, badge: myPendingAbsences.length || undefined },
    { id: 'grades', label: 'Gradebook', Icon: Award },
    { id: 'skills', label: 'Behaviour', Icon: Star },
    { id: 'curriculum', label: 'Curriculum', Icon: BookMarked },
    { id: 'assignments', label: 'Assignments', Icon: BookOpen },
    { id: 'messages', label: 'Messages', Icon: MessageSquare },
    { id: 'ai_tools', label: 'AI Tools', Icon: Sparkles },
  ];

  // Helper: subjects the current teacher can grade in the selected class
  // '__all__' means form tutor — can grade any subject
  const mySubjectsForSelectedClass: string[] = (() => {
    const subs = myAssignedSubjectsByClass[selectedClass] ?? [];
    if (subs.includes('__all__')) return allSubjects;
    return subs;
  })();

  // Whether teacher is assigned to currently selected class (for attendance/grades/skills)
  const isAssignedToSelectedClass = myAssignedClasses.includes(selectedClass);

  const statusColor = (s: string) =>
    s === 'present' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    s === 'absent' ? 'bg-rose-50 text-rose-700 border-rose-200' :
    'bg-amber-50 text-amber-700 border-amber-200';

  if (loading || assignmentLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <ProfileHeader
        displayName={profile?.displayName}
        photoUrl={profile?.photoUrl}
        assignedClasses={myAssignedClasses}
        schoolName={schoolName}
        currentTerm={currentTerm}
        currentSession={currentSession}
        onAskAI={() => navigateTab('home')}
      />

      {/* Clock-In Hero (restyle of GPS widget — logic untouched, see handleGpsEvent/watchPosition above) */}
      <ClockInHero
        geofence={geofence}
        todayCheckIn={todayCheckIn}
        todayCheckOut={todayCheckOut}
        currentlyInFence={currentlyInFence}
        autoTracking={autoTracking}
        checkInLoading={checkInLoading}
        onGpsEvent={handleGpsEvent}
      />

      {/* Tab Bar */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-8 w-full overflow-x-auto">
        {tabs.map(({ id, label, Icon, badge }) => (
          <button
            key={id}
            onClick={() => navigateTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {!!badge && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── HOME / OVERVIEW TAB ── */}
      {activeTab === 'home' && (
        <TeacherOverview
          schoolId={schoolId}
          selectedClass={selectedClass}
          subjectsForClass={mySubjectsForSelectedClass}
          students={students}
          assignments={assignments}
          messages={messages}
          currentUserId={user?.uid}
          currentTerm={currentTerm}
          currentSession={currentSession}
          navigateTab={navigateTab}
        />
      )}

      {/* ── CURRICULUM TAB ── */}
      {activeTab === 'curriculum' && (
        <CurriculumPage
          schoolId={schoolId}
          selectedClass={selectedClass}
          myAssignedClasses={myAssignedClasses}
          onSelectClass={setSelectedClass}
          subjectsForClass={mySubjectsForSelectedClass}
          students={students}
          currentTerm={currentTerm}
          currentSession={currentSession}
        />
      )}

      {/* ── STUDENTS TAB ── */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          {myAssignedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-amber-50 rounded-2xl border border-amber-200">
              <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="font-bold text-slate-900 mb-1">No Classes Assigned</h3>
              <p className="text-slate-500 text-sm text-center max-w-sm">You haven't been assigned to any class yet. Ask your admin to assign you as a subject teacher or form tutor in Class Management.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Filter className="w-5 h-5 text-slate-400" />
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
                >
                  {myAssignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-sm text-slate-400 font-medium">{students.length} students</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {students.map(student => (
                  <div key={student.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center mb-4">
                      <Avatar photoUrl={student.photoUrl} name={student.studentName} size="sm" gradientFrom="from-indigo-500" gradientTo="to-violet-600" className="mr-3" />
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
                      onClick={() => { navigateTab('messages'); setNewMessage({ receiverId: student.guardianEmail || '', content: '' }); }}
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
            </>
          )}
        </div>
      )}

      {/* ── ATTENDANCE TAB ── */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {myAssignedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-amber-50 rounded-2xl border border-amber-200">
              <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="font-bold text-slate-900 mb-1">No Classes Assigned</h3>
              <p className="text-slate-500 text-sm text-center max-w-sm">You can only take attendance for classes you are assigned to. Contact your admin.</p>
            </div>
          ) : (
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
                    {myAssignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
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
                              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-indigo-700 font-bold text-sm bg-indigo-50 flex-shrink-0">
                                {row.photoUrl ? (
                                  <img src={row.photoUrl} alt={row.studentName} className="w-full h-full object-cover" />
                                ) : (
                                  row.studentName.charAt(0)
                                )}
                              </div>
                              <span className="text-sm font-medium text-slate-900">{row.studentName}</span>
                              {(() => {
                                const ab = absenceForStudentOnDate(row.studentId);
                                if (!ab) return null;
                                return (
                                  <span
                                    title={`${ab.reason} (${ab.startDate} → ${ab.endDate})`}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                      ab.status === 'approved'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                  >
                                    {ab.status === 'approved' ? 'On approved leave' : 'Leave requested'}
                                  </span>
                                );
                              })()}
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
          )}
        </div>
      )}

      {/* ── ABSENCE REQUESTS TAB ── */}
      {activeTab === 'absences' && (
        <div className="space-y-3">
          {myAssignedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-amber-50 rounded-2xl border border-amber-200">
              <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="font-bold text-slate-900 mb-1">No Classes Assigned</h3>
              <p className="text-slate-500 text-sm text-center max-w-sm">You'll see absence requests once you're assigned to a class.</p>
            </div>
          ) : myAbsenceRequests.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No absence requests for your classes.</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {myAbsenceRequests.map(req => (
                <motion.div key={req.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900">{req.studentName}</p>
                        <span className="text-xs text-slate-500">{req.class}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          req.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>{req.status}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{req.startDate} → {req.endDate}</span>
                        <span>by {req.parentName}</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{req.reason}</p>
                      {req.reviewedBy && <p className="text-xs text-slate-400 mt-0.5">Reviewed by {req.reviewedBy}{req.reviewNote ? ` — "${req.reviewNote}"` : ''}</p>}
                    </div>
                    {req.status === 'pending' && (
                      <button onClick={() => setAbsenceReviewingId(absenceReviewingId === req.id ? null : req.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors shrink-0">
                        <ChevronDown className={`w-3 h-3 transition-transform ${absenceReviewingId === req.id ? 'rotate-180' : ''}`} />
                        Review
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {absenceReviewingId === req.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-5 pb-5 border-t border-slate-100">
                          <textarea placeholder="Optional note to parent…" value={absenceReviewNote}
                            onChange={e => setAbsenceReviewNote(e.target.value)}
                            className="w-full mt-4 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} />
                          <div className="flex gap-2 mt-3 justify-end">
                            <button onClick={() => { setAbsenceReviewingId(null); setAbsenceReviewNote(''); }}
                              className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                            <button disabled={absenceSubmitting} onClick={() => handleReviewAbsence(req.id, 'rejected')}
                              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors">
                              <X className="w-4 h-4" /> Reject
                            </button>
                            <button disabled={absenceSubmitting} onClick={() => handleReviewAbsence(req.id, 'approved')}
                              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                              {absenceSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              Approve
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* ── GRADEBOOK TAB ── */}
      {activeTab === 'grades' && (
        <div className="space-y-6">
          {myAssignedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-amber-50 rounded-2xl border border-amber-200">
              <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="font-bold text-slate-900 mb-1">No Classes Assigned</h3>
              <p className="text-slate-500 text-sm text-center max-w-sm">You can only grade students in classes you are assigned to teach. Contact your admin.</p>
            </div>
          ) : (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  {myAssignedClasses.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <select value={gradeSubject} onChange={e => setGradeSubject(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {mySubjectsForSelectedClass.length > 0
                  ? mySubjectsForSelectedClass.map(s => <option key={s}>{s}</option>)
                  : allSubjects.map(s => <option key={s}>{s}</option>)
                }
              </select>
              <select value={gradeTerm} onChange={e => setGradeTerm(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {terms.map(t => <option key={t}>{t}</option>)}
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
          )}
        </div>
      )}

      {/* ── SKILLS TAB ── */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          {myAssignedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-amber-50 rounded-2xl border border-amber-200">
              <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="font-bold text-slate-900 mb-1">No Classes Assigned</h3>
              <p className="text-slate-500 text-sm text-center max-w-sm">You can only rate skills for students in classes you are assigned to. Contact your admin.</p>
            </div>
          ) : (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  {myAssignedClasses.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <select value={skillsTerm} onChange={e => setSkillsTerm(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                {terms.map(t => <option key={t}>{t}</option>)}
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
          )}
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
                  <button type="button" onClick={() => { setEditingAssignment(null); setNewAssignment({ title: '', description: '', subject: allSubjects[0], class: allClasses[0], dueDate: '' }); }}>
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
                  {mySubjectsForSelectedClass.length > 0
                    ? mySubjectsForSelectedClass.map(s => <option key={s} value={s}>{s}</option>)
                    : SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)
                  }
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Class</label>
                <select value={newAssignment.class} onChange={e => setNewAssignment({ ...newAssignment, class: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm">
                  {(myAssignedClasses.length > 0 ? myAssignedClasses : allClasses).map(c => <option key={c} value={c}>{c}</option>)}
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
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start gap-4">
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
                  </div>
                  <button
                    onClick={() => setViewingSubmissions(viewingSubmissions?.id === a.id ? null : a)}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-200"
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    View Submissions
                    {a.submissionCount != null && a.submissionCount > 0 && (
                      <span className="ml-1 bg-indigo-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">{a.submissionCount}</span>
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${viewingSubmissions?.id === a.id ? 'rotate-90' : ''}`} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredAssignments.length === 0 && (
              <div className="text-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No assignments found.</p>
              </div>
            )}

            {/* ── SUBMISSION PANEL ── */}
            <AnimatePresence>
              {viewingSubmissions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Inbox className="w-4 h-4 text-indigo-600" />
                      Submissions for "{viewingSubmissions.title}"
                      <span className="text-xs font-medium text-indigo-600">({submissions.length})</span>
                    </h4>
                    <button onClick={() => setViewingSubmissions(null)}>
                      <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                    </button>
                  </div>

                  {submissions.length === 0 ? (
                    <div className="text-center py-8 bg-white rounded-xl border border-dashed border-indigo-200">
                      <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No submissions yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {submissions.map(sub => (
                        <div key={sub.id} className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-slate-900 text-sm">{sub.studentName}</p>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                  sub.status === 'graded'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {sub.status}
                                </span>
                                {sub.grade && (
                                  <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                                    {sub.grade}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Submitted by {sub.submitterName}
                              </p>
                              {sub.note && <p className="text-sm text-slate-700 mt-2">{sub.note}</p>}
                              {sub.fileUrl && (
                                <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1">
                                  <ChevronRight className="w-3 h-3" /> View attached file
                                </a>
                              )}
                              {sub.feedback && (
                                <p className="text-xs text-slate-500 mt-2 italic">Feedback: {sub.feedback}</p>
                              )}
                            </div>
                            <button
                              onClick={() => { setGradingSubmission(sub); setGradeForm({ grade: sub.grade ?? '', feedback: sub.feedback ?? '' }); }}
                              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                            >
                              <GraduationCap className="w-3.5 h-3.5" />
                              {sub.status === 'graded' ? 'Re-grade' : 'Grade'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── GRADE SUBMISSION MODAL ── */}
            <AnimatePresence>
              {gradingSubmission && (
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
                    onSubmit={handleGradeSubmission}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <GraduationCap className="w-5 h-5 text-indigo-600" />
                        Grade Submission
                      </h3>
                      <button type="button" onClick={() => setGradingSubmission(null)}>
                        <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                      </button>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-sm font-bold text-slate-900">{gradingSubmission.studentName}</p>
                      <p className="text-xs text-slate-500">{gradingSubmission.note || '(No note provided)'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Grade *</label>
                      <input
                        required
                        placeholder="e.g. A, 85%, Excellent"
                        value={gradeForm.grade}
                        onChange={e => setGradeForm({ ...gradeForm, grade: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Feedback (optional)</label>
                      <textarea
                        placeholder="Leave feedback for the student…"
                        value={gradeForm.feedback}
                        onChange={e => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setGradingSubmission(null)}
                        className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={savingGrade}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                        {savingGrade && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Grade
                      </button>
                    </div>
                  </motion.form>
                </motion.div>
              )}
            </AnimatePresence>
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
                  {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Class Level</label>
                <select value={aiLevel} onChange={e => setAiLevel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm">
                  {allClasses.map(c => <option key={c}>{c}</option>)}
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

              {aiTool === 'questions' && curriculumDocs.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Curriculum Document <span className="font-normal normal-case text-slate-400">(optional — for AI context)</span>
                  </label>
                  <select
                    value={selectedCurriculumDocId}
                    onChange={e => setSelectedCurriculumDocId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm"
                  >
                    <option value="">None (generic generation)</option>
                    {curriculumDocs
                      .filter(d => !aiSubject || d.subject === aiSubject)
                      .map(d => (
                        <option key={d.id} value={d.id}>
                          {d.fileName} — {d.level} · {d.term}
                        </option>
                      ))
                    }
                  </select>
                  {selectedCurriculumDocId && (
                    <p className="text-xs text-violet-600 mt-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-violet-500 rounded-full inline-block" />
                      AI will use this document's curriculum summary as context.
                    </p>
                  )}
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

      {/* My Timetable Tab */}
      {activeTab === 'timetable' && (
        <div className="space-y-6">
          {myTimetables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-3">
              <Clock className="w-12 h-12" />
              <p className="text-slate-500 text-sm">No timetable entries found for your account.</p>
              <p className="text-slate-400 text-xs">Ask your admin to assign you to classes in the Timetable module.</p>
            </div>
          ) : (
            myTimetables.map(tt => {
              const teacherName = profile?.displayName;
              return (
                <div key={tt.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-900 text-white px-5 py-3 flex items-center gap-3">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-sm">{tt.class}</span>
                    <span className="text-slate-400 text-xs">— {tt.term} · {tt.session}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-24">Day</th>
                          <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Your Periods</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {DAYS_OF_WEEK.map(day => {
                          const myPeriods = (tt.schedule[day] || []).filter(p => p.teacher === teacherName);
                          if (myPeriods.length === 0) return null;
                          return (
                            <tr key={day} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-700 text-sm">{day}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {myPeriods.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl px-3 py-1.5 text-xs">
                                      <span className="font-bold">{p.subject}</span>
                                      <span className="text-indigo-400">·</span>
                                      <span>{p.startTime}–{p.endTime}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        }).filter(Boolean)}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
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
