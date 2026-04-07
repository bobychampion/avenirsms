import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Student, Grade, calculateGrade, CURRENT_SESSION, formatDate, StudentSkillRecord, StudentSkills, SKILL_LABELS, SKILL_RATING_LABELS, SkillRating } from '../types';
import { generateReportSummary } from '../services/geminiService';
import toast from 'react-hot-toast';
import { useClassSelectOptions } from '../components/SchoolContext';
import { FileText, Printer, Sparkles, ChevronDown, Users } from 'lucide-react';

const DEFAULT_SKILLS: StudentSkills = {
  punctuality: 'G', neatness: 'G', cooperation: 'G', honesty: 'G', sports: 'G', creativity: 'G',
};

interface StudentReport {
  student: Student;
  grades: Grade[];
  totalScore: number;
  average: number;
  position: number;
  attendanceRate?: number;
  principalComment?: string;
  skills?: StudentSkills;
}

const GRADE_MAP: Record<string, { label: string; color: string }> = {
  A1: { label: 'Excellent', color: 'text-emerald-600' },
  B2: { label: 'Very Good', color: 'text-green-600' },
  B3: { label: 'Good', color: 'text-lime-600' },
  C4: { label: 'Credit', color: 'text-blue-600' },
  C5: { label: 'Credit', color: 'text-blue-600' },
  C6: { label: 'Credit', color: 'text-indigo-600' },
  D7: { label: 'Pass', color: 'text-amber-600' },
  E8: { label: 'Pass', color: 'text-orange-600' },
  F9: { label: 'Fail', color: 'text-rose-600' },
};

