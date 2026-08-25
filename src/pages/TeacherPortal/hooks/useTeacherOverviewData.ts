import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Grade, Student, StudentSkillRecord, StudentSkills, CurriculumItem, SkillRating } from '../../../types';

const SKILL_VALUE: Record<SkillRating, number> = { E: 5, VG: 4, G: 3, F: 2, P: 1 };

interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  total: number;
  rate: number;
}

interface StudentAttendance {
  studentId: string;
  studentName: string;
  rate: number;
}

interface SubjectPerformance {
  subject: string;
  average: number;
}

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  photoUrl?: string;
  average: number;
}

export interface TeacherOverviewData {
  loading: boolean;
  attendance: AttendanceSummary;
  belowThresholdStudents: StudentAttendance[];
  classAverage: number;
  schoolAverage: number | null;
  subjectPerformance: SubjectPerformance[];
  leaderboard: LeaderboardEntry[];
  curriculumCoverage: number;
  upcomingLessons: CurriculumItem[];
  conductScore: number | null;
  lessonsCompleted: number;
  testsConducted: number;
}

const ATTENDANCE_THRESHOLD = 75;

/**
 * Aggregation hook for the Teacher Dashboard overview. Each query is scoped
 * to the teacher's currently selected class — mirrors the scoping already
 * used by the Gradebook/Skills/Attendance tabs in TeacherPortal.tsx.
 */
