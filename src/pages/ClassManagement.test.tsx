import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enrolled: ['alice', 'bob'] as string[], update: vi.fn(), error: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../firebase', () => ({ db: {}, handleFirestoreError: vi.fn(), OperationType: {} }));
vi.mock('../hooks/useSchoolId', () => ({ useSchoolId: () => 'school' }));
vi.mock('../components/SchoolContext', () => ({ useSchool: () => ({
  schoolLevels: ['Year 11'], currentSession: '2026', subjects: ['Mathematics'],
  hasDivisions: false, divisionOfLevel: () => undefined,
}) }));
vi.mock('../services/api', () => ({ callApi: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: mocks.error } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  query: (name: string) => name, where: vi.fn(),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  updateDoc: mocks.update, addDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn(),
  onSnapshot: (name: string, next: (snap: any) => void) => {
    const data: Record<string, any[]> = {
      classes: [{ id: 'class', name: 'Year 11', level: 'Year 11', academicSession: '2026' }],
      users: [{ id: 'teacher', uid: 'teacher', displayName: 'Teacher' }],
      class_subjects: [{ id: 'maths', classId: 'class', subjectName: 'Mathematics', teacherId: 'teacher', enrolledStudentIds: mocks.enrolled }],
      students: ['alice', 'bob', 'carol'].map(id => ({ id, studentName: id, currentClass: 'Year 11' })),
    };
    next({ docs: (data[name] ?? []).map(row => ({ id: row.id, data: () => row })), exists: () => false });
    return vi.fn();
  },
}));
import ClassManagement from './ClassManagement';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); mocks.enrolled = ['alice', 'bob'];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function click(element: Element | undefined | null) {
  expect(element).toBeTruthy();
  await act(async () => (element as HTMLElement).click());
}
async function openEdit() {
  await act(async () => root.render(<ClassManagement />));
  await click([...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Subjects'));
  await click(container.querySelector('[aria-label="Edit Mathematics assignment"]'));
}
function student(name: string) {
  return [...container.querySelectorAll('label')].find(label => label.textContent?.trim() === name)?.querySelector('input') as HTMLInputElement;
}
async function submit() {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
it('shows existing enrolment and saves removal of only the unchecked student', async () => {
  await openEdit();
  expect(student('alice').checked).toBe(true);
  expect(student('bob').checked).toBe(true);
  expect(student('carol').checked).toBe(false);
  await click(student('bob'));
  await submit();
  expect(mocks.update).toHaveBeenCalledWith('class_subjects/maths', expect.objectContaining({ enrolledStudentIds: ['alice'], teacherId: 'teacher' }));
});
it('lets a whole-class assignment become a selected roster by unticking a student', async () => {
  mocks.enrolled = [];
  await openEdit();
  expect(student('carol').checked).toBe(true);
  await click(student('bob'));
  await submit();
  expect(mocks.update).toHaveBeenCalledWith('class_subjects/maths', expect.objectContaining({ enrolledStudentIds: ['alice', 'carol'] }));
});
it('does not save an empty selected roster as accidental whole-class enrolment', async () => {
  await openEdit();
  await click(student('alice')); await click(student('bob'));
  await submit();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalled();
});
