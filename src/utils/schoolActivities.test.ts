import { describe, expect, it } from 'vitest';
import { activityTypeLabel, activityFormError, activitySchedule, validTimeRange, meetingFormError, meetingAttendanceId, reportableActivityAttendance, recurringMeetingDates } from './schoolActivities';
import type { ActivityMeeting, SpecialLesson, SpecialLessonAttendance } from '../types';
const activity = { id: 'chess', schoolId: 'school', name: 'Chess', activityType: 'club', status: 'active', teacherIds: ['leader'], days: ['Wednesday'], startDate: '2026-10-01', endDate: '2026-12-31', startTime: '15:30', endTime: '16:30', location: 'Library' } as SpecialLesson;
const meeting = { id: 'm1', schoolId: 'school', specialLessonId: 'chess', title: 'Opening tactics', date: '2026-10-21', startTime: '15:30', endTime: '16:30', leaderIds: ['leader'], items: [], notes: '', location: 'Library', status: 'scheduled' } as ActivityMeeting;
describe('combined school activities', () => {
  it('treats legacy activities as special lessons and preserves free-text schedules', () => {
    expect(activityTypeLabel({})).toBe('Special lesson');
    expect(activitySchedule({ ...activity, startTime: '', endTime: '', time: '3 PM to 4 PM' })).toContain('3 PM to 4 PM');
    expect(activityFormError({ ...activity, startTime: '', endTime: '' }, '3 PM to 4 PM')).toBe('');
  });
  it('requires a title, leader and ordered structured times for new activities', () => {
    expect(activityFormError(activity)).toBe('');
    expect(activityFormError({ ...activity, name: '' })).not.toBe('');
    expect(activityFormError({ ...activity, teacherIds: [] })).not.toBe('');
    expect(validTimeRange('15:30', '14:30')).toBe(false);
    expect(validTimeRange('25:00', '26:00')).toBe(false);
    expect(activitySchedule(activity)).toContain('Every Wednesday · 15:30–16:30 · Library');
  });
  it('validates meeting periods and activity leaders', () => {
    expect(meetingFormError(meeting, activity)).toBe('');
    expect(meetingFormError({ ...meeting, date: '2026-02-30' }, activity)).not.toBe('');
    expect(meetingFormError({ ...meeting, date: '2027-01-01' }, activity)).not.toBe('');
    expect(meetingFormError({ ...meeting, leaderIds: ['stranger'] }, activity)).not.toBe('');
    expect(meetingFormError({ ...meeting, items: [{ id: 'a', title: '', completed: false }] }, activity)).not.toBe('');
  });
  it('keeps two meetings on the same date separate and makes retries idempotent', () => {
    expect(meetingAttendanceId('chess', 'm1', 'student')).not.toBe(meetingAttendanceId('chess', 'm2', 'student'));
    expect(meetingAttendanceId('chess', 'm1', 'student')).toBe(meetingAttendanceId('chess', 'm1', 'student'));
  });
  it('excludes cancelled meetings while retaining older date-based history', () => {
    const records = [{ meetingId: 'm1', status: 'present' }, { meetingId: 'cancelled', status: 'absent' }, { status: 'late' }] as SpecialLessonAttendance[];
    expect(reportableActivityAttendance(records, [meeting, { ...meeting, id: 'cancelled', status: 'cancelled' }])).toEqual([records[0], records[2]]);
  });
  it('generates weekly meetings at the right dates with limits', () => {
    expect(recurringMeetingDates('2026-10-21', '2026-11-04', ['Wednesday'])).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
    expect(() => recurringMeetingDates('2026-10-21', '2026-10-20', ['Wednesday'])).toThrow();
    expect(() => recurringMeetingDates('2026-10-21', '2028-10-21', ['Wednesday'])).toThrow();
    expect(() => recurringMeetingDates('2026-10-21', '2026-11-21', [])).toThrow();
  });
});
