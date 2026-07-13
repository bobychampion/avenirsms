import React from 'react';
import { Timetable, SpecialLesson } from '../../types';
import { Clock, ClipboardList, CheckSquare, Sparkles, AlertCircle, CalendarClock } from 'lucide-react';

interface TodayPanelProps {
  myTimetables: Timetable[];
  mySpecialLessons: SpecialLesson[];
  myAssignedClasses: string[];
  todaysMarkedClasses: Set<string>;
  teacherName?: string;
  onOpenDailyAttendance: (className: string) => void;
  onOpenSubjectAttendance: (className: string, subject: string, timetablePeriodId?: string) => void;
  onOpenSpecialLesson: (lessonId: string) => void;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Home-tab "what's happening today" surface — Today's Classes/Subjects (from the timetable),
 * today's Special Lessons, which classes still need Daily Attendance marked, and what's next.
 * Every row is a one-click jump into the right marking screen with class/subject/lesson
 * pre-selected — teachers should never have to manually browse for the right class first.
 */
export default function TodayPanel({
  myTimetables, mySpecialLessons, myAssignedClasses, todaysMarkedClasses, teacherName,
  onOpenDailyAttendance, onOpenSubjectAttendance, onOpenSpecialLesson,
}: TodayPanelProps) {
  const now = new Date();
  const todayName = WEEKDAY_NAMES[now.getDay()];
  const todayDate = now.toISOString().split('T')[0];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  type TodayPeriod = { className: string; subject: string; startTime: string; endTime: string; slotId?: string };
  const todaysPeriods: TodayPeriod[] = myTimetables.flatMap(tt => {
    const periods = tt.schedule[todayName as keyof Timetable['schedule']] || [];
    return periods
      .filter(p => !teacherName || p.teacher === teacherName)
      .map(p => ({ className: tt.class, subject: p.subject, startTime: p.startTime, endTime: p.endTime, slotId: p.slotId }));
  }).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  const upcomingPeriods = todaysPeriods.filter(p => toMinutes(p.startTime) >= nowMinutes).slice(0, 4);

  const todaysSpecialLessons = mySpecialLessons.filter(l =>
    l.status === 'active' && l.days.includes(todayName) && l.startDate <= todayDate && l.endDate >= todayDate
  );

  const pendingClasses = myAssignedClasses.filter(c => !todaysMarkedClasses.has(c));

  if (myAssignedClasses.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
      <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2 mb-4">
        <CalendarClock className="w-5 h-5 text-indigo-600" /> Today — {todayName}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pending Daily Attendance */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Pending Attendance
          </p>
          {pendingClasses.length === 0 ? (
            <p className="text-xs text-emerald-600 font-medium">All classes marked for today ✓</p>
          ) : (
            <div className="space-y-1.5">
              {pendingClasses.map(c => (
                <button key={c} onClick={() => onOpenDailyAttendance(c)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors text-left">
                  <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> {c}</span>
                  <span>Mark →</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Today's Classes / Subjects (from timetable) */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" /> Today's Subjects
          </p>
          {todaysPeriods.length === 0 ? (
            <p className="text-xs text-slate-400">No timetabled periods today.</p>
          ) : (
            <div className="space-y-1.5">
              {todaysPeriods.slice(0, 4).map((p, i) => (
                <button key={`${p.className}-${p.subject}-${i}`} onClick={() => onOpenSubjectAttendance(p.className, p.subject, p.slotId)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition-colors text-left">
                  <span className="truncate">{p.subject} · {p.className}</span>
                  <span className="shrink-0 ml-2 text-indigo-500">{p.startTime}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Special Lessons today */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Special Lessons
          </p>
          {todaysSpecialLessons.length === 0 ? (
            <p className="text-xs text-slate-400">None scheduled today.</p>
          ) : (
            <div className="space-y-1.5">
              {todaysSpecialLessons.map(l => (
                <button key={l.id} onClick={() => l.id && onOpenSpecialLesson(l.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-xs font-semibold text-violet-800 hover:bg-violet-100 transition-colors text-left">
                  <span className="truncate">{l.name}</span>
                  {l.time && <span className="shrink-0 ml-2 text-violet-500">{l.time}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {upcomingPeriods.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Upcoming Today
          </p>
          <div className="flex flex-wrap gap-2">
            {upcomingPeriods.map((p, i) => (
              <span key={i} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
                {p.startTime}–{p.endTime} · {p.subject} ({p.className})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
