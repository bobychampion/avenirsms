import React from 'react';
import { BookOpen, FileText, CheckSquare, Heart } from 'lucide-react';

interface ProductivityCardsProps {
  assignmentsCreated: number;
  lessonsCompleted: number;
  testsConducted: number;
  conductScore: number | null;
}

export default function ProductivityCards({ assignmentsCreated, lessonsCompleted, testsConducted, conductScore }: ProductivityCardsProps) {
  const cards = [
    { label: 'Lessons Completed', value: lessonsCompleted, icon: BookOpen, color: 'emerald' },
    { label: 'Assignments Created', value: assignmentsCreated, icon: FileText, color: 'indigo' },
    { label: 'Tests Conducted', value: testsConducted, icon: CheckSquare, color: 'amber' },
    { label: 'Conduct Score', value: conductScore !== null ? `${conductScore}%` : '—', icon: Heart, color: 'violet' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <div className={`w-9 h-9 rounded-xl bg-${c.color}-50 flex items-center justify-center mx-auto mb-2`}>
            <c.icon className={`w-5 h-5 text-${c.color}-600`} />
          </div>
          <p className="text-xl font-bold text-slate-900">{c.value}</p>
          <p className="text-xs text-slate-500 font-medium mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
