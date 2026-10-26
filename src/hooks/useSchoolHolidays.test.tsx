// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ collection: (_db: any, name: string) => name, where: (...args: any[]) => args, query: (...args: any[]) => args, onSnapshot: (...args: any[]) => { mocks.listen(...args); return mocks.stop; }, getDocs: vi.fn() }));
import { useSchoolHolidays } from './useSchoolHolidays';
function Consumer({ school }: { school: string }) { const { holidays, loading } = useSchoolHolidays(school); return <span>{loading ? 'loading' : holidays.map(h => h.title).join(',')}</span>; }
it('shares a school-scoped listener, isolates schools and updates all consumers live', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<><Consumer school="a" /><Consumer school="a" /><Consumer school="b" /></>));
    expect(mocks.listen).toHaveBeenCalledTimes(2);
    expect(mocks.listen.mock.calls[0][0]).toEqual(['events', ['schoolId', '==', 'a'], ['type', '==', 'holiday']]);
    await act(async () => mocks.listen.mock.calls[0][1]({ docs: [{ id: 'break', data: () => ({ title: 'Autumn holiday', date: '2026-10-26', type: 'holiday', schoolId: 'a' }) }] }));
    expect(container.textContent).toBe('Autumn holidayAutumn holidayloading');
    await act(async () => mocks.listen.mock.calls[0][1]({ docs: [] }));
    expect(container.textContent).toBe('loading');
  } finally { await act(async () => root.unmount()); container.remove(); }
  expect(mocks.stop).toHaveBeenCalledTimes(2);
});
