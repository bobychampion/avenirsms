import type { ActivityMeeting, SpecialLesson, SpecialLessonAttendance } from '../types';

export const CLUB_SUGGESTIONS = ['Chess', 'Drama', 'Sports', 'Baking', 'Music', 'Art', 'Coding', 'Debate', 'Dance'];
export const activityTypeLabel = (a: Pick<SpecialLesson, 'activityType'>) => a.activityType === 'club' ? 'After-school club' : 'Special lesson';
export const validTimeRange = (start: string, end: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && end > start;
export function activitySchedule(a: SpecialLesson) {
  return `${a.days?.length ? `Every ${a.days.join(', ')}` : 'Meetings scheduled individually'}${a.startTime && a.endTime ? ` · ${a.startTime}–${a.endTime}` : a.time ? ` · ${a.time}` : ''}${a.location ? ` · ${a.location}` : ''}`;
}
export function activityFormError(a: Partial<SpecialLesson>, legacyTime = '') {
  if (!a.name?.trim()) return 'Enter an activity title.';
  if (!a.teacherIds?.length) return 'Select at least one leader.';
  if (a.startDate && a.endDate && a.endDate < a.startDate) return 'End date must follow the start date.';
  if ((a.startTime || a.endTime || !legacyTime) && !validTimeRange(a.startTime ?? '', a.endTime ?? '')) return 'Choose a start time and a later end time.';
  return '';
}
export function meetingFormError(m: Partial<ActivityMeeting>, activity: SpecialLesson) {
  if (!m.title?.trim()) return 'Enter a meeting title.';
  if (!m.date || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(Date.parse(`${m.date}T12:00:00Z`)) || new Date(`${m.date}T12:00:00Z`).toISOString().slice(0, 10) !== m.date) return 'Choose a valid meeting date.';
  if (!validTimeRange(m.startTime ?? '', m.endTime ?? '')) return 'Choose a start time and a later end time.';
  if (activity.startDate && m.date < activity.startDate || activity.endDate && m.date > activity.endDate) return 'The meeting must fall within the activity dates.';
  if (!m.leaderIds?.length || m.leaderIds.some(id => !activity.teacherIds.includes(id))) return 'Select a leader assigned to this activity.';
  if (m.items?.some(item => !item.title.trim())) return 'Give each planned activity a title, or remove the empty row.';
  if ((m.items?.length ?? 0) > 100) return 'Use up to 100 planned activities per meeting.';
  return '';
}
export function meetingAttendanceId(activityId: string, meetingId: string, studentId: string) {
  return encodeURIComponent(JSON.stringify([activityId, 'meeting', meetingId, studentId]));
}
export function reportableActivityAttendance(records: SpecialLessonAttendance[], meetings: ActivityMeeting[]) {
  const cancelled = new Set(meetings.filter(m => m.status === 'cancelled').map(m => m.id));
  return records.filter(r => !r.meetingId || !cancelled.has(r.meetingId));
}

export function recurringMeetingDates(first: string, until: string, days: string[]) {
  const start = Date.parse(`${first}T12:00:00Z`), end = Date.parse(`${until}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 366 * 86400000 || !days.length) throw new Error('Choose repeat days and an end date within one year of the first meeting.');
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dates: string[] = [];
  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time);
    if (time === start || days.includes(names[date.getUTCDay()])) dates.push(date.toISOString().slice(0, 10));
  }
  if (dates.length > 80) throw new Error('Generate up to 80 meetings at a time. Choose a shorter date range.');
  return dates;
}
