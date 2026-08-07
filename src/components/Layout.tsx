import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './FirebaseProvider';
import { useSchool } from './SchoolContext';
import { useSuperAdmin } from './SuperAdminContext';
import { useImpersonation } from './ImpersonationContext';
import { ImpersonationBanner } from './ImpersonationBanner';
import DemoBanner from './DemoBanner';
import NotificationBell from './NotificationBell';
import { useMobile } from '../hooks/useMobile';
import { MobileShell } from './MobileShell';
import {
  GraduationCap, LogOut, LayoutDashboard, Users, UserCheck, BookOpen,
  ClipboardList, Calendar, DollarSign, FileText, Settings, BarChart3,
  Clock, Award, Briefcase, CreditCard, Map, Menu, X, Bell,
  ArrowUpRight, Key, MessageSquare, FileSpreadsheet, Database,
  HelpCircle, Building2, ShieldCheck, LogIn, MapPin, WifiOff, Chrome, Package, Sparkles,
  NotebookPen,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { GeoFence } from '../types';
import { isWithinFence } from '../services/geofenceService';
import { useSchoolId } from '../hooks/useSchoolId';
import Avatar from './Avatar';

// ── Live clock widget ─────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="hidden sm:flex flex-col items-end leading-tight select-none">
      <span className="text-xs font-bold text-slate-700 tabular-nums">{time}</span>
      <span className="text-[10px] text-slate-400 font-medium">{date}</span>
    </div>
  );
}

// ── Teacher GPS presence badge ────────────────────────────────────────────────
function TeacherPresenceBadge({ schoolId }: { schoolId: string }) {
  const [status, setStatus] = useState<'checking' | 'inside' | 'outside' | 'no_fence' | 'denied'>('checking');
  const fenceRef = useRef<GeoFence | null>(null);
  const watchRef = useRef<number | null>(null);

  // Subscribe to geofence config
  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(doc(db, 'geofences', schoolId), snap => {
      fenceRef.current = snap.exists() ? (snap.data() as GeoFence) : null;
      if (!snap.exists()) setStatus('no_fence');
    });
    return () => unsub();
  }, [schoolId]);

  // Watch GPS position
  useEffect(() => {
    if (!navigator.geolocation) { setStatus('denied'); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const fence = fenceRef.current;
        if (!fence) { setStatus('no_fence'); return; }
        const inside = isWithinFence(pos.coords.latitude, pos.coords.longitude, fence);
        setStatus(inside ? 'inside' : 'outside');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  if (status === 'no_fence') return null;

  const cfg = {
    checking: { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400', label: 'Locating…', pulse: false },
    inside:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'On Campus', pulse: true },
    outside:  { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    label: 'Off Campus', pulse: false },
    denied:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   label: 'GPS Off',    pulse: false },
  }[status];

  return (
    <div className={cn('hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold', cfg.bg, cfg.text,
      status === 'inside' ? 'border-emerald-200' : status === 'outside' ? 'border-rose-200' : status === 'denied' ? 'border-amber-200' : 'border-slate-200')}>
      {status === 'denied' ? (
        <WifiOff className="w-3 h-3" />
      ) : (
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot, cfg.pulse && 'animate-pulse')} />
      )}
      <MapPin className="w-3 h-3 opacity-60" />
      {cfg.label}
    </div>
  );
}

/** Returns true if the given hex color is "light" (needs dark text on top). */
function isLightColor(hex: string): boolean {
  const m = hex.replace('#', '');
  if (m.length !== 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // Perceived luminance (ITU-R BT.601)
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 160;
}

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
      { to: '/admin/special-lessons', label: 'Special Lessons', icon: Sparkles },
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
      { to: '/admin/lesson-coverage', label: 'Lesson Coverage', icon: NotebookPen },
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
      { to: '/admin/parents', label: 'Parent Directory', icon: Users },
      { to: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/pins', label: 'Result PINs', icon: Key },
      { to: '/admin/settings', label: 'School Settings', icon: Settings },
      { to: '/admin/integrations/google', label: 'Google Workspace', icon: Chrome },
      { to: '/admin/data-portability', label: 'Import / Export', icon: Package },
      { to: '/admin/bulk-import', label: 'Bulk Import', icon: FileSpreadsheet },
      { to: '/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare },
    ],
  },
];

