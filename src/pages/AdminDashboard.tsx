import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, getDocs, limit, where } from 'firebase/firestore';
import {
  initFCMForUser, onForegroundMessage,
  notifyCheckIn, notifyCheckOut, notifyIdleClass,
  showBrowserNotification,
} from '../services/notificationService';

const showBrowserNotificationRaw = (title: string, body: string) =>
  showBrowserNotification({ category: 'check_in', title, body });
import { Application, ApplicationStatus, GeoFence, TeacherCheckIn, Timetable, DAYS_OF_WEEK } from '../types';
import { useSchool } from '../components/SchoolContext';
import { formatCurrency } from '../utils/formatCurrency';
import { useAuth } from '../components/FirebaseProvider';
import { motion } from 'motion/react';
import {
  Users, FileText, DollarSign, TrendingUp, CheckCircle2, XCircle,
  Clock, AlertCircle, ChevronRight, BarChart3, BookOpen, ClipboardList,
  GraduationCap, Award, Briefcase, CreditCard, Map, Settings, Eye,
  UserCheck, Calendar, Bell, ArrowUpRight, Key, FileSpreadsheet, MessageSquare,
  Database, TrendingDown, Activity, Star, Layers, Target, RefreshCw,
  Shield, Wallet, ReceiptText, UserCog, CalendarDays, BookMarked,
  MapPin, Radio, Minus,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-100',
    reviewing: 'bg-blue-50 text-blue-700 border border-blue-100',
    approved: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    rejected: 'bg-rose-50 text-rose-700 border border-rose-100',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]} capitalize`}>
      {status}
    </span>
  );
}

// ─── Module Categories ────────────────────────────────────────────────────────
const moduleGroups = [
  {
    label: 'Academic',
    color: 'border-blue-200 bg-blue-50',
    labelColor: 'text-blue-700',
    items: [
      { to: '/admin/students', label: 'Students', icon: Users, color: 'bg-blue-500' },
      { to: '/admin/classes', label: 'Classes', icon: BookOpen, color: 'bg-purple-500' },
      { to: '/admin/timetable', label: 'Timetable', icon: Clock, color: 'bg-cyan-500' },
      { to: '/admin/gradebook', label: 'Gradebook', icon: Award, color: 'bg-amber-500' },
      { to: '/admin/report-cards', label: 'Report Cards', icon: FileText, color: 'bg-orange-500' },
      { to: '/admin/exams', label: 'Exams', icon: GraduationCap, color: 'bg-rose-500' },
      { to: '/admin/curriculum', label: 'Curriculum', icon: Map, color: 'bg-lime-500' },
      { to: '/admin/attendance', label: 'Attendance', icon: ClipboardList, color: 'bg-green-500' },
    ],
  },
  {
    label: 'Finance & HR',
    color: 'border-emerald-200 bg-emerald-50',
    labelColor: 'text-emerald-700',
    items: [
      { to: '/admin/finance', label: 'Finance', icon: DollarSign, color: 'bg-emerald-500' },
      { to: '/admin/payroll', label: 'Payroll', icon: CreditCard, color: 'bg-teal-500' },
      { to: '/admin/staff', label: 'Staff / HR', icon: Briefcase, color: 'bg-slate-500' },
    ],
  },
  {
    label: 'Admissions',
    color: 'border-indigo-200 bg-indigo-50',
    labelColor: 'text-indigo-700',
    items: [
      { to: '/admin/admissions', label: 'Admissions', icon: UserCheck, color: 'bg-indigo-500' },
      { to: '/admin/promotion', label: 'Promotion', icon: ArrowUpRight, color: 'bg-fuchsia-500' },
      { to: '/admin/pins', label: 'Result PINs', icon: Key, color: 'bg-orange-600' },
    ],
  },
  {
    label: 'Communication & Tools',
    color: 'border-sky-200 bg-sky-50',
    labelColor: 'text-sky-700',
    items: [
      { to: '/admin/notifications', label: 'Notifications', icon: Bell, color: 'bg-sky-500' },
      { to: '/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-600' },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, color: 'bg-violet-500' },
      { to: '/admin/bulk-import', label: 'Bulk Import', icon: FileSpreadsheet, color: 'bg-teal-600' },
      { to: '/admin/users', label: 'User Mgmt', icon: Settings, color: 'bg-pink-500' },
      { to: '/admin/settings', label: 'School Settings', icon: Shield, color: 'bg-slate-600' },
      { to: '/admin/seed', label: 'Seed Data', icon: Database, color: 'bg-violet-600' },
    ],
  },
];

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-700 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Live Class Status Helpers ────────────────────────────────────────────────
type ClassStatus = 'active' | 'scheduled' | 'idle' | 'no_timetable';

interface LiveClassRow {
  className: string;
  status: ClassStatus;
  teacherName?: string;
  subject?: string;
  periodStart?: string;
  periodEnd?: string;
  checkedIn: boolean;
  outOfFence: boolean;
}

function computeLiveClasses(
  timetables: Timetable[],
  checkins: TeacherCheckIn[],
  now: Date,
): LiveClassRow[] {
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] as typeof DAYS_OF_WEEK[number];
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const checkinMap: Record<string, TeacherCheckIn> = {};
  const checkoutMap: Record<string, boolean> = {};
  checkins.forEach(c => {
    if (c.type === 'check_in') checkinMap[c.teacherName] = c;
    if (c.type === 'check_out') checkoutMap[c.teacherName] = true;
  });

  const schoolDays: Record<string, boolean> = {
    Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true,
  };

  return timetables.map(tt => {
    const base: LiveClassRow = {
      className: tt.class,
      status: 'idle',
      checkedIn: false,
      outOfFence: false,
    };

    if (!schoolDays[dayName]) {
      return { ...base, status: 'no_timetable' };
    }

    const periods = tt.schedule[dayName as typeof DAYS_OF_WEEK[number]] || [];
    if (periods.length === 0) return { ...base, status: 'no_timetable' };

    // Find the current or next period
    let activePeriod = periods.find(p => {
      if (!p.startTime || !p.endTime) return false;
      return p.startTime <= timeStr && timeStr < p.endTime;
    });

    if (activePeriod) {
      const checkin = checkinMap[activePeriod.teacher ?? ''];
      const checkedOut = checkoutMap[activePeriod.teacher ?? ''] ?? false;
      const checkedIn = !!checkin && !checkedOut;
      return {
        ...base,
        status: checkedIn ? 'active' : 'scheduled',
        teacherName: activePeriod.teacher,
        subject: activePeriod.subject,
        periodStart: activePeriod.startTime,
        periodEnd: activePeriod.endTime,
        checkedIn,
        outOfFence: !!checkin && !checkin.withinFence,
      };
    }

    // Next upcoming period today
    const upcoming = periods
      .filter(p => p.startTime && p.startTime > timeStr)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))[0];

    if (upcoming) {
      return {
        ...base,
        status: 'scheduled',
        teacherName: upcoming.teacher,
        subject: upcoming.subject,
        periodStart: upcoming.startTime,
        periodEnd: upcoming.endTime,
        checkedIn: false,
        outOfFence: false,
      };
    }

    return base;
  });
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { locale, currency } = useSchool();
  const fmt = (amount: number) => formatCurrency(amount, locale, currency);

  // ─── State ──────────────────────────────────────────────────────────────────
  const [applications, setApplications] = useState<Application[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [gradeDistribution, setGradeDistribution] = useState<{ grade: string; count: number }[]>([]);
  const [classEnrollment, setClassEnrollment] = useState<{ name: string; students: number }[]>([]);
  const [revenueByMonth, setRevenueByMonth] = useState<{ month: string; revenue: number; expenses: number }[]>([]);
  const [attendanceByDay, setAttendanceByDay] = useState<{ date: string; present: number; absent: number; late: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'today' | 'academic' | 'finance' | 'admissions'>('overview');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Live / Today tab
  const [liveCheckins, setLiveCheckins] = useState<TeacherCheckIn[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const [liveNow, setLiveNow] = useState(new Date());
  const [teacherList, setTeacherList] = useState<{ uid: string; displayName: string }[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<{ class: string; present: number; absent: number; late: number }[]>([]);

  // Notification refs — persist across renders without causing re-renders
  const mountedAtRef   = useRef(Date.now());
  const alertedClasses = useRef<Set<string>>(new Set());
  // Ref snapshot of timetables so the idle-class interval can read latest value
  const timetablesRef  = useRef<Timetable[]>([]);
  const checkinsRef    = useRef<TeacherCheckIn[]>([]);
  useEffect(() => { timetablesRef.current = timetables; }, [timetables]);
  useEffect(() => { checkinsRef.current = liveCheckins; }, [liveCheckins]);

  // ─── FCM Initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    initFCMForUser(user.uid).catch(() => {/* non-fatal */});
    let unsub: (() => void) | undefined;
    onForegroundMessage(({ title, body }) => {
      // FCM foreground messages (sent via Cloud Functions) are surfaced as
      // browser notifications the same way as the in-app triggers above.
      if (title) {
        showBrowserNotificationRaw(title, body ?? '');
      }
    }).then(fn => { unsub = fn; });
    return () => unsub?.();
  }, [user?.uid]);

  // ─── Live Applications Listener ─────────────────────────────────────────────
  useEffect(() => {
    const unsubApps = onSnapshot(
      query(collection(db, 'applications'), orderBy('createdAt', 'desc')),
      snap => {
        setApplications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Application)));
        setLoading(false);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'applications')
    );
    return () => unsubApps();
  }, []);

  // ─── Live Class Board Subscriptions ─────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    const unsubFence = onSnapshot(
      collection(db, 'geofences'),
      snap => setGeofenceEnabled(!snap.empty),
    );

    const unsubCheckins = onSnapshot(
      query(collection(db, 'attendance_checkins'), where('date', '==', today)),
      snap => {
        // Update state for all docs
        setLiveCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherCheckIn)));

        // Fire browser notifications only for truly new events (added after mount)
        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const ev = change.doc.data() as TeacherCheckIn;
          const evMs = ev.timestamp?.toMillis?.() ?? 0;
          if (evMs < mountedAtRef.current) return; // existing doc on initial load

          const timeStr = new Date(evMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (ev.type === 'check_in')  notifyCheckIn(ev.teacherName, timeStr, ev.withinFence);
          if (ev.type === 'check_out') notifyCheckOut(ev.teacherName, timeStr);
        });
      },
    );

    const unsubTimetables = onSnapshot(
      collection(db, 'timetables'),
      snap => setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable))),
    );

    const unsubTeachers = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'teacher')),
      snap => setTeacherList(
        snap.docs.map(d => ({ uid: d.id, displayName: (d.data().displayName || d.data().email || 'Unknown') }))
      ),
    );

    const unsubStudentAtt = onSnapshot(
      query(collection(db, 'attendance'), where('date', '==', today)),
      snap => {
        const byClass: Record<string, { present: number; absent: number; late: number }> = {};
        snap.docs.forEach(d => {
          const { class: cls, status } = d.data();
          if (!byClass[cls]) byClass[cls] = { present: 0, absent: 0, late: 0 };
          if (status === 'present') byClass[cls].present++;
          else if (status === 'absent') byClass[cls].absent++;
          else if (status === 'late') byClass[cls].late++;
        });
        setTodayAttendance(
          Object.entries(byClass)
            .map(([cls, counts]) => ({ class: cls, ...counts }))
            .sort((a, b) => a.class.localeCompare(b.class))
        );
      },
    );

    // ── Idle-class alert: every 5 min check for started-but-unteachered periods ──
    const idleCheck = setInterval(() => {
      const now = new Date();
      const liveClasses = computeLiveClasses(timetablesRef.current, checkinsRef.current, now);
      liveClasses.forEach(cls => {
        if (cls.status !== 'scheduled') return;           // only "due but no check-in"
        if (!cls.periodStart) return;
        // Calculate how many minutes past the scheduled start
        const [h, m] = cls.periodStart.split(':').map(Number);
        const startMs = new Date(now).setHours(h, m, 0, 0);
        const minutesLate = Math.floor((now.getTime() - startMs) / 60_000);
        if (minutesLate < 10) return;                     // grace period: 10 minutes
        const key = `${cls.className}_${cls.periodStart}`;
        if (alertedClasses.current.has(key)) return;      // already alerted this period
        alertedClasses.current.add(key);
        notifyIdleClass(cls.className, cls.subject ?? 'Class', cls.teacherName ?? 'Teacher', minutesLate);
      });
    }, 5 * 60_000);

    // Tick every minute to keep the live status fresh
    const tick = setInterval(() => setLiveNow(new Date()), 60_000);

    return () => { unsubFence(); unsubCheckins(); unsubTimetables(); unsubTeachers(); unsubStudentAtt(); clearInterval(idleCheck); clearInterval(tick); };
  }, []);

  // ─── Stats Fetch ────────────────────────────────────────────────────────────
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const [studentsSnap, staffSnap, paymentsSnap, expensesSnap, attendanceSnap, gradesSnap, leavesSnap] =
        await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'staff')),
          getDocs(query(collection(db, 'fee_payments'), limit(1000))),
          getDocs(query(collection(db, 'expenses'), limit(500))),
          getDocs(query(collection(db, 'attendance'), limit(2000))),
          getDocs(query(collection(db, 'grades'), limit(2000))),
          getDocs(collection(db, 'leave_requests')),
        ]);

      setStudentCount(studentsSnap.size);
      setStaffCount(staffSnap.size);

      // Revenue & expenses
      const rev = paymentsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
      const exp = expensesSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
      setTotalRevenue(rev);
      setTotalExpenses(exp);

      // Attendance rate
      const attTotal = attendanceSnap.size;
      const attPresent = attendanceSnap.docs.filter(d => d.data().status === 'present').length;
      setAttendanceRate(attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0);

      // Pending leaves
      setPendingLeaves(leavesSnap.docs.filter(d => d.data().status === 'pending').length);

      // Grade distribution
      const gc: Record<string, number> = {};
      gradesSnap.docs.forEach(d => { const g = d.data().grade; if (g) gc[g] = (gc[g] || 0) + 1; });
      const gradeOrder = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
      setGradeDistribution(gradeOrder.filter(g => gc[g]).map(grade => ({ grade, count: gc[grade] })));

      // Class enrollment
      const cc: Record<string, number> = {};
      studentsSnap.docs.forEach(d => { const c = d.data().currentClass; if (c) cc[c] = (cc[c] || 0) + 1; });
      setClassEnrollment(
        Object.entries(cc)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, students]) => ({ name, students }))
      );

      // Revenue by month (from payments)
      const revMap: Record<string, { revenue: number; expenses: number }> = {};
      paymentsSnap.docs.forEach(d => {
        const ts = d.data().date;
        if (ts) {
          const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
          const key = date.toLocaleString('default', { month: 'short', year: '2-digit' });
          if (!revMap[key]) revMap[key] = { revenue: 0, expenses: 0 };
          revMap[key].revenue += d.data().amount || 0;
        }
      });
      expensesSnap.docs.forEach(d => {
        const ts = d.data().date;
        if (ts) {
          const date = new Date(ts);
          const key = date.toLocaleString('default', { month: 'short', year: '2-digit' });
          if (!revMap[key]) revMap[key] = { revenue: 0, expenses: 0 };
          revMap[key].expenses += d.data().amount || 0;
        }
      });
      setRevenueByMonth(
        Object.entries(revMap)
          .slice(-6)
          .map(([month, v]) => ({ month, ...v }))
      );

      // Attendance by day (last 7 days)
      const dayMap: Record<string, { present: number; absent: number; late: number }> = {};
      attendanceSnap.docs.forEach(d => {
        const date = d.data().date;
        if (date) {
          if (!dayMap[date]) dayMap[date] = { present: 0, absent: 0, late: 0 };
          const st = d.data().status;
          if (st === 'present') dayMap[date].present++;
          else if (st === 'absent') dayMap[date].absent++;
          else if (st === 'late') dayMap[date].late++;
        }
      });
      setAttendanceByDay(
        Object.entries(dayMap)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-7)
          .map(([date, v]) => ({
            date: new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
            ...v,
          }))
      );

      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  // ─── Derived Stats ──────────────────────────────────────────────────────────
  const appStats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
    reviewing: applications.filter(a => a.status === 'reviewing').length,
  };

  const appPieData = [
    { name: 'Pending', value: appStats.pending, color: '#f59e0b' },
    { name: 'Reviewing', value: appStats.reviewing, color: '#6366f1' },
    { name: 'Approved', value: appStats.approved, color: '#10b981' },
    { name: 'Rejected', value: appStats.rejected, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const netBalance = totalRevenue - totalExpenses;

  // Enrollment trend from application dates
  const trendData = React.useMemo(() => {
    const months: Record<string, number> = {};
    applications.forEach(app => {
      if (app.createdAt?.seconds) {
        const d = new Date(app.createdAt.seconds * 1000);
        const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        months[key] = (months[key] || 0) + 1;
      }
    });
    return Object.entries(months).map(([month, count]) => ({ month, count })).slice(-6);
  }, [applications]);

  // ─── KPI Cards ──────────────────────────────────────────────────────────────
  const kpiCards = [
    {
      label: 'Total Students', value: studentCount.toLocaleString(), icon: Users,
      gradient: 'from-blue-500 to-blue-700', light: 'bg-blue-50 text-blue-600',
      sub: `${studentCount > 0 ? 'enrolled' : 'no data'}`, trend: null,
    },
    {
      label: 'Total Staff', value: staffCount.toLocaleString(), icon: Briefcase,
      gradient: 'from-slate-500 to-slate-700', light: 'bg-slate-50 text-slate-600',
      sub: `${pendingLeaves} leave pending`, trend: null,
    },
    {
      label: 'Total Revenue', value: fmt(totalRevenue), icon: Wallet,
      gradient: 'from-emerald-500 to-green-700', light: 'bg-emerald-50 text-emerald-600',
      sub: `Net: ${fmt(netBalance)}`, trend: netBalance >= 0 ? 'up' : 'down',
    },
    {
      label: 'Attendance Rate', value: `${attendanceRate}%`, icon: Activity,
      gradient: 'from-violet-500 to-purple-700', light: 'bg-violet-50 text-violet-600',
      sub: attendanceRate >= 80 ? 'On track' : 'Needs attention', trend: attendanceRate >= 80 ? 'up' : 'down',
    },
    {
      label: 'Applications', value: appStats.total.toLocaleString(), icon: FileText,
      gradient: 'from-amber-500 to-orange-600', light: 'bg-amber-50 text-amber-600',
      sub: `${appStats.pending} pending review`, trend: null,
    },
    {
      label: 'Total Expenses', value: fmt(totalExpenses), icon: ReceiptText,
      gradient: 'from-rose-500 to-red-600', light: 'bg-rose-50 text-rose-600',
      sub: `${totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 100) : 0}% of revenue`, trend: null,
    },
  ];

  const tabs = [
    { id: 'overview',   label: 'Overview',    live: false },
    { id: 'today',      label: 'Today',       live: true  },
    { id: 'academic',   label: 'Academic',    live: false },
    { id: 'finance',    label: 'Finance',     live: false },
    { id: 'admissions', label: 'Admissions',  live: false },
  ] as const;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Welcome back — last updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-indigo-300 transition-colors bg-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {kpiCards.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <kpi.icon className="w-4 h-4 text-white" />
              </div>
              {kpi.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
              {kpi.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
            </div>
            <p className="text-lg font-bold text-slate-900 leading-none truncate">
              {statsLoading ? <span className="inline-block w-16 h-5 bg-slate-100 rounded animate-pulse" /> : kpi.value}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium truncate">{kpi.label}</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              tab.live
                ? activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-emerald-600 hover:text-emerald-700'
                : activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.live && (
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </span>
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-5">

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Application Trend */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Application Trend</h3>
                <Link to="/admin/admissions" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                  View all <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={28} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#appGrad)" strokeWidth={2} name="Applications" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No application data yet</div>
              )}
            </div>

            {/* Application Status Pie */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Application Status</h3>
                <span className="text-xs text-slate-400">{appStats.total} total</span>
              </div>
              {appPieData.length > 0 ? (
                <div className="flex items-center gap-3">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={appPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={58} dataKey="value" paddingAngle={2}>
                        {appPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {appPieData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-slate-600">{d.name}</span>
                        </div>
                        <span className="font-bold text-slate-800">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No applications yet</div>
              )}
            </div>

            {/* Quick Actions / Recent Alerts */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                {[
                  { to: '/admin/admissions', label: 'Review Applications', icon: UserCheck, badge: appStats.pending, badgeColor: 'bg-amber-100 text-amber-700' },
                  { to: '/admin/finance', label: 'Manage Fees', icon: DollarSign, badge: null, badgeColor: '' },
                  { to: '/admin/attendance', label: 'Take Attendance', icon: ClipboardList, badge: null, badgeColor: '' },
                  { to: '/admin/gradebook', label: 'Enter Grades', icon: Award, badge: null, badgeColor: '' },
                  { to: '/admin/staff', label: 'Staff Leaves', icon: Briefcase, badge: pendingLeaves || null, badgeColor: 'bg-rose-100 text-rose-700' },
                  { to: '/admin/notifications', label: 'Send Notifications', icon: Bell, badge: null, badgeColor: '' },
                ].map(item => (
                  <Link key={item.to} to={item.to}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {item.badge ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${item.badgeColor}`}>{item.badge}</span>
                      ) : null}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Live sections moved to the Today tab */}
          {false && geofenceEnabled && timetables.length > 0 && (() => {
            const liveClasses = computeLiveClasses(timetables, liveCheckins, liveNow);
            const activeCount = liveClasses.filter(c => c.status === 'active').length;
            const scheduledCount = liveClasses.filter(c => c.status === 'scheduled').length;
            const idleCount = liveClasses.filter(c => c.status === 'idle' || c.status === 'no_timetable').length;
            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-slate-900">Live Class Status</h3>
                    <span className="text-xs text-slate-400">
                      as of {liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      {activeCount} Active
                    </span>
                    <span className="flex items-center gap-1 text-amber-600 font-semibold">
                      <span className="w-2 h-2 bg-amber-400 rounded-full" />
                      {scheduledCount} Scheduled
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Minus className="w-3 h-3" />
                      {idleCount} Idle
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-px bg-slate-100">
                  {liveClasses.map(cls => (
                    <div key={cls.className} className="bg-white p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold text-slate-800 truncate mr-2">{cls.className}</p>
                        {cls.status === 'active' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            Live
                          </span>
                        )}
                        {cls.status === 'scheduled' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                            <Clock className="w-2.5 h-2.5" />
                            Next
                          </span>
                        )}
                        {(cls.status === 'idle' || cls.status === 'no_timetable') && (
                          <span className="text-[10px] text-slate-400 shrink-0">—</span>
                        )}
                      </div>
                      {cls.subject && (
                        <p className="text-[11px] text-slate-600 truncate">{cls.subject}</p>
                      )}
                      {cls.teacherName && (
                        <p className="text-[11px] text-slate-500 truncate">{cls.teacherName}</p>
                      )}
                      {cls.periodStart && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{cls.periodStart}–{cls.periodEnd}</p>
                      )}
                      {cls.outOfFence && (
                        <p className="text-[10px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                          <MapPin className="w-2.5 h-2.5" /> Out-of-fence
                        </p>
                      )}
                      {(cls.status === 'idle' || cls.status === 'no_timetable') && (
                        <p className="text-[11px] text-slate-400 mt-0.5">No session</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Staff check-ins moved to the Today tab */}
          {false && geofenceEnabled && (() => {
            const today = liveNow.toISOString().split('T')[0];

            // Build per-teacher check-in / check-out lookup
            const ciMap: Record<string, TeacherCheckIn> = {};
            const coMap: Record<string, TeacherCheckIn> = {};
            liveCheckins.forEach(c => {
              if (c.type === 'check_in')  ciMap[c.teacherName] = c;
              if (c.type === 'check_out') coMap[c.teacherName] = c;
            });

            // Also include teachers who checked in but aren't in the users list yet
            const extraNames = liveCheckins
              .map(c => c.teacherName)
              .filter(n => !teacherList.some(t => t.displayName === n));
            const uniqueExtras = [...new Set(extraNames)];

            const rows = [
              ...teacherList.map(t => ({ name: t.displayName })),
              ...uniqueExtras.map(n => ({ name: n })),
            ];

            const checkedInCount  = rows.filter(r => ciMap[r.name]).length;
            const notCheckedIn    = rows.filter(r => !ciMap[r.name]).length;

            const fmtTime = (ci: TeacherCheckIn | undefined) => {
              if (!ci?.timestamp?.toDate) return null;
              return ci.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            };

            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-900">Staff Check-ins Today</h3>
                    <span className="text-xs text-slate-400">{today}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className="text-emerald-600">{checkedInCount} in</span>
                    <span className="text-slate-400">{notCheckedIn} pending</span>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">No teachers found. Add teachers in User Management.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {rows.map(row => {
                      const ci = ciMap[row.name];
                      const co = coMap[row.name];
                      const ciTime = fmtTime(ci);
                      const coTime = fmtTime(co);
                      const checked = !!ci;
                      const outOfFence = !!ci && !ci.withinFence;

                      return (
                        <div key={row.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                          {/* Avatar initial */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            checked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {row.name.charAt(0).toUpperCase()}
                          </div>

                          {/* Name */}
                          <p className="text-sm font-medium text-slate-800 flex-1 truncate">{row.name}</p>

                          {/* Out-of-fence warning */}
                          {outOfFence && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              <MapPin className="w-2.5 h-2.5" /> Out-of-fence
                            </span>
                          )}

                          {/* Check-in / Check-out times */}
                          {checked ? (
                            <div className="text-right shrink-0">
                              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 justify-end">
                                <CheckCircle2 className="w-3 h-3" /> {ciTime}
                              </p>
                              {coTime ? (
                                <p className="text-[10px] text-slate-400">Out {coTime}</p>
                              ) : (
                                <p className="text-[10px] text-slate-400">Still in</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Not yet
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Module Grid — Categorized */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">All Modules</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
              {moduleGroups.map(group => (
                <div key={group.label} className={`rounded-xl border ${group.color} p-3`}>
                  <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${group.labelColor}`}>{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(mod => (
                      <Link
                        key={mod.to}
                        to={mod.to}
                        className="bg-white rounded-lg border border-white/80 p-2.5 hover:shadow-md hover:border-indigo-200 transition-all group flex items-center gap-2"
                      >
                        <div className={`w-7 h-7 ${mod.color} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-sm`}>
                          <mod.icon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors leading-tight">{mod.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Applications Preview */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Recent Applications</h3>
              <Link to="/admin/admissions" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {loading ? (
              <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
            ) : applications.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No applications yet.</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {applications.slice(0, 5).map(app => (
                  <div key={app.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {app.applicantName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{app.applicantName}</p>
                        <p className="text-xs text-slate-400 truncate">{app.classApplyingFor}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <StatusBadge status={app.status} />
                      <Link to={`/admin/application/${app.id}`} className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ TODAY (LIVE) */}
      {activeTab === 'today' && (() => {
        const today = liveNow.toISOString().split('T')[0];
        const todayFull = liveNow.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // ── Staff check-in helpers ──────────────────────────────────────────────
        const ciMap: Record<string, TeacherCheckIn> = {};
        const coMap: Record<string, TeacherCheckIn> = {};
        liveCheckins.forEach(c => {
          if (c.type === 'check_in')  ciMap[c.teacherName] = c;
          if (c.type === 'check_out') coMap[c.teacherName] = c;
        });
        const extraNames = [...new Set(
          liveCheckins.map(c => c.teacherName).filter(n => !teacherList.some(t => t.displayName === n))
        )];
        const staffRows = [
          ...teacherList.map(t => ({ name: t.displayName })),
          ...extraNames.map(n => ({ name: n })),
        ];
        const checkedInCount = staffRows.filter(r => ciMap[r.name]).length;
        const fmtTime = (ci: TeacherCheckIn | undefined) =>
          ci?.timestamp?.toDate
            ? ci.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null;

        // ── Live class helpers ──────────────────────────────────────────────────
        const liveClasses = computeLiveClasses(timetables, liveCheckins, liveNow);
        const activeCount    = liveClasses.filter(c => c.status === 'active').length;
        const scheduledCount = liveClasses.filter(c => c.status === 'scheduled').length;

        // ── Student attendance helpers ──────────────────────────────────────────
        const totalPresent = todayAttendance.reduce((s, r) => s + r.present, 0);
        const totalAbsent  = todayAttendance.reduce((s, r) => s + r.absent, 0);
        const totalLate    = todayAttendance.reduce((s, r) => s + r.late, 0);
        const totalMarked  = totalPresent + totalAbsent + totalLate;
        const presentPct   = totalMarked ? Math.round((totalPresent / totalMarked) * 100) : null;

        return (
          <div className="space-y-5">

            {/* Live header banner */}
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-bold text-emerald-800">Live Activity</span>
                </span>
                <span className="text-xs text-emerald-600">{todayFull}</span>
              </div>
              <span className="text-xs text-emerald-600 font-medium">
                Updates automatically · {liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* KPI strip for today */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Classes Active',  value: activeCount,         sub: `${scheduledCount} upcoming`,    color: 'emerald' },
                { label: 'Staff In',        value: `${checkedInCount}/${staffRows.length}`, sub: geofenceEnabled ? 'GPS verified' : 'No geo-fence set', color: 'indigo' },
                { label: 'Students Present',value: presentPct !== null ? `${presentPct}%` : '—', sub: `${totalPresent} of ${totalMarked} marked`, color: 'blue' },
                { label: 'Absent Today',    value: totalAbsent,          sub: `${totalLate} late`,             color: 'rose' },
              ].map(k => (
                <div key={k.label} className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm`}>
                  <p className={`text-2xl font-bold text-${k.color}-600`}>{k.value}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{k.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Two-column: Live Classes + Staff Check-ins */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* ── Live Class Status ── */}
              {timetables.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-sm font-bold text-slate-900">Live Class Status</h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />{activeCount} Active
                      </span>
                      <span className="flex items-center gap-1 text-amber-600 font-semibold">
                        <Clock className="w-3 h-3" />{scheduledCount} Next
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {liveClasses.map(cls => (
                      <div key={cls.className} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          cls.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                          cls.status === 'scheduled' ? 'bg-amber-400' : 'bg-slate-200'
                        }`} />
                        <p className="text-sm font-semibold text-slate-800 w-28 shrink-0 truncate">{cls.className}</p>
                        <div className="flex-1 min-w-0">
                          {cls.subject && <p className="text-xs text-slate-600 truncate">{cls.subject}</p>}
                          {cls.teacherName && <p className="text-xs text-slate-400 truncate">{cls.teacherName}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          {cls.periodStart
                            ? <p className="text-xs text-slate-500 font-mono">{cls.periodStart}–{cls.periodEnd}</p>
                            : <p className="text-xs text-slate-300">—</p>}
                          {cls.outOfFence && (
                            <p className="text-[10px] text-amber-600 flex items-center gap-0.5 justify-end mt-0.5">
                              <MapPin className="w-2.5 h-2.5" /> Out-of-fence
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center justify-center gap-2 text-center">
                  <Clock className="w-8 h-8 text-slate-200" />
                  <p className="text-sm font-semibold text-slate-500">No timetables configured</p>
                  <Link to="/admin/timetable" className="text-xs text-indigo-600 hover:underline">Set up timetable →</Link>
                </div>
              )}

              {/* ── Staff Check-ins ── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-900">Staff Check-ins</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className="text-emerald-600">{checkedInCount} in</span>
                    <span className="text-slate-400">{staffRows.length - checkedInCount} pending</span>
                  </div>
                </div>
                {!geofenceEnabled ? (
                  <div className="p-5 flex flex-col items-center gap-2 text-center">
                    <MapPin className="w-7 h-7 text-slate-200" />
                    <p className="text-sm font-semibold text-slate-500">Geo-fence not configured</p>
                    <Link to="/admin/settings" className="text-xs text-indigo-600 hover:underline">Configure in Settings → Geo-fence →</Link>
                  </div>
                ) : staffRows.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">No teachers found. Add teachers in User Management.</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {staffRows.map(row => {
                      const ci = ciMap[row.name];
                      const co = coMap[row.name];
                      const ciTime = fmtTime(ci);
                      const coTime = fmtTime(co);
                      const outOfFence = !!ci && !ci.withinFence;
                      return (
                        <div key={row.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            ci ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {row.name.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-sm font-medium text-slate-800 flex-1 truncate">{row.name}</p>
                          {outOfFence && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                              <MapPin className="w-2.5 h-2.5" /> Out-of-fence
                            </span>
                          )}
                          {ci ? (
                            <div className="text-right shrink-0">
                              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 justify-end">
                                <CheckCircle2 className="w-3 h-3" />{ciTime}
                              </p>
                              <p className="text-[10px] text-slate-400">{coTime ? `Out ${coTime}` : 'Still in'}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Not yet
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Student Attendance by Class ── */}
            {todayAttendance.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-bold text-slate-900">Student Attendance — Today</h3>
                  </div>
                  <Link to="/admin/attendance" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                    Full report <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2 font-semibold text-slate-500">Class</th>
                        <th className="text-center px-3 py-2 font-semibold text-emerald-600">Present</th>
                        <th className="text-center px-3 py-2 font-semibold text-rose-500">Absent</th>
                        <th className="text-center px-3 py-2 font-semibold text-amber-500">Late</th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-500">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {todayAttendance.map(row => {
                        const total = row.present + row.absent + row.late;
                        const rate = total ? Math.round((row.present / total) * 100) : 0;
                        return (
                          <tr key={row.class} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-700">{row.class}</td>
                            <td className="text-center px-3 py-2 text-emerald-700 font-semibold">{row.present}</td>
                            <td className="text-center px-3 py-2 text-rose-600 font-semibold">{row.absent}</td>
                            <td className="text-center px-3 py-2 text-amber-600 font-semibold">{row.late}</td>
                            <td className="text-right px-4 py-2">
                              <span className={`font-bold ${rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {rate}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-4 py-2 font-bold text-slate-700">Total</td>
                        <td className="text-center px-3 py-2 font-bold text-emerald-700">{totalPresent}</td>
                        <td className="text-center px-3 py-2 font-bold text-rose-600">{totalAbsent}</td>
                        <td className="text-center px-3 py-2 font-bold text-amber-600">{totalLate}</td>
                        <td className="text-right px-4 py-2 font-bold text-slate-700">
                          {presentPct !== null ? `${presentPct}%` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
            {todayAttendance.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center gap-2 text-center">
                <ClipboardList className="w-8 h-8 text-slate-200" />
                <p className="text-sm font-semibold text-slate-500">No attendance recorded yet today</p>
                <Link to="/admin/attendance" className="text-xs text-indigo-600 hover:underline">Take attendance →</Link>
              </div>
            )}

          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════ ACADEMIC */}
      {activeTab === 'academic' && (
        <div className="space-y-5">

          {/* Academic KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Enrolled Students', value: studentCount, icon: Users, color: 'bg-blue-500', suffix: '' },
              { label: 'Attendance Rate', value: attendanceRate, icon: Activity, color: 'bg-violet-500', suffix: '%' },
              { label: 'Grades Recorded', value: gradeDistribution.reduce((s, g) => s + g.count, 0), icon: Award, color: 'bg-amber-500', suffix: '' },
              { label: 'Classes', value: classEnrollment.length, icon: BookOpen, color: 'bg-purple-500', suffix: '' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex items-center gap-3">
                <div className={`w-9 h-9 ${kpi.color} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                  <kpi.icon className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{kpi.value.toLocaleString()}{kpi.suffix}</p>
                  <p className="text-xs text-slate-500">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Class Enrollment Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Students per Class</h3>
              {classEnrollment.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={classEnrollment} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="students" fill="#6366f1" radius={[0, 4, 4, 0]} name="Students" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No enrollment data</div>
              )}
            </div>

            {/* Grade Distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Grade Distribution</h3>
              {gradeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={gradeDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="grade" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={28} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Count">
                      {gradeDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No grade data</div>
              )}
            </div>

          </div>

          {/* Attendance Trend */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Attendance (Last 7 Days)</h3>
              <Link to="/admin/attendance" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                Manage <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {attendanceByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={attendanceByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="present" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name="Present" />
                  <Bar dataKey="late" stackId="a" fill="#f59e0b" name="Late" />
                  <Bar dataKey="absent" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-slate-400 text-xs">No attendance data</div>
            )}
          </div>

          {/* Academic Module Quick Links */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {moduleGroups[0].items.map(mod => (
              <Link key={mod.to} to={mod.to}
                className="bg-white rounded-xl border border-slate-200 p-3 hover:shadow-md hover:border-indigo-200 transition-all group flex flex-col items-center gap-2 text-center"
              >
                <div className={`w-9 h-9 ${mod.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                  <mod.icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors leading-tight">{mod.label}</span>
              </Link>
            ))}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ FINANCE */}
      {activeTab === 'finance' && (
        <div className="space-y-5">

          {/* Finance KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total Revenue', value: fmt(totalRevenue), icon: TrendingUp, color: 'from-emerald-500 to-green-600' },
              { label: 'Total Expenses', value: fmt(totalExpenses), icon: TrendingDown, color: 'from-rose-500 to-red-600' },
              { label: 'Net Balance', value: fmt(netBalance), icon: Wallet, color: netBalance >= 0 ? 'from-teal-500 to-cyan-600' : 'from-orange-500 to-red-500' },
              { label: 'Expense Ratio', value: totalRevenue > 0 ? `${Math.round((totalExpenses / totalRevenue) * 100)}%` : '—', icon: Target, color: 'from-violet-500 to-purple-600' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-sm`}>
                    <kpi.icon className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
                </div>
                <p className="text-base font-bold text-slate-900">
                  {statsLoading ? <span className="inline-block w-20 h-4 bg-slate-100 rounded animate-pulse" /> : kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Revenue vs Expenses Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Revenue vs Expenses</h3>
                <Link to="/admin/finance" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                  Manage <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {revenueByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} formatter={(v: any) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} name="Revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No financial data yet</div>
              )}
            </div>

            {/* Finance Summary Pie */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Financial Breakdown</h3>
              {totalRevenue > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={160}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Expenses', value: totalExpenses, color: '#ef4444' },
                          { name: 'Net Balance', value: Math.max(0, netBalance), color: '#10b981' },
                        ]}
                        cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}
                      >
                        <Cell fill="#ef4444" />
                        <Cell fill="#10b981" />
                      </Pie>
                      <Tooltip content={<CustomTooltip />} formatter={(v: any) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-xs text-slate-500">Total Revenue</p>
                      <p className="text-sm font-bold text-emerald-600">{fmt(totalRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Expenses</p>
                      <p className="text-sm font-bold text-rose-600">{fmt(totalExpenses)}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-500">Net Balance</p>
                      <p className={`text-sm font-bold ${netBalance >= 0 ? 'text-teal-600' : 'text-red-600'}`}>{fmt(netBalance)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No financial data yet</div>
              )}
            </div>
          </div>

          {/* Finance & HR Links */}
          <div className="grid grid-cols-3 gap-3">
            {moduleGroups[1].items.map(mod => (
              <Link key={mod.to} to={mod.to}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all group flex items-center gap-3"
              >
                <div className={`w-10 h-10 ${mod.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                  <mod.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{mod.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mod.label === 'Finance' ? 'Fees, invoices & expenses' :
                      mod.label === 'Payroll' ? 'Staff salaries & deductions' :
                        'Staff records & leave'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 ml-auto transition-colors" />
              </Link>
            ))}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ ADMISSIONS */}
      {activeTab === 'admissions' && (
        <div className="space-y-5">

          {/* Admission KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: appStats.total, color: 'bg-slate-100 text-slate-700', border: 'border-slate-200' },
              { label: 'Pending', value: appStats.pending, color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
              { label: 'Reviewing', value: appStats.reviewing, color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
              { label: 'Approved', value: appStats.approved, color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
              { label: 'Rejected', value: appStats.rejected, color: 'bg-rose-50 text-rose-700', border: 'border-rose-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border ${s.border} p-3.5 ${s.color}`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Admission Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Monthly Application Volume</h3>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={28} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Applications" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-slate-400 text-xs">No data yet</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Status Distribution</h3>
              {appPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={appPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {appPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-slate-400 text-xs">No applications yet</div>
              )}
            </div>
          </div>

          {/* Full Applications Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">All Applications</h3>
              <Link to="/admin/admissions" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                Manage <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
            ) : applications.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No applications yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {applications.map(app => (
                  <div key={app.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {app.applicantName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{app.applicantName}</p>
                        <p className="text-xs text-slate-400 truncate">{app.classApplyingFor} · {app.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <StatusBadge status={app.status} />
                      <Link to={`/admin/application/${app.id}`} className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
