import { expect, it, vi } from 'vitest';
import { schoolHolidayLookup } from '../../functions/src/utils/schoolCalendarDates';

it('skips holiday reminders per school and reuses one calendar read within a job', async () => {
  const get = vi.fn(async function(this: any) { return { docs: this.school === 'a' ? [{ data: () => ({ date: '2026-10-26', endDate: '2026-10-30', type: 'holiday' }) }] : [] }; });
  const queries: any[] = [];
  const db = { collection: vi.fn((name: string) => {
    expect(name).toBe('events');
    const q = { school: '', where(field: string, op: string, value: string) { expect(op).toBe('=='); if (field === 'schoolId') this.school = value; return this; }, get };
    queries.push(q); return q;
  }) };
  const holiday = schoolHolidayLookup(db as any);
  expect(await holiday('a', ['2026-10-28'])).toBe(true);
  expect(await holiday('a', ['2026-11-02'])).toBe(false);
  expect(await holiday('b', ['2026-10-28'])).toBe(false);
  expect(await holiday('a', ['2026-10-23', '2026-10-26'])).toBe(true);
  expect(get).toHaveBeenCalledTimes(2);
  expect(queries.map(q => q.school)).toEqual(['a', 'b']);
});

it('fails the alert check when the calendar is unavailable instead of treating it as a school day', async () => {
  const q = { where: () => q, get: vi.fn().mockRejectedValue(new Error('Calendar unavailable')) };
  const holiday = schoolHolidayLookup({ collection: () => q } as any);
  await expect(holiday('a', ['2026-10-28'])).rejects.toThrow('Calendar unavailable');
});
