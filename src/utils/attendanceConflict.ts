import type { AttendanceConflict } from '../services/firestoreService';

/**
 * Human-readable prompt for the `window.confirm` shown when `batchUpsertAttendance`
 * reports that another teacher changed some of these students since the register was
 * opened. `nameOf` resolves a studentId to a display name.
 */
export function describeAttendanceConflicts(
  conflicts: AttendanceConflict[],
  nameOf: (studentId: string) => string,
): string {
  const lines = conflicts
    .map(c => `• ${nameOf(c.studentId)}: someone else marked "${c.theirStatus}" — your save would set "${c.yourStatus}"`)
    .join('\n');
  return (
    `${conflicts.length} student(s) were updated by another teacher since you opened this register:\n\n` +
    `${lines}\n\n` +
    `Overwrite with your values? (Cancel keeps their marks — reopen the class to see them.)`
  );
}