export function useTeacherOverviewData(params: {
  schoolId: string | null | undefined;
  selectedClass: string;
  subjectsForClass: string[];
  students: Student[];
  currentTerm: string;
  currentSession: string;
}): TeacherOverviewData {
  const { schoolId, selectedClass, subjectsForClass, students, currentTerm, currentSession } = params;

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceSummary>({ present: 0, absent: 0, late: 0, total: 0, rate: 0 });
  const [belowThresholdStudents, setBelowThresholdStudents] = useState<StudentAttendance[]>([]);
  const [classAverage, setClassAverage] = useState(0);
  const [schoolAverage, setSchoolAverage] = useState<number | null>(null);
  const [subjectPerformance, setSubjectPerformance] = useState<SubjectPerformance[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [curriculumCoverage, setCurriculumCoverage] = useState(0);
  const [upcomingLessons, setUpcomingLessons] = useState<CurriculumItem[]>([]);
  const [conductScore, setConductScore] = useState<number | null>(null);
  const [lessonsCompleted, setLessonsCompleted] = useState(0);
  const [testsConducted, setTestsConducted] = useState(0);

  useEffect(() => {
    if (!schoolId || !selectedClass) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const [attendanceSnap, gradesSnap, schoolGradesSnap, curriculumSnap, skillsSnap, examsSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendance'), where('schoolId', '==', schoolId), where('class', '==', selectedClass))),
        getDocs(query(
          collection(db, 'grades'), where('schoolId', '==', schoolId), where('class', '==', selectedClass),
          where('term', '==', currentTerm), where('session', '==', currentSession),
        )),
        getDocs(query(
          collection(db, 'grades'), where('schoolId', '==', schoolId),
          where('term', '==', currentTerm), where('session', '==', currentSession),
        )),
        getDocs(query(
          collection(db, 'curriculum_items'), where('schoolId', '==', schoolId), where('level', '==', selectedClass),
          where('term', '==', currentTerm),
        )).catch(() => ({ docs: [] as any[] })),
        getDocs(query(
          collection(db, 'student_skills'), where('schoolId', '==', schoolId), where('class', '==', selectedClass),
          where('term', '==', currentTerm), where('session', '==', currentSession),
        )),
        getDocs(query(
          collection(db, 'cbt_exams'), where('schoolId', '==', schoolId), where('targetClass', '==', selectedClass),
        )).catch(() => ({ docs: [] as any[] })),
      ]);
      if (cancelled) return;

      // ── Attendance ──────────────────────────────────────────────────────────
      const byStudent: Record<string, { present: number; absent: number; late: number; total: number }> = {};
      let present = 0, absent = 0, late = 0;
      attendanceSnap.docs.forEach(d => {
        const data = d.data() as { studentId: string; status: 'present' | 'absent' | 'late' };
        if (!byStudent[data.studentId]) byStudent[data.studentId] = { present: 0, absent: 0, late: 0, total: 0 };
        byStudent[data.studentId].total++;
        byStudent[data.studentId][data.status]++;
        if (data.status === 'present') present++;
        else if (data.status === 'absent') absent++;
        else late++;
      });
      const total = present + absent + late;
      setAttendance({ present, absent, late, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 });

      const studentNameById: Record<string, string> = {};
      students.forEach(s => { studentNameById[s.id!] = s.studentName; });
      const below: StudentAttendance[] = Object.entries(byStudent)
        .map(([studentId, s]) => ({
          studentId,
          studentName: studentNameById[studentId] || 'Unknown',
          rate: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
        }))
        .filter(s => s.rate < ATTENDANCE_THRESHOLD)
        .sort((a, b) => a.rate - b.rate);
      setBelowThresholdStudents(below);

      // ── Grades: class average, subject performance, leaderboard ────────────
      // single_grade records have no numeric score — excluded from every average below,
      // since there's no sane numeric average across discrete grade values.
      const classGrades = gradesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Grade))
        .filter(g => (g.gradingMode ?? 'ca_exam') !== 'single_grade');
      const byStudentGrades: Record<string, Grade[]> = {};
      classGrades.forEach(g => { (byStudentGrades[g.studentId] ||= []).push(g); });

      const studentAverages: LeaderboardEntry[] = students.map(s => {
        const sg = byStudentGrades[s.id!] || [];
        const avg = sg.length > 0 ? Math.round(sg.reduce((sum, g) => sum + (g.totalScore ?? 0), 0) / sg.length) : 0;
        return { studentId: s.id!, studentName: s.studentName, photoUrl: s.photoUrl, average: avg };
      }).filter(s => s.average > 0).sort((a, b) => b.average - a.average);
      setLeaderboard(studentAverages.slice(0, 5));

      const overallClassAvg = studentAverages.length > 0
        ? Math.round(studentAverages.reduce((sum, s) => sum + s.average, 0) / studentAverages.length)
        : 0;
      setClassAverage(overallClassAvg);

      const bySubject: Record<string, number[]> = {};
      classGrades.forEach(g => { (bySubject[g.subject] ||= []).push(g.totalScore ?? 0); });
      setSubjectPerformance(
        subjectsForClass
          .map(subject => {
            const scores = bySubject[subject] || [];
            return { subject, average: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0 };
          })
          .filter(s => s.average > 0)
      );

      // ── School-wide average (cross-class) ───────────────────────────────────
      const schoolGrades = schoolGradesSnap.docs.map(d => d.data() as Grade)
        .filter(g => (g.gradingMode ?? 'ca_exam') !== 'single_grade');
      setSchoolAverage(schoolGrades.length > 0
        ? Math.round(schoolGrades.reduce((sum, g) => sum + (g.totalScore ?? 0), 0) / schoolGrades.length)
        : null);

      // ── Curriculum coverage ─────────────────────────────────────────────────
      const items = curriculumSnap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumItem))
        .filter(item => subjectsForClass.length === 0 || subjectsForClass.includes(item.subject));
      const completedCount = items.filter(i => i.completed).length;
      setCurriculumCoverage(items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0);
      setUpcomingLessons(items.filter(i => !i.completed).slice(0, 6));
      setLessonsCompleted(completedCount);
      setTestsConducted(examsSnap.docs.length);

      // ── Conduct score (approximate behaviour score) ─────────────────────────
      const skillRecords = skillsSnap.docs.map(d => (d.data() as StudentSkillRecord).skills);
      if (skillRecords.length > 0) {
        const allValues: number[] = [];
        skillRecords.forEach((skills: StudentSkills) => {
          Object.values(skills).forEach(rating => allValues.push(SKILL_VALUE[rating as SkillRating] ?? 3));
        });
        const meanOutOf5 = allValues.reduce((a, b) => a + b, 0) / allValues.length;
        setConductScore(Math.round((meanOutOf5 / 5) * 100));
      } else {
        setConductScore(null);
      }

      setLoading(false);
    };

    run().catch(e => { console.error('[useTeacherOverviewData] failed:', e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schoolId, selectedClass, currentTerm, currentSession, students, subjectsForClass.join('|')]);

  return {
    loading, attendance, belowThresholdStudents, classAverage, schoolAverage,
    subjectPerformance, leaderboard, curriculumCoverage, upcomingLessons, conductScore,
    lessonsCompleted, testsConducted,
  };
}
