import type { ClassSubject, Student } from '../types';

export function additionalAttendanceIds(assignments: ClassSubject[], subject: string) {
  return [...new Set(assignments.filter(a => a.status !== 'inactive' && a.subjectName === subject)
    .flatMap(a => a.additionalAttendanceStudentIds ?? []))].sort();
}

export function mergeAttendanceStudents(base: Student[], additional: Student[], allowedIds: string[]) {
  const allowed = new Set(allowedIds);
  const byId = new Map<string, Student>();
  for (const student of [...base, ...additional.filter(s => allowed.has(s.id!))]) {
    if (student.id && student.admissionStatus !== 'withdrawn') byId.set(student.id, student);
  }
  return [...byId.values()].sort((a, b) => a.studentName.localeCompare(b.studentName));
}
