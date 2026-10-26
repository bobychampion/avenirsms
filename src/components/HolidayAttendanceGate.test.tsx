// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ calendar: { holidays: [] as any[], loading: false, error: '' } }));
vi.mock('../hooks/useSchoolHolidays', () => ({ useSchoolHolidays: () => state.calendar }));
import HolidayAttendanceGate from './HolidayAttendanceGate';
let root: Root; let container: HTMLDivElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; state.calendar = { holidays: [], loading: false, error: '' }; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(<HolidayAttendanceGate schoolId="school" date="2026-10-28"><button>Save attendance</button></HolidayAttendanceGate>)); }
it('shows the holiday name and no marking controls, then reopens when the event is removed', async () => {
  state.calendar.holidays = [{ title: 'Autumn holiday', type: 'holiday', date: '2026-10-26', endDate: '2026-10-30' }];
  await render(); expect(container.textContent).toContain('Holiday — Autumn holiday'); expect(container.querySelector('button')).toBeNull();
  state.calendar.holidays = []; await render(); expect(container.querySelector('button')?.textContent).toBe('Save attendance');
});
it('keeps marking unavailable while calendar loading or failed', async () => {
  state.calendar.loading = true; await render(); expect(container.textContent).toContain('Checking school calendar'); expect(container.querySelector('button')).toBeNull();
  state.calendar = { holidays: [], loading: false, error: 'Reload before marking attendance.' }; await render(); expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.querySelector('button')).toBeNull();
});
