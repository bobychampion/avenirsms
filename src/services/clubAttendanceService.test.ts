import { describe, expect, it, vi, beforeEach } from 'vitest';
import { saveClubAttendance } from './clubAttendanceService';
import type { SpecialLesson, Student } from '../types';
const mocks = vi.hoisted(() => ({ set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined), guard: vi.fn(), getDocs: vi.fn().mockResolvedValue({ docs: [] }) }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../utils/impersonationGuard', () => ({ assertNotImpersonating: mocks.guard }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  serverTimestamp: () => 'server-time', writeBatch: () => ({ set: mocks.set, commit: mocks.commit }),
  collection: () => ({}), query: () => ({}), where: () => ({}), getDocs: mocks.getDocs,
}));
const club = { id: 'chess', schoolId: 'school', activityType: 'club', status: 'active', enrolledStudentIds: ['a', 'b'] } as SpecialLesson;
const students = [{ id: 'a', schoolId: 'school', studentName: 'Anna', currentClass: 'Year 11' }, { id: 'b', schoolId: 'school', studentName: 'Ben', currentClass: 'Year 12' }] as Student[];
beforeEach(() => { vi.clearAllMocks(); });
describe('club attendance persistence', () => {
  it('writes only club attendance and updates the same IDs when re-saving', async () => {
    await saveClubAttendance(club, students, '2026-10-20', { a: 'present', b: 'absent' }, 'teacher', '2026-10-21');
    const ids = mocks.set.mock.calls.map(c => c[0].id);
    expect(mocks.set.mock.calls.every(c => c[0].collection === 'specialLessonAttendance')).toBe(true);
    expect(mocks.set.mock.calls[1][1]).toMatchObject({ studentClass: 'Year 12', status: 'absent', recordedBy: 'teacher', schoolId: 'school' });
    await saveClubAttendance(club, students, '2026-10-20', { a: 'late', b: 'present' }, 'teacher', '2026-10-21');
    expect(mocks.set.mock.calls.slice(2).map(c => c[0].id)).toEqual(ids);
    expect(mocks.commit).toHaveBeenCalledTimes(2);
  });
  it('does not save an incomplete register or a student from another school', async () => {
    await expect(saveClubAttendance(club, students, '2026-10-20', { a: 'present' }, 'teacher', '2026-10-21')).rejects.toThrow();
    await expect(saveClubAttendance(club, [{ ...students[0], schoolId: 'other' }], '2026-10-20', { a: 'present' }, 'teacher', '2026-10-21')).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('updates existing activity attendance after conversion instead of duplicating it', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [{ id: 'legacy-row', data: () => ({ studentId: 'a' }) }] });
    await saveClubAttendance(club, students, '2026-10-20', { a: 'present', b: 'absent' }, 'teacher', '2026-10-21');
    expect(mocks.set.mock.calls[0][0].id).toBe('legacy-row');
  });
  it('preserves read-only impersonation and refuses inactive clubs', async () => {
    await expect(saveClubAttendance({ ...club, status: 'inactive' }, students, '2026-10-20', { a: 'present', b: 'present' }, 'teacher', '2026-10-21')).rejects.toThrow();
    mocks.guard.mockImplementationOnce(() => { throw new Error('Read only'); });
    await expect(saveClubAttendance(club, students, '2026-10-20', { a: 'present', b: 'present' }, 'teacher', '2026-10-21')).rejects.toThrow('Read only');
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
