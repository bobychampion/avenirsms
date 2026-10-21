import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveActivityMeeting, saveMeetingAttendance } from './activityMeetingService';
import type { ActivityMeeting, SpecialLesson, Student } from '../types';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined), setDoc: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../utils/impersonationGuard', () => ({ assertNotImpersonating: () => {} }));
vi.mock('firebase/firestore', () => ({ collection: (_db: unknown, name: string) => ({ name }), doc: (_db: unknown, name: string, id: string) => ({ name, id }), getDoc: mocks.get, setDoc: mocks.setDoc, serverTimestamp: () => 'timestamp', writeBatch: () => ({ set: mocks.set, update: mocks.update, commit: mocks.commit }) }));
const activity = { id: 'chess', schoolId: 's', status: 'active', teacherIds: ['leader'], enrolledStudentIds: Array.from({ length: 21 }, (_, i) => `student${i}`) } as SpecialLesson;
const meeting = { id: 'm1', schoolId: 's', specialLessonId: 'chess', title: 'Tactics', date: '2026-10-21', startTime: '15:00', endTime: '16:00', location: '', notes: '', leaderIds: ['leader'], status: 'scheduled', items: [] } as ActivityMeeting;
const students = activity.enrolledStudentIds.map(id => ({ id, schoolId: 's', studentName: id, currentClass: 'Year 12' } as Student));
const marks = Object.fromEntries(students.map(s => [s.id!, 'present' as const]));
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockImplementation(async (ref: any) => ({ exists: () => true, id: ref.id, data: () => ref.name === 'special_lessons' ? activity : meeting })); });
describe('activity meeting services', () => {
  it('saves attendance in small rule-safe batches and locks the meeting timing', async () => {
    await saveMeetingAttendance(activity, meeting, students, marks, 'leader', '2026-10-21');
    expect(mocks.commit).toHaveBeenCalledTimes(3);
    expect(mocks.set).toHaveBeenCalledTimes(21);
    expect(mocks.update).toHaveBeenCalledWith({ name: 'activity_meetings', id: 'm1' }, expect.objectContaining({ attendanceRecorded: true }));
    expect(mocks.set.mock.calls[0][1]).toMatchObject({ meetingId: 'm1', attendanceDate: '2026-10-21', studentClass: 'Year 12' });
    expect(mocks.set.mock.calls.every(c => c[0].name === 'specialLessonAttendance')).toBe(true);
  });
  it('blocks a meeting cancelled by another user after the register was loaded', async () => {
    mocks.get.mockImplementation(async (ref: any) => ({ exists: () => true, id: ref.id, data: () => ref.name === 'special_lessons' ? activity : { ...meeting, status: 'cancelled' } }));
    await expect(saveMeetingAttendance(activity, meeting, students, marks, 'leader', '2026-10-21')).rejects.toThrow('cancelled');
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('blocks stale enrolment and incomplete registers', async () => {
    await expect(saveMeetingAttendance(activity, meeting, students, {}, 'leader', '2026-10-21')).rejects.toThrow('Mark every');
    mocks.get.mockImplementation(async (ref: any) => ({ exists: () => true, id: ref.id, data: () => ref.name === 'special_lessons' ? { ...activity, enrolledStudentIds: [] } : meeting }));
    await expect(saveMeetingAttendance(activity, meeting, students, marks, 'leader', '2026-10-21')).rejects.toThrow('Enrolment changed');
  });
  it('prevents moving a meeting after attendance while allowing plan edits', async () => {
    mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ ...meeting, attendanceRecorded: true }) });
    await expect(saveActivityMeeting(activity, { ...meeting, date: '2026-10-22' })).rejects.toThrow('timing is locked');
    await saveActivityMeeting(activity, { ...meeting, notes: 'Completed opening tactics' });
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ notes: 'Completed opening tactics' }), { merge: true });
  });
});
