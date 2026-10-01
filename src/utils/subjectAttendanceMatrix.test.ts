import { describe, it, expect } from 'vitest';
import { buildSubjectMatrix, dedupeSubjectLessons, SubjectAttendanceRow } from './subjectAttendanceMatrix';

const at = (ms: number) => ({ toMillis: () => ms });
const row = (over: Partial<SubjectAttendanceRow>): SubjectAttendanceRow => ({
  studentId: 's1', subjectName: 'Maths', attendanceDate: '2026-09-17', status: 'present', ...over,
});

describe('buildSubjectMatrix', () => {
  it('keeps school trips separate when counting actual subject lessons', () => {
    const m = buildSubjectMatrix([
      row({ status: 'school_trip', timetablePeriodId: 'p1' }),
      row({ status: 'present', timetablePeriodId: 'p2' }),
      row({ status: 'absent', studentId: 's2', timetablePeriodId: 'p1' }),
    ]);
    expect(m.cells.s1.Maths).toEqual({ present: 1, absent: 0, late: 0, school_trip: 1 });
    expect(m.totalsByStudent.s1.school_trip).toBe(1);
    expect(m.totalsBySubject.Maths.school_trip).toBe(1);
    expect(m.lessonCount).toBe(3);
  });

  it('scopes to one day when a date is given', () => {
    const m = buildSubjectMatrix([
      row({ attendanceDate: '2026-09-16' }),
      row({ attendanceDate: '2026-09-17', subjectName: 'English' }),
    ], '2026-09-17');
    expect(m.subjects).toEqual(['English']);
    expect(m.lessonCount).toBe(1);
  });

  it('aggregates every date when no date is given', () => {
    const m = buildSubjectMatrix([
      row({ attendanceDate: '2026-09-16' }),
      row({ attendanceDate: '2026-09-17', status: 'absent' }),
    ]);
    expect(m.cells.s1.Maths).toEqual({ present: 1, absent: 1, late: 0, school_trip: 0 });
    expect(m.totalsByStudent.s1).toEqual({ present: 1, absent: 1, late: 0, school_trip: 0 });
  });

  it('collapses a period-less duplicate of the same lesson, keeping the newest', () => {
    const m = buildSubjectMatrix([
      row({ status: 'present', recordedAt: at(1) }),
      row({ status: 'absent', recordedAt: at(2) }),
    ], '2026-09-17');
    expect(m.lessonCount).toBe(1);
    expect(m.cells.s1.Maths).toEqual({ present: 0, absent: 1, late: 0, school_trip: 0 });
  });

  it('drops a period-less row when a period-tagged row exists for the same day', () => {
    const m = buildSubjectMatrix([
      row({ status: 'present', recordedAt: at(1) }),
      row({ status: 'present', timetablePeriodId: 'p3', recordedAt: at(2) }),
    ], '2026-09-17');
    expect(m.lessonCount).toBe(1);
  });

  it('keeps a genuine double period as two lessons', () => {
    const m = buildSubjectMatrix([
      row({ timetablePeriodId: 'p1', status: 'present' }),
      row({ timetablePeriodId: 'p2', status: 'absent' }),
    ], '2026-09-17');
    expect(m.lessonCount).toBe(2);
    expect(m.cells.s1.Maths).toEqual({ present: 1, absent: 1, late: 0, school_trip: 0 });
  });

  it('does not merge different students or subjects', () => {
    const m = buildSubjectMatrix([
      row({ studentId: 's1' }),
      row({ studentId: 's2' }),
      row({ studentId: 's1', subjectName: 'English' }),
    ], '2026-09-17');
    expect(m.lessonCount).toBe(3);
    expect(m.subjects).toEqual(['English', 'Maths']);
    expect(m.totalsBySubject.Maths.present).toBe(2);
  });

  it('dedupeSubjectLessons returns the surviving rows themselves, one per lesson', () => {
    const older = row({ status: 'present', recordedAt: at(1) });
    const newer = row({ status: 'absent', recordedAt: at(2) });
    const other = row({ subjectName: 'English' });
    const lessons = dedupeSubjectLessons([older, newer, other]);
    expect(lessons).toHaveLength(2);
    expect(lessons).toContain(newer);
    expect(lessons).not.toContain(older);
  });

  it('returns an empty grid when nothing is in scope', () => {
    const m = buildSubjectMatrix([row({ attendanceDate: '2026-09-01' })], '2026-09-17');
    expect(m.lessonCount).toBe(0);
    expect(m.subjects).toEqual([]);
  });
});
