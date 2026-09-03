import type { Timetable, TimetablePeriod, TimetablePeriodSlot } from '../types';
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
    teacher: data.teacher || undefined,
  };

  return [...without, period];
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
