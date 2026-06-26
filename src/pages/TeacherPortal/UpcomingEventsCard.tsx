import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { SchoolEvent } from '../../types';

function dayParts(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return { day: d.getDate(), month: d.toLocaleString('default', { month: 'short' }) };
}

export default function UpcomingEventsCard({ events }: { events: SchoolEvent[] }) {
  const upcoming = events.slice(0, 4);

  return (
    <div className="h-full bg-gradient-to-br from-violet-600 to-indigo-700 rounded-2xl shadow-sm p-5 text-white flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Upcoming Events
        </h3>
      </div>
      <p className="text-xs text-white/70 mb-4">What's happening at school</p>

      {upcoming.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-white/70 text-xs py-6">
          No upcoming events scheduled.
        </div>
      ) : (
        <div className="space-y-2.5 flex-1">
          {upcoming.map(ev => {
            const { day, month } = dayParts(ev.date);
            return (
              <div key={ev.id} className="flex items-center gap-3 bg-white/10 rounded-xl p-2.5">
                <div className="w-11 h-11 rounded-lg bg-white text-indigo-700 flex flex-col items-center justify-center shrink-0 font-extrabold leading-none">
                  <span className="text-sm">{day}</span>
                  <span className="text-[9px] uppercase">{month}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{ev.title}</p>
                  <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/20 text-white">
                    {ev.type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link
        to="/calendar"
        className="mt-4 flex items-center justify-center gap-1.5 bg-white text-indigo-700 font-bold text-xs rounded-xl py-2.5 hover:bg-indigo-50 transition-colors"
      >
        View Calendar <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
