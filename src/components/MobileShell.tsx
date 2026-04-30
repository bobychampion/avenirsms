import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  GraduationCap, LogOut, LayoutDashboard, CheckSquare, Home,
  Users, Bell, Download, X, WifiOff
} from 'lucide-react';
import { useAuth } from './FirebaseProvider';
import { useSchool } from './SchoolContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { cn } from '../lib/utils';

interface TabItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

const adminTabs: TabItem[] = [
  { to: '/mobile/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/admissions', label: 'Admissions', icon: Users },
  { to: '/admin/notifications', label: 'Alerts', icon: Bell },
];

const teacherTabs: TabItem[] = [
  { to: '/mobile/teacher', label: 'Attendance', icon: CheckSquare },
  { to: '/teacher', label: 'Full Portal', icon: LayoutDashboard },
];

const parentTabs: TabItem[] = [
  { to: '/mobile/parent', label: 'Home', icon: Home },
  { to: '/parent', label: 'Full Portal', icon: LayoutDashboard },
];

interface MobileShellProps {
  children: React.ReactNode;
  role: 'admin' | 'teacher' | 'parent';
}

export function MobileShell({ children, role }: MobileShellProps) {
  const { profile, logout } = useAuth();
  const { schoolName, logoUrl } = useSchool();
  const navigate = useNavigate();
  const location = useLocation();
  const { canInstall, isIOS, isInstalled, promptInstall } = usePWAInstall();
  const [showIOSHint, setShowIOSHint] = useState(() => isIOS && !isInstalled);
  const isOffline = useOfflineStatus();

  const tabs = role === 'admin' ? adminTabs : role === 'teacher' ? teacherTabs : parentTabs;

  const accentColor = role === 'admin'
    ? 'from-indigo-600 to-violet-600'
    : role === 'teacher'
    ? 'from-emerald-500 to-teal-600'
    : 'from-sky-500 to-blue-600';

  const accentActive = role === 'admin'
    ? 'text-indigo-600 bg-indigo-50'
    : role === 'teacher'
    ? 'text-emerald-600 bg-emerald-50'
    : 'text-sky-600 bg-sky-50';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const initial = profile?.displayName?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans max-w-md mx-auto relative">

      {/* ── TOP BAR ── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 h-14 flex items-center px-4 gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt={schoolName} className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
        ) : (
          <div className={cn('bg-gradient-to-br p-1.5 rounded-lg flex-shrink-0', accentColor)}>
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate leading-tight">{schoolName}</p>
          <p className="text-xs text-slate-500 capitalize leading-tight">{role} · mobile</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Install button */}
          {canInstall && !isInstalled && (
            <button
              onClick={promptInstall}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg border border-indigo-100 active:scale-95 transition-transform"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
          )}
          {/* Avatar */}
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 bg-gradient-to-br',
            accentColor
          )}>
            {initial}
          </div>
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── iOS INSTALL HINT ── */}
      {showIOSHint && (
        <div className="mx-3 mt-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-start gap-2.5">
          <Download className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-indigo-700 leading-relaxed flex-1">
            <span className="font-semibold">Add to Home Screen</span> for the best experience:<br />
            Tap <span className="font-semibold">Share</span> → <span className="font-semibold">"Add to Home Screen"</span>
          </p>
          <button onClick={() => setShowIOSHint(false)} className="text-indigo-400 hover:text-indigo-600 p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── OFFLINE BANNER ── */}
      {isOffline && (
        <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-2.5 flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700 font-semibold">You're offline — showing cached data</p>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* ── BOTTOM TAB BAR ── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-white/90 backdrop-blur-md border-t border-slate-100 h-16 flex items-center justify-around px-2 safe-area-bottom">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-xl transition-all duration-200 min-w-[64px]',
                isActive ? accentActive : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <tab.icon className={cn('w-5 h-5 transition-transform duration-200', isActive && 'scale-110')} />
              <span className={cn('text-[10px] font-semibold', isActive ? '' : 'font-medium')}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
