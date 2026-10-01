import { describe, it, expect } from 'vitest';
import { effectiveDailyStatus, buildEffectiveAttendanceByStudent } from './attendanceConflict';
import { attendanceStatusLabel, countsAsAttended } from './attendanceStatus';

describe('school trip attendance', () => {
  it('preserves the official trip status despite conflicting lesson marks', () => {
    expect(effectiveDailyStatus('school_trip', [{ status: 'present', inheritedFromDaily: false }])).toBe('school_trip');
    expect(effectiveDailyStatus('school_trip', [{ status: 'absent', inheritedFromDaily: false }])).toBe('school_trip');
  });
  it('derives a trip day from confirmed subject records when no daily mark exists', () => {
    expect(effectiveDailyStatus(undefined, [{ status: 'school_trip', inheritedFromDaily: false }])).toBe('school_trip');
    expect(effectiveDailyStatus(undefined, [{ status: 'school_trip', inheritedFromDaily: true }])).toBeUndefined();
  });
  it('keeps existing reconciliation behavior for other attendance statuses', () => {
    expect(effectiveDailyStatus('absent', [{ status: 'present', inheritedFromDaily: false }])).toBe('present');
    expect(effectiveDailyStatus('absent', [{ status: 'school_trip', inheritedFromDaily: false }])).toBe('absent');
  });
  it('scopes trip marks by student and date in report reconciliation', () => {
    expect(buildEffectiveAttendanceByStudent([
      { studentId: 's1', date: '2026-10-01', status: 'school_trip' },
      { studentId: 's1', date: '2026-10-02', status: 'absent' },
      { studentId: 's2', date: '2026-10-01', status: 'late' },
    ], [{ studentId: 's1', attendanceDate: '2026-10-01', status: 'present', inheritedFromDaily: false }])).toEqual({
      s1: { '2026-10-01': 'school_trip', '2026-10-02': 'absent' },
      s2: { '2026-10-01': 'late' },
    });
  });
  it('counts school trips as attended without counting absences or late arrivals', () => {
    expect(['present', 'school_trip', 'absent', 'late'].filter(countsAsAttended)).toEqual(['present', 'school_trip']);
    expect(attendanceStatusLabel('school_trip')).toBe('School trip');
  });
});
