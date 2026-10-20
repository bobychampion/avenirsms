import { describe, expect, it } from 'vitest';
import { clubAttendanceId, clubDateError, clubRoster, completeClubMarks } from './clubAttendance';
import type { SpecialLesson, Student } from '../types';
const club = { id: 'chess', schoolId: 'a', activityType: 'club', enrolledStudentIds: ['one', 'two', 'outsider', 'withdrawn'] } as SpecialLesson;
const students = [
  { id: 'one', schoolId: 'a', currentClass: 'Year 11', studentName: 'Anna' },
  { id: 'two', schoolId: 'a', currentClass: 'Year 12', studentName: 'Ben' },
  { id: 'outsider', schoolId: 'b', studentName: 'Chris' },
  { id: 'withdrawn', schoolId: 'a', admissionStatus: 'withdrawn', studentName: 'Dan' },
  { id: 'unenrolled', schoolId: 'a', studentName: 'Ed' },
] as Student[];
describe('club attendance', () => {
  it('combines enrolled students across classes, excluding other schools and withdrawn students', () => {
    expect(clubRoster(club, students).map(s => s.id)).toEqual(['one', 'two']);
    expect(students[1].currentClass).toBe('Year 12');
  });
  it('requires an explicit mark for each student, including missing keys', () => {
    const roster = clubRoster(club, students);
    expect(completeClubMarks(roster, {})).toBe(false);
    expect(completeClubMarks(roster, { one: 'present' })).toBe(false);
    expect(completeClubMarks(roster, { one: 'present', two: 'absent' })).toBe(true);
    expect(completeClubMarks([], {})).toBe(false);
  });
  it('gives repeated saves the same ID, without collisions across clubs, students or dates', () => {
    expect(clubAttendanceId('chess', '2026-10-20', 'one')).toBe(clubAttendanceId('chess', '2026-10-20', 'one'));
    const keys = [['chess', '2026-10-20', 'one'], ['drama', '2026-10-20', 'one'], ['chess', '2026-10-21', 'one'], ['chess', '2026-10-20', 'two']];
    expect(new Set(keys.map(([c, d, s]) => clubAttendanceId(c, d, s))).size).toBe(4);
  });
  it('blocks future dates, invalid dates and dates outside the club period', () => {
    const dated = { ...club, startDate: '2026-10-01', endDate: '2026-10-20' };
    expect(clubDateError(dated, '2026-10-15', '2026-10-21')).toBe('');
    for (const date of ['2026-09-30', '2026-10-22', '2026-02-30', '']) expect(clubDateError(dated, date, '2026-10-21')).not.toBe('');
  });
});
