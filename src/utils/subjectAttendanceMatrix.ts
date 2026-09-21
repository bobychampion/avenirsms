type Status = 'present' | 'absent' | 'late';

export interface SubjectAttendanceRow {
  studentId: string;
  subjectName: string;
  attendanceDate: string;
  status: Status;
  timetablePeriodId?: string;
  /** Firestore Timestamp (or anything with toMillis) — used only to pick the newest duplicate. */
  recordedAt?: { toMillis?: () => number } | null;
}

export interface StatusCounts { present: number; absent: number; late: number }

export interface SubjectMatrix {
  /** Subjects that have at least one lesson in scope, alphabetical. */
  subjects: string[];
  /** studentId -> subjectName -> lesson counts. */
  cells: Record<string, Record<string, StatusCounts>>;
  totalsBySubject: Record<string, StatusCounts>;
  totalsByStudent: Record<string, StatusCounts>;
  lessonCount: number;
}

/**
 * Collapses raw `subjectAttendance` rows to one row per actual lesson.
 *
 * One student can carry several rows for the same subject and day: a genuine double period, or
 * the same lesson saved once before and once after its timetable period was known (the upsert
 * only matches on period when it is given, so the second save creates a second row). Rows are
 * therefore collapsed to one per (student, subject, date, period), keeping the most recently
 * recorded, and a period-less row is dropped when a period-tagged row exists for that day.
 * Without this, a lesson is counted twice and the totals overstate how many lessons took place.
 */
export function dedupeSubjectLessons<T extends SubjectAttendanceRow>(rows: T[]): T[] {
  const recordedMs = (r: SubjectAttendanceRow) => r.recordedAt?.toMillis?.() ?? 0;

  const groups = new Map<string, T[]>();
  rows.forEach(r => {
    const key = `${r.studentId}|${r.subjectName}|${r.attendanceDate}`;
    const list = groups.get(key);
    if (list) list.push(r); else groups.set(key, [r]);
  });

  const lessons: T[] = [];
  groups.forEach(group => {
    const tagged = group.filter(r => r.timetablePeriodId);
    const latestByPeriod = new Map<string, T>();
    (tagged.length > 0 ? tagged : group).forEach(r => {
      const periodKey = r.timetablePeriodId ?? '';
      const current = latestByPeriod.get(periodKey);
      if (!current || recordedMs(r) >= recordedMs(current)) latestByPeriod.set(periodKey, r);
    });
    latestByPeriod.forEach(r => lessons.push(r));
  });
  return lessons;
}

/**
 * Builds the student × subject attendance grid from raw `subjectAttendance` rows, counting
 * lessons after `dedupeSubjectLessons`. `date` limits the grid to a single day; omit it to
 * include every recorded date.
 */
export function buildSubjectMatrix(rows: SubjectAttendanceRow[], date?: string): SubjectMatrix {
  const lessons = dedupeSubjectLessons(date ? rows.filter(r => r.attendanceDate === date) : rows);

  const cells: SubjectMatrix['cells'] = {};
  const totalsBySubject: SubjectMatrix['totalsBySubject'] = {};
  const totalsByStudent: SubjectMatrix['totalsByStudent'] = {};
  const empty = (): StatusCounts => ({ present: 0, absent: 0, late: 0 });
  lessons.forEach(r => {
    ((cells[r.studentId] ??= {})[r.subjectName] ??= empty())[r.status]++;
    (totalsBySubject[r.subjectName] ??= empty())[r.status]++;
    (totalsByStudent[r.studentId] ??= empty())[r.status]++;
  });

  return {
    subjects: Object.keys(totalsBySubject).sort((a, b) => a.localeCompare(b)),
    cells,
    totalsBySubject,
    totalsByStudent,
    lessonCount: lessons.length,
  };
}
