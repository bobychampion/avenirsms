/**
 * Student portal — kid-friendly UI rendered inside StudentLayout.
 *
 * Routes (all wrapped by StudentLayout in App.tsx):
 *   /student            → StudentToday          (timetable + due assignments)
 *   /student/assignments → StudentAssignments   (full list)
 *   /student/grades     → StudentGrades         (report card)
 *   /student/messages   → StudentMessages       (inbox)
 *   /student/profile    → StudentProfile        (account info)
 *
 * Data lookup: profile.linkedStudentIds[0] — written by ApplicationDetail
 * when an applicant is approved. Parents arriving here (linkedStudentIds
 * with multiple kids) fall back to the first child for now; full multi-child
 * support belongs in the Parent portal, not here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/FirebaseProvider';
import { useSchool } from '../components/SchoolContext';
import { db } from '../firebase';
import {
  collection, doc, getDoc, query, where, onSnapshot, orderBy,
  addDoc, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import {
  Student, Grade, Assignment, Message, Attendance, Timetable, DAYS_OF_WEEK,
} from '../types';
import {
  BookOpen, Trophy, Calendar, Clock, MessageCircle, Send,
  CheckCircle2, AlertCircle, Sparkles, User, Mail, Hash,
} from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════
 * Shared hook: resolve the current user's student record
 * ════════════════════════════════════════════════════════════════════════ */
function useCurrentStudent() {
  const { profile } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const studentId = profile?.linkedStudentIds?.[0];
      if (!studentId) { setStudent(null); setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'students', studentId));
        if (!cancelled) {
          setStudent(snap.exists() ? ({ id: snap.id, ...(snap.data() as Student) }) : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.linkedStudentIds]);

  return { student, loading };
}

/* ════════════════════════════════════════════════════════════════════════
 * Loading / empty states
 * ════════════════════════════════════════════════════════════════════════ */
function LoadingCard() {
  return (
    <div className="rounded-3xl bg-white/80 backdrop-blur-sm border border-white p-8 text-center shadow-sm">
      <div className="inline-block w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      <p className="mt-3 text-sm text-slate-500">Loading...</p>
    </div>
  );
}

