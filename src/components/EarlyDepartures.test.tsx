import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ write: vi.fn().mockResolvedValue({ id: 'new' }) }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('./FirebaseProvider', () => ({ useAuth: () => ({ user: { uid: 'teacher' } }) }));
vi.mock('../services/dataExport/csvModules', () => ({ exportEarlyDeparturesCsv: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  addDoc: mocks.write, collection: (_db: unknown, name: string) => name,
  where: (...args: unknown[]) => args, query: (...args: unknown[]) => args,
  serverTimestamp: () => 'SERVER_TIME',
  onSnapshot: (_q: unknown, next: (snap: unknown) => void) => { next({ docs: [] }); return vi.fn(); },
}));
import EarlyDepartures from './EarlyDepartures';
let root: Root; let container: HTMLDivElement;
const props = { schoolId: 'school', className: 'Year 12', date: '2026-10-13', subjectName: 'History', timetablePeriodId: 'period4',
  students: [{ studentId: 'lena', studentName: 'Lena' }, { studentId: 'justin', studentName: 'Justin' }], editable: true };
beforeEach(async () => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<EarlyDepartures {...props} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('records a departure with the selected subject/period and only the supplied enrolled students', async () => {
  const open = [...container.querySelectorAll('button')].find(b => b.textContent === '+ Record left early')!;
  await act(async () => open.click());
  expect([...container.querySelector('select')!.options].map(o => o.value)).toEqual(['lena', 'justin']);
  const lesson = [...container.querySelectorAll('input')].find(i => i.placeholder.includes('Mathematics'))!;
  expect(lesson.value).toBe('History');
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(mocks.write).toHaveBeenCalledWith('attendance_departures', expect.objectContaining({
    studentId: 'lena', class: 'Year 12', subjectName: 'History', timetablePeriodId: 'period4', lesson: 'History',
    date: '2026-10-13', recordedBy: 'teacher', recordedAt: 'SERVER_TIME',
  }));
  expect(mocks.write.mock.calls[0][0]).not.toBe('subjectAttendance');
});
it('closes an old form when the subject changes and uses the new lesson', async () => {
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === '+ Record left early')!.click());
  await act(async () => root.render(<EarlyDepartures {...props} subjectName="Mathematics" />));
  expect(container.querySelector('form')).toBeNull();
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === '+ Record left early')!.click());
  expect([...container.querySelectorAll('input')].find(i => i.placeholder.includes('Mathematics'))!.value).toBe('Mathematics');
});
