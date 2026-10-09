import { describe, expect, it } from 'vitest';
import { attendanceWeekday, isAttendanceWeekend } from './attendanceCalendar';
import { departureDescription, validDeparture } from './earlyDeparture';

describe('attendance weekends', () => {
  it('highlights all September 2026 weekends shown in the request', () => {
    const weekends = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`).filter(isAttendanceWeekend);
    expect(weekends.map(d => Number(d.slice(-2)))).toEqual([5, 6, 12, 13, 19, 20, 26, 27]);
  });
  it('handles leap days, month boundaries, and UK clock changes', () => {
    expect(attendanceWeekday('2028-02-29')).toBe(2);
    expect(isAttendanceWeekend('2026-10-31')).toBe(true);
    expect(isAttendanceWeekend('2026-11-01')).toBe(true);
    expect(isAttendanceWeekend('2026-03-29')).toBe(true);
    expect(isAttendanceWeekend('2026-10-26')).toBe(false);
  });
});

describe('early departures', () => {
  it('requires a real date, valid local departure time, and reason', () => {
    const valid = { date: '2026-10-09', departureTime: '14:30', reason: 'Appointment' };
    expect(validDeparture(valid)).toBe(true);
    expect(validDeparture({ ...valid, departureTime: '24:00' })).toBe(false);
    expect(validDeparture({ ...valid, departureTime: '14:60' })).toBe(false);
    expect(validDeparture({ ...valid, date: '2026-02-30' })).toBe(false);
    expect(validDeparture({ ...valid, reason: ' ' })).toBe(false);
  });
  it('includes lesson and explanation in the monthly cell details', () => {
    const record = { schoolId: 'school', studentId: 'student', studentName: 'Ada', class: 'Year 12', date: '2026-10-09',
      departureTime: '14:30', reason: 'Public transport', notes: 'Last bus at 15:00', lesson: 'Mathematics', recordedBy: 'teacher' };
    expect(departureDescription(record)).toBe('Left early at 14:30: Public transport (Mathematics) — Last bus at 15:00');
    expect(record).not.toHaveProperty('status');
  });
});
