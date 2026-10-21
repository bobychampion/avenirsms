import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ActivityMeeting, SpecialLesson } from '../types';
import { DAYS_OF_WEEK, WEEKEND_DAYS } from '../types';
import { meetingFormError, recurringMeetingDates } from '../utils/schoolActivities';
import { saveActivityMeeting } from '../services/activityMeetingService';

export default function ActivityMeetingEditor({ activity, meeting, today, onClose, onSaved }: {
  activity: SpecialLesson; meeting?: ActivityMeeting; today: string; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<ActivityMeeting>(() => ({
    schoolId: activity.schoolId, specialLessonId: activity.id!, title: meeting?.title ?? activity.name,
    date: meeting?.date ?? (activity.startDate && activity.startDate > today ? activity.startDate : today), startTime: meeting?.startTime ?? activity.startTime ?? '', endTime: meeting?.endTime ?? activity.endTime ?? '',
    location: meeting?.location ?? activity.location ?? '', leaderIds: meeting ? meeting.leaderIds.filter(id => activity.teacherIds.includes(id)) : activity.teacherIds,
    status: meeting?.status ?? 'scheduled', items: meeting?.items.map(i => ({ ...i })) ?? [], notes: meeting?.notes ?? '',
    ...(meeting?.id ? { id: meeting.id } : {}),
  }));
  const initial = useState(() => JSON.stringify(form))[0];
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatDays, setRepeatDays] = useState(activity.days ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!saving && (JSON.stringify(form) === initial && !repeatUntil || confirm('Discard unsaved meeting changes?'))) onClose(); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = meetingFormError(form, activity);
    if (validation) { setError(validation); return; }
    setSaving(true); setError('');
    try {
      const dates = repeatUntil && !meeting ? recurringMeetingDates(form.date, repeatUntil, repeatDays) : [form.date];
      for (const date of dates) { const error = meetingFormError({ ...form, date }, activity); if (error) throw new Error(error); }
      let firstId = '';
      for (const date of dates) {
        const recurringId = repeatUntil && !meeting ? encodeURIComponent(JSON.stringify([activity.id, date, form.startTime])) : undefined;
        if (recurringId && (await getDoc(doc(db, 'activity_meetings', recurringId))).exists()) { firstId ||= recurringId; continue; }
        const id = await saveActivityMeeting(activity, { ...form, date, ...(recurringId ? { id: recurringId } : {}) });
        firstId ||= id;
      }
      onSaved(firstId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save meeting.'); }
    finally { setSaving(false); }
  };
  const field = 'w-full mt-1 border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  return <div className="fixed inset-0 z-50 bg-slate-950/50 p-0 sm:p-6 flex items-center justify-center" onMouseDown={e => { if (e.currentTarget === e.target) close(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="meeting-title" className="bg-white sm:rounded-3xl w-full max-w-3xl max-h-full overflow-y-auto p-5 sm:p-8">
      <div className="flex justify-between mb-5"><div><p className="text-xs text-indigo-600 font-semibold">{activity.name}</p><h2 id="meeting-title" className="text-xl font-bold">{meeting ? 'Edit meeting & plan' : 'Plan a meeting'}</h2></div><button disabled={saving} onClick={close} aria-label="Close meeting editor" className="text-xl px-2">×</button></div>
      <form onSubmit={save}><fieldset disabled={saving} className="space-y-5">
        <label className="block text-sm font-medium">Meeting title<input autoFocus required className={field} value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Rehearsal for the winter play" /></label>
        <div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Date<input required disabled={!!meeting?.attendanceRecorded} type="date" min={activity.startDate} max={activity.endDate} className={field} value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} /></label><label className="text-sm">Start time<input required disabled={!!meeting?.attendanceRecorded} type="time" className={field} value={form.startTime} onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))} /></label><label className="text-sm">End time<input required disabled={!!meeting?.attendanceRecorded} type="time" className={field} value={form.endTime} onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))} /></label></div>
        {meeting?.attendanceRecorded && <p className="text-xs text-slate-500">Timing is locked because this meeting has recorded attendance. Plans, notes and cancellation remain editable.</p>}
        <label className="block text-sm">Location<input className={field} value={form.location} onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))} /></label>
        <div><p className="text-sm mb-2">Meeting leaders</p><div className="flex flex-wrap gap-2">{activity.teacherIds.map((id, i) => <button type="button" key={id} aria-pressed={form.leaderIds.includes(id)} className={`px-3 py-2 rounded-xl border text-sm ${form.leaderIds.includes(id) ? 'bg-indigo-600 text-white' : ''}`} onClick={() => setForm(prev => ({ ...prev, leaderIds: prev.leaderIds.includes(id) ? prev.leaderIds.filter(x => x !== id) : [...prev.leaderIds, id] }))}>{activity.teacherNames?.[i] || 'Teacher'}</button>)}</div></div>
        {!meeting && <div className="rounded-2xl bg-slate-50 p-4 space-y-3"><label className="block text-sm">Repeat weekly until (optional)<input type="date" className={field} min={form.date} max={activity.endDate} value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} /></label>{repeatUntil && <div className="flex flex-wrap gap-2">{[...DAYS_OF_WEEK, ...WEEKEND_DAYS].map(day => <button type="button" key={day} aria-pressed={repeatDays.includes(day)} className={`px-2 py-1.5 rounded-lg text-xs border ${repeatDays.includes(day) ? 'bg-indigo-600 text-white' : 'bg-white'}`} onClick={() => setRepeatDays(prev => prev.includes(day) ? prev.filter(x => x !== day) : [...prev, day])}>{day.slice(0, 3)}</button>)}</div>}<p className="text-xs text-slate-500">Each generated meeting has its own plan and attendance register.</p></div>}
        <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Planned activities</h3><button type="button" className="text-indigo-600 text-sm font-semibold" onClick={() => setForm(prev => ({ ...prev, items: [...prev.items, { id: crypto.randomUUID(), title: '', completed: false }] }))}>+ Add activity</button></div>
          {!form.items.length && <p className="text-sm text-slate-400">Add exercises, topics, rehearsals or projects for this meeting.</p>}
          {form.items.map((item, index) => <div key={item.id} className="flex items-center gap-2"><input type="checkbox" aria-label={`Completed planned activity ${index + 1}`} checked={item.completed} onChange={e => setForm(prev => ({ ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, completed: e.target.checked } : i) }))} /><input aria-label={`Planned activity ${index + 1}`} required className={field} value={item.title} placeholder="e.g. Warm-up exercises" onChange={e => setForm(prev => ({ ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, title: e.target.value } : i) }))} /><button aria-label={`Remove planned activity ${index + 1}`} type="button" onClick={() => setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== item.id) }))}>×</button></div>)}
        </section>
        <label className="block text-sm">Meeting notes / outcomes<textarea rows={3} className={field} value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="What was covered? What should happen next?" /></label>
        <label className="block text-sm">Status<select className={field} value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as ActivityMeeting['status'] }))}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled — excluded from attendance totals</option></select></label>
      </fieldset>{error && <p role="alert" className="text-rose-600 text-sm mt-4">{error}</p>}<footer className="flex justify-end gap-2 border-t mt-6 pt-4"><button disabled={saving} type="button" onClick={close} className="border rounded-xl px-4 py-2">Cancel</button><button disabled={saving} type="submit" className="bg-indigo-600 text-white font-semibold rounded-xl px-5 py-2">{saving ? 'Saving…' : repeatUntil && !meeting ? 'Create weekly meetings' : 'Save meeting'}</button></footer></form>
    </div>
  </div>;
}
