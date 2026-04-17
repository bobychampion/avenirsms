import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './FirebaseProvider';
import { useSchool } from './SchoolContext';
import { useSuperAdmin } from './SuperAdminContext';
import { useMobile } from '../hooks/useMobile';
import { MobileShell } from './MobileShell';
import {
  GraduationCap, LogOut, LayoutDashboard, Users, UserCheck, BookOpen,
  ClipboardList, Calendar, DollarSign, FileText, Settings, BarChart3,
  Clock, Award, Briefcase, CreditCard, Map, Menu, X, Bell,
  ArrowUpRight, Key, Sparkles, MessageSquare, Star, CheckSquare, FileSpreadsheet, Database,
  HelpCircle, Building2, ShieldCheck, LogIn
} from 'lucide-react';
import { cn } from '../lib/utils';

const teacherNavGroups = [
  {
    label: 'My Portal',
    items: [
      { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: 'Classroom',
    items: [
      { to: '/teacher?tab=students', label: 'My Students', icon: Users, exact: false },
      { to: '/teacher?tab=attendance', label: 'Attendance', icon: CheckSquare, exact: false },
      { to: '/teacher?tab=grades', label: 'Gradebook', icon: Award, exact: false },
      { to: '/teacher?tab=skills', label: 'Skills', icon: Star, exact: false },
      { to: '/teacher?tab=assignments', label: 'Assignments', icon: BookOpen, exact: false },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/teacher?tab=messages', label: 'Messages', icon: MessageSquare, exact: false },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { to: '/teacher?tab=ai_tools', label: 'AI Teaching Tools', icon: Sparkles, exact: false },
    ],
  },
];

const superAdminNavGroups = [
  {
    label: 'Platform',
    items: [
      { to: '/super-admin', label: 'Platform Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/super-admin/schools', label: 'Schools', icon: Building2 },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/migrate', label: 'Data Migration', icon: Database },
    ],
  },
];

const accountantNavGroups = [
  {
    label: 'Finance',
    items: [
      { to: '/admin/finance', label: 'Finance', icon: DollarSign },
      { to: '/admin/payroll', label: 'Payroll', icon: CreditCard },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

const adminNavGroups = [
  {
    label: 'Core Management',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/admin/students', label: 'Students', icon: Users },
      { to: '/admin/admissions', label: 'Admissions', icon: UserCheck },
      { to: '/admin/attendance', label: 'Attendance', icon: ClipboardList },
    ],
  },
  {
    label: 'Academic',
    items: [
      { to: '/admin/classes', label: 'Classes', icon: BookOpen },
      { to: '/admin/timetable', label: 'Timetable', icon: Clock },
      { to: '/admin/gradebook', label: 'Gradebook', icon: Award },
      { to: '/admin/report-cards', label: 'Report Cards', icon: FileText },
      { to: '/admin/exams', label: 'Exams', icon: ClipboardList },
      { to: '/admin/curriculum', label: 'Curriculum', icon: Map },
      { to: '/admin/promotion', label: 'Promotion', icon: ArrowUpRight },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/finance', label: 'Finance', icon: DollarSign },
      { to: '/admin/payroll', label: 'Payroll', icon: CreditCard },
    ],
  },
  {
    label: 'HR & System',
    items: [
      { to: '/admin/staff', label: 'Staff / HR', icon: Briefcase },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/admin/users', label: 'User Management', icon: Users },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/pins', label: 'Result PINs', icon: Key },
      { to: '/admin/settings', label: 'School Settings', icon: Settings },
      { to: '/admin/bulk-import', label: 'Bulk Import', icon: FileSpreadsheet },
      { to: '/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { to: '/admin/seed', label: 'Seed Demo Data', icon: Database },
    ],
  },
];

function AdminSidebar({ open, onClose, schoolName, logoUrl, navGroups: customNavGroups }: { open: boolean; onClose: () => void; schoolName: string; logoUrl: string; navGroups?: typeof adminNavGroups }) {
  const location = useLocation();
  const navGroups = customNavGroups ?? adminNavGroups;

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-slate-900 z-50 flex flex-col transition-transform duration-300',
          'lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700">
          <Link to="/admin" className="flex items-center gap-3" onClick={onClose}>
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName} className="w-9 h-9 object-contain rounded-xl bg-white p-0.5" />
            ) : (
              <div className="bg-indigo-600 p-2 rounded-xl">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-sm leading-tight">{schoolName}</p>
              <p className="text-slate-400 text-xs">School Management</p>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest px-3 mb-2">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map(item => {
                  const active = item.exact
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to) && item.to !== '/admin';
                  const isExactAdmin = item.to === '/admin' && location.pathname === '/admin';
                  const isActive = item.exact ? isExactAdmin : (item.to !== '/admin' && location.pathname.startsWith(item.to));
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                          isActive || isExactAdmin
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Calendar quick link + Getting Started */}
        <div className="p-3 border-t border-slate-700 space-y-1">
          <Link
            to="/calendar"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
          >
            <Calendar className="w-4 h-4" />
            School Calendar
          </Link>
          <Link
            to="/onboarding"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-indigo-700 hover:text-white transition-all"
          >
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            Getting Started Guide
          </Link>
        </div>
      </aside>
    </>
  );
}

