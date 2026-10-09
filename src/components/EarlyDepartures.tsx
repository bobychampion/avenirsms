import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { useAuth } from './FirebaseProvider';
import { EarlyDeparture, departureDescription, validDeparture } from '../utils/earlyDeparture';
import { exportEarlyDeparturesCsv } from '../services/dataExport/csvModules';

export function useEarlyDepartures(schoolId: string | null | undefined, className?: string, studentId?: string) {
  const [records, setRecords] = useState<EarlyDeparture[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setRecords([]); setError(false);
    if (!schoolId || (!className && !studentId)) { setLoading(false); return; }
    setLoading(true);
    const filters = [where('schoolId', '==', schoolId)];
    if (studentId) filters.push(where('studentId', '==', studentId));
    else filters.push(where('class', '==', className));
    return onSnapshot(query(collection(db, 'attendance_departures'), ...filters), snap => {
      setRecords(snap.docs.map(d => ({ ...d.data(), id: d.id } as EarlyDeparture)).sort((a, b) => b.date.localeCompare(a.date) || b.departureTime.localeCompare(a.departureTime)));
      setLoading(false);
    }, () => { setError(true); setLoading(false); });
  }, [schoolId, className, studentId]);
  return { records, error, loading };
}

interface Props {
  schoolId: string | null | undefined;
  className?: string;
  studentId?: string;
  date?: string;
  month?: string;
  students?: { studentId: string; studentName: string }[];
  editable?: boolean;
}

/** Append-only departure log: changing daily status cannot erase departure evidence. */
export default function EarlyDepartures({ schoolId, className, studentId, date, month, students = [], editable = false }: Props) {
  const { user } = useAuth();
  const { records, error, loading } = useEarlyDepartures(schoolId, className, studentId);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('Public transport');
  const [notes, setNotes] = useState('');
  const [lesson, setLesson] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => { setOpen(false); setSelected(''); setTime(''); setNotes(''); setLesson(''); }, [className, date, studentId]);
  const visible = records.filter(r => (!date || r.date === date) && (!month || r.date.startsWith(month)));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current || !schoolId || !className || !date || !user || !editable) return;
    const student = students.find(s => s.studentId === selected);
    if (!student || !validDeparture({ date, departureTime: time, reason })) { toast.error('Select a student and enter a valid departure time and reason.'); return; }
    savingRef.current = true; setSaving(true);
    try {
      await addDoc(collection(db, 'attendance_departures'), {
        schoolId, class: className, ...student, date, departureTime: time, reason: reason.trim(),
        notes: notes.trim(), lesson: lesson.trim(), recordedBy: user.uid, recordedAt: serverTimestamp(),
      });
      setOpen(false); setNotes(''); setLesson(''); toast.success('Early departure recorded.');
    } catch { toast.error('Unable to record early departure.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  if (!className && !studentId) return null;
  return <section className="my-4 rounded-xl border border-purple-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-bold text-purple-800">Early departures{date ? ` — ${date}` : month ? ` — ${month}` : ''}</h3>
        <p className="text-xs text-slate-500">{loading ? 'Loading…' : `${visible.length} recorded departure${visible.length === 1 ? '' : 's'}`}. Attendance status is recorded separately.</p></div>
      <div className="flex gap-2">
        {visible.length > 0 && <button type="button" onClick={() => exportEarlyDeparturesCsv(visible)} className="text-xs px-3 py-2 border rounded-lg">Export CSV</button>}
        {editable && date && <button type="button" disabled={saving || loading || error || !students.length} onClick={() => { setSelected(students[0]?.studentId ?? ''); setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })); setOpen(true); }} className="text-xs px-3 py-2 rounded-lg bg-purple-600 text-white font-semibold disabled:opacity-50">+ Record left early</button>}
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-rose-600">Unable to load early-departure records.</p>}
    {open && <form onSubmit={save} className="mt-4 flex flex-wrap gap-3 items-end">
      <label className="text-xs font-semibold">Student<select required value={selected} onChange={e => setSelected(e.target.value)} className="block border rounded-lg p-2">{students.map(s => <option key={s.studentId} value={s.studentId}>{s.studentName}</option>)}</select></label>
      <label className="text-xs font-semibold">Departure time<input type="time" required value={time} onChange={e => setTime(e.target.value)} className="block border rounded-lg p-2" /></label>
      <label className="text-xs font-semibold">Reason<select value={reason} onChange={e => setReason(e.target.value)} className="block border rounded-lg p-2">{['Public transport', 'Appointment', 'Other'].map(r => <option key={r}>{r}</option>)}</select></label>
      <label className="text-xs font-semibold">Lesson (optional)<input maxLength={120} value={lesson} onChange={e => setLesson(e.target.value)} className="block border rounded-lg p-2" placeholder="e.g. Mathematics, period 4" /></label>
      <label className="text-xs font-semibold">{reason === 'Other' ? 'Explain reason' : 'Notes (optional)'}<input required={reason === 'Other'} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className="block border rounded-lg p-2" /></label>
      <button disabled={saving} className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm">{saving ? 'Saving…' : 'Save departure'}</button>
      <button type="button" disabled={saving} onClick={() => setOpen(false)} className="px-3 py-2 text-sm">Cancel</button>
    </form>}
    {visible.length > 0 && <div className="overflow-x-auto mt-3"><table className="w-full text-xs text-left"><thead className="bg-purple-50"><tr><th className="p-2">Student</th><th className="p-2">Date</th><th className="p-2">Departure</th><th className="p-2">Recorded</th></tr></thead><tbody>
      {visible.map(r => <tr key={r.id} className="border-t"><td className="p-2">{r.studentName}</td><td className="p-2">{r.date}</td><td className="p-2">{departureDescription(r)}</td><td className="p-2">{r.recordedAt?.toDate ? r.recordedAt.toDate().toLocaleString('en-GB') : 'Saving…'}</td></tr>)}
    </tbody></table>
      {!studentId && <p className="mt-2 text-xs text-purple-700">{Object.entries(visible.reduce<Record<string, number>>((counts, r) => { counts[r.studentId] = (counts[r.studentId] ?? 0) + 1; return counts; }, {})).map(([id, count]) => `${visible.find(r => r.studentId === id)?.studentName ?? id}: ${count}`).join(' · ')}</p>}
    </div>}
  </section>;
}
