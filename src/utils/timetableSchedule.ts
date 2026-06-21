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