function TeacherSidebar({ open, onClose, displayName, schoolName, logoUrl }: { open: boolean; onClose: () => void; displayName?: string; schoolName: string; logoUrl: string }) {
  const location = useLocation();
  const activeTab = new URLSearchParams(location.search).get('tab') || '';

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-slate-900 z-50 flex flex-col transition-transform duration-300',
          'lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700">
          <Link to="/teacher" className="flex items-center gap-3" onClick={onClose}>
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName} className="w-9 h-9 object-contain rounded-xl bg-white p-0.5" />
            ) : (
              <div className="bg-emerald-600 p-2 rounded-xl">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-sm leading-tight">{schoolName}</p>
              <p className="text-emerald-400 text-xs font-medium">Teacher Portal</p>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Teacher profile badge */}
        <div className="px-5 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">{displayName?.[0]?.toUpperCase() || 'T'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{displayName || 'Teacher'}</p>
              <p className="text-emerald-400 text-xs">Class Teacher</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {teacherNavGroups.map(group => (
            <div key={group.label}>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest px-3 mb-2">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map(item => {
                  const tabParam = new URLSearchParams(item.to.split('?')[1] || '').get('tab');
                  const isActive = item.exact
                    ? location.pathname === '/teacher' && !activeTab
                    : tabParam ? activeTab === tabParam : location.pathname === item.to.split('?')[0];
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Calendar quick link + Getting Started */}
        <div className="p-3 border-t border-slate-700 space-y-1">
          <Link
            to="/calendar"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
          >
            <Calendar className="w-4 h-4" />
            School Calendar
          </Link>
          <Link
            to="/onboarding"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-emerald-700 hover:text-white transition-all"
          >
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            Getting Started Guide
          </Link>
        </div>
      </aside>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout, login, isAdmin, isSuperAdmin } = useAuth();
  const { schoolName, logoUrl } = useSchool();
  const { activeSchoolId, activeSchoolName, exitSchool } = useSuperAdmin();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useMobile();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isTeacher = profile?.role === 'teacher';
  const isParent = profile?.role === 'parent';
  const isAccountant = profile?.role === 'accountant';

  // ── MOBILE SHELL (admin / teacher / parent on small screens) ──
  if (isMobile && (isAdmin || isTeacher || isParent)) {
    const mobileRole = isAdmin ? 'admin' : isTeacher ? 'teacher' : 'parent';
    return <MobileShell role={mobileRole}>{children}</MobileShell>;
  }

  // ── SUPER ADMIN LAYOUT ──
  if (isSuperAdmin) {
    // When super_admin has entered a school, show normal admin sidebar + viewing banner
    const navGroups = activeSchoolId ? adminNavGroups : superAdminNavGroups;
    const sidebarSchoolName = activeSchoolId ? activeSchoolName : 'Avenir Platform';
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <AdminSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          schoolName={sidebarSchoolName}
          logoUrl={logoUrl}
          navGroups={navGroups}
        />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Viewing school banner */}
          {activeSchoolId && (
            <div className="bg-amber-500 text-white text-sm font-semibold px-4 py-2 flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">Viewing school: <strong>{activeSchoolName}</strong></span>
              <button
                onClick={() => { exitSchool(); navigate('/super-admin'); }}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Exit School
              </button>
            </div>
          )}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{profile?.displayName}</p>
                <p className="text-xs text-purple-600 font-bold">Super Admin</p>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    );
  }

  // ── TEACHER LAYOUT ──
  if (isTeacher) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <TeacherSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} displayName={profile?.displayName} schoolName={schoolName} logoUrl={logoUrl} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <Link
              to="/calendar"
              className="hidden sm:flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </Link>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{profile?.displayName}</p>
                <p className="text-xs text-emerald-600 font-medium">Teacher</p>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {profile?.displayName?.[0]?.toUpperCase() || 'T'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // ── ACCOUNTANT LAYOUT ──
  if (isAccountant) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} schoolName={schoolName} logoUrl={logoUrl} navGroups={accountantNavGroups} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{profile?.displayName}</p>
                <p className="text-xs text-teal-600 font-medium">Accountant</p>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">{profile?.displayName?.[0]?.toUpperCase() || 'A'}</span>
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    );
  }

  // ── ADMIN LAYOUT ──
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} schoolName={schoolName} logoUrl={logoUrl} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            <Link
              to="/calendar"
              className="hidden sm:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </Link>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{profile?.displayName}</p>
                <p className="text-xs text-slate-500 capitalize">{profile?.role?.replace('_', ' ')}</p>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {profile?.displayName?.[0]?.toUpperCase() || 'A'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // Non-admin layout (top nav)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to={!user ? '/' : profile?.role === 'teacher' ? '/teacher' : profile?.role === 'parent' ? '/parent' : '/apply'}
            className="flex items-center space-x-2"
          >
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName} className="w-9 h-9 object-contain rounded-lg" />
            ) : (
              <div className="bg-indigo-600 p-2 rounded-lg">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
            )}
            <span className="text-xl font-bold text-slate-900 tracking-tight">{schoolName}</span>
          </Link>

          <nav className="flex items-center space-x-4">
            {user ? (
              <>
                <Link to="/calendar" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors text-sm">
                  <Calendar className="w-4 h-4 mr-2" />Calendar
                </Link>
                {profile?.role === 'teacher' ? (
                  <Link to="/teacher" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors text-sm">
                    <LayoutDashboard className="w-4 h-4 mr-2" />Teacher Portal
                  </Link>
                ) : profile?.role === 'parent' ? (
                  <>
                    <Link to="/parent" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors text-sm">
                      <LayoutDashboard className="w-4 h-4 mr-2" />Parent Portal
                    </Link>
                    <Link to="/onboarding" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors text-sm">
                      <HelpCircle className="w-4 h-4 mr-2" />Help
                    </Link>
                  </>
                ) : (
                  <Link to="/apply" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors text-sm">
                    <FileText className="w-4 h-4 mr-2" />My Application
                  </Link>
                )}
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex items-center space-x-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900">{profile?.displayName}</p>
                    <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
                  </div>
                  <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Logout">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <button onClick={login} className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-all shadow-sm">
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-grow">{children}</main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
                {logoUrl ? (
                  <img src={logoUrl} alt={schoolName} className="w-8 h-8 object-contain rounded-lg" />
                ) : (
                  <div className="bg-indigo-600 p-1.5 rounded-lg">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                )}
                <span className="text-lg font-bold text-slate-900">{schoolName}</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Empowering schools worldwide with smart, secure, and efficient management tools.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">Quick Access</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/" className="text-slate-500 hover:text-indigo-600 transition-colors">Home</Link></li>
                <li><Link to="/calendar" className="text-slate-500 hover:text-indigo-600 transition-colors">School Calendar</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">Support</h4>
              <p className="text-slate-500 text-sm">
                Need help? Contact our support team at <br />
                <span className="font-medium text-indigo-600">support@avenir-sis.com</span>
              </p>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-100 text-center">
              <p className="text-slate-400 text-xs">
              &copy; {new Date().getFullYear()} Avenir Smart School Management System. Empowering Schools Globally.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
