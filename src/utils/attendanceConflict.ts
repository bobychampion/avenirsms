import type { AttendanceConflict } from '../services/firestoreService';

type DailyStatus = 'present' | 'absent' | 'late';

/**
 * Reconciles a day's official daily-attendance status against that day's per-subject
 * records, for schools running `daily_and_subject` / `subject_only` mode.
 *
 * Only subject records a teacher *explicitly* confirmed (`inheritedFromDaily: false`)
 * count as evidence — a record still carrying the inherited default is just a stale copy
 * of whatever the daily record said at the moment the subject register was opened, so it
 * would be circular to use it to override that same daily record. When every explicitly
 * confirmed subject record for the day says "present", that's real, independent proof the
 * student attended, so it wins over a conflicting (or missing) daily mark — this is the
 * "marked absent for the day but present in every lesson" case reported against the
 * Parent Portal, where subject teachers had corrected the record but the daily view hadn't.
 * Any other disagreement (mixed, or all-absent) is left as the daily record — genuinely
 * ambiguous cases (e.g. left after period 1) stay with the official daily mark rather than
 * guessing.
 */
export function effectiveDailyStatus(
  dailyStatus: DailyStatus | undefined,
  subjectRecords: { status: DailyStatus; inheritedFromDaily: boolean }[] | undefined,
): DailyStatus | undefined {
  const confirmed = subjectRecords?.filter(r => !r.inheritedFromDaily) ?? [];
  if (confirmed.length > 0 && confirmed.every(r => r.status === 'present')) return 'present';
  return dailyStatus;
}

/**
 * Same reconciliation as `effectiveDailyStatus`, applied across every student in a class/
 * school rather than one child — shared by every screen that aggregates attendance (Parent
 * Portal, admin reports, dashboards, student profiles) so they never disagree with each
 * other the same way the raw daily/subject records can disagree with themselves.
 * Returns studentId -> date -> effective status.
 */
export function buildEffectiveAttendanceByStudent(
  daily: { studentId: string; date: string; status: DailyStatus }[],
  subject: { studentId: string; attendanceDate: string; status: DailyStatus; inheritedFromDaily: boolean }[],
): Record<string, Record<string, DailyStatus>> {
  const byStudent: Record<string, Record<string, DailyStatus>> = {};
  daily.forEach(a => {
    (byStudent[a.studentId] ??= {})[a.date] = a.status;
  });

  const subjectByStudentDate: Record<string, Record<string, { status: DailyStatus; inheritedFromDaily: boolean }[]>> = {};
  subject.forEach(sa => {
    const byDate = (subjectByStudentDate[sa.studentId] ??= {});
    (byDate[sa.attendanceDate] ??= []).push({ status: sa.status, inheritedFromDaily: sa.inheritedFromDaily });
  });

  Object.entries(subjectByStudentDate).forEach(([studentId, byDate]) => {
    const dates = (byStudent[studentId] ??= {});
    Object.entries(byDate).forEach(([date, records]) => {
      const effective = effectiveDailyStatus(dates[date], records);
      if (effective) dates[date] = effective;
    });
  });

  return byStudent;
}

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