function AdminSidebar({ open, onClose, schoolName, logoUrl, primaryColor, sidebarStyle, navGroups: customNavGroups }: {
  open: boolean; onClose: () => void; schoolName: string; logoUrl: string;
  primaryColor: string; sidebarStyle: 'dark' | 'light' | 'brand' | 'minimal';
  navGroups?: typeof adminNavGroups
}) {
  const location = useLocation();
  const navGroups = customNavGroups ?? adminNavGroups;

  const isDark = sidebarStyle === 'dark';
  const isLight = sidebarStyle === 'light';
  const isBrand = sidebarStyle === 'brand';
  const isMinimal = sidebarStyle === 'minimal';

  // For brand-style sidebar: pick dark text if the brand color is light (e.g. yellow, lime)
  const brandIsLight = isBrand && isLightColor(primaryColor);

  const sidebarBg = isDark ? 'bg-slate-900' : isLight ? 'bg-white border-r border-slate-200' : isBrand ? '' : 'bg-slate-50 border-r border-slate-200';
  const dividerColor = isDark ? 'border-slate-700' : isBrand && !brandIsLight ? 'border-white/20' : 'border-slate-200';
  const groupLabelColor = isDark ? 'text-slate-500'
    : isBrand && brandIsLight ? 'text-slate-700/70'
    : isBrand ? 'text-white/60'
    : 'text-slate-400';
  const inactiveLink = isDark ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
    : isBrand && brandIsLight ? 'text-slate-800 hover:bg-black/10'
    : isBrand ? 'text-white/85 hover:bg-white/15 hover:text-white'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';
  const nameColor = isDark || (isBrand && !brandIsLight) ? 'text-white' : 'text-slate-900';
  const subtitleColor = isDark ? 'text-slate-400'
    : isBrand && brandIsLight ? 'text-slate-700/70'
    : isBrand ? 'text-white/70'
    : 'text-slate-500';
  // Active link text — white normally, but dark when brand background is light
  const activeText = brandIsLight ? 'text-slate-900' : 'text-white';

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 z-50 flex flex-col transition-transform duration-300',
          'lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full',
          sidebarBg
        )}
        style={isBrand ? { backgroundColor: primaryColor } : {}}
      >
        {/* Logo */}
        <div className={cn('flex items-center justify-between px-5 py-5 border-b', dividerColor)}>
          <Link to="/admin" className="flex items-center gap-3" onClick={onClose}>
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName} className="w-9 h-9 object-contain rounded-xl bg-white p-0.5" />
            ) : (
              <div className="p-2 rounded-xl" style={{ backgroundColor: primaryColor }}>
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className={cn('font-bold text-sm leading-tight', nameColor)}>{schoolName}</p>
              <p className={cn('text-xs', subtitleColor)}>School Management</p>
            </div>
          </Link>
          <button onClick={onClose} className={cn('lg:hidden', isDark || isBrand ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-900')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className={cn('text-xs font-semibold uppercase tracking-widest px-3 mb-2', groupLabelColor)}>
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map(item => {
                  const isExactAdmin = item.to === '/admin' && location.pathname === '/admin';
                  const isActive = item.exact ? isExactAdmin : (item.to !== '/admin' && location.pathname.startsWith(item.to));
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                          isActive || isExactAdmin ? `${activeText} shadow-lg` : inactiveLink
                        )}
                        style={isActive || isExactAdmin
                          ? isBrand
                            ? { backgroundColor: brandIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }
                            : { backgroundColor: primaryColor, boxShadow: `0 4px 14px ${primaryColor}50` }
                          : {}}
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
        <div className={cn('p-3 border-t space-y-1', dividerColor)}>
          <Link
            to="/calendar"
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              location.pathname.startsWith('/calendar') ? `${activeText} shadow-lg` : inactiveLink
            )}
            style={location.pathname.startsWith('/calendar')
              ? isBrand
                ? { backgroundColor: brandIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }
                : { backgroundColor: primaryColor, boxShadow: `0 4px 14px ${primaryColor}50` }
              : {}}
          >
            <Calendar className="w-4 h-4" />
            School Calendar
          </Link>
          <Link
            to="/onboarding"
            onClick={onClose}
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all', inactiveLink)}
          >
            <HelpCircle className="w-4 h-4" />
            Getting Started Guide
          </Link>
        </div>
      </aside>
    </>
  );
}


