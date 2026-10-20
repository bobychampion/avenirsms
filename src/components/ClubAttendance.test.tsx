import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClubAttendance from './ClubAttendance';
const state = vi.hoisted(() => ({ userId: 'leader', fail: false, rows: [] as any[], history: undefined as any, save: vi.fn(), exportCsv: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('./FirebaseProvider', () => ({ useAuth: () => ({ user: { uid: state.userId }, isAdmin: false, isSuperAdmin: false }) }));
vi.mock('./SchoolContext', () => ({ useSchool: () => ({ timezone: 'UTC' }) }));
vi.mock('../services/clubAttendanceService', () => ({ saveClubAttendance: state.save }));
vi.mock('../services/dataExport/csvModules', () => ({ downloadCsv: state.exportCsv }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({ kind: 'doc' }), collection: () => ({}), documentId: () => '__name__', where: () => ({}), query: () => ({ kind: 'query' }),
  getDocs: async () => {
    if (state.fail) throw new Error('Unable to load enrolment');
    return { docs: ['one', 'two'].map((id, i) => ({ id, data: () => ({ schoolId: 'school', studentName: i ? 'Ben' : 'Anna', currentClass: i ? 'Year 12' : 'Year 11' }) })) };
  },
  onSnapshot: (ref: any, next: any) => {
    if (ref.kind === 'doc') next({ id: 'chess', exists: () => true, data: () => ({ schoolId: 'school', name: 'Chess', activityType: 'club', teacherIds: ['leader'], status: 'active', enrolledStudentIds: ['one', 'two'] }) });
    else { state.history = next; next({ docs: state.rows }); }
    return () => {};
  },
}));
let root: Root;
let container: HTMLDivElement;
async function mount() {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ClubAttendance schoolId="school" clubId="chess" />); });
}
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.userId = 'leader'; state.fail = false; state.rows = []; state.save.mockReset(); state.exportCsv.mockReset();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); });

describe('club attendance register', () => {
  it('shows mixed-class students, requires marks, saves, reloads and exports history', async () => {
    state.save.mockImplementation(async (_club, _students, date, marks) => {
      state.rows = Object.entries(marks).map(([studentId, status]) => ({ data: () => ({ studentId, status, attendanceDate: date }) }));
      state.history({ docs: state.rows });
    });
    await mount();
    expect(container.textContent).toContain('Year 11'); expect(container.textContent).toContain('Year 12');
    expect(button('Save club attendance').disabled).toBe(true);
    await act(async () => button('Mark all present').click());
    const ben = container.querySelector('select[aria-label="Attendance for Ben"]') as HTMLSelectElement;
    await act(async () => { ben.value = 'absent'; ben.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => button('Save club attendance').click());
    expect(state.save.mock.calls[0][3]).toEqual({ one: 'present', two: 'absent' });
    await act(async () => root.unmount()); container.remove();
    await mount();
    expect((container.querySelector('select[aria-label="Attendance for Ben"]') as HTMLSelectElement).value).toBe('absent');
    expect(container.textContent).toContain('Recorded sessions (1)');
    await act(async () => button('Export history CSV').click());
    expect(state.exportCsv.mock.calls[0][2]).toHaveLength(2);
  });
  it('blocks an unassigned teacher from recording', async () => {
    state.userId = 'other'; await mount();
    expect(button('Mark all present').disabled).toBe(true);
    expect(button('Save club attendance').disabled).toBe(true);
    expect(state.save).not.toHaveBeenCalled();
  });
  it('does not show a partial register when loading enrolment fails', async () => {
    state.fail = true; await mount();
    expect(container.textContent).toContain('Unable to load enrolment');
    expect(container.querySelector('select')).toBeNull();
    expect(state.save).not.toHaveBeenCalled();
  });
});
