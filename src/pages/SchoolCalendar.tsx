import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { collection, query, onSnapshot, orderBy, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { SchoolEvent } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, Plus, Trash2, Edit2, 
  ChevronLeft, ChevronRight, Loader2, Info, 
  MapPin, Clock, AlertCircle, CheckCircle2, X
} from 'lucide-react';

export default function SchoolCalendar() {
  const { profile, isAdmin } = useAuth();
  
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [formData, setFormData] = useState<Partial<SchoolEvent>>({
    title: '',
    description: '',
    date: '',
    type: 'academic'
  });

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'events'));

    return () => unsubscribe();
  }, []);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEvent?.id) {
        await updateDoc(doc(db, 'events', editingEvent.id), formData);
      } else {
        await addDoc(collection(db, 'events'), formData);
      }
      setIsModalOpen(false);
      setEditingEvent(null);
      setFormData({ title: '', description: '', date: '', type: 'academic' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'events');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${id}`);
    }
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);
    const calendarDays = [];

    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
      calendarDays.push(<div key={`empty-${i}`} className="h-24 sm:h-32 border border-slate-100 bg-slate-50/50" />);
    }

    // Days of the month
    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      calendarDays.push(
        <div key={day} className={`h-24 sm:h-32 border border-slate-100 p-2 relative group transition-colors hover:bg-slate-50 ${isToday ? 'bg-indigo-50/30' : 'bg-white'}`}>
          <span className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
            {day}
          </span>
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
                className={`text-[10px] sm:text-xs p-1 rounded border truncate cursor-pointer transition-all ${
                  event.type === 'holiday' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                  event.type === 'academic' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                  event.type === 'sports' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  'bg-slate-50 text-slate-700 border-slate-100'
                }`}
              >
                {event.title}
              </div>
            ))}
          </div>
          {isAdmin && (
            <button 
              onClick={() => {
                setFormData({ ...formData, date: dateStr });
                setIsModalOpen(true);
              }}
              className="absolute bottom-1 right-1 p-1 bg-indigo-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      );
    }

    return calendarDays;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">School Calendar</h1>
          <p className="text-slate-500 mt-1">Stay updated with academic dates, holidays, and school events.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingEvent(null);
              setFormData({ title: '', description: '', date: '', type: 'academic' });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Event
          </button>
        )}
      </div>

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
          <div className="hidden sm:flex items-center space-x-4">
            <div className="flex items-center text-xs font-bold text-slate-500">
              <span className="w-3 h-3 bg-indigo-100 border border-indigo-200 rounded-sm mr-2" />
              Academic
            </div>
            <div className="flex items-center text-xs font-bold text-slate-500">
              <span className="w-3 h-3 bg-rose-100 border border-rose-200 rounded-sm mr-2" />
              Holiday
            </div>
            <div className="flex items-center text-xs font-bold text-slate-500">
              <span className="w-3 h-3 bg-emerald-100 border border-emerald-200 rounded-sm mr-2" />
              Sports
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 bg-slate-50/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
            <div key={day} className="py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
              {day}
            </div>
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

      {/* Upcoming Events List */}
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
                  event.type === 'holiday' ? 'bg-rose-50 text-rose-700' :
                  event.type === 'academic' ? 'bg-indigo-50 text-indigo-700' :
                  event.type === 'sports' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-slate-50 text-slate-700'
                }`}>
                  {event.type}
                </div>
                <span className="text-xs font-bold text-slate-400">{event.date}</span>
              </div>
              <h4 className="font-bold text-slate-900 mb-2">{event.title}</h4>
              <p className="text-sm text-slate-500 line-clamp-2">{event.description}</p>
              {isAdmin && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end space-x-2">
                  <button 
                    onClick={() => {
                      setEditingEvent(event);
                      setFormData(event);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteEvent(event.id!)}
                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
                  <h3 className="text-2xl font-bold text-slate-900">
                    {editingEvent ? 'Edit Event' : 'Add New Event'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleSaveEvent} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Event Title</label>
                    <input
                      required
                      type="text"
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
                        required
                        type="date"
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
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
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
