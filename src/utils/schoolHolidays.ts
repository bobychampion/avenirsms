import type { SchoolEvent } from '../types';
import { calendarEventCoversDate } from '../../functions/src/utils/schoolCalendarDates';

export function schoolHolidayOn(date: string, events: readonly SchoolEvent[]) {
  return events.find(event => event.type === 'holiday' && calendarEventCoversDate(date, event));
}

export function calendarEventOn(date: string, event: SchoolEvent) {
  return calendarEventCoversDate(date, event);
}

export function calendarDateError(start?: string, end?: string) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!start || !valid(start)) return 'Choose a valid start date.';
  if (end && (!valid(end) || end < start)) return 'End date must be on or after the start date.';
  return '';
}
