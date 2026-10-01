import type { Grade, GradingMode, Student } from '../types';
import { stripUndefined } from './firestoreSanitize';
import { deleteField } from 'firebase/firestore';

export function subjectGradeStudents(students: Student[], className: string, enrolledIds: string[] | null) {
  return students.filter(student => student.currentClass === className &&
    (!enrolledIds?.length || enrolledIds.includes(student.id!)));
}

/** Only visible, graded students may be written; blank rows are not zero grades. */
export function gradesToSave(students: Student[], grades: Record<string, Grade>): Grade[] {
  return students.flatMap(student => {
    const grade = grades[student.id!];
    return grade && typeof grade.grade === 'string' && grade.grade.trim() !== '' ? [grade] : [];
  });
}

export function gradePayload(grade: Grade, mode: GradingMode, classId: string, schoolId: string) {
  const { id, ...fields } = grade;
  const payload = stripUndefined({ ...fields, classId, schoolId, gradingMode: mode });
  if (mode === 'single_grade') {
    delete payload.caScore;
    delete payload.examScore;
    delete payload.totalScore;
    delete payload.subjectPosition;
  } else if (mode === 'score_percentage') {
    delete payload.caScore;
    delete payload.examScore;
  }
  return payload;
}

/** Remove obsolete numeric fields when an existing record changes grading mode. */
export function gradeUpdatePayload(grade: Grade, mode: GradingMode, classId: string, schoolId: string) {
  return {
    ...gradePayload(grade, mode, classId, schoolId),
    ...(mode === 'single_grade' || mode === 'score_percentage'
      ? { caScore: deleteField(), examScore: deleteField() } : {}),
    ...(mode === 'single_grade' ? { totalScore: deleteField(), subjectPosition: deleteField() } : {}),
  };
}
