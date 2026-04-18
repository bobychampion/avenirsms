/**
 * Shared layout shell for non-teaching staff portals: accountant, HR, librarian.
 *
 * Differs from Layout.tsx (which targets admin/teacher/parent) by:
 *  - Slim, focused sidebar (only the role's relevant tools — no admin bloat)
 *  - Reuses the existing brand-color CSS variables for theming
 *  - Same h-screen overflow pattern as Layout.tsx
 *
 * Pass `role` to pick the nav set. Falls back to a generic single-link nav.
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './FirebaseProvider';
import { useSchool } from './SchoolContext';
import {
  DollarSign, Receipt, FileText, BarChart3,
  Users, UserPlus, CalendarOff, ClipboardList,
  BookOpen, Library, AlertCircle, RotateCcw,
  LogOut, Menu, X,
} from 'lucide-react';

type StaffRole = 'accountant' | 'hr' | 'librarian';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_BY_ROLE: Record<StaffRole, { title: string; items: NavItem[] }> = {
  accountant: {
    title: 'Finance',
    items: [
      { to: '/accountant', label: 'Overview', icon: BarChart3 },
      { to: '/admin/finance', label: 'Invoices & Payments', icon: Receipt },
      { to: '/admin/payroll', label: 'Payroll', icon: DollarSign },
      { to: '/admin/analytics', label: 'Reports', icon: FileText },
    ],
  },
  hr: {
    title: 'Human Resources',
    items: [
      { to: '/hr', label: 'Dashboard', icon: BarChart3 },
      { to: '/hr/staff', label: 'Staff Directory', icon: Users },
      { to: '/hr/leave', label: 'Leave Requests', icon: CalendarOff },
      { to: '/hr/onboarding', label: 'Onboarding', icon: UserPlus },
      { to: '/hr/policies', label: 'Policies', icon: ClipboardList },
    ],
  },
  librarian: {
    title: 'Library',
    items: [
      { to: '/library', label: 'Dashboard', icon: BarChart3 },
      { to: '/library/catalog', label: 'Catalog', icon: BookOpen },
      { to: '/library/circulation', label: 'Issue / Return', icon: RotateCcw },
      { to: '/library/fines', label: 'Fines', icon: AlertCircle },
    ],
  },
};

export function StaffLayout({ role, children }: { role: StaffRole; children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const { schoolName, logoUrl } = useSchool();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = NAV_BY_ROLE[role];
  const RoleIcon = role === 'accountant' ? DollarSign : role === 'hr' ? Users : Library;

  const sidebar = (
    <aside className="w-64 shrink-0 bg-slate-900 text-white flex flex-col h-screen">
      <div className="p-5 border-b border-white/10 flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-white" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
            <RoleIcon className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">{nav.title}</p>
          <p className="text-sm font-bold truncate">{schoolName || 'School'}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {nav.items.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 mb-2 px-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
            {profile?.displayName?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate">{profile?.displayName}</p>
            <p className="text-[10px] text-white/50 capitalize">{role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:sticky lg:top-0">{sidebar}</div>

      {/* Mobile sidebar (drawer) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-slate-100">
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <p className="text-sm font-bold text-slate-900 capitalize">{nav.title}</p>
          <button onClick={logout} className="p-2 -mr-2 rounded-lg hover:bg-slate-100">
            <LogOut className="w-5 h-5 text-slate-700" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Mobile close button (when drawer open) */}
      {mobileOpen && (
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-full bg-white shadow-lg"
        >
          <X className="w-5 h-5 text-slate-900" />
        </button>
      )}
    </div>
  );
}
