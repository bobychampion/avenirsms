/**
 * StudentLifecycle — full lifecycle tracker for a student.
 * Tabs: Timeline · Academic Growth · Behavioral History · Alumni
 * Route: /admin/students/:id/lifecycle
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import {
  doc, onSnapshot, collection, query, where, orderBy,
  addDoc, setDoc, serverTimestamp, getDocs,
} from 'firebase/firestore';
import {
  Student, Grade, LifecycleEvent, BehavioralRecord, AlumniProfile,
  TERMS,
} from '../types';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import { useAuth } from '../components/FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, GraduationCap, TrendingUp, TrendingDown, Shield, Users2,
  Plus, Save, Loader2, CheckCircle2, AlertTriangle, Star,
  BookOpen, Calendar, Award, Briefcase, Link2,
  ChevronRight, X, DollarSign, Phone, Mail,
  Activity, Clock, Flag, Sparkles, Minus, Edit2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LIFECYCLE_ICONS: Record<LifecycleEvent['type'], React.ReactNode> = {
  enrolled:   <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  promoted:   <ChevronRight className="w-4 h-4 text-indigo-600" />,
  detained:   <Clock className="w-4 h-4 text-amber-600" />,
  graduated:  <GraduationCap className="w-4 h-4 text-violet-600" />,
  withdrawn:  <X className="w-4 h-4 text-rose-600" />,
  suspended:  <Flag className="w-4 h-4 text-orange-600" />,
  reinstated: <CheckCircle2 className="w-4 h-4 text-teal-600" />,
  note:       <BookOpen className="w-4 h-4 text-slate-500" />,
};

const LIFECYCLE_COLORS: Record<LifecycleEvent['type'], string> = {
  enrolled:   'bg-emerald-50 border-emerald-200',
  promoted:   'bg-indigo-50 border-indigo-200',
  detained:   'bg-amber-50 border-amber-200',
  graduated:  'bg-violet-50 border-violet-200',
  withdrawn:  'bg-rose-50 border-rose-200',
  suspended:  'bg-orange-50 border-orange-200',
  reinstated: 'bg-teal-50 border-teal-200',
  note:       'bg-slate-50 border-slate-200',
};

const LIFECYCLE_DOT_COLORS: Record<LifecycleEvent['type'], string> = {
  enrolled:   'bg-emerald-500',
  promoted:   'bg-indigo-500',
  detained:   'bg-amber-500',
  graduated:  'bg-violet-500',
  withdrawn:  'bg-rose-500',
  suspended:  'bg-orange-500',
  reinstated: 'bg-teal-500',
  note:       'bg-slate-400',
};

const BEHAVIOR_COLORS: Record<BehavioralRecord['type'], string> = {
  commendation: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  achievement:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  warning:      'bg-amber-50 text-amber-700 border-amber-200',
  incident:     'bg-rose-50 text-rose-700 border-rose-200',
  suspension:   'bg-orange-50 text-orange-700 border-orange-200',
};

const BEHAVIOR_ICONS: Record<BehavioralRecord['type'], React.ReactNode> = {
  commendation: <Star className="w-3.5 h-3.5" />,
  achievement:  <Award className="w-3.5 h-3.5" />,
  warning:      <AlertTriangle className="w-3.5 h-3.5" />,
  incident:     <Flag className="w-3.5 h-3.5" />,
  suspension:   <Shield className="w-3.5 h-3.5" />,
};

type TabId = 'timeline' | 'academic' | 'behavioral' | 'alumni';

function formatDate(ts: any): string {
  if (!ts) return '';
  if (ts?.toDate) return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (typeof ts === 'string') return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return '';
}

function statusBadge(status: Student['admissionStatus']) {
  const map: Record<string, string> = {
    active:    'bg-emerald-100 text-emerald-700',
    graduated: 'bg-violet-100 text-violet-700',
    withdrawn: 'bg-rose-100 text-rose-700',
    suspended: 'bg-orange-100 text-orange-700',
  };
  return map[status ?? 'active'] ?? 'bg-slate-100 text-slate-600';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StudentLifecycle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const schoolId = useSchoolId();
  const { currentSession } = useSchool();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [student, setStudent] = useState<Student | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(true);

  // ── Load student ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'students', id), snap => {
      if (snap.exists()) setStudent({ id: snap.id, ...snap.data() } as Student);
      setLoadingStudent(false);
    });
    return unsub;
  }, [id]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline',   label: 'Timeline',          icon: <Activity className="w-4 h-4" /> },
    { id: 'academic',   label: 'Academic Growth',   icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'behavioral', label: 'Behavioral History', icon: <Shield className="w-4 h-4" /> },
    { id: 'alumni',     label: 'Alumni',             icon: <Users2 className="w-4 h-4" /> },
  ];

  if (loadingStudent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Student not found</h2>
          <button onClick={() => navigate('/admin/students')} className="mt-4 text-indigo-600 font-bold">
            Back to Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          to={`/admin/students/${id}`}
          className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Profile
        </Link>
        <span className="text-slate-300">|</span>
        <Link to="/admin/students" className="text-slate-500 hover:text-indigo-600 transition-colors font-medium text-sm">
          Student Directory
        </Link>
      </div>

      {/* ── Student identity bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 shadow-md">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.studentName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl">
                {student.studentName.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{student.studentName}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{student.studentId}</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{student.currentClass}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${statusBadge(student.admissionStatus)}`}>
                {student.admissionStatus ?? 'active'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Lifecycle Tracker</span>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 mb-8 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'timeline'   && <TimelineTab   student={student} schoolId={schoolId} profile={profile} />}
          {activeTab === 'academic'   && <AcademicTab   student={student} schoolId={schoolId} />}
          {activeTab === 'behavioral' && <BehavioralTab student={student} schoolId={schoolId} profile={profile} />}
          {activeTab === 'alumni'     && <AlumniTab     student={student} schoolId={schoolId} profile={profile} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Tab 1: Timeline ─────────────────────────────────────────────────────────

interface TimelineTabProps {
  student: Student;
  schoolId: string | null;
  profile: any;
}

function TimelineTab({ student, schoolId, profile }: TimelineTabProps) {
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  // Load lifecycle_events + synthesize from promotions
  useEffect(() => {
    if (!schoolId || !student.id) return;

    const q = query(
      collection(db, 'lifecycle_events'),
      where('schoolId', '==', schoolId),
      where('studentId', '==', student.id),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(q, async snap => {
      const firestoreEvents: LifecycleEvent[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as LifecycleEvent));

      // Synthesize promotion events from promotions collection
      try {
        const promoSnap = await getDocs(query(
          collection(db, 'promotions'),
          where('schoolId', '==', schoolId),
          where('studentId', '==', student.id),
        ));
        const promoEvents: LifecycleEvent[] = promoSnap.docs.map(d => {
          const p = d.data();
          return {
            id: `promo_${d.id}`,
            studentId: student.id!,
            schoolId: schoolId,
            type: p.decision === 'detained' ? 'detained' : 'promoted',
            title: p.decision === 'detained'
              ? `Detained in ${p.fromClass}`
              : `Promoted: ${p.fromClass} → ${p.toClass}`,
            description: p.decision === 'detained'
              ? `Student was detained in ${p.fromClass} for session ${p.fromSession}`
              : `Moved from ${p.fromClass} to ${p.toClass}`,
            fromClass: p.fromClass,
            toClass: p.toClass,
            session: p.fromSession,
            createdAt: p.createdAt,
          } as LifecycleEvent;
        });

        // Merge and sort by createdAt desc
        const all = [...firestoreEvents, ...promoEvents].sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
          return bTime - aTime;
        });

        // Add enrollment event if no enrolled event exists
        const hasEnrolled = all.some(e => e.type === 'enrolled');
        if (!hasEnrolled && student.enrolledAt) {
          all.push({
            id: 'synthetic_enrolled',
            studentId: student.id!,
            schoolId: schoolId,
            type: 'enrolled',
            title: 'Enrolled',
            description: `${student.studentName} was enrolled in ${student.currentClass}`,
            createdAt: student.enrolledAt,
          } as LifecycleEvent);
        }

        setEvents(all);
      } catch {
        setEvents(firestoreEvents);
      }
      setLoading(false);
    });

    return unsub;
  }, [schoolId, student.id, student.enrolledAt, student.studentName, student.currentClass]);

  const handleAddNote = async () => {
    if (!noteText.trim() || !schoolId || !student.id) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'lifecycle_events'), {
        studentId: student.id,
        schoolId,
        type: 'note',
        title: 'Note',
        description: noteText.trim(),
        recordedBy: profile?.displayName ?? 'Admin',
        createdAt: serverTimestamp(),
      });
      setNoteText('');
      setShowNoteForm(false);
      toast.success('Note added to timeline');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Note button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowNoteForm(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm shadow-indigo-200"
        >
          <Plus className="w-4 h-4" />
          Add Note
        </button>
      </div>

      {/* Note form */}
      <AnimatePresence>
        {showNoteForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-slate-800 text-sm">Add Timeline Note</h3>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                placeholder="Write a note about this student..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowNoteForm(false); setNoteText(''); }}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={saving || !noteText.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Note
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No lifecycle events yet</p>
          <p className="text-sm mt-1">Events will appear here as the student progresses</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />
          <div className="space-y-4">
            {events.map((event, idx) => (
              <motion.div
                key={event.id ?? idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="relative flex gap-4 pl-12"
              >
                {/* Dot */}
                <div className={`absolute left-3.5 top-3.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${LIFECYCLE_DOT_COLORS[event.type]}`} />
                {/* Card */}
                <div className={`flex-1 rounded-2xl border p-4 ${LIFECYCLE_COLORS[event.type]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0">{LIFECYCLE_ICONS[event.type]}</span>
                      <span className="font-bold text-slate-800 text-sm">{event.title}</span>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(event.createdAt)}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-sm text-slate-600 mt-1.5 ml-6">{event.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 ml-6 flex-wrap">
                    {event.session && (
                      <span className="text-xs text-slate-400 font-medium">{event.session}</span>
                    )}
                    {event.fromClass && event.toClass && (
                      <span className="text-xs text-slate-400 font-medium">
                        {event.fromClass} → {event.toClass}
                      </span>
                    )}
                    {event.recordedBy && (
                      <span className="text-xs text-slate-400">by {event.recordedBy}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Academic Growth ───────────────────────────────────────────────────

interface AcademicTabProps {
  student: Student;
  schoolId: string | null;
}

interface TermSummary {
  label: string;
  session: string;
  term: string;
  subjects: number;
  average: number;
  position?: number;
}

function AcademicTab({ student, schoolId }: AcademicTabProps) {
  const [chartData, setChartData] = useState<{ label: string; average: number }[]>([]);
  const [summaryRows, setSummaryRows] = useState<TermSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<'improving' | 'stable' | 'declining'>('stable');

  useEffect(() => {
    if (!schoolId || !student.id) return;

    getDocs(query(
      collection(db, 'grades'),
      where('schoolId', '==', schoolId),
      where('studentId', '==', student.id),
    )).then(snap => {
      const grades = snap.docs.map(d => d.data() as Grade);

      // Group by session + term
      const grouped: Record<string, Grade[]> = {};
      grades.forEach(g => {
        const key = `${g.session}__${g.term}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(g);
      });

      // Sort keys chronologically
      const sortedKeys = Object.keys(grouped).sort((a, b) => {
        const [sessA, termA] = a.split('__');
        const [sessB, termB] = b.split('__');
        if (sessA !== sessB) return sessA.localeCompare(sessB);
        const termOrder = ['1st Term', '2nd Term', '3rd Term'];
        return termOrder.indexOf(termA) - termOrder.indexOf(termB);
      });

      const chart: { label: string; average: number }[] = [];
      const summary: TermSummary[] = [];

      sortedKeys.forEach(key => {
        const [session, term] = key.split('__');
        const termGrades = grouped[key];
        const avg = termGrades.length > 0
          ? Math.round(termGrades.reduce((s, g) => s + (g.totalScore ?? (g.caScore + g.examScore)), 0) / termGrades.length)
          : 0;
        const label = `${term} ${session}`;
        chart.push({ label, average: avg });
        summary.push({
          label,
          session,
          term,
          subjects: termGrades.length,
          average: avg,
          position: termGrades[0]?.subjectPosition,
        });
      });

      setChartData(chart);
      setSummaryRows(summary);

      // Trend: compare last 3 data points
      if (chart.length >= 3) {
        const last3 = chart.slice(-3).map(c => c.average);
        if (last3[2] > last3[0] + 2) setTrend('improving');
        else if (last3[2] < last3[0] - 2) setTrend('declining');
        else setTrend('stable');
      }

      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId, student.id]);

  const trendConfig = {
    improving: { icon: <TrendingUp className="w-4 h-4" />, label: 'Improving', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    stable:    { icon: <Minus className="w-4 h-4" />,      label: 'Stable',    cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    declining: { icon: <TrendingDown className="w-4 h-4" />, label: 'Declining', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trend badge */}
      {chartData.length >= 3 && (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${trendConfig[trend].cls}`}>
            {trendConfig[trend].icon}
            Trend: {trendConfig[trend].label}
          </span>
          <span className="text-xs text-slate-400">Based on last 3 terms</span>
        </div>
      )}

      {/* Chart */}
      {chartData.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No grade data available</p>
          <p className="text-sm mt-1">Grades will appear here once recorded</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Average Score Over Time
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Average Score']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="average"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ fill: '#6366f1', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      {summaryRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">Term-by-Term Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Session</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Term</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Subjects</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700">{row.session}</td>
                    <td className="px-4 py-3 text-slate-600">{row.term}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{row.subjects}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        row.average >= 70 ? 'bg-emerald-100 text-emerald-700' :
                        row.average >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {row.average}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Behavioral History ────────────────────────────────────────────────

interface BehavioralTabProps {
  student: Student;
  schoolId: string | null;
  profile: any;
}

const SEVERITY_TYPES: BehavioralRecord['type'][] = ['warning', 'incident', 'suspension'];

function BehavioralTab({ student, schoolId, profile }: BehavioralTabProps) {
  const [records, setRecords] = useState<BehavioralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    type: BehavioralRecord['type'];
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    date: string;
  }>({
    type: 'commendation',
    title: '',
    description: '',
    severity: 'low',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (!schoolId || !student.id) return;
    const q = query(
      collection(db, 'behavioral_records'),
      where('schoolId', '==', schoolId),
      where('studentId', '==', student.id),
      orderBy('date', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as BehavioralRecord)));
      setLoading(false);
    });
    return unsub;
  }, [schoolId, student.id]);

  const handleSave = async () => {
    if (!form.title.trim() || !schoolId || !student.id) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'behavioral_records'), {
        studentId: student.id,
        schoolId,
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        ...(SEVERITY_TYPES.includes(form.type) ? { severity: form.severity } : {}),
        date: form.date,
        recordedBy: profile?.displayName ?? 'Admin',
        createdAt: serverTimestamp(),
      });
      setShowForm(false);
      setForm({ type: 'commendation', title: '', description: '', severity: 'low', date: new Date().toISOString().split('T')[0] });
      toast.success('Behavioral record added');
    } catch {
      toast.error('Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    commendation: records.filter(r => r.type === 'commendation').length,
    achievement:  records.filter(r => r.type === 'achievement').length,
    warning:      records.filter(r => r.type === 'warning').length,
    incident:     records.filter(r => r.type === 'incident').length,
    suspension:   records.filter(r => r.type === 'suspension').length,
  };

  return (
    <div className="space-y-6">
      {/* Summary counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.entries(counts) as [BehavioralRecord['type'], number][]).map(([type, count]) => (
          <div key={type} className={`rounded-2xl border p-3 text-center ${BEHAVIOR_COLORS[type]}`}>
            <div className="flex justify-center mb-1">{BEHAVIOR_ICONS[type]}</div>
            <div className="text-xl font-black">{count}</div>
            <div className="text-xs font-bold capitalize mt-0.5">{type}s</div>
          </div>
        ))}
      </div>

      {/* Add Record button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm shadow-indigo-200"
        >
          <Plus className="w-4 h-4" />
          Add Record
        </button>
      </div>

      {/* Add Record form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">New Behavioral Record</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as BehavioralRecord['type'] }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                  >
                    <option value="commendation">Commendation</option>
                    <option value="achievement">Achievement</option>
                    <option value="warning">Warning</option>
                    <option value="incident">Incident</option>
                    <option value="suspension">Suspension</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Brief title..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Describe the incident or commendation..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
                  />
                </div>
                {SEVERITY_TYPES.includes(form.type) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Severity</label>
                    <select
                      value={form.severity}
                      onChange={e => setForm(f => ({ ...f, severity: e.target.value as 'low' | 'medium' | 'high' }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Record
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Records list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No behavioral records yet</p>
          <p className="text-sm mt-1">Add commendations, warnings, or incidents above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record, idx) => (
            <motion.div
              key={record.id ?? idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`rounded-2xl border p-4 ${BEHAVIOR_COLORS[record.type]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0">{BEHAVIOR_ICONS[record.type]}</span>
                  <span className="font-bold text-sm">{record.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize border ${BEHAVIOR_COLORS[record.type]}`}>
                    {record.type}
                  </span>
                  {record.severity && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                      record.severity === 'high' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                      record.severity === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {record.severity}
                    </span>
                  )}
                </div>
                <span className="text-xs opacity-60 whitespace-nowrap flex-shrink-0 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {record.date ? new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                </span>
              </div>
              {record.description && (
                <p className="text-sm mt-1.5 ml-6 opacity-80">{record.description}</p>
              )}
              {record.recordedBy && (
                <p className="text-xs mt-1.5 ml-6 opacity-50">Recorded by {record.recordedBy}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Alumni ────────────────────────────────────────────────────────────

interface AlumniTabProps {
  student: Student;
  schoolId: string | null;
  profile: any;
}

function AlumniTab({ student, schoolId, profile }: AlumniTabProps) {
  const [alumniData, setAlumniData] = useState<Partial<AlumniProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isGraduated = student.admissionStatus === 'graduated';

  useEffect(() => {
    if (!student.id || !schoolId) return;
    const unsub = onSnapshot(doc(db, 'alumni_profiles', student.id), snap => {
      if (snap.exists()) {
        setAlumniData(snap.data() as AlumniProfile);
      } else {
        // Pre-fill defaults
        setAlumniData({
          studentId: student.id,
          schoolId,
          studentName: student.studentName,
          graduationYear: '',
          graduationClass: student.currentClass,
          engagementStatus: 'active',
          totalDonations: 0,
        });
      }
      setLoading(false);
    });
    return unsub;
  }, [student.id, schoolId, student.studentName, student.currentClass]);

  const handleSave = async () => {
    if (!student.id || !schoolId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'alumni_profiles', student.id), {
        ...alumniData,
        studentId: student.id,
        schoolId,
        studentName: student.studentName,
        updatedAt: serverTimestamp(),
        createdAt: alumniData.createdAt ?? serverTimestamp(),
      }, { merge: true });
      toast.success('Alumni profile saved');
    } catch {
      toast.error('Failed to save alumni profile');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof AlumniProfile) => ({
    value: (alumniData[key] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setAlumniData(prev => ({ ...prev, [key]: e.target.value })),
  });

  if (!isGraduated) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <GraduationCap className="w-14 h-14 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-bold text-slate-700 mb-2">Not Yet Graduated</h3>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          The alumni profile becomes available once this student's admission status is set to <strong>Graduated</strong>.
        </p>
        <Link
          to={`/admin/students/${student.id}`}
          className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm"
        >
          <Edit2 className="w-4 h-4" />
          Update Student Status
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-violet-600" />
          <h2 className="font-bold text-slate-800">Alumni Profile</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm shadow-indigo-200 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Profile
        </button>
      </div>

      {/* Graduation info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Graduation Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Graduation Year</label>
            <input
              type="text"
              placeholder="e.g. 2024"
              {...field('graduationYear')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Graduation Class</label>
            <input
              type="text"
              placeholder="e.g. SSS 3"
              {...field('graduationClass')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Current info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-indigo-500" />
          Current Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Occupation</label>
            <input
              type="text"
              placeholder="e.g. Software Engineer"
              {...field('currentOccupation')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Employer</label>
            <input
              type="text"
              placeholder="Company name"
              {...field('employer')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">University / Institution</label>
            <input
              type="text"
              placeholder="University name"
              {...field('university')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Course / Field of Study</label>
            <input
              type="text"
              placeholder="e.g. Computer Science"
              {...field('course')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
          <Mail className="w-4 h-4 text-indigo-500" />
          Contact Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal Email</label>
            <input
              type="email"
              placeholder="personal@email.com"
              {...field('personalEmail')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phone</label>
            <input
              type="tel"
              placeholder="+234..."
              {...field('phone')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Link2 className="w-3 h-3" /> LinkedIn
            </label>
            <input
              type="url"
              placeholder="https://linkedin.com/in/..."
              {...field('linkedIn')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Last Contact Date
            </label>
            <input
              type="date"
              {...field('lastContactDate')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Engagement & Donations */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-indigo-500" />
          Engagement & Donations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Engagement Status</label>
            <select
              value={alumniData.engagementStatus ?? 'active'}
              onChange={e => setAlumniData(prev => ({ ...prev, engagementStatus: e.target.value as AlumniProfile['engagementStatus'] }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="lost_contact">Lost Contact</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Donations (₦)</label>
            <input
              type="number"
              min="0"
              value={alumniData.totalDonations ?? 0}
              onChange={e => setAlumniData(prev => ({ ...prev, totalDonations: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Donation Notes</label>
            <textarea
              rows={2}
              placeholder="Notes about donations..."
              {...field('donationNotes')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Networking Notes</label>
            <textarea
              rows={3}
              placeholder="Notes about networking, events attended, referrals..."
              {...field('networkingNotes')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Save button (bottom) */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Alumni Profile
        </button>
      </div>
    </div>
  );
}
