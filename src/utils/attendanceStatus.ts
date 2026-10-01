export type AttendanceStatus = 'present' | 'absent' | 'late' | 'school_trip';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'school_trip'];
export function attendanceStatusLabel(status: string): string {
  return status === 'school_trip' ? 'School trip' : status.charAt(0).toUpperCase() + status.slice(1);
}
/** School trips are supervised school activities and count as attended. */
export function countsAsAttended(status: string): boolean {
  return status === 'present' || status === 'school_trip';
}
