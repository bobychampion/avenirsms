import React from 'react';
import { Award } from 'lucide-react';
import Avatar from '../../components/Avatar';

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  photoUrl?: string;
  average: number;
}

const MEDAL_COLOR = ['text-amber-500', 'text-slate-400', 'text-orange-500'];

export default function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">Top Performing Students</h3>
      {entries.length === 0 ? (
        <div className="py-8 flex items-center justify-center text-slate-400 text-xs">No grades recorded yet.</div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((e, i) => (
            <div key={e.studentId} className="flex items-center gap-3">
              {i < 3 ? (
                <Award className={`w-5 h-5 shrink-0 ${MEDAL_COLOR[i]}`} />
              ) : (
                <span className="w-5 text-center text-xs font-bold text-slate-400 shrink-0">{i + 1}</span>
              )}
              <Avatar photoUrl={e.photoUrl} name={e.studentName} size="xs" gradientFrom="from-indigo-500" gradientTo="to-violet-600" />
              <span className="text-sm font-medium text-slate-800 flex-1 truncate">{e.studentName}</span>
              <span className="text-sm font-bold text-slate-900">{e.average}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
