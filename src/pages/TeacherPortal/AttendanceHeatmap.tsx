import React from 'react';
import { AlertCircle } from 'lucide-react';

interface StudentAttendance {
  studentId: string;
  studentName: string;
  rate: number;
}

interface AttendanceHeatmapProps {
  present: number;
  absent: number;
  late: number;
  belowThreshold: StudentAttendance[];
}

function rateColor(rate: number) {
  if (rate >= 90) return 'bg-emerald-500';
  if (rate >= 75) return 'bg-amber-400';
  return 'bg-rose-500';
}

export default function AttendanceHeatmap({ present, absent, late, belowThreshold }: AttendanceHeatmapProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">Attendance Intelligence</h3>

      <div className="flex gap-4 text-xs font-bold mb-4">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{present} Present</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />{late} Late</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" />{absent} Absent</span>
      </div>

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Below 75% Threshold</p>
      {belowThreshold.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No students currently below the attendance threshold. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {belowThreshold.map(s => (
            <li key={s.studentId} className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-sm text-slate-700 flex-1 truncate">{s.studentName}</span>
              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                <div className={`h-1.5 rounded-full ${rateColor(s.rate)}`} style={{ width: `${s.rate}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-600 w-9 text-right shrink-0">{s.rate}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
