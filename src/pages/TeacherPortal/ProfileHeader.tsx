import React from 'react';
import { Bell, Sparkles } from 'lucide-react';
import Avatar from '../../components/Avatar';

interface ProfileHeaderProps {
  displayName?: string;
  photoUrl?: string | null;
  assignedClasses: string[];
  schoolName: string;
  currentTerm: string;
  currentSession: string;
  onAskAI?: () => void;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function ProfileHeader({
  displayName, photoUrl, assignedClasses, schoolName, currentTerm, currentSession, onAskAI,
}: ProfileHeaderProps) {
  const firstName = displayName?.split(' ')[0] || 'Teacher';
  const classSummary = assignedClasses.length === 0
    ? 'No classes assigned yet'
    : assignedClasses.length === 1
      ? `${assignedClasses[0]} Teacher`
      : `${assignedClasses.length} classes — ${assignedClasses.slice(0, 2).join(', ')}${assignedClasses.length > 2 ? '…' : ''}`;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4 min-w-0">
        <Avatar photoUrl={photoUrl} name={displayName} size="md" gradientFrom="from-emerald-500" gradientTo="to-teal-600" />
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight truncate">
            {greeting()}, {firstName} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 truncate">{classSummary}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-slate-700">{schoolName}</p>
          <p className="text-xs text-slate-400">{currentTerm} · {currentSession}</p>
        </div>
        <button
          title="Notifications"
          className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm"
        >
          <Bell className="w-5 h-5" />
        </button>
        <button
          onClick={onAskAI}
          title="Ask Avenir AI"
          className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white hover:bg-violet-700 transition-colors shadow-sm shadow-violet-200"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
