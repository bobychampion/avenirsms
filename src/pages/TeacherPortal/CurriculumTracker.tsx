import React from 'react';
import { BookMarked } from 'lucide-react';
import { CurriculumItem } from '../../types';

interface CurriculumTrackerProps {
  coverage: number;
  upcomingLessons: CurriculumItem[];
}

export default function CurriculumTracker({ coverage, upcomingLessons }: CurriculumTrackerProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-indigo-600" /> Curriculum Coverage
        </h3>
        <span className="text-sm font-bold text-indigo-600">{coverage}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
        <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${coverage}%` }} />
      </div>

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Upcoming Lessons</p>
      {upcomingLessons.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No topics tracked yet for this term — add them in Curriculum Mapping.</p>
      ) : (
        <ul className="space-y-2">
          {upcomingLessons.map(item => (
            <li key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="truncate">{item.topic}</span>
              <span className="text-xs text-slate-400 ml-auto shrink-0">{item.subject}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
