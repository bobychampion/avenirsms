import React from 'react';
import { BookOpen, MessageSquare, CheckSquare, CalendarOff } from 'lucide-react';
import { Student, Assignment, Message } from '../../types';
import { useTeacherOverviewData } from './hooks/useTeacherOverviewData';
import { useSchoolEvents } from './hooks/useSchoolEvents';
import MetricsGrid from './MetricsGrid';
import PerformanceChart from './PerformanceChart';
import Leaderboard from './Leaderboard';
import CurriculumTracker from './CurriculumTracker';
import AttendanceHeatmap from './AttendanceHeatmap';
import AIInsightCard from './AIInsightCard';
import ProductivityCards from './ProductivityCards';
import UpcomingEventsCard from './UpcomingEventsCard';
import MiniCalendarCard from './MiniCalendarCard';

type TabType = 'home' | 'students' | 'attendance' | 'assignments' | 'grades' | 'skills' | 'messages' | 'ai_tools' | 'timetable' | 'absences' | 'curriculum' | 'leave';

interface TeacherOverviewProps {
  schoolId: string | null | undefined;
  selectedClass: string;
  subjectsForClass: string[];
  students: Student[];
  assignments: Assignment[];
  messages: Message[];
  currentUserId?: string;
  currentTerm: string;
  currentSession: string;
  navigateTab: (tab: TabType) => void;
}

export default function TeacherOverview({
  schoolId, selectedClass, subjectsForClass, students, assignments, messages, currentUserId,
  currentTerm, currentSession, navigateTab,
}: TeacherOverviewProps) {
  const data = useTeacherOverviewData({ schoolId, selectedClass, subjectsForClass, students, currentTerm, currentSession });
  const { events, upcoming } = useSchoolEvents(schoolId);

  const quickCards = [
    { label: 'Leave Request', value: '→', color: 'indigo', Icon: CalendarOff, tab: 'leave' as TabType },
    { label: 'Assignments', value: assignments.length, color: 'emerald', Icon: BookOpen, tab: 'assignments' as TabType },
    { label: 'Unread Messages', value: messages.filter(m => m.senderId !== currentUserId && !m.read).length, color: 'violet', Icon: MessageSquare, tab: 'messages' as TabType },
    { label: 'Take Attendance', value: '→', color: 'amber', Icon: CheckSquare, tab: 'attendance' as TabType },
  ];

  if (!selectedClass) {
    return (
      <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="text-slate-500 text-sm">Assign yourself to a class to see your classroom overview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickCards.map(card => (
          <button
            key={card.tab}
            onClick={() => navigateTab(card.tab)}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
          >
            <div className={`w-10 h-10 rounded-xl bg-${card.color}-50 flex items-center justify-center mb-3`}>
              <card.Icon className={`w-5 h-5 text-${card.color}-600`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</p>
          </button>
        ))}
      </div>

      {data.loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading classroom data…</div>
      ) : (
        <>
          {/* Bento row: small metric tiles beside a featured events card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <MetricsGrid
                attendanceRate={data.attendance.rate}
                classAverage={data.classAverage}
                schoolAverage={data.schoolAverage}
                curriculumCoverage={data.curriculumCoverage}
                onRequestLeave={() => navigateTab('leave')}
              />
            </div>
            <UpcomingEventsCard events={upcoming} />
          </div>

          {/* Performance chart (big) + leaderboard (small) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2"><PerformanceChart data={data.subjectPerformance} /></div>
            <Leaderboard entries={data.leaderboard} />
          </div>

          {/* Calendar widget + attendance intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MiniCalendarCard events={events} />
            <AttendanceHeatmap
              present={data.attendance.present}
              absent={data.attendance.absent}
              late={data.attendance.late}
              belowThreshold={data.belowThresholdStudents}
            />
          </div>

          {/* Curriculum + AI insight */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CurriculumTracker coverage={data.curriculumCoverage} upcomingLessons={data.upcomingLessons} />
            <AIInsightCard selectedClass={selectedClass} students={students} belowThresholdStudents={data.belowThresholdStudents} />
          </div>

          <ProductivityCards
            assignmentsCreated={assignments.length}
            lessonsCompleted={data.lessonsCompleted}
            testsConducted={data.testsConducted}
            conductScore={data.conductScore}
          />
        </>
      )}
    </div>
  );
}
