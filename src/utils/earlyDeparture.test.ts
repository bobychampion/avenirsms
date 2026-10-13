import { expect, it } from 'vitest';
import { filterDepartures, type EarlyDeparture } from './earlyDeparture';
const records = [
  { studentId: 'lena', date: '2026-10-13', subjectName: 'History', timetablePeriodId: 'p1' },
  { studentId: 'lena', date: '2026-10-13', subjectName: 'History', timetablePeriodId: 'p2' },
  { studentId: 'lena', date: '2026-10-13', subjectName: 'Mathematics' },
  { studentId: 'matija', date: '2026-10-13', subjectName: 'History' },
  { studentId: 'lena', date: '2026-10-13' },
  { studentId: 'lena', date: '2026-10-12', subjectName: 'History' },
] as EarlyDeparture[];
it('filters subject departures by enrolled students and lesson, retaining daily departure evidence', () => {
  expect(filterDepartures(records, { date: '2026-10-13', subjectName: 'History', timetablePeriodId: 'p1', studentIds: ['lena'] })).toEqual([records[0], records[4]]);
});
it('keeps all subjects visible in the daily register and hides an empty subject roster', () => {
  expect(filterDepartures(records, { date: '2026-10-13' })).toHaveLength(5);
  expect(filterDepartures(records, { subjectName: 'History', studentIds: [] })).toEqual([]);
});
