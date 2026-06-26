import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { SchoolEvent } from '../../types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MiniCalendarCard({ events }: { events: SchoolEvent[] }) {
  const [cursor, setCursor] = useState(new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const eventDays = new Set(
    events
      .filter(ev => ev.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
      .map(ev => Number(ev.date.split('-')[2]))
  );

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDayOfWeek }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">School Event Calendar</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-600 w-24 text-center">
            {cursor.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="text-[10px] font-bold text-slate-400 uppercase">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const hasEvent = eventDays.has(day);
          return (
            <div key={i} className="relative flex items-center justify-center py-1.5">
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium ${
                isToday ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600'
              }`}>
                {day}
              </span>
              {hasEvent && !isToday && (
                <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
              )}
            </div>
          );
        })}
      </div>

      <Link to="/calendar" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline">
        View full calendar <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
