import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { collection, query, onSnapshot, orderBy, addDoc, deleteDoc, doc, updateDoc, where, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { SchoolEvent } from '../types';
import { useSchoolId } from '../hooks/useSchoolId';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Calendar as CalendarIcon, Plus, Trash2, Edit2,
  ChevronLeft, ChevronRight, Loader2, Info,
  X, Chrome, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';

type CalendarStatus = 'connected' | 'disconnected' | 'disabled' | 'loading';

export default function SchoolCalendar() {
  const { profile, isAdmin } = useAuth();
  const schoolId = useSchoolId();

  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [formData, setFormData] = useState<Partial<SchoolEvent>>({
    title: '',
    description: '',
    date: '',
    type: 'academic',
  });

  // Google Calendar integration status
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>('loading');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // ── Load events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'events'),
      where('schoolId', '==', schoolId),
      orderBy('date', 'asc')
    );
    return onSnapshot(
      q,
      snap => {
        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolEvent)));
        setLoading(false);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'events')
    );
  }, [schoolId]);

  // ── Load Google Calendar connection status ─────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    const ref = doc(db, 'schools', schoolId, 'integrations', 'google');
    return onSnapshot(ref, snap => {
      if (!snap.exists()) { setCalendarStatus('disconnected'); return; }
      const d = snap.data();
      if (!d.connected) { setCalendarStatus('disconnected'); return; }
      setCalendarStatus(d.enabledServices?.calendar ? 'connected' : 'disabled');
    }, () => setCalendarStatus('disconnected'));
  }, [schoolId]);

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ── Sync event to Google Calendar ──────────────────────────────────────────
  const syncToGoogle = async (firestoreId: string, eventData: Partial<SchoolEvent>, existingGoogleId?: string) => {
    if (calendarStatus !== 'connected') return;
    setSyncingId(firestoreId);
    try {
      const fns = getFunctions();
      const syncFn = httpsCallable<any, { googleEventId: string }>(fns, 'syncCalendarEvent');
      const result = await syncFn({
        schoolId,
        event: {
          title: eventData.title,
          description: eventData.description,
          date: eventData.date,
          type: eventData.type,
        },
        googleEventId: existingGoogleId,
      });
      await updateDoc(doc(db, 'events', firestoreId), {
        googleEventId: result.data.googleEventId,
      });
      toast.success('Synced to Google Calendar', { icon: '📅' });
    } catch (err: any) {
      console.error('Google sync error:', err);
      toast.error(`Google Calendar sync failed: ${err?.message ?? 'unknown error'}`);
    } finally {
      setSyncingId(null);
    }
  };

  // ── Save event ─────────────────────────────────────────────────────────────
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setSaving(true);
    try {
      let savedId: string;
      let existingGoogleId: string | undefined;

      if (editingEvent?.id) {
        await updateDoc(doc(db, 'events', editingEvent.id), { ...formData, schoolId });
        savedId = editingEvent.id;
        existingGoogleId = editingEvent.googleEventId;
      } else {
        const ref = await addDoc(collection(db, 'events'), { ...formData, schoolId });
        savedId = ref.id;
      }

      setIsModalOpen(false);
      setEditingEvent(null);
      setFormData({ title: '', description: '', date: '', type: 'academic' });

      // Sync to Google Calendar in background
      await syncToGoogle(savedId, formData, existingGoogleId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'events');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete event ───────────────────────────────────────────────────────────
  const handleDeleteEvent = async (event: SchoolEvent) => {
    if (!event.id) return;
    if (!window.confirm('Delete this event? It will also be removed from Google Calendar.')) return;
    setDeletingId(event.id);
    try {
      // Remove from Google Calendar first
      if (event.googleEventId && calendarStatus === 'connected') {
        try {
          const fns = getFunctions();
          const deleteFn = httpsCallable(fns, 'deleteCalendarEvent');
          await deleteFn({ schoolId, googleEventId: event.googleEventId });
        } catch (err) {
          console.warn('Google Calendar delete failed (continuing):', err);
        }
      }
      await deleteDoc(doc(db, 'events', event.id));
      toast.success('Event deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${event.id}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Manual sync for existing events ───────────────────────────────────────
  const handleManualSync = async (event: SchoolEvent) => {
    if (!event.id) return;
    await syncToGoogle(event.id, event, event.googleEventId);
  };

  // ── Render calendar grid ───────────────────────────────────────────────────
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-24 sm:h-32 border border-slate-100 bg-slate-50/50" />);
    }

    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      cells.push(
        <div key={day} className={`h-24 sm:h-32 border border-slate-100 p-2 relative group transition-colors hover:bg-slate-50 ${isToday ? 'bg-indigo-50/30' : 'bg-white'}`}>
          <span className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>{day}</span>
          <div className="mt-1 space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)]">
            {dayEvents.map(event => (
              <div
                key={event.id}
                onClick={() => {
                  if (isAdmin) {
                    setEditingEvent(event);
                    setFormData(event);
                    setIsModalOpen(true);
                  }
                }}
                className={`text-[10px] sm:text-xs p-1 rounded border truncate cursor-pointer transition-all flex items-center gap-1 ${
                  event.type === 'holiday'  ? 'bg-rose-50 text-rose-700 border-rose-100' :
                  event.type === 'academic' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                  event.type === 'sports'   ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  'bg-slate-50 text-slate-700 border-slate-100'
                }`}
              >
                <span className="truncate flex-1">{event.title}</span>
                {event.googleEventId && (
                  <Chrome size={8} className="shrink-0 opacity-60" />
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <button
              onClick={() => { setFormData({ ...formData, date: dateStr }); setIsModalOpen(true); }}
              className="absolute bottom-1 right-1 p-1 bg-indigo-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      );
    }
    return cells;
  };

  // ── Google Calendar status banner ──────────────────────────────────────────
  const renderGoogleBanner = () => {
    if (!isAdmin || calendarStatus === 'loading') return null;
    if (calendarStatus === 'connected') return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
        <CheckCircle2 size={14} />
        <span>Google Calendar sync is <strong>active</strong> — events saved here will appear in your Google Calendar automatically.</span>
      </div>
    );
    if (calendarStatus === 'disabled') return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
        <AlertCircle size={14} />
        <span>Google Workspace is connected but Calendar sync is <strong>disabled</strong>. <a href="/admin/integrations/google" className="underline font-semibold">Enable it here.</a></span>
      </div>
    );
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-500">
        <Chrome size={14} />
        <span>Google Calendar not connected. <a href="/admin/integrations/google" className="underline font-semibold">Connect Google Workspace</a> to sync events.</span>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">School Calendar</h1>
          <p className="text-slate-500 mt-1">Stay updated with academic dates, holidays, and school events.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditingEvent(null); setFormData({ title: '', description: '', date: '', type: 'academic' }); setIsModalOpen(true); }}
            className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Event
          </button>
        )}
      </div>

      {/* Google Calendar banner */}
      <div className="mb-6">{renderGoogleBanner()}</div>

      {/* Calendar grid */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h2 className="text-xl font-bold text-slate-900 min-w-[150px] text-center">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all">
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex items-center text-xs font-bold text-slate-500">
              <span className="w-3 h-3 bg-indigo-100 border border-indigo-200 rounded-sm mr-2" />Academic
            </div>
            <div className="flex items-center text-xs font-bold text-slate-500">
              <span className="w-3 h-3 bg-rose-100 border border-rose-200 rounded-sm mr-2" />Holiday
            </div>
            <div className="flex items-center text-xs font-bold text-slate-500">
              <span className="w-3 h-3 bg-emerald-100 border border-emerald-200 rounded-sm mr-2" />Sports
            </div>
            {calendarStatus === 'connected' && (
              <div className="flex items-center text-xs font-bold text-slate-400">
                <Chrome size={10} className="mr-1" /> Synced to Google
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-7 bg-slate-50/50">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {loading ? (
            <div className="col-span-7 py-40 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
              <p className="text-slate-400 font-medium">Loading calendar events...</p>
            </div>
          ) : renderCalendar()}
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="mt-12">
        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center">
          <CalendarIcon className="w-5 h-5 mr-3 text-indigo-600" />
          Upcoming Events
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.filter(e => new Date(e.date) >= new Date()).slice(0, 6).map(event => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  event.type === 'holiday'  ? 'bg-rose-50 text-rose-700' :
                  event.type === 'academic' ? 'bg-indigo-50 text-indigo-700' :
                  event.type === 'sports'   ? 'bg-emerald-50 text-emerald-700' :
                  'bg-slate-50 text-slate-700'
                }`}>
                  {event.type}
                </div>
                <div className="flex items-center gap-2">
                  {event.googleEventId && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                      <Chrome size={10} /> Synced
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-400">{event.date}</span>
                </div>
              </div>
              <h4 className="font-bold text-slate-900 mb-2">{event.title}</h4>
              <p className="text-sm text-slate-500 line-clamp-2">{event.description}</p>
              {isAdmin && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-1">
                  {/* Manual sync button for unsynced events */}
                  {calendarStatus === 'connected' && !event.googleEventId && (
                    <button
                      onClick={() => handleManualSync(event)}
                      disabled={syncingId === event.id}
                      className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Sync to Google Calendar"
                    >
                      {syncingId === event.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => { setEditingEvent(event); setFormData(event); setIsModalOpen(true); }}
                    className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteEvent(event)}
                    disabled={deletingId === event.id}
                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    {deletingId === event.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </motion.div>
          ))}
          {events.length === 0 && !loading && (
            <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <Info className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No events scheduled yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">
                      {editingEvent ? 'Edit Event' : 'Add New Event'}
                    </h3>
                    {calendarStatus === 'connected' && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                        <Chrome size={11} /> Will sync to Google Calendar
                      </p>
                    )}
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleSaveEvent} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Event Title</label>
                    <input
                      required type="text"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="e.g., Mid-Term Break"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date</label>
                      <input
                        required type="date"
                        value={formData.date}
                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Type</label>
                      <select
                        value={formData.type}
                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                      >
                        <option value="academic">Academic</option>
                        <option value="holiday">Holiday</option>
                        <option value="sports">Sports</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                      placeholder="Details about the event..."
                    />
                  </div>

                  <div className="pt-4 flex space-x-4">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving && <Loader2 size={15} className="animate-spin" />}
                      {editingEvent ? 'Update Event' : 'Create Event'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
