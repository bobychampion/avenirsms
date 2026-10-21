import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityWorkspace from './ActivityWorkspace';
const state = vi.hoisted(() => ({ exportCsv: vi.fn() }));
vi.mock('./FirebaseProvider', () => ({ useAuth: () => ({ user: { uid: 'leader' }, isAdmin: false, isSuperAdmin: false }) }));
vi.mock('./SchoolContext', () => ({ useSchool: () => ({ timezone: 'UTC' }) }));
vi.mock('../hooks/useActivityWorkspace', () => ({ useActivityWorkspace: () => ({ ready: true, error: '', activity: { id: 'a', schoolId: 's', name: 'Legacy revision', status: 'active', teacherIds: ['leader'], teacherNames: ['Leader'], enrolledStudentIds: [], days: [], time: '4–5 pm' }, students: [], meetings: [
  { id: 'first', title: 'Afternoon rehearsal', date: '2026-10-21', startTime: '15:00', endTime: '16:00', status: 'scheduled', items: [] },
  { id: 'second', title: 'Evening performance', date: '2026-10-21', startTime: '18:00', endTime: '19:00', status: 'scheduled', items: [] },
  { id: 'cancelled', title: 'Cancelled rehearsal', date: '2026-10-22', startTime: '15:00', endTime: '16:00', status: 'cancelled', items: [] },
], attendance: [
  { meetingId: 'first', attendanceDate: '2026-10-21', studentId: 'one', status: 'present' },
  { meetingId: 'cancelled', attendanceDate: '2026-10-22', studentId: 'one', status: 'absent' },
  { attendanceDate: '2026-10-20', studentId: 'one', status: 'late' },
] }) }));
vi.mock('./ActivityMeetingRegister', () => ({ default: ({ meeting }: any) => <div>Register: {meeting.title}</div> }));
vi.mock('./ActivityMeetingEditor', () => ({ default: () => null }));
vi.mock('./ClubAttendance', () => ({ default: () => <div>Earlier history preserved</div> }));
vi.mock('../services/activityMeetingService', () => ({ saveActivityMeeting: vi.fn() }));
vi.mock('../services/dataExport/csvModules', () => ({ downloadCsv: state.exportCsv }));
let root: Root, container: HTMLDivElement;
async function mount() { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; state.exportCsv.mockClear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); await act(async () => root.render(<ActivityWorkspace schoolId="s" activityId="a" />)); }
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('shared activity workspace', () => {
  it('has four workspace tabs, supports legacy lessons and separate meetings on the same day', async () => {
    await mount();
    expect(container.textContent).toContain('Special lesson');
    const nav = container.querySelector('nav')!;
    expect([...nav.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Overview', 'Members', 'Meetings & Plans', 'Attendance']);
    await act(async () => [...nav.querySelectorAll('button')].find(b => b.textContent === 'Attendance')!.click());
    const select = container.querySelector('select')!;
    expect([...select.options].filter(o => o.textContent?.includes('2026-10-21'))).toHaveLength(2);
    await act(async () => { select.value = 'second'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toContain('Register: Evening performance');
    await act(async () => { select.value = 'legacy'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toContain('Earlier history preserved');
  });
  it('excludes cancelled attendance from CSV while retaining older records', async () => {
    await mount();
    await act(async () => [...container.querySelectorAll('nav button')].find(b => b.textContent === 'Attendance')!.click());
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Export activity history CSV')!.click());
    expect(state.exportCsv.mock.calls[0][2]).toHaveLength(2);
    expect(state.exportCsv.mock.calls[0][2].some((row: string[]) => row.includes('absent'))).toBe(false);
  });
});
