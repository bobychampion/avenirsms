// Run only with the Firestore emulator. No production credentials or data are used.
import assert from 'node:assert/strict';
import { initializeApp as adminApp, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getFirestore, setDoc, updateDoc, writeBatch, terminate } from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This script requires the Firestore emulator.');
const projectId = process.env.GCLOUD_PROJECT || 'demo-avenir-activities';
if (!projectId.startsWith('demo-')) throw new Error('Use a demo- project for isolated rules tests.');
const admin = adminApp({ projectId });
const seed = adminFirestore(admin);
const activity = { schoolId: 'a', name: 'Chess', activityType: 'club', status: 'active', teacherIds: ['leader'], enrolledStudentIds: Array.from({ length: 12 }, (_, i) => `student${i}`) };
await Promise.all([
  seed.doc('schools/a').set({ status: 'active' }), seed.doc('schools/b').set({ status: 'active' }),
  ...[['leader', 'teacher', 'a'], ['stranger', 'teacher', 'a'], ['admin', 'admin', 'a'], ['otherAdmin', 'admin', 'b'], ['super', 'super_admin', null]].map(([id, role, schoolId]) => seed.doc(`users/${id}`).set({ role, schoolId, disabled: false })),
  seed.doc('special_lessons/chess').set(activity),
  ...activity.enrolledStudentIds.map(id => seed.doc(`students/${id}`).set({ schoolId: 'a', admissionStatus: 'enrolled' })),
]);
const clients = [];
function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'demo-key' }, uid);
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, user_id: uid } });
  clients.push({ app, db }); return db;
}
const leader = client('leader'), stranger = client('stranger'), schoolAdmin = client('admin'), otherAdmin = client('otherAdmin'), platformAdmin = client('super');
const meeting = { schoolId: 'a', specialLessonId: 'chess', title: 'Tactics', date: '2026-10-21', startTime: '15:00', endTime: '16:00', location: 'Library', notes: '', leaderIds: ['leader'], items: [], status: 'scheduled' };
const rejected = promise => assert.rejects(promise, e => e.code === 'permission-denied');
let checks = 0;
async function check(name, test) { await test(); checks++; console.log(`PASS ${name}`); }
try {
  await check('assigned leader creates meeting', () => setDoc(doc(leader, 'activity_meetings/m1'), meeting));
  await check('school administrator creates meeting', () => setDoc(doc(schoolAdmin, 'activity_meetings/adminMeeting'), meeting));
  await check('platform administrator manages selected school', () => setDoc(doc(platformAdmin, 'activity_meetings/platformMeeting'), meeting));
  await check('unassigned teacher cannot create meeting', () => rejected(setDoc(doc(stranger, 'activity_meetings/denied'), meeting)));
  await check('another school cannot create meeting', () => rejected(setDoc(doc(otherAdmin, 'activity_meetings/denied2'), meeting)));
  await check('invalid time range is rejected', () => rejected(setDoc(doc(leader, 'activity_meetings/badTime'), { ...meeting, endTime: '14:00' })));
  const mark = (studentId = 'student0') => ({ schoolId: 'a', specialLessonId: 'chess', meetingId: 'm1', studentId, attendanceDate: '2026-10-21', status: 'present', recordedBy: 'leader' });
  await check('attendance must lock meeting timing atomically', () => rejected(setDoc(doc(leader, 'specialLessonAttendance/missingLock'), mark())));
  await check('ten-member attendance batch stays within rule read limits', async () => {
    const batch = writeBatch(leader); batch.update(doc(leader, 'activity_meetings/m1'), { attendanceRecorded: true });
    for (let i = 0; i < 10; i++) batch.set(doc(leader, `specialLessonAttendance/mark${i}`), mark(`student${i}`));
    await batch.commit();
  });
  await check('timing is immutable after attendance', () => rejected(updateDoc(doc(leader, 'activity_meetings/m1'), { startTime: '15:30' })));
  await check('leader can still edit meeting outcomes', () => updateDoc(doc(leader, 'activity_meetings/m1'), { notes: 'Completed opening tactics' }));
  await check('unassigned teacher cannot mark another activity', () => rejected(setDoc(doc(stranger, 'specialLessonAttendance/strangerMark'), { ...mark(), recordedBy: 'stranger' })));
  await check('non-member cannot be marked', () => rejected(setDoc(doc(leader, 'specialLessonAttendance/nonMember'), mark('notEnrolled'))));
  await check('meeting link cannot be removed from existing attendance', () => rejected(setDoc(doc(leader, 'specialLessonAttendance/mark0'), { schoolId: 'a', specialLessonId: 'chess', studentId: 'student0', attendanceDate: '2026-10-21', status: 'absent', recordedBy: 'leader' })));
  await check('meeting can be cancelled without deleting history', () => updateDoc(doc(leader, 'activity_meetings/m1'), { status: 'cancelled' }));
  await check('cancelled meeting refuses further attendance writes', () => rejected(updateDoc(doc(leader, 'specialLessonAttendance/mark0'), { status: 'absent' })));
  await check('legacy attendance remains writable without meeting migration', () => setDoc(doc(leader, 'specialLessonAttendance/legacy'), { schoolId: 'a', specialLessonId: 'chess', studentId: 'student0', attendanceDate: '2026-10-20', status: 'present', recordedBy: 'leader' }));
  console.log(`${checks} activity rules checks passed.`);
} finally {
  await Promise.all(clients.map(async ({ db, app }) => { await terminate(db); await deleteApp(app); }));
  await deleteAdmin(admin);
}