export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout, login, isAdmin, isSuperAdmin } = useAuth();
  const { schoolName, logoUrl, primaryColor, sidebarStyle } = useSchool();
  const { activeSchoolId, activeSchoolName, exitSchool } = useSuperAdmin();
  const { impersonatedProfile, isImpersonating } = useImpersonation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useMobile();
  const schoolId = useSchoolId();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // While impersonating, render the TARGET user's dashboard (role/name/
  // email) rather than the real super_admin's — the persistent
  // ImpersonationBanner keeps the real identity visible at all times.
  const effectiveProfile = impersonatedProfile
    ? { ...profile, ...impersonatedProfile }
    : profile;
  const effectiveIsAdmin = isImpersonating
    ? ['admin', 'School_admin', 'accountant'].includes(effectiveProfile?.role ?? '')
    : isAdmin;
  const effectiveIsSuperAdmin = isSuperAdmin && !isImpersonating;

  const isTeacher = effectiveProfile?.role === 'teacher';
  const isParent = effectiveProfile?.role === 'parent';
  const isAccountant = effectiveProfile?.role === 'accountant';

  // ── MOBILE SHELL (admin / teacher / parent on small screens) ──
  if (isMobile && (effectiveIsAdmin || isTeacher || isParent)) {
    const mobileRole = effectiveIsAdmin ? 'admin' : isTeacher ? 'teacher' : 'parent';
    return <MobileShell role={mobileRole}>{children}</MobileShell>;
  }

  // ── SUPER ADMIN LAYOUT ──
  if (effectiveIsSuperAdmin) {
    // When super_admin has entered a school, show normal admin sidebar + viewing banner
    const navGroups = activeSchoolId ? adminNavGroups : superAdminNavGroups;
    const sidebarSchoolName = activeSchoolId ? activeSchoolName : 'Avenir Platform';
    return (
      <div className="h-screen bg-slate-50 flex overflow-hidden">
        <AdminSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          schoolName={sidebarSchoolName}
          logoUrl={logoUrl}
          primaryColor={primaryColor}
          sidebarStyle={activeSchoolId ? sidebarStyle : 'dark'}
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
            <LiveClock />
            <NotificationBell />
            <div className="hidden sm:block w-px h-6 bg-slate-200" />
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

  // ── TEACHER LAYOUT (no sidebar — TeacherPortal's own tab bar covers navigation) ──
  if (isTeacher) {
    return (
      <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
        <ImpersonationBanner />
        <DemoBanner />
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
          <Link to="/teacher" className="flex items-center gap-2.5 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName} className="w-8 h-8 object-contain rounded-lg" />
            ) : (
              <div className="bg-emerald-600 p-1.5 rounded-lg">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="text-sm font-bold text-slate-900 hidden sm:block">{schoolName}</span>
          </Link>
          <div className="flex-1" />
          {/* GPS presence */}
          {schoolId && <TeacherPresenceBadge schoolId={schoolId} />}
          {/* Live clock */}
          <LiveClock />
          <NotificationBell />
          <div className="hidden sm:block w-px h-6 bg-slate-200" />
          <Link
            to="/calendar"
            className="hidden sm:flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </Link>
          <Link
            to="/onboarding"
            title="Getting Started Guide"
            className="hidden sm:flex items-center justify-center w-9 h-9 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">{effectiveProfile?.displayName}</p>
              <p className="text-xs text-emerald-600 font-medium">Teacher</p>
            </div>
            <Link to="/profile" title="My Profile">
              <Avatar photoUrl={isImpersonating ? undefined : profile?.photoUrl} name={effectiveProfile?.displayName ?? ''} fallbackChar="T" size="xs" rounded="full" gradientFrom="from-emerald-500" gradientTo="to-teal-600" />
            </Link>
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
    );
  }

  // ── ACCOUNTANT LAYOUT ──
  if (isAccountant) {
    return (
      <div className="h-screen bg-slate-50 flex overflow-hidden">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} schoolName={schoolName} logoUrl={logoUrl} primaryColor={primaryColor} sidebarStyle={sidebarStyle} navGroups={accountantNavGroups} />
        <div className="flex-1 flex flex-col min-w-0">
          <ImpersonationBanner />
        <DemoBanner />
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <LiveClock />
            <NotificationBell />
            <div className="hidden sm:block w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{effectiveProfile?.displayName}</p>
                <p className="text-xs text-teal-600 font-medium">Accountant</p>
              </div>
              <Link to="/profile" title="My Profile">
                <Avatar photoUrl={isImpersonating ? undefined : profile?.photoUrl} name={effectiveProfile?.displayName ?? ''} fallbackChar="A" size="xs" rounded="full" gradientFrom="from-teal-500" gradientTo="to-cyan-600" />
              </Link>
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
  if (effectiveIsAdmin) {
    return (
      <div className="h-screen bg-slate-50 flex overflow-hidden">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} schoolName={schoolName} logoUrl={logoUrl} primaryColor={primaryColor} sidebarStyle={sidebarStyle} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <ImpersonationBanner />
        <DemoBanner />
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center px-4 sm:px-6 gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            {/* Live clock */}
            <LiveClock />
            <NotificationBell />
            <div className="hidden sm:block w-px h-6 bg-slate-200" />

            <Link
              to="/calendar"
              className="hidden sm:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </Link>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{effectiveProfile?.displayName}</p>
                <p className="text-xs text-slate-500 capitalize">{effectiveProfile?.role?.replace('_', ' ')}</p>
              </div>
              <Link to="/profile" title="My Profile">
                <Avatar photoUrl={isImpersonating ? undefined : profile?.photoUrl} name={effectiveProfile?.displayName ?? ''} fallbackChar="A" size="xs" rounded="full" gradientFrom="from-indigo-500" gradientTo="to-purple-600" />
              </Link>
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
      <ImpersonationBanner />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to={!user ? '/' : effectiveProfile?.role === 'teacher' ? '/teacher' : effectiveProfile?.role === 'parent' ? '/parent' : '/apply'}
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
                {effectiveProfile?.role === 'teacher' ? (
                  <Link to="/teacher" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors text-sm">
                    <LayoutDashboard className="w-4 h-4 mr-2" />Teacher Portal
                  </Link>
                ) : effectiveProfile?.role === 'parent' ? (
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
                <NotificationBell />
                <div className="flex items-center space-x-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900">{effectiveProfile?.displayName}</p>
                    <p className="text-xs text-slate-500 capitalize">{effectiveProfile?.role}</p>
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
