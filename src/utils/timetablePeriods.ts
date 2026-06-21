/**
 * Timetable period slot definitions — school-wide bell schedule.
 * Stored in school_settings.timetablePeriods; drives dynamic timetable grid columns.
 */

export type TimetablePeriodSlotType = 'lesson' | 'break';

export interface TimetablePeriodSlot {
  id: string;
  label: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  type: TimetablePeriodSlotType;
  order: number;
}

export const DEFAULT_TIMETABLE_PERIODS: TimetablePeriodSlot[] = [
  { id: 'tp-1', label: 'Period 1', startTime: '08:00', endTime: '08:45', type: 'lesson', order: 0 },
  { id: 'tp-2', label: 'Period 2', startTime: '08:45', endTime: '09:30', type: 'lesson', order: 1 },
  { id: 'tp-3', label: 'Period 3', startTime: '09:30', endTime: '10:15', type: 'lesson', order: 2 },
  { id: 'tp-break-1', label: 'Break', startTime: '10:15', endTime: '10:30', type: 'break', order: 3 },
  { id: 'tp-4', label: 'Period 4', startTime: '10:30', endTime: '11:15', type: 'lesson', order: 4 },
  { id: 'tp-5', label: 'Period 5', startTime: '11:15', endTime: '12:00', type: 'lesson', order: 5 },
  { id: 'tp-6', label: 'Period 6', startTime: '12:00', endTime: '12:45', type: 'lesson', order: 6 },
  { id: 'tp-break-2', label: 'Lunch', startTime: '12:45', endTime: '13:30', type: 'break', order: 7 },
  { id: 'tp-7', label: 'Period 7', startTime: '13:30', endTime: '14:15', type: 'lesson', order: 8 },
  { id: 'tp-8', label: 'Period 8', startTime: '14:15', endTime: '15:00', type: 'lesson', order: 9 },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateTimeHHMM(value: string): boolean {
  return TIME_RE.test(value.trim());
}

export function createSlotId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function sortedPeriodSlots(slots: TimetablePeriodSlot[]): TimetablePeriodSlot[] {
  return [...slots].sort((a, b) => a.order - b.order);
}

export function lessonSlots(slots: TimetablePeriodSlot[]): TimetablePeriodSlot[] {
  return sortedPeriodSlots(slots).filter(s => s.type === 'lesson');
}

/** Legacy flat start-time list derived from lesson slots (for backward compatibility). */
export function periodTimesFromSlots(slots: TimetablePeriodSlot[]): string[] {
  return lessonSlots(slots).map(s => s.startTime);
}

/** Convert legacy periodTimes (start times only) into full slot definitions. */
export function migratePeriodTimesToSlots(periodTimes: string[]): TimetablePeriodSlot[] {
  const sorted = [...periodTimes].filter(validateTimeHHMM).sort();
  if (sorted.length === 0) return [...DEFAULT_TIMETABLE_PERIODS];

  return sorted.map((start, i) => ({
    id: createSlotId(),
    label: `Period ${i + 1}`,
    startTime: start,
    endTime: sorted[i + 1] ?? addMinutes(start, 45),
    type: 'lesson' as const,
    order: i,
  }));
}

export interface PeriodSettingsInput {
  timetablePeriods?: TimetablePeriodSlot[];
  periodTimes?: string[];
}

/** Resolve slots from school_settings — prefers timetablePeriods, falls back to periodTimes migration. */
export function resolveTimetablePeriodSlots(settings: PeriodSettingsInput): TimetablePeriodSlot[] {
  if (settings.timetablePeriods?.length) {
    return sortedPeriodSlots(settings.timetablePeriods);
  }
  if (settings.periodTimes?.length) {
    return migratePeriodTimesToSlots(settings.periodTimes);
  }
  return [...DEFAULT_TIMETABLE_PERIODS];
}

export function nextLessonLabel(slots: TimetablePeriodSlot[]): string {
  const count = lessonSlots(slots).length;
  return `Period ${count + 1}`;
}

export function reindexSlots(slots: TimetablePeriodSlot[]): TimetablePeriodSlot[] {
  return sortedPeriodSlots(slots).map((s, i) => ({ ...s, order: i }));
}

export function formatSlotHeader(slot: TimetablePeriodSlot): string {
  return `${slot.label}\n${slot.startTime}–${slot.endTime}`;
}
