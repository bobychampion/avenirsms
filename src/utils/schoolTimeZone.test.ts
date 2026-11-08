import { expect, it } from 'vitest';
import { schoolCalendarDate, supportedSchoolTimeZone } from './schoolTimeZone';

it('accepts valid identifiers and normalises the reported legacy display label', () => {
  expect(supportedSchoolTimeZone(' Europe/Ljubljana ')).toBe('Europe/Ljubljana');
  expect(supportedSchoolTimeZone('Central European Summer Time')).toBe('Europe/Ljubljana');
  expect(supportedSchoolTimeZone('Central European Standard Time')).toBe('Europe/Ljubljana');
  expect(supportedSchoolTimeZone('Not a timezone')).toBeNull();
});
it('uses Central European daylight saving rules rather than a fixed summer offset', () => {
  expect(schoolCalendarDate('Central European Summer Time', new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  expect(schoolCalendarDate('Central European Summer Time', new Date('2026-11-08T22:30:00Z'))).toBe('2026-11-08');
});
it('never crashes for blank or invalid settings and keeps the school date across UTC midnight', () => {
  const now = new Date('2026-11-08T23:30:00Z');
  expect(schoolCalendarDate('Europe/Ljubljana', now)).toBe('2026-11-09');
  expect(schoolCalendarDate('invalid', now)).toBe('2026-11-08');
  expect(schoolCalendarDate('', now)).toBe('2026-11-08');
  expect(schoolCalendarDate(undefined, now)).toBe('2026-11-08');
});
