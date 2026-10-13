import type { ClassSubject, Student } from '../types';

export function permittedSubjects(assigned: string[], schoolSubjects: string[]) {
  return assigned.includes('__all__') ? schoolSubjects : assigned;
}

export function resolveGradeSubject(selected: string, permitted: string[], loading = false) {
  return loading ? '' : permitted.includes(selected) ? selected : permitted[0] ?? '';
}

/** Empty/missing enrolment on an existing assignment means the whole class. */
export function teachingStudents(students: Student[], className: string, subjects: string[], assignments: ClassSubject[]) {
  const roster = students.filter(s => s.currentClass === className && s.admissionStatus !== 'withdrawn');
  if (subjects.includes('__all__')) return roster;
  const relevant = assignments.filter(a => a.status !== 'inactive' && subjects.includes(a.subjectName));
  if (relevant.some(a => !a.enrolledStudentIds?.length)) return roster;
  const ids = new Set(relevant.flatMap(a => a.enrolledStudentIds ?? []));
  return roster.filter(s => ids.has(s.id!));
}

export function visibleSkills<T>(students: Student[], skills: Record<string, T>): [string, T][] {
  return students.flatMap(s => skills[s.id!] ? [[s.id!, skills[s.id!]] as [string, T]] : []);
}
