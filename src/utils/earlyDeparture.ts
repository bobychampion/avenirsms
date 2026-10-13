export interface EarlyDeparture {
  id?: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  class: string;
  date: string;
  departureTime: string;
  reason: string;
  notes: string;
  lesson: string;
  recordedBy: string;
  subjectName?: string;
  timetablePeriodId?: string;
  recordedAt?: any;
}

export function departureDescription(record: EarlyDeparture): string {
  return `Left early at ${record.departureTime}: ${record.reason}${record.lesson ? ` (${record.lesson})` : ''}${record.notes ? ` — ${record.notes}` : ''}`;
}

export function validDeparture(record: Pick<EarlyDeparture, 'date' | 'departureTime' | 'reason'>): boolean {
  const parsed = new Date(`${record.date}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(record.date) && !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() === Number(record.date.slice(0, 4)) &&
    parsed.getMonth() + 1 === Number(record.date.slice(5, 7)) &&
    parsed.getDate() === Number(record.date.slice(8, 10)) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(record.departureTime) && record.reason.trim().length > 0;
}

/** Subject views show their enrolled students and the selected lesson or a daily departure. */
export function filterDepartures(records: EarlyDeparture[], context: { date?: string; month?: string; subjectName?: string; timetablePeriodId?: string; studentIds?: string[] }) {
  const ids = context.studentIds ? new Set(context.studentIds) : undefined;
  return records.filter(r => (!context.date || r.date === context.date) &&
    (!context.month || r.date.startsWith(context.month)) &&
    (!ids || ids.has(r.studentId)) &&
    (!context.subjectName || !r.subjectName || r.subjectName === context.subjectName) &&
    (!context.timetablePeriodId || !r.timetablePeriodId || r.timetablePeriodId === context.timetablePeriodId));
}
