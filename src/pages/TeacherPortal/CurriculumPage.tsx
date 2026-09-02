import React from 'react';
import { Filter } from 'lucide-react';
import { Student } from '../../types';
import { useTeacherOverviewData } from './hooks/useTeacherOverviewData';
import CurriculumTracker from './CurriculumTracker';

interface CurriculumPageProps {
  schoolId: string | null | undefined;
  selectedClass: string;
  myAssignedClasses: string[];
  onSelectClass: (cls: string) => void;
  subjectsForClass: string[];
  students: Student[];
  currentTerm: string;
  currentSession: string;
}

export default function CurriculumPage({
  schoolId, selectedClass, myAssignedClasses, onSelectClass, subjectsForClass, students, currentTerm, currentSession,
}: CurriculumPageProps) {
  const data = useTeacherOverviewData({ schoolId, selectedClass, subjectsForClass, students, currentTerm, currentSession });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Filter className="w-5 h-5 text-slate-400" />
        <select
          value={selectedClass}
          onChange={e => onSelectClass(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
        >
          {myAssignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-slate-400 font-medium">{currentTerm} · {currentSession}</span>
      </div>

      {data.loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading curriculum data…</div>
      ) : (
        <CurriculumTracker upcomingLessons={data.upcomingLessons} />
      )}
    </div>
  );
}
