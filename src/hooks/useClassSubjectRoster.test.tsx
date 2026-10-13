import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listeners: [] as { next: (snap: any) => void; error: () => void; unsubscribe: ReturnType<typeof vi.fn> }[] }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  where: (...args: unknown[]) => args,
  query: (...args: unknown[]) => args,
  onSnapshot: (_q: unknown, next: (snap: any) => void, error: () => void) => {
    const unsubscribe = vi.fn(); mocks.listeners.push({ next, error, unsubscribe }); return unsubscribe;
  },
}));
import { useClassSubjectRoster } from './useClassSubjectRoster';
let root: Root; let container: HTMLDivElement;
function Viewer({ classId }: { classId: string }) {
  const result = useClassSubjectRoster('school', classId);
  return <div>{result.error ? 'error' : result.loading ? 'loading' : result.assignments.map(a => a.subjectName).join(',')}</div>;
}
const emit = (index: number, subjectName: string) => mocks.listeners[index].next({ docs: [{ id: subjectName, data: () => ({ subjectName }) }] });
beforeEach(() => {
  mocks.listeners.length = 0; Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('hides the previous roster during a class switch and ignores its late callbacks', async () => {
  await act(async () => root.render(<Viewer classId="y12" />));
  await act(async () => emit(0, 'History'));
  expect(container.textContent).toBe('History');
  await act(async () => root.render(<Viewer classId="y11" />));
  expect(container.textContent).toBe('loading');
  expect(mocks.listeners[0].unsubscribe).toHaveBeenCalled();
  await act(async () => emit(1, 'Physics'));
  await act(async () => { emit(0, 'History'); mocks.listeners[0].error(); });
  expect(container.textContent).toBe('Physics');
});
it('updates live enrolment metadata and blocks the roster after a read error', async () => {
  await act(async () => root.render(<Viewer classId="y12" />));
  await act(async () => emit(0, 'History'));
  await act(async () => emit(0, 'Mathematics'));
  expect(container.textContent).toBe('Mathematics');
  await act(async () => mocks.listeners[0].error());
  expect(container.textContent).toBe('error');
});
