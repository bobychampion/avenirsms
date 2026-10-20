import type { SpecialLesson, Student } from '../types';
import type { AttendanceStatus } from './attendanceStatus';

export function clubAttendanceId(clubId: string, date: string, studentId: string) {
  return encodeURIComponent(JSON.stringify([clubId, date, studentId]));
}

export function clubRoster(club: SpecialLesson, students: Student[]) {
  const ids = new Set(club.enrolledStudentIds);
  return students.filter(s => s.schoolId === club.schoolId && ids.has(s.id!) && s.admissionStatus !== 'withdrawn')
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export function clubDateError(club: SpecialLesson, date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) return 'Choose a valid attendance date.';
  if (date > today) return 'Attendance cannot be recorded for a future date.';
  if (club.startDate && date < club.startDate) return 'This date is before the club start date.';
  if (club.endDate && date > club.endDate) return 'This date is after the club end date.';
  return '';
}

export function completeClubMarks(students: Student[], marks: Record<string, AttendanceStatus>) {
  return students.length > 0 && students.every(s => ['present', 'absent', 'late', 'school_trip'].includes(marks[s.id!]));
}
