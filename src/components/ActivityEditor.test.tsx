import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityEditor from './ActivityEditor';
import type { SpecialLesson, Student, UserProfile } from '../types';
const mocks = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('./SchoolContext', () => ({ useSchool: () => ({ currentSession: '2026/2027', currentTerm: '1st Term', terms: ['1st Term'] }) }));
vi.mock('../utils/impersonationGuard', () => ({ assertNotImpersonating: () => {} }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn() } }));
vi.mock('firebase/firestore', () => ({ updateDoc: mocks.update, addDoc: vi.fn(), collection: () => ({}), doc: () => ({}), serverTimestamp: () => 'timestamp' }));
let root: Root, container: HTMLDivElement;
const activity = { id: 'a', schoolId: 's', activityType: 'club', name: 'Chess Club', teacherIds: ['t'], teacherNames: ['Leader'], academicSession: '2026/2027', term: '1st Term', enrolledStudentIds: ['student'], startTime: '15:00', endTime: '16:00', days: ['Wednesday'], status: 'active' } as SpecialLesson;
async function mount(value: SpecialLesson) {
  mocks.update.mockClear(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<ActivityEditor schoolId="s" activity={value} teachers={[{ uid: 't', displayName: 'Leader' } as UserProfile]} students={[{ id: 'student', studentName: 'Anna', currentClass: 'Year 11' } as Student]} onClose={() => {}} onSaved={() => {}} />));
}
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('activity setup modal', () => {
  it('has both activity types, club suggestions, proper time pickers and saves membership', async () => {
    await mount(activity);
    expect(container.querySelector('[role="dialog"]')?.className).toContain('max-w-5xl');
    expect(container.querySelectorAll('input[type="time"]')).toHaveLength(2);
    const drama = [...container.querySelectorAll('button')].find(b => b.textContent === 'Drama')!;
    await act(async () => drama.click());
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'Drama Club', startTime: '15:00', endTime: '16:00', enrolledStudentIds: ['student'], activityType: 'club' }));
  });
  it('refuses an end time before the start time', async () => {
    await mount({ ...activity, endTime: '14:00' });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('later end time');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
