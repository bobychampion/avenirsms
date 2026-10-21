import { collection, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ActivityMeeting, SpecialLesson, Student } from '../types';
import type { AttendanceStatus } from '../utils/attendanceStatus';
import { assertNotImpersonating } from '../utils/impersonationGuard';
import { meetingFormError, meetingAttendanceId } from '../utils/schoolActivities';
import { clubDateError, completeClubMarks } from '../utils/clubAttendance';

export async function saveActivityMeeting(activity: SpecialLesson, meeting: ActivityMeeting) {
  assertNotImpersonating();
  if (!activity.id || activity.status !== 'active' || meeting.schoolId !== activity.schoolId || meeting.specialLessonId !== activity.id) throw new Error('Choose an active activity.');
  const error = meetingFormError(meeting, activity);
  if (error) throw new Error(error);
  const { id, ...data } = meeting;
  if (id) {
    const old = await getDoc(doc(db, 'activity_meetings', id));
    if (old.exists() && (old.data().schoolId !== activity.schoolId || old.data().specialLessonId !== activity.id)) throw new Error('Meeting does not belong to this activity.');
    if (old.exists() && old.data().attendanceRecorded && ['date', 'startTime', 'endTime'].some(key => old.data()[key] !== data[key])) throw new Error('Meeting timing is locked because attendance has already been recorded.');
  }
  const ref = id ? doc(db, 'activity_meetings', id) : doc(collection(db, 'activity_meetings'));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp(), ...(!id ? { createdAt: serverTimestamp() } : {}) }, { merge: true });
  return ref.id;
}

export async function saveMeetingAttendance(activity: SpecialLesson, meeting: ActivityMeeting, students: Student[], marks: Record<string, AttendanceStatus>, uid: string, today: string) {
  assertNotImpersonating();
  if (!activity.id || !meeting.id || !uid || !completeClubMarks(students, marks)) throw new Error('Mark every student before saving.');
  // Recheck cancellation and enrolment at save time, including changes made by another user.
  const [activitySnap, meetingSnap] = await Promise.all([getDoc(doc(db, 'special_lessons', activity.id)), getDoc(doc(db, 'activity_meetings', meeting.id))]);
  if (!activitySnap.exists() || !meetingSnap.exists()) throw new Error('This activity or meeting no longer exists.');
  const currentActivity = { ...activitySnap.data(), id: activitySnap.id } as SpecialLesson;
  const currentMeeting = { ...meetingSnap.data(), id: meetingSnap.id } as ActivityMeeting;
  const error = clubDateError(currentActivity, currentMeeting.date, today);
  if (currentActivity.schoolId !== activity.schoolId || currentMeeting.schoolId !== activity.schoolId || currentMeeting.specialLessonId !== activity.id || currentActivity.status !== 'active' || currentMeeting.status === 'cancelled' || currentMeeting.date !== meeting.date || error) throw new Error(error || 'Meeting details changed or the meeting was cancelled. Reload before saving.');
  if (students.some(s => s.schoolId !== activity.schoolId || !currentActivity.enrolledStudentIds.includes(s.id!) || s.admissionStatus === 'withdrawn')) throw new Error('Enrolment changed. Reload the register.');
  // Rules validate each student's enrolment; keep each batch below the 20 rule-read limit.
  for (let i = 0; i < students.length; i += 10) {
    const batch = writeBatch(db);
    const currentLeaders = currentMeeting.leaderIds.filter(id => currentActivity.teacherIds.includes(id));
    batch.update(doc(db, 'activity_meetings', meeting.id), { attendanceRecorded: true, leaderIds: currentLeaders.length ? currentLeaders : currentActivity.teacherIds, updatedAt: serverTimestamp() });
    for (const student of students.slice(i, i + 10)) batch.set(doc(db, 'specialLessonAttendance', meetingAttendanceId(activity.id, meeting.id, student.id!)), {
      schoolId: activity.schoolId, specialLessonId: activity.id, meetingId: meeting.id,
      meetingTitle: currentMeeting.title, meetingTime: `${currentMeeting.startTime}–${currentMeeting.endTime}`,
      studentId: student.id!, studentName: student.studentName, studentClass: student.currentClass,
      attendanceDate: currentMeeting.date, status: marks[student.id!], recordedBy: uid, recordedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
}
