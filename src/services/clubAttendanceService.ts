import { collection, doc, getDocs, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { assertNotImpersonating } from '../utils/impersonationGuard';
import { clubAttendanceId, clubDateError, completeClubMarks } from '../utils/clubAttendance';
import type { SpecialLesson, Student } from '../types';
import type { AttendanceStatus } from '../utils/attendanceStatus';

export async function saveClubAttendance(club: SpecialLesson, students: Student[], date: string,
  marks: Record<string, AttendanceStatus>, uid: string, today: string) {
  assertNotImpersonating();
  const error = clubDateError(club, date, today);
  if (!club.id || !club.schoolId || club.status !== 'active' || error || !completeClubMarks(students, marks)) {
    throw new Error(error || 'Choose an active club and mark every enrolled student.');
  }
  if (students.some(s => s.schoolId !== club.schoolId || !club.enrolledStudentIds.includes(s.id!) || s.admissionStatus === 'withdrawn')) throw new Error('Club enrolment has changed. Reload the register.');
  // Reuse legacy activity attendance when an existing activity is converted into a club.
  const existing = await getDocs(query(collection(db, 'specialLessonAttendance'), where('schoolId', '==', club.schoolId), where('specialLessonId', '==', club.id), where('attendanceDate', '==', date)));
  const existingIds = new Map(existing.docs.filter(d => !d.data().meetingId).map(d => [d.data().studentId as string, d.id]));
  for (let offset = 0; offset < students.length; offset += 450) {
    const batch = writeBatch(db);
    for (const student of students.slice(offset, offset + 450)) {
      batch.set(doc(db, 'specialLessonAttendance', existingIds.get(student.id!) ?? clubAttendanceId(club.id, date, student.id!)), {
        schoolId: club.schoolId, specialLessonId: club.id, studentId: student.id!,
        studentName: student.studentName, studentClass: student.currentClass,
        attendanceDate: date, status: marks[student.id!], recordedBy: uid, recordedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
}
