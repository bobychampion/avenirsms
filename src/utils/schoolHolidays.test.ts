import { describe, expect, it } from 'vitest';
import type { SchoolEvent } from '../types';
import { calendarDateError, calendarEventOn, schoolHolidayOn } from './schoolHolidays';
import { buildEffectiveAttendanceByStudent } from './attendanceConflict';

const autumn: SchoolEvent = { title: 'Autumn holiday', description: '', date: '2026-10-26', endDate: '2026-10-30', type: 'holiday', schoolId: 'school' };
describe('school calendar holidays', () => {
  it('covers both ends of a holiday range, including a month/year boundary', () => {
    expect(schoolHolidayOn('2026-10-25', [autumn])).toBeUndefined();
    for (const day of ['2026-10-26', '2026-10-28', '2026-10-30']) expect(schoolHolidayOn(day, [autumn])).toBe(autumn);
    expect(schoolHolidayOn('2026-10-31', [autumn])).toBeUndefined();
    expect(schoolHolidayOn('2027-01-01', [{ ...autumn, date: '2026-12-20', endDate: '2027-01-05' }])).toBeDefined();
  });
  it('uses existing single-day holidays without inferring a week from their title', () => {
    const one = { ...autumn, endDate: undefined };
    expect(schoolHolidayOn('2026-10-26', [one])).toBe(one);
    expect(schoolHolidayOn('2026-10-27', [one])).toBeUndefined();
  });
  it('only closes attendance for holiday events', () => {
    const sports: SchoolEvent = { ...autumn, type: 'sports' };
    expect(calendarEventOn('2026-10-28', sports)).toBe(true);
    expect(schoolHolidayOn('2026-10-28', [sports])).toBeUndefined();
    expect(schoolHolidayOn('2026-10-28', [])).toBeUndefined();
  });
  it('rejects invalid and reversed calendar ranges', () => {
    expect(calendarDateError('2026-02-30')).not.toBe('');
    expect(calendarDateError('2026-10-26', '2026-10-25')).not.toBe('');
    expect(calendarDateError('2026-10-26', '2026-10-26')).toBe('');
    expect(calendarDateError('2026-10-26', '')).toBe('');
  });
  it('excludes historical daily and subject holiday marks without altering records', () => {
    const daily = [{ studentId: 'one', date: '2026-10-26', status: 'absent' as const }, { studentId: 'one', date: '2026-11-02', status: 'present' as const }];
    const subjects = [{ studentId: 'two', attendanceDate: '2026-10-27', status: 'present' as const, inheritedFromDaily: false }];
    const result = buildEffectiveAttendanceByStudent(daily, subjects, [autumn]);
    expect(result).toEqual({ one: { '2026-11-02': 'present' } });
    expect(daily).toHaveLength(2);
    expect(buildEffectiveAttendanceByStudent(daily, subjects, []).one['2026-10-26']).toBe('absent');
  });
});
