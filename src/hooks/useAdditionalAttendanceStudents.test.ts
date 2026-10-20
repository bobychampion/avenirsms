import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDocs } from 'firebase/firestore';
import { useAdditionalAttendanceStudents } from './useAdditionalAttendanceStudents';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  documentId: () => '__name__',
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (ref: unknown, ...filters: unknown[]) => ({ ref, filters }),
  getDocs: vi.fn(),
}));

let root: Root | undefined;
let result: ReturnType<typeof useAdditionalAttendanceStudents>;
function Probe({ ids }: { ids: string[] }) {
  result = useAdditionalAttendanceStudents('school-a', ids, '2026-10-20');
  return null;
}
async function render(ids: string[]) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  if (!root) root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(React.createElement(Probe, { ids })); });
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.resetAllMocks();
});

describe('additional attendance student loading', () => {
  it('scopes student and daily-attendance reads to the school and inherits the home-class daily mark', async () => {
    vi.mocked(getDocs).mockImplementation(async (q: any) => ({ docs: q.ref.name === 'students'
      ? [{ id: 'retaker', data: () => ({ studentName: 'Ben', currentClass: 'Year 12', schoolId: 'school-a' }) }]
      : [{ data: () => ({ studentId: 'retaker', status: 'absent', class: 'Year 12' }) }] }) as any);
    await render(['retaker']);
    expect(result.loading).toBe(false);
    expect(result.students[0].currentClass).toBe('Year 12');
    expect(result.daily.retaker).toBe('absent');
    for (const [q] of vi.mocked(getDocs).mock.calls as any) {
      expect(q.filters).toContainEqual({ field: 'schoolId', op: '==', value: 'school-a' });
    }
  });
  it('chunks larger lists to respect Firestore in-query limits', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
    await render(Array.from({ length: 31 }, (_, i) => `student-${i}`));
    expect(getDocs).toHaveBeenCalledTimes(4);
    expect(result.loading).toBe(false);
  });
  it('reports load failures and clears the old roster when additional enrolment is removed', async () => {
    vi.mocked(getDocs).mockRejectedValue(new Error('permission denied'));
    await render(['retaker']);
    expect(result.error).toBe(true);
    expect(result.students).toEqual([]);
    await render([]);
    expect(result.error).toBe(false);
    expect(result.loading).toBe(false);
    expect(result.students).toEqual([]);
    expect(result.daily).toEqual({});
  });
});
