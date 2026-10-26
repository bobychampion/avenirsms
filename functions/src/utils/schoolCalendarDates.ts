/** Date-only, inclusive ranges. Shared by attendance screens and scheduled alerts. */
export interface CalendarEventDates { date: string; endDate?: string; type: string }
export function calendarEventCoversDate(date: string, event: CalendarEventDates) {
  return event.date <= date && date <= (event.endDate && event.endDate >= event.date ? event.endDate : event.date);
}

/** Cache within one job invocation, never across requests or schools. */
export function schoolHolidayLookup(db: import('firebase-admin/firestore').Firestore) {
  const schools = new Map<string, Promise<CalendarEventDates[]>>();
  return async (schoolId: string, dates: readonly string[]) => {
    if (!schoolId) return false;
    if (!schools.has(schoolId)) schools.set(schoolId, db.collection('events').where('schoolId', '==', schoolId).where('type', '==', 'holiday').get()
      .then(snap => snap.docs.map(d => d.data() as CalendarEventDates)));
    const holidays = await schools.get(schoolId)!;
    return dates.some(date => holidays.some(event => calendarEventCoversDate(date, event)));
  };
}
