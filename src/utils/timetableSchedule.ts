import type { ClassSubject, Timetable, TimetablePeriod, TimetablePeriodSlot } from '../types';
import { lessonSlots, sortedPeriodSlots } from './timetablePeriods';

/** Find the scheduled lesson for a template slot (supports legacy data without slotId). */
export function findPeriodForSlot(
  dayPeriods: TimetablePeriod[],
  slot: TimetablePeriodSlot,
  allSlots: TimetablePeriodSlot[]
): TimetablePeriod | undefined {
  const byId = dayPeriods.find(p => p.slotId === slot.id);
  if (byId) return byId;

  const byTime = dayPeriods.find(
    p => !p.slotId && p.startTime === slot.startTime && p.endTime === slot.endTime
  );
  if (byTime) return byTime;

  const lessonIndex = lessonSlots(allSlots).findIndex(s => s.id === slot.id);
  if (lessonIndex < 0) return undefined;

  const legacyWithoutSlotId = dayPeriods.filter(p => !p.slotId);
  return legacyWithoutSlotId[lessonIndex];
}

/** Upsert a lesson into a day's schedule, keyed by slotId. */
export function upsertPeriodForSlot(
  dayPeriods: TimetablePeriod[],
  slot: TimetablePeriodSlot,
  data: { subject: string; teacher?: string } | null,
  allSlots: TimetablePeriodSlot[]
): TimetablePeriod[] {
  const lessonIndex = lessonSlots(allSlots).findIndex(s => s.id === slot.id);

  const without = dayPeriods.filter((p, idx) => {
    if (p.slotId === slot.id) return false;
    if (!p.slotId && p.startTime === slot.startTime && p.endTime === slot.endTime) return false;
    if (!p.slotId && lessonIndex >= 0) {
      const legacyIndex = dayPeriods.filter(x => !x.slotId).indexOf(p);
      if (legacyIndex === lessonIndex) return false;
    }
    return true;
  });

  if (!data || !data.subject.trim()) {
    return without;
  }

  const period: TimetablePeriod = {
    slotId: slot.id,
    subject: data.subject.trim(),
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
  // Firestore rejects `undefined` field values — only set `teacher` when one is assigned.
  if (data.teacher && data.teacher.trim()) {
    period.teacher = data.teacher.trim();
  }

  return [...without, period];
}

/**
 * All periods scheduled for a given day+slot — 0, 1 (the normal case), or N (an elective/
 * option block, where each entry carries its own classSubjectId). Same matching logic as
 * findPeriodForSlot, but returns every match instead of just the first.
 */
export function findPeriodsForSlot(
  dayPeriods: TimetablePeriod[],
  slot: TimetablePeriodSlot,
  allSlots: TimetablePeriodSlot[]
): TimetablePeriod[] {
  const byId = dayPeriods.filter(p => p.slotId === slot.id);
  if (byId.length > 0) return byId;

  const byTime = dayPeriods.filter(
    p => !p.slotId && p.startTime === slot.startTime && p.endTime === slot.endTime
  );
  if (byTime.length > 0) return byTime;

  const lessonIndex = lessonSlots(allSlots).findIndex(s => s.id === slot.id);
  if (lessonIndex < 0) return [];

  const legacyWithoutSlotId = dayPeriods.filter(p => !p.slotId);
  const legacyMatch = legacyWithoutSlotId[lessonIndex];
  return legacyMatch ? [legacyMatch] : [];
}

/**
 * Replaces the full set of options at (day, slot) with `options` — the elective-block
 * counterpart to upsertPeriodForSlot. Each option must carry a classSubjectId; pass a
 * single-element array for what is effectively a plain period, though callers should
 * prefer upsertPeriodForSlot for that case.
 */
export function upsertPeriodOptionsForSlot(
  dayPeriods: TimetablePeriod[],
  slot: TimetablePeriodSlot,
  options: { classSubjectId: string; subject: string; teacher?: string }[],
  allSlots: TimetablePeriodSlot[]
): TimetablePeriod[] {
  const cleared = upsertPeriodForSlot(dayPeriods, slot, null, allSlots);
  const newPeriods: TimetablePeriod[] = options.map(o => {
    const period: TimetablePeriod = {
      slotId: slot.id,
      subject: o.subject,
      startTime: slot.startTime,
      endTime: slot.endTime,
      classSubjectId: o.classSubjectId,
    };
    if (o.teacher && o.teacher.trim()) period.teacher = o.teacher.trim();
    return period;
  });
  return [...cleared, ...newPeriods];
}

/**
 * Resolves which single option (if any) applies to a specific student — the one place
 * "which option is this student's" is decided, reused by every personal/parent timetable
 * view. Plain (non-elective) slots always resolve 'unique' without touching rosters.
 */
export function resolvePeriodForStudent(
  periods: TimetablePeriod[],
  studentId: string,
  classSubjectsById: Record<string, ClassSubject>
): { status: 'none' } | { status: 'unique'; period: TimetablePeriod } | { status: 'ambiguous'; periods: TimetablePeriod[] } {
  if (periods.length === 0) return { status: 'none' };
  if (periods.length === 1 && !periods[0].classSubjectId) {
    return { status: 'unique', period: periods[0] };
  }

  const matches = periods.filter(p => {
    if (!p.classSubjectId) return true; // no roster restriction — covers everyone
    const cs = classSubjectsById[p.classSubjectId];
    const roster = cs?.enrolledStudentIds;
    return !roster || roster.length === 0 || roster.includes(studentId);
  });

  if (matches.length === 0) return { status: 'none' };
  if (matches.length === 1) return { status: 'unique', period: matches[0] };
  return { status: 'ambiguous', periods: matches };
}

/** Detect teacher double-booking within a single class timetable. */
export function detectTimetableConflicts(
  schedule: Timetable['schedule'],
  days: readonly string[]
): string[] {
  const teacherSlots: Record<string, string[]> = {};
  const issues: string[] = [];

  days.forEach(day => {
    (schedule[day as keyof typeof schedule] || []).forEach(period => {
      if (!period.teacher) return;
      const key = `${period.teacher}|${day}|${period.startTime}`;
      if (!teacherSlots[key]) teacherSlots[key] = [];
      teacherSlots[key].push(period.subject);
      if (teacherSlots[key].length > 1) {
        issues.push(`${period.teacher} has a conflict on ${day} at ${period.startTime}`);
      }
    });
  });

  return [...new Set(issues)];
}

export function slotColumnHeaders(slots: TimetablePeriodSlot[]): TimetablePeriodSlot[] {
  return sortedPeriodSlots(slots);
}

// ─── Copy / paste / templates / duplicate-to-class ─────────────────────────

/** Re-keys a copied period onto a (possibly different) slot — times always follow the target slot. */
export function copyPeriodToSlot(period: TimetablePeriod, targetSlot: TimetablePeriodSlot): TimetablePeriod {
  return { ...period, slotId: targetSlot.id, startTime: targetSlot.startTime, endTime: targetSlot.endTime };
}

/** Pastes a single copied period into a day's period list at targetSlot, replacing whatever was there. */
export function pastePeriodIntoDay(
  dayPeriods: TimetablePeriod[],
  targetSlot: TimetablePeriodSlot,
  copiedPeriod: TimetablePeriod,
  allSlots: TimetablePeriodSlot[]
): TimetablePeriod[] {
  if (targetSlot.type === 'break') return dayPeriods; // defense in depth — UI already disables this
  return upsertPeriodForSlot(dayPeriods, targetSlot, { subject: copiedPeriod.subject, teacher: copiedPeriod.teacher }, allSlots);
}

/**
 * Copies an entire day's period list, re-keyed onto a target day's own column set — each source
 * lesson slot's period is remapped by lesson-index onto the target's lesson slot at that same
 * index (the same convention findPeriodForSlot/upsertPeriodForSlot already use for legacy data).
 * sourceColumns/targetColumns are the same array in every call site today (one school-wide bell
 * schedule) — kept as two params for clarity, not because they differ in practice.
 */
export function copyDayPeriods(
  sourceDayPeriods: TimetablePeriod[],
  sourceColumns: TimetablePeriodSlot[],
  targetColumns: TimetablePeriodSlot[]
): TimetablePeriod[] {
  const sourceLessons = lessonSlots(sourceColumns);
  const targetLessons = lessonSlots(targetColumns);
  const result: TimetablePeriod[] = [];
  sourceLessons.forEach((slot, i) => {
    const period = findPeriodForSlot(sourceDayPeriods, slot, sourceColumns);
    const targetSlot = targetLessons[i];
    if (period && targetSlot) result.push(copyPeriodToSlot(period, targetSlot));
  });
  return result;
}

/** Replaces a target day's period list wholesale with a copied day's periods (paste-day). */
export function pasteDayIntoSchedule(
  schedule: Timetable['schedule'],
  targetDay: keyof Timetable['schedule'],
  copiedDayPeriods: TimetablePeriod[]
): Timetable['schedule'] {
  return { ...schedule, [targetDay]: copiedDayPeriods };
}

/** Seeds a schedule from a template's schedule, restricted to the target school's actual days. */
export function applyTemplateToSchedule(
  templateSchedule: Timetable['schedule'],
  days: readonly string[]
): Timetable['schedule'] {
  const result = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] } as Timetable['schedule'];
  days.forEach(day => {
    const key = day as keyof Timetable['schedule'];
    result[key] = (templateSchedule[key] || []).map(p => ({ ...p }));
  });
  return result;
}

/**
 * Does `schedule` (a candidate — e.g. about to be pasted onto targetClass) double-book any teacher
 * against another class's ALREADY-SAVED timetable for the same term+session? Non-blocking check —
 * callers render the result as a warning, not a hard stop.
 */
export function detectCrossClassConflicts(
  schedule: Timetable['schedule'],
  days: readonly string[],
  targetClass: string,
  term: string,
  session: string,
  otherTimetables: Timetable[]
): string[] {
  const issues = new Set<string>();
  const others = otherTimetables.filter(t => t.term === term && t.session === session && t.class !== targetClass);

  days.forEach(day => {
    const dayKey = day as keyof Timetable['schedule'];
    const candidatePeriods = schedule[dayKey] || [];
    candidatePeriods.forEach(period => {
      if (!period.teacher) return;
      others.forEach(other => {
        const otherPeriods = other.schedule[dayKey] || [];
        const clash = otherPeriods.find(p => p.teacher === period.teacher && p.startTime === period.startTime);
        if (clash) {
          issues.add(`${period.teacher} is already teaching ${other.class} on ${day} at ${period.startTime}`);
        }
      });
    });
  });

  return [...issues];
}
