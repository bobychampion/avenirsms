import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, DollarSign, GraduationCap, MessageSquare, ClipboardList, CalendarClock, Info } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { Notification } from '../types';

const ICONS: Record<Notification['type'], React.ReactNode> = {
  fee_due: <DollarSign className="w-4 h-4 text-amber-600" />,
  exam: <ClipboardList className="w-4 h-4 text-violet-600" />,
  attendance: <CalendarClock className="w-4 h-4 text-rose-600" />,
  message: <MessageSquare className="w-4 h-4 text-indigo-600" />,
  grade: <GraduationCap className="w-4 h-4 text-emerald-600" />,
  assignment: <ClipboardList className="w-4 h-4 text-blue-600" />,
  general: <Info className="w-4 h-4 text-slate-500" />,
};

function timeAgo(ts: any): string {
  const date = ts?.toDate?.() ?? (typeof ts === 'string' ? new Date(ts) : null);
  if (!date) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Notification bell with unread badge + dropdown — mounted in every portal's header. */
export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleClick = (n: Notification) => {
    markRead(n.id!);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
            <p className="font-bold text-slate-900 text-sm">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 transition-colors ${!n.read && n.recipientId !== 'all' ? 'bg-indigo-50/40' : ''}`}
                >
                  <div className="mt-0.5 shrink-0">{ICONS[n.type] ?? ICONS.general}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && n.recipientId !== 'all' && (
                    <span className="w-2 h-2 bg-indigo-500 rounded-full shrink-0 mt-1.5" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
