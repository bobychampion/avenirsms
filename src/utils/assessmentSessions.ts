import type { Grade } from '../types';

export interface AssessmentSession {
  id: string;
  name: string;
  date: string;
  term: Grade['term'];
  order: number;
}

export interface AssessmentGrade extends Grade {
  assessmentId: string;
  assessmentName: string;
  assessmentDate: string;
  revision?: number;
}

// Stable identifiers: the six defaults belong to the whole year, not each term.
export function defaultAssessmentSessions(): AssessmentSession[] {
  const terms: Grade['term'][] = ['1st Term', '2nd Term', '3rd Term'];
  return Array.from({ length: 6 }, (_, i) => ({
    id: `grade-${i + 1}`, name: `Grade ${i + 1}`, date: '', term: terms[Math.floor(i / 2)], order: i + 1,
  }));
}

export function assessmentDocumentId(...parts: string[]): string {
  return parts.map(encodeURIComponent).join('|');
}

export function assessmentCellKey(studentId: string, assessmentId: string): string {
  return assessmentDocumentId(studentId, assessmentId);
}

/** Copy the chosen assessment into the existing final record without replacing its identity. */
export function chooseFinalAssessment(existing: Grade, assessment: AssessmentGrade): Grade {
  return { ...existing, grade: assessment.grade, teacherNotes: assessment.teacherNotes,
    caScore: assessment.caScore, examScore: assessment.examScore, totalScore: assessment.totalScore };
}
