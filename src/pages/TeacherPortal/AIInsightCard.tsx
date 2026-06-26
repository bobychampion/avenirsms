import React, { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { generateStudentInsights } from '../../services/geminiService';
import { Student, Grade } from '../../types';
import toast from 'react-hot-toast';

interface AIInsightCardProps {
  selectedClass: string;
  students: Student[];
  belowThresholdStudents: { studentId: string; studentName: string; rate: number }[];
}

interface Insight {
  overallRemark: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  trend: 'improving' | 'stable' | 'declining';
  riskLevel: 'low' | 'medium' | 'high';
}

const TREND_ICON = { improving: TrendingUp, stable: Minus, declining: TrendingDown };
const RISK_COLOR = { low: 'bg-emerald-50 text-emerald-700 border-emerald-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', high: 'bg-rose-50 text-rose-700 border-rose-200' };

export default function AIInsightCard({ selectedClass, students, belowThresholdStudents }: AIInsightCardProps) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [forStudent, setForStudent] = useState<string | null>(null);

  // Pick the most attendance-at-risk student as the default candidate to analyse.
  const candidate = belowThresholdStudents[0];
  const candidateStudent = students.find(s => s.id === candidate?.studentId);

  const runInsight = async () => {
    if (!candidateStudent) return;
    setLoading(true);
    setInsight(null);
    try {
      const result = await generateStudentInsights(
        candidateStudent.studentName,
        selectedClass,
        [],
        candidate.rate,
      );
      if (result) {
        setInsight(result as Insight);
        setForStudent(candidateStudent.studentName);
      } else {
        toast.error('AI insight unavailable right now.');
      }
    } catch (e: any) {
      toast.error('AI error: ' + (e.message || 'Unknown'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" /> AI Classroom Insight
        </h3>
        {candidate && !loading && (
          <button onClick={runInsight} className="text-xs font-bold text-violet-600 hover:underline">
            {insight ? 'Refresh' : 'Analyse'}
          </button>
        )}
      </div>

      {!candidate ? (
        <p className="text-xs text-slate-400 py-6 text-center">No attendance concerns flagged for this class right now. 🎉</p>
      ) : loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Analysing classroom data…
        </div>
      ) : !insight ? (
        <div className="py-2">
          <p className="text-sm text-slate-600 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span><span className="font-bold">{candidateStudent?.studentName}</span>'s attendance is at {candidate.rate}%, below the 75% threshold. Click "Analyse" for an AI-generated insight and recommendation.</span>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${RISK_COLOR[insight.riskLevel]}`}>
              {insight.riskLevel} risk
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              {React.createElement(TREND_ICON[insight.trend], { className: 'w-3.5 h-3.5' })} {insight.trend}
            </span>
          </div>
          <p className="text-sm text-slate-700">
            <span className="font-bold">{forStudent}:</span> {insight.overallRemark}
          </p>
          {insight.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Recommendation</p>
              <ul className="text-sm text-slate-600 space-y-1">
                {insight.recommendations.slice(0, 2).map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
