import React, { useState } from 'react';
import { Plus, X, ChevronUp, ChevronDown, Coffee } from 'lucide-react';
import {
  TimetablePeriodSlot,
  createSlotId,
  validateTimeHHMM,
  reindexSlots,
  sortedPeriodSlots,
  nextLessonLabel,
} from '../utils/timetablePeriods';

interface TimetablePeriodEditorProps {
  slots: TimetablePeriodSlot[];
  onChange: (slots: TimetablePeriodSlot[]) => void;
}

const emptyLesson = (slots: TimetablePeriodSlot[], order: number): TimetablePeriodSlot => ({
  id: createSlotId(),
  label: nextLessonLabel(slots),
  startTime: '08:00',
  endTime: '08:45',
  type: 'lesson',
  order,
});

const emptyBreak = (order: number): TimetablePeriodSlot => ({
  id: createSlotId(),
  label: 'Break',
  startTime: '10:15',
  endTime: '10:30',
  type: 'break',
  order,
});

export default function TimetablePeriodEditor({ slots, onChange }: TimetablePeriodEditorProps) {
  const [err, setErr] = useState<string | null>(null);
  const ordered = sortedPeriodSlots(slots);

  const update = (next: TimetablePeriodSlot[]) => {
    setErr(null);
    onChange(reindexSlots(next));
  };

  const updateSlot = (id: string, patch: Partial<TimetablePeriodSlot>) => {
    update(slots.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...ordered];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    update(next);
  };

  const moveDown = (i: number) => {
    if (i === ordered.length - 1) return;
    const next = [...ordered];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    update(next);
  };

  const remove = (id: string) => {
    if (ordered.length <= 1) {
      setErr('At least one period is required.');
      return;
    }
    update(slots.filter(s => s.id !== id));
  };

  const addLesson = () => {
    const last = ordered[ordered.length - 1];
    const start = last?.endTime ?? '08:00';
    const end = `${String(Math.min(23, parseInt(start.split(':')[0], 10) + 1)).padStart(2, '0')}:${start.split(':')[1]}`;
    update([
      ...slots,
      {
        ...emptyLesson(slots, ordered.length),
        startTime: start,
        endTime: end,
        order: ordered.length,
      },
    ]);
  };

  const addBreak = () => {
    update([...slots, { ...emptyBreak(ordered.length) }]);
  };

  const validateSlot = (slot: TimetablePeriodSlot): string | null => {
    if (!slot.label.trim()) return 'Label is required.';
    if (!validateTimeHHMM(slot.startTime)) return 'Start time must be HH:MM (24h).';
    if (!validateTimeHHMM(slot.endTime)) return 'End time must be HH:MM (24h).';
    if (slot.startTime >= slot.endTime) return 'End time must be after start time.';
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
            School Day Periods
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            {ordered.filter(s => s.type === 'lesson').length} lesson
            {ordered.filter(s => s.type === 'lesson').length !== 1 ? 's' : ''},{' '}
            {ordered.filter(s => s.type === 'break').length} break
            {ordered.filter(s => s.type === 'break').length !== 1 ? 's' : ''} — used as timetable columns
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addBreak}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
          >
            <Coffee className="w-3.5 h-3.5" /> Add Break
          </button>
          <button
            type="button"
            onClick={addLesson}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add Period
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
        {ordered.map((slot, i) => {
          const slotErr = validateSlot(slot);
          const isBreak = slot.type === 'break';
          return (
            <div
              key={slot.id}
              className={`rounded-xl border px-3 py-3 ${
                isBreak
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-indigo-50/50 border-indigo-100'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-25"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === ordered.length - 1}
                    className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-25"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                    <select
                      value={slot.type}
                      onChange={e =>
                        updateSlot(slot.id, {
                          type: e.target.value as 'lesson' | 'break',
                          label: e.target.value === 'break' ? 'Break' : slot.label || nextLessonLabel(slots),
                        })
                      }
                      className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      <option value="lesson">Lesson</option>
                      <option value="break">Break</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Label</label>
                    <input
                      value={slot.label}
                      onChange={e => updateSlot(slot.id, { label: e.target.value })}
                      placeholder={isBreak ? 'Break' : 'Period 1'}
                      className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Start</label>
                    <input
                      value={slot.startTime}
                      onChange={e => updateSlot(slot.id, { startTime: e.target.value })}
                      placeholder="08:00"
                      className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">End</label>
                    <input
                      value={slot.endTime}
                      onChange={e => updateSlot(slot.id, { endTime: e.target.value })}
                      placeholder="08:45"
                      className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => remove(slot.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 mt-4"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {slotErr && <p className="text-xs text-red-500 mt-1.5 ml-8">{slotErr}</p>}
            </div>
          );
        })}
      </div>

      {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
    </div>
  );
}