function NoStudentLinked() {
  return (
    <div className="rounded-3xl bg-white/80 backdrop-blur-sm border border-white p-8 text-center shadow-sm">
      <div className="text-5xl mb-3">🎒</div>
      <h2 className="text-xl font-bold text-slate-900">Almost there!</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your student account hasn't been linked to your school records yet.
        Please ask your school admin to link your account.
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * 1. TODAY — timetable + due assignments + quick stats
 * ════════════════════════════════════════════════════════════════════════ */
export function StudentToday() {
  const { student, loading } = useCurrentStudent();
  const { currentSession, currentTerm, schoolName } = useSchool();
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [dueAssignments, setDueAssignments] = useState<Assignment[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>([]);

  useEffect(() => {
    if (!student) return;
    // Today's timetable for the student's class
    const ttUnsub = onSnapshot(
      query(
        collection(db, 'timetables'),
        where('class', '==', student.currentClass),
        where('term', '==', currentTerm),
        where('session', '==', currentSession),
      ),
      snap => setTimetable(snap.empty ? null : ({ id: snap.docs[0].id, ...(snap.docs[0].data() as Timetable) })),
      () => setTimetable(null),
    );
    // Upcoming assignments (next 14 days)
    const today = new Date().toISOString().slice(0, 10);
    const aUnsub = onSnapshot(
      query(
        collection(db, 'assignments'),
        where('schoolId', '==', student.schoolId ?? ''),
        where('class', '==', student.currentClass),
        where('dueDate', '>=', today),
        orderBy('dueDate', 'asc'),
      ),
      snap => setDueAssignments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Assignment) }))),
      () => setDueAssignments([]),
    );
    // Last 7 attendance records
    const attUnsub = onSnapshot(
      query(
        collection(db, 'attendance'),
        where('studentId', '==', student.id),
        orderBy('date', 'desc'),
      ),
      snap => setRecentAttendance(
        snap.docs.slice(0, 7).map(d => ({ id: d.id, ...(d.data() as Attendance) })),
      ),
      () => setRecentAttendance([]),
    );
    return () => { ttUnsub(); aUnsub(); attUnsub(); };
  }, [student, currentSession, currentTerm]);

  if (loading) return <LoadingCard />;
  if (!student) return <NoStudentLinked />;

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }) as typeof DAYS_OF_WEEK[number];
  const todayPeriods = (timetable?.schedule as any)?.[dayName] ?? [];
  const presentCount = recentAttendance.filter(a => a.status === 'present').length;
  const attendancePct = recentAttendance.length
    ? Math.round((presentCount / recentAttendance.length) * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white p-6 shadow-lg shadow-indigo-200">
        <div className="flex items-start gap-4">
          <div className="text-5xl">🌟</div>
          <div className="flex-1">
            <p className="text-sm text-white/80">{schoolName} • {dayName}</p>
            <h1 className="mt-1 text-2xl font-extrabold">Good {greetingTime()}, {student.studentName.split(' ')[0]}!</h1>
            <p className="mt-1 text-sm text-white/90">Class: <strong>{student.currentClass}</strong></p>
          </div>
        </div>
      </div>

      {/* Quick stat strip */}
      <div className="grid grid-cols-2 gap-3">
        <StatPill icon={<BookOpen className="w-5 h-5" />} value={dueAssignments.length} label="Assignments due" tone="indigo" />
        <StatPill icon={<CheckCircle2 className="w-5 h-5" />} value={attendancePct !== null ? `${attendancePct}%` : '—'} label="Last 7 attendance" tone="emerald" />
      </div>

      {/* Today's classes */}
      <section className="rounded-3xl bg-white/90 backdrop-blur-sm border border-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          Today's classes
        </h2>
        {todayPeriods.length === 0 ? (
          <div className="mt-3 text-center py-6 text-sm text-slate-500">
            🌴 No classes scheduled today. Enjoy your day!
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {todayPeriods.map((p: any, i: number) => (
              <li key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-xs font-bold text-indigo-600">
                  {p.startTime}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{p.subject}</p>
                  {p.teacher && <p className="text-xs text-slate-500">with {p.teacher}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming assignments */}
      <section className="rounded-3xl bg-white/90 backdrop-blur-sm border border-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500" />
          Coming up
        </h2>
        {dueAssignments.length === 0 ? (
          <div className="mt-3 text-center py-6 text-sm text-slate-500">
            ✨ All caught up! No assignments due soon.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {dueAssignments.slice(0, 5).map(a => (
              <li key={a.id} className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="text-2xl">📝</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{a.title}</p>
                  <p className="text-xs text-slate-600">{a.subject} • Due {a.dueDate}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function greetingTime() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function StatPill({ icon, value, label, tone }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone: 'indigo' | 'emerald' }) {
  const colors = tone === 'indigo'
    ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
    : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return (
    <div className={`rounded-2xl border p-4 ${colors}`}>
      <div className="flex items-center gap-2 opacity-80">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * 2. ASSIGNMENTS — full list
 * ════════════════════════════════════════════════════════════════════════ */
export function StudentAssignments() {
  const { student, loading } = useCurrentStudent();
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!student) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'assignments'),
        where('schoolId', '==', student.schoolId ?? ''),
        where('class', '==', student.currentClass),
        orderBy('dueDate', 'desc'),
      ),
      snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment))),
      () => setAssignments([]),
    );
    return () => unsub();
  }, [student]);

  if (loading) return <LoadingCard />;
  if (!student) return <NoStudentLinked />;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming: Assignment[] = assignments.filter(a => a.dueDate >= today);
  const past: Assignment[] = assignments.filter(a => a.dueDate < today);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">📚 Assignments</h1>

      <section>
        <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-2">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2">Nothing due 🎉</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map(a => <AssignmentCard key={a.id} a={a} state="upcoming" />)}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-2">Past ({past.length})</h2>
        {past.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2">No past assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {past.slice(0, 20).map(a => <AssignmentCard key={a.id} a={a} state="past" />)}
          </ul>
        )}
      </section>
    </div>
  );
}

