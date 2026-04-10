import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, getDocs, limit } from 'firebase/firestore';
import { Application, ApplicationStatus } from '../types';
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
  Shield, Wallet, ReceiptText, UserCog, CalendarDays, BookMarked
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
  const [activeTab, setActiveTab] = useState<'overview' | 'academic' | 'finance' | 'admissions'>('overview');
  const [lastRefresh, setLastRefresh] = useState(new Date());

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
    { id: 'overview', label: 'Overview' },
    { id: 'academic', label: 'Academic' },
    { id: 'finance', label: 'Finance' },
    { id: 'admissions', label: 'Admissions' },
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
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
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
