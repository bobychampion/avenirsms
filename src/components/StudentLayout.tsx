import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './FirebaseProvider';
import { useSchool } from './SchoolContext';
import { Home, BookOpen, Trophy, MessageCircle, User, LogOut, Sparkles } from 'lucide-react';

/**
 * Kid-friendly shell for the student portal.
 *
 * Differs from Layout.tsx intentionally:
 *  - No sidebar (students navigate via bottom tab bar)
 *  - Pastel gradient background
 *  - Larger text, rounded-3xl cards, emoji accents
 *
 * Age tier comes from SchoolContext.studentAgeTier ('primary' | 'secondary'):
 *  - primary: full playful treatment (illustrated header, big icons)
 *  - secondary: tones it down (still no sidebar, but lighter colors and
 *    normal-sized type — appropriate for teenagers)
 */
const TABS: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; emoji: string }[] = [
  { to: '/student', label: 'Today', icon: Home, emoji: '🏠' },
  { to: '/student/assignments', label: 'Assignments', icon: BookOpen, emoji: '📚' },
  { to: '/student/grades', label: 'Grades', icon: Trophy, emoji: '🏆' },
  { to: '/student/messages', label: 'Messages', icon: MessageCircle, emoji: '💬' },
  { to: '/student/profile', label: 'Profile', icon: User, emoji: '👤' },
];

export function StudentLayout({ children }: { children?: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const { schoolName, studentAgeTier } = useSchool();
  const location = useLocation();
  const tier = studentAgeTier ?? 'primary';
  const isPrimary = tier === 'primary';

  const wrapperClass = isPrimary
    ? 'min-h-screen bg-gradient-to-br from-indigo-50 via-pink-50 to-amber-50'
    : 'min-h-screen bg-slate-50';

  return (
    <div className={wrapperClass}>
      {/* ── Header (playful for primary, minimal for secondary) ── */}
      <header className={isPrimary
        ? 'sticky top-0 z-30 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg'
        : 'sticky top-0 z-30 bg-white border-b border-slate-200'
      }>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={isPrimary
              ? 'w-10 h-10 rounded-full bg-white/20 flex items-center justify-center ring-2 ring-white/40'
              : 'w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center'
            }>
              {isPrimary ? <Sparkles className="w-6 h-6 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className={isPrimary ? 'text-xs font-medium text-white/80' : 'text-[11px] font-medium text-slate-500'}>
                {schoolName || 'My School'}
              </p>
              <p className={isPrimary ? 'text-base font-bold' : 'text-sm font-bold text-slate-900'}>
                Hi {profile?.displayName?.split(' ')[0] || 'there'}! 👋
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className={isPrimary
              ? 'p-2 rounded-full hover:bg-white/15 transition-colors'
              : 'p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors'
            }
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className={`max-w-5xl mx-auto px-4 py-6 pb-28 ${isPrimary ? 'text-slate-800' : 'text-slate-900'}`}>
        {children ?? <Outlet />}
      </main>

      {/* ── Bottom tab bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-5xl mx-auto grid grid-cols-5">
          {TABS.map(tab => {
            const active = tab.to === '/student'
              ? location.pathname === '/student'
              : location.pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center gap-1 py-3 px-1 transition-colors ${
                  active
                    ? 'text-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {isPrimary ? (
                  <span className={`text-2xl transition-transform ${active ? 'scale-110' : ''}`}>{tab.emoji}</span>
                ) : (
                  <Icon className={`w-5 h-5 ${active ? 'stroke-2' : ''}`} />
                )}
                <span className={`text-[10px] font-bold leading-none ${active ? '' : 'opacity-80'}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
