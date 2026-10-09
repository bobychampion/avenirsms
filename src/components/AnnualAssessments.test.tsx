import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Student } from '../types';

const mocks = vi.hoisted(() => ({ save: vi.fn(), writes: vi.fn(), query: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('./FirebaseProvider', () => ({ useAuth: () => ({ user: { uid: 'teacher' } }) }));
vi.mock('../services/assessmentService', () => ({ saveAssessmentChunk: mocks.save, saveAssessmentDefinition: async (a: unknown, entries: unknown, context: unknown) => mocks.writes('grade_assessments/definition', { ...(a as object), ...(context as object) }) }));
vi.mock('../services/dataExport/csvModules', () => ({ exportAssessmentGradesCsv: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (_db: unknown, name: string, id: string) => `${name}/${id}`,
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  query: (...args: unknown[]) => { mocks.query(...args); return args; },
  getDocs: async () => ({ docs: [] }),
  serverTimestamp: () => 'SERVER_TIME',
  runTransaction: async (_db: unknown, callback: any) => callback({ get: async () => ({ exists: () => false }), set: mocks.writes }),
}));
import AnnualAssessments from './AnnualAssessments';

let container: HTMLDivElement;
let root: Root;
const chooseFinal = vi.fn();
const props = {
  schoolId: 'school', className: 'Year 12', classId: 'class12', subject: 'Mathematics', session: '2026/2027',
  term: '1st Term' as const, students: [{ id: 'student', studentName: 'Ada', currentClass: 'Year 12' }] as Student[],
  grading: { gradingMode: 'single_grade' as const, gradingSystem: 'igcse' as const, allowedGrades: ['6', '7', '8'] },
  onChooseFinal: chooseFinal,
};
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!;
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<AnnualAssessments {...props} />); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('annual gradebook interactions', () => {
  it('renders six columns across all terms and fetches by academic year', () => {
    expect(container.querySelectorAll('thead th')).toHaveLength(7);
    expect(container.textContent).toContain('Grade 6');
    expect(container.textContent).toContain('3rd Term');
    for (const call of mocks.query.mock.calls) {
      expect(call).toContainEqual({ field: 'session', op: '==', value: '2026/2027' });
      expect(call.some(item => (item as { field?: string })?.field === 'term')).toBe(false);
    }
  });
  it('adds a seventh column without replacing any of the six defaults', async () => {
    await act(async () => button('+ Add assessment').click());
    expect(container.querySelector('form')).not.toBeNull();
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelectorAll('thead th')).toHaveLength(8);
    expect(container.textContent).toContain('Grade 7');
    expect(mocks.writes).toHaveBeenCalledWith(expect.stringContaining('grade_assessments/'), expect.objectContaining({ name: 'Grade 7', session: '2026/2027', recordedBy: 'teacher' }));
  });
  it('saves only a changed cell and explicitly selects a final grade', async () => {
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Ada, Grade 1: grade"]')!;
    await act(async () => { select.value = '7'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => button('Save assessments').click());
    expect(mocks.save).toHaveBeenCalledWith(
      [expect.objectContaining({ grade: expect.objectContaining({ studentId: 'student', grade: '7', assessmentId: 'grade-1' }), revision: 0 })],
      [expect.objectContaining({ id: 'grade-1' })], expect.objectContaining({ session: '2026/2027' }),
    );
    const finalButtons = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent === 'Use as final grade');
    expect(finalButtons[2].disabled).toBe(true);
    await act(async () => finalButtons[0].click());
    expect(chooseFinal).toHaveBeenCalledWith('student', expect.objectContaining({ grade: '7', term: '1st Term' }));
  });
});