const AssignmentCard: React.FC<{ a: Assignment; state: 'upcoming' | 'past' }> = ({ a, state }) => {
  const overdueIcon = state === 'past' ? '✅' : '📝';
  const tone = state === 'past'
    ? 'bg-slate-50 border-slate-200'
    : 'bg-amber-50 border-amber-100';
  return (
    <li className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">{overdueIcon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900">{a.title}</p>
          {a.description && <p className="mt-1 text-xs text-slate-600 line-clamp-2">{a.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 font-bold text-slate-700">{a.subject}</span>
            <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
              <Clock className="inline w-3 h-3 mr-0.5" />Due {a.dueDate}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
};

/* ════════════════════════════════════════════════════════════════════════
 * 3. GRADES — current term report
 * ════════════════════════════════════════════════════════════════════════ */
export function StudentGrades() {
  const { student, loading } = useCurrentStudent();
  const { currentSession, currentTerm } = useSchool();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<Grade['term']>(currentTerm as Grade['term']);

  useEffect(() => {
    if (!student) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'grades'),
        where('studentId', '==', student.id),
        where('session', '==', currentSession),
      ),
      snap => setGrades(snap.docs.map(d => ({ id: d.id, ...(d.data() as Grade) }))),
      () => setGrades([]),
    );
    return () => unsub();
  }, [student, currentSession]);

  if (loading) return <LoadingCard />;
  if (!student) return <NoStudentLinked />;

  const termGrades = grades.filter(g => g.term === selectedTerm);
  const avg = termGrades.length
    ? Math.round(termGrades.reduce((s, g) => s + (g.totalScore || 0), 0) / termGrades.length)
    : null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">🏆 My Grades</h1>

      {/* Term selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['1st Term', '2nd Term', '3rd Term'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSelectedTerm(t)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              selectedTerm === t
                ? 'bg-indigo-600 text-white shadow shadow-indigo-200'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Summary */}
      {avg !== null && (
        <div className="rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white p-5 shadow-lg shadow-emerald-200">
          <p className="text-xs text-white/80 uppercase tracking-wider font-bold">Term Average</p>
          <p className="mt-1 text-4xl font-extrabold">{avg}<span className="text-lg font-bold opacity-80">%</span></p>
          <p className="mt-1 text-sm text-white/90">
            {avg >= 75 ? '🌟 Excellent work!' : avg >= 60 ? '👍 Keep it up!' : avg >= 40 ? '💪 Push harder!' : '📚 Time to study more!'}
          </p>
        </div>
      )}

      {/* Subject grades */}
      {termGrades.length === 0 ? (
        <div className="rounded-3xl bg-white/90 border border-white p-8 text-center shadow-sm">
          <div className="text-5xl mb-2">📭</div>
          <p className="text-sm text-slate-500">No grades posted for {selectedTerm} yet. Check back soon!</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {termGrades.map(g => (
            <li key={g.id} className="rounded-2xl bg-white/90 border border-white p-4 shadow-sm flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-lg ${gradeColors(g.totalScore)}`}>
                {g.grade || '—'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 truncate">{g.subject}</p>
                <p className="text-xs text-slate-500">CA: {g.caScore} • Exam: {g.examScore} • Total: <strong>{g.totalScore}</strong></p>
              </div>
              {g.subjectPosition && (
                <div className="text-xs text-slate-500">Pos: <strong>#{g.subjectPosition}</strong></div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function gradeColors(score: number) {
  if (score >= 75) return 'bg-emerald-100 text-emerald-700';
  if (score >= 60) return 'bg-indigo-100 text-indigo-700';
  if (score >= 40) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

/* ════════════════════════════════════════════════════════════════════════
 * 4. MESSAGES — inbox + reply
 * ════════════════════════════════════════════════════════════════════════ */
export function StudentMessages() {
  const { user, profile } = useAuth();
  const { schoolId } = useSchool();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [activeThread, setActiveThread] = useState<{ id: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'messages'),
        where('receiverId', '==', user.uid),
        orderBy('timestamp', 'desc'),
      ),
      snap => setMessages(snap.docs.map(d => ({ id: d.id, ...(d.data() as Message) }))),
      () => setMessages([]),
    );
    return () => unsub();
  }, [user]);

  const threads = useMemo(() => {
    const byPerson = new Map<string, Message[]>();
    for (const m of messages) {
      const arr = byPerson.get(m.senderId) ?? [];
      arr.push(m); byPerson.set(m.senderId, arr);
    }
    return Array.from(byPerson.entries()).map(([id, msgs]) => ({
      id, name: msgs[0].senderName, latest: msgs[0], unread: msgs.filter(m => !m.read).length,
    }));
  }, [messages]);

  const sendReply = async () => {
    if (!reply.trim() || !activeThread || !user || !profile) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderName: profile.displayName,
        receiverId: activeThread.id,
        content: reply.trim(),
        timestamp: serverTimestamp(),
        read: false,
        schoolId: schoolId ?? undefined,
      });
      setReply('');
    } finally {
      setSending(false);
    }
  };

  // Mark unread messages from active thread as read
  useEffect(() => {
    if (!activeThread) return;
    messages
      .filter(m => m.senderId === activeThread.id && !m.read && m.id)
      .forEach(m => {
        updateDoc(doc(db, 'messages', m.id!), { read: true }).catch(() => {});
      });
  }, [activeThread, messages]);

  if (activeThread) {
    const thread = messages.filter(m => m.senderId === activeThread.id).reverse();
    return (
      <div className="space-y-4">
        <button onClick={() => setActiveThread(null)} className="text-sm font-bold text-indigo-600 hover:underline">← Back to inbox</button>
        <h1 className="text-xl font-extrabold text-slate-900">💬 {activeThread.name}</h1>
        <ul className="space-y-2">
          {thread.map(m => (
            <li key={m.id} className="rounded-2xl bg-white border border-slate-200 p-3 shadow-sm">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.content}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {m.timestamp?.toDate?.()?.toLocaleString() ?? ''}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2 sticky bottom-20 bg-white/95 backdrop-blur p-3 rounded-2xl border border-slate-200 shadow-lg">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={2}
            placeholder="Type a reply..."
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            disabled={!reply.trim() || sending}
            onClick={sendReply}
            className="p-3 rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">💬 Messages</h1>
      {threads.length === 0 ? (
        <div className="rounded-3xl bg-white/90 border border-white p-8 text-center shadow-sm">
          <div className="text-5xl mb-2">📬</div>
          <p className="text-sm text-slate-500">No messages yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {threads.map(t => (
            <li key={t.id}>
              <button
                onClick={() => setActiveThread({ id: t.id, name: t.name })}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/90 border border-white shadow-sm text-left hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-lg font-extrabold text-indigo-700">
                  {t.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900 truncate">{t.name}</p>
                    {t.unread > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">{t.unread}</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{t.latest.content}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * 5. PROFILE — student account info
 * ════════════════════════════════════════════════════════════════════════ */
export function StudentProfile() {
  const { profile } = useAuth();
  const { student, loading } = useCurrentStudent();
  const { schoolName } = useSchool();

  if (loading) return <LoadingCard />;
  if (!student) return <NoStudentLinked />;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white p-6 shadow-lg text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center text-3xl font-extrabold ring-4 ring-white/30">
          {student.studentName?.[0]?.toUpperCase()}
        </div>
        <h1 className="mt-3 text-xl font-extrabold">{student.studentName}</h1>
        <p className="text-sm text-white/90">{student.currentClass} • {schoolName}</p>
      </div>

      <section className="rounded-3xl bg-white/90 border border-white p-5 shadow-sm space-y-3">
        <ProfileRow icon={<Hash className="w-4 h-4" />} label="Student ID" value={student.studentId} />
        <ProfileRow icon={<Mail className="w-4 h-4" />} label="Email" value={profile?.email || student.email || '—'} />
        <ProfileRow icon={<User className="w-4 h-4" />} label="Guardian" value={student.guardianName || '—'} />
        <ProfileRow icon={<Sparkles className="w-4 h-4" />} label="Status" value={student.admissionStatus || '—'} />
      </section>

      {student.medicalConditions && (
        <section className="rounded-3xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Medical
          </p>
          <p className="mt-1 text-sm text-amber-900">{student.medicalConditions}</p>
        </section>
      )}
    </div>
  );
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">{icon}</div>
      <div className="flex-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Default export — convenience: re-exports for cleaner imports in App.tsx
 * ════════════════════════════════════════════════════════════════════════ */
const StudentPortalExports = {
  StudentToday,
  StudentAssignments,
  StudentGrades,
  StudentMessages,
  StudentProfile,
};
export default StudentPortalExports;
