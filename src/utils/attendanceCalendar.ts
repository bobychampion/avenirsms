/** Parse calendar components explicitly: UTC parsing must not shift a day in another timezone. */
export function attendanceWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getDay();
}

export function isAttendanceWeekend(date: string): boolean {
  return [0, 6].includes(attendanceWeekday(date));
}

export function attendanceDayTitle(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