export default function ReportCards() {
  const classSelectOptions = useClassSelectOptions();
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [session] = useState(CURRENT_SESSION);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<StudentReport | null>(null);
  const [generatingComment, setGeneratingComment] = useState<string | null>(null);
  const [schoolName] = useState('Avenir Secondary School');

  const loadReports = async () => {
    setLoading(true);
    setSelectedReport(null);
    const [studentsSnap, gradesSnap, skillsSnap] = await Promise.all([
      getDocs(query(collection(db, 'students'), where('currentClass', '==', selectedClass))),
      getDocs(query(collection(db, 'grades'), where('class', '==', selectedClass), where('term', '==', selectedTerm), where('session', '==', session))),
      getDocs(query(collection(db, 'student_skills'), where('class', '==', selectedClass), where('term', '==', selectedTerm), where('session', '==', session))),
    ]).catch(e => { handleFirestoreError(e, OperationType.LIST, 'grades'); return [null, null, null]; });

    if (!studentsSnap || !gradesSnap) { setLoading(false); return; }

    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
    const grades = gradesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Grade));
    const skillsMap: Record<string, StudentSkills> = {};
    if (skillsSnap) {
      skillsSnap.docs.forEach(d => {
        const rec = d.data() as StudentSkillRecord;
        skillsMap[rec.studentId] = rec.skills;
      });
    }

    const studentReports: StudentReport[] = students.map(student => {
      const studentGrades = grades.filter(g => g.studentId === student.id);
      const totalScore = studentGrades.reduce((sum, g) => sum + g.totalScore, 0);
      const average = studentGrades.length > 0 ? Math.round(totalScore / studentGrades.length) : 0;
      return { student, grades: studentGrades, totalScore, average, position: 0, skills: skillsMap[student.id!] };
    });

    // Assign positions
    const sorted = [...studentReports].sort((a, b) => b.average - a.average);
    sorted.forEach((r, i) => { r.position = i + 1; });

    setReports(sorted);
    setLoading(false);
  };

  const generateComment = async (report: StudentReport) => {
    setGeneratingComment(report.student.id!);
    const gradeList = report.grades.map(g => ({ subject: g.subject, total: g.totalScore, grade: g.grade }));
    const tid = toast.loading('Generating AI comment…');
    try {
      const comment = await generateReportSummary(report.student.studentName, gradeList, 90);
      if (comment) {
        setReports(prev => prev.map(r => r.student.id === report.student.id ? { ...r, principalComment: comment.trim() } : r));
        setSelectedReport(prev => prev && prev.student.id === report.student.id ? { ...prev, principalComment: comment.trim() } : prev);
        toast.success('Comment generated!', { id: tid });
      }
    } catch (e: any) {
      toast.error('AI error: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setGeneratingComment(null);
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto print:p-0 print:max-w-none">
      <div className="mb-8 print:hidden">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-indigo-600" />
          Report Cards
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Generate and print end-of-term report cards for students.</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              <option>1st Term</option><option>2nd Term</option><option>3rd Term</option>
            </select>
          </div>
          <button onClick={loadReports} disabled={loading}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm disabled:opacity-60">
            {loading ? 'Loading...' : 'Generate Reports'}
          </button>
          {selectedReport && (
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-all text-sm">
              <Printer className="w-4 h-4" /> Print
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">
        {/* Student list */}
        <div className="print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-700">{selectedClass} — {reports.length} students</p>
            </div>
            {reports.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Generate reports to view the list.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {reports.map(report => (
                  <button key={report.student.id} onClick={() => setSelectedReport(report)}
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left transition-colors ${selectedReport?.student.id === report.student.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{report.student.studentName}</p>
                      <p className="text-xs text-slate-500">{report.grades.length} subjects</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-indigo-600">{report.average}%</p>
                      <p className="text-xs text-slate-400">#{report.position}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Report Card Preview */}
        <div className="lg:col-span-2 print:col-span-3">
          {selectedReport ? (
            <div className="print:shadow-none print:border-none">
              <div className="print:hidden mb-4 flex justify-end gap-2">
                <button
                  onClick={() => generateComment(selectedReport)}
                  disabled={generatingComment === selectedReport.student.id}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-all disabled:opacity-60"
                >
                  {generatingComment === selectedReport.student.id
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Sparkles className="w-4 h-4" />}
                  AI Principal Comment
                </button>
              </div>

              {/* Report Card */}
              <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm print:shadow-none print:border-slate-300 overflow-hidden" id="report-card">
                {/* Header */}
                <div className="bg-indigo-900 text-white p-6 text-center">
                  <h2 className="text-xl font-bold">{schoolName}</h2>
                  <p className="text-indigo-300 text-sm mt-0.5">Student Progress Report</p>
                  <div className="mt-3 flex justify-center gap-6 text-sm">
                    <span><span className="text-indigo-300">Term:</span> {selectedTerm}</span>
                    <span><span className="text-indigo-300">Session:</span> {session}</span>
                    <span><span className="text-indigo-300">Class:</span> {selectedClass}</span>
                  </div>
                </div>

                {/* Student Info */}
                <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-6">
                  {[
                    { label: 'Name', value: selectedReport.student.studentName },
                    { label: 'Student ID', value: selectedReport.student.studentId },
                    { label: 'Gender', value: selectedReport.student.gender },
                    { label: 'Class Position', value: `${selectedReport.position} of ${reports.length}` },
                    { label: 'Average', value: `${selectedReport.average}%` },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.label}</p>
                      <p className="text-sm font-bold text-slate-800 capitalize">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Grades Table */}
                <div className="p-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200">
                        <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Subject</th>
                        <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">CA /40</th>
                        <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Exam /60</th>
                        <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</th>
                        <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Grade</th>
                        <th className="text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Pos.</th>
                        <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedReport.grades.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs">No grades recorded for this term.</td></tr>
                      ) : (
                        selectedReport.grades.map(g => (
                          <tr key={g.subject}>
                            <td className="py-2.5 font-medium text-slate-800">{g.subject}</td>
                            <td className="py-2.5 text-center text-slate-600">{g.caScore}</td>
                            <td className="py-2.5 text-center text-slate-600">{g.examScore}</td>
                            <td className="py-2.5 text-center font-bold text-slate-900">{g.totalScore}</td>
                            <td className="py-2.5 text-center">
                              <span className={`font-bold ${GRADE_MAP[g.grade]?.color || 'text-slate-700'}`}>{g.grade}</span>
                            </td>
                            <td className="py-2.5 text-center text-xs text-slate-500">
                              {g.subjectPosition ? `#${g.subjectPosition}` : '—'}
                            </td>
                            <td className={`py-2.5 text-xs ${GRADE_MAP[g.grade]?.color || 'text-slate-500'}`}>
                              {GRADE_MAP[g.grade]?.label || g.grade}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={2} className="py-2.5 font-bold text-slate-700 text-sm">Overall Average</td>
                        <td colSpan={2} className="py-2.5 text-center font-bold text-indigo-700 text-lg">{selectedReport.average}%</td>
                        <td colSpan={3} className="py-2.5 text-left font-bold text-slate-700">
                          {calculateGrade(selectedReport.average)} &nbsp;—&nbsp; Position: <span className="text-indigo-700">{selectedReport.position} of {reports.length}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Skills / Psychomotor Assessment (NERDC) */}
                <div className="px-5 pb-5">
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Psychomotor / Affective Skills Assessment</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-100">
                      {SKILL_LABELS.map(({ key, label }) => {
                        const rating = selectedReport.skills?.[key] ?? 'G';
                        return (
                          <div key={key} className="p-3 text-center">
                            <p className="text-xs font-semibold text-slate-600 mb-1">{label}</p>
                            <p className={`text-sm font-black ${rating === 'E' || rating === 'VG' ? 'text-emerald-600' : rating === 'P' ? 'text-rose-600' : 'text-slate-700'}`}>
                              {rating}
                            </p>
                            <p className="text-[10px] text-slate-400">{SKILL_RATING_LABELS[rating as SkillRating]}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
                      <p className="text-[10px] text-slate-400">E = Excellent &nbsp;|&nbsp; VG = Very Good &nbsp;|&nbsp; G = Good &nbsp;|&nbsp; F = Fair &nbsp;|&nbsp; P = Poor</p>
                    </div>
                  </div>
                </div>

                {/* Principal Comment */}
                <div className="px-5 pb-5">
                  <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2">Principal's Comment</p>
                    <p className="text-sm text-slate-700 italic leading-relaxed">
                      {selectedReport.principalComment || 'Click "AI Principal Comment" to generate an intelligent comment, or enter manually.'}
                    </p>
                  </div>
                </div>

                {/* Grading Key */}
                <div className="px-5 pb-5">
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Grading Scale</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {Object.entries(GRADE_MAP).map(([g, v]) => (
                        <span key={g}><span className="font-bold">{g}</span> — {v.label}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">A1: 75+ | B2: 70–74 | B3: 65–69 | C4: 60–64 | C5: 55–59 | C6: 50–54 | D7: 45–49 | E8: 40–44 | F9: &lt;40</p>
                  </div>
                </div>

                {/* Signature Lines — visible on print */}
                <div className="px-5 pb-8">
                  <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-200">
                    {['Class Teacher', 'Head of Department', 'Principal / Head Teacher'].map(role => (
                      <div key={role} className="text-center">
                        <div className="h-10 border-b-2 border-slate-300 mb-1" />
                        <p className="text-xs font-bold text-slate-500">{role}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Signature &amp; Date</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next Term resumption note */}
                <div className="px-5 pb-5 print:pb-8">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 text-center">
                    <strong className="text-slate-700">Next Term Begins:</strong> _________________ &nbsp;|&nbsp;
                    <strong className="text-slate-700">School Fees Due:</strong> _________________
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 py-24 text-center shadow-sm print:hidden">
              <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">Select a student from the list to preview their report card.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
