import React from 'react';
import { BookMarked, Award, CalendarOff } from 'lucide-react';

interface MetricsGridProps {
  attendanceRate: number;
  classAverage: number;
  schoolAverage: number | null;
  curriculumCoverage: number;
  onRequestLeave: () => void;
}

function Ring({ percent, color }: { percent: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-100" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
      />
    </svg>
  );
}

function MetricCard({
  icon: Icon, color, label, value, sub,
}: { icon: React.ElementType; color: string; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl bg-${color}-50 flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 text-${color}-600`} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function MetricsGrid({
  attendanceRate, classAverage, schoolAverage, curriculumCoverage, onRequestLeave,
}: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
        <div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
            <CalendarOff className="w-5 h-5 text-indigo-600" />
          </div>
          <p className="text-xs text-slate-500 font-medium">Need time off?</p>
        </div>
        <button
          type="button"
          onClick={onRequestLeave}
          className="mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-800 text-left"
        >
          Request Leave &rarr;
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow flex items-center gap-3">
        <div className="relative shrink-0">
          <Ring percent={attendanceRate} color="#10b981" />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">{attendanceRate}%</span>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Attendance Rate</p>
          <p className="text-xs text-slate-400 mt-0.5">This class</p>
        </div>
      </div>

      <MetricCard
        icon={Award} color="amber" label="Class Average"
        value={`${classAverage}%`}
        sub={schoolAverage !== null ? (
          classAverage >= schoolAverage
            ? `+${classAverage - schoolAverage} pts vs school avg (${schoolAverage}%)`
            : `${classAverage - schoolAverage} pts vs school avg (${schoolAverage}%)`
        ) : undefined}
      />

      <MetricCard icon={BookMarked} color="indigo" label="Course Progress" value={`${curriculumCoverage}%`} />
    </div>
  );
}
