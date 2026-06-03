/**
 * Trip Register — manage school trips and student registrations.
 *
 * Data model
 * ──────────
 * `school_trips`: title, destination, departureDate, returnDate,
 *   description, maxStudents, cost (₦), status, schoolId, createdAt
 *
 * `trip_registrations`: tripId, tripTitle, studentId, studentName,
 *   class, consentReceived, feePaid, notes, schoolId, registeredAt
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, deleteDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { Student } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bus, Plus, Edit2, Trash2, Users, Search, X, Loader2,
  MapPin, Calendar, DollarSign, ChevronDown, ChevronUp,
  CheckCircle2, Circle, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SchoolTrip {
  id?: string;
  title: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  description: string;
  maxStudents: number;
  cost: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  schoolId: string;
  createdAt: any;
}

interface TripRegistration {
  id?: string;
  tripId: string;
  tripTitle: string;
  studentId: string;
  studentName: string;
  class: string;
  consentReceived: boolean;
  feePaid: boolean;
  notes: string;
  schoolId: string;
  registeredAt: any;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ongoing: { label: 'Ongoing', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  completed: { label: 'Completed', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const emptyTrip = (): Omit<SchoolTrip, 'id' | 'schoolId' | 'createdAt'> => ({
  title: '', destination: '', departureDate: '', returnDate: '',
  description: '', maxStudents: 30, cost: 0, status: 'upcoming',
});

export default function TripRegister() {
  const { schoolId } = useSchool();

  const [trips, setTrips] = useState<SchoolTrip[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [registrations, setRegistrations] = useState<TripRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [showTripForm, setShowTripForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<SchoolTrip | null>(null);
  const [tripForm, setTripForm] = useState(emptyTrip());
  const [tripSaving, setTripSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [regSaving, setRegSaving] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'school_trips'), where('schoolId', '==', schoolId));
    const unsubTrips = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolTrip)));
      setLoading(false);
    }, () => setLoading(false));

    const qReg = query(collection(db, 'trip_registrations'), where('schoolId', '==', schoolId));
    const unsubReg = onSnapshot(qReg, snap => {
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() } as TripRegistration)));
    });

    getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId))).then(snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    });

    return () => { unsubTrips(); unsubReg(); };
  }, [schoolId]);

  const filteredTrips = trips.filter(t =>
    (statusFilter === 'all' || t.status === statusFilter)
  ).sort((a, b) => a.departureDate.localeCompare(b.departureDate));

  const openCreate = () => { setEditingTrip(null); setTripForm(emptyTrip()); setShowTripForm(true); };
  const openEdit = (t: SchoolTrip) => {
    setEditingTrip(t);
    setTripForm({ title: t.title, destination: t.destination, departureDate: t.departureDate, returnDate: t.returnDate, description: t.description, maxStudents: t.maxStudents, cost: t.cost, status: t.status });
    setShowTripForm(true);
  };

  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setTripSaving(true);
    try {
      if (editingTrip?.id) {
        await updateDoc(doc(db, 'school_trips', editingTrip.id), { ...tripForm, updatedAt: serverTimestamp() });
        toast.success('Trip updated.');
      } else {
        await addDoc(collection(db, 'school_trips'), { ...tripForm, schoolId, createdAt: serverTimestamp() });
        toast.success('Trip created.');
      }
      setShowTripForm(false);
    } catch { toast.error('Failed to save trip.'); }
    finally { setTripSaving(false); }
  };

  const handleDeleteTrip = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'school_trips', id));
      toast.success('Trip deleted.');
      setDeleteConfirm(null);
      if (expandedTrip === id) setExpandedTrip(null);
    } catch { toast.error('Failed to delete.'); }
  };

  const tripRegs = (tripId: string) => registrations.filter(r => r.tripId === tripId);

  const availableStudents = (tripId: string) => {
    const registered = new Set(tripRegs(tripId).map(r => r.studentId));
    return students.filter(s =>
      !registered.has(s.id!) &&
      s.studentName.toLowerCase().includes(studentSearch.toLowerCase())
    ).slice(0, 8);
  };

  const handleRegister = async (trip: SchoolTrip, student: Student) => {
    if (!schoolId || !trip.id || !student.id) return;
    setRegSaving(student.id);
    try {
      await addDoc(collection(db, 'trip_registrations'), {
        tripId: trip.id,
        tripTitle: trip.title,
        studentId: student.id,
        studentName: student.studentName ?? '',
        class: student.currentClass ?? '',
        consentReceived: false,
        feePaid: false,
        notes: '',
        schoolId,
        registeredAt: serverTimestamp(),
      } satisfies Omit<TripRegistration, 'id'>);
      toast.success(`${student.studentName} registered.`);
      setStudentSearch('');
    } catch (err: any) {
      console.error('[TripRegister] register failed:', err?.code, err?.message, err);
      toast.error(err?.code === 'permission-denied'
        ? 'Permission denied — check you are logged in as admin.'
        : `Failed to register: ${err?.message ?? 'unknown error'}`);
    } finally { setRegSaving(null); }
  };

  const handleRemoveReg = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'trip_registrations', id));
      toast.success('Registration removed.');
    } catch (err: any) {
      console.error('[TripRegister] remove failed:', err?.code, err?.message);
      toast.error('Failed to remove registration.');
    }
  };

  const toggleField = async (reg: TripRegistration, field: 'consentReceived' | 'feePaid') => {
    if (!reg.id) return;
    setRegSaving(reg.id);
    try {
      await updateDoc(doc(db, 'trip_registrations', reg.id), { [field]: !reg[field] });
    } catch (err: any) {
      console.error('[TripRegister] toggle failed:', err?.code, err?.message);
      toast.error('Failed to update.');
    } finally { setRegSaving(null); }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Administration</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Trip Register</h1>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Trip
        </button>
      </div>

      {/* Trip Form Modal */}
      <AnimatePresence>
        {showTripForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto"
            onClick={() => setShowTripForm(false)}>
            <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onSubmit={handleSaveTrip}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 my-8"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-lg">{editingTrip ? 'Edit Trip' : 'New School Trip'}</h3>
                <button type="button" onClick={() => setShowTripForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Trip Title *</label>
                  <input required placeholder="e.g. Science Museum Visit" value={tripForm.title}
                    onChange={e => setTripForm({ ...tripForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Destination *</label>
                  <input required placeholder="e.g. Lagos Science Museum" value={tripForm.destination}
                    onChange={e => setTripForm({ ...tripForm, destination: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Departure Date *</label>
                  <input required type="date" value={tripForm.departureDate}
                    onChange={e => setTripForm({ ...tripForm, departureDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Return Date</label>
                  <input type="date" value={tripForm.returnDate}
                    onChange={e => setTripForm({ ...tripForm, returnDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Max Students</label>
                  <input type="number" min="1" value={tripForm.maxStudents}
                    onChange={e => setTripForm({ ...tripForm, maxStudents: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cost per Student (₦)</label>
                  <input type="number" min="0" value={tripForm.cost}
                    onChange={e => setTripForm({ ...tripForm, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Status</label>
                  <select value={tripForm.status} onChange={e => setTripForm({ ...tripForm, status: e.target.value as SchoolTrip['status'] })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Description / Notes</label>
                  <textarea value={tripForm.description}
                    onChange={e => setTripForm({ ...tripForm, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowTripForm(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" disabled={tripSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {tripSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingTrip ? 'Update' : 'Create Trip'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['all', 'upcoming', 'ongoing', 'completed', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
              statusFilter === s ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Trip Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : filteredTrips.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Bus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No trips found. Click "New Trip" to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrips.map(trip => {
            const regs = tripRegs(trip.id!);
            const expanded = expandedTrip === trip.id;
            const spotsLeft = trip.maxStudents - regs.length;
            return (
              <motion.div key={trip.id} layout className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Trip Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-slate-900">{trip.title}</h3>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_CONFIG[trip.status].cls}`}>
                          {STATUS_CONFIG[trip.status].label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.destination}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{trip.departureDate}{trip.returnDate ? ` → ${trip.returnDate}` : ''}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{regs.length}/{trip.maxStudents} registered</span>
                        {trip.cost > 0 && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />₦{trip.cost.toLocaleString()}</span>}
                      </div>
                      {trip.description && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{trip.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(trip)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm(trip.id!)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      <button onClick={() => setExpandedTrip(expanded ? null : trip.id!)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (regs.length / trip.maxStudents) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{spotsLeft} spots left</span>
                  </div>
                </div>

                {/* Expanded — registrations */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-5 pb-5 border-t border-slate-100">
                        {/* Register new student */}
                        {spotsLeft > 0 && (
                          <div className="mt-4">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Add Student</label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input placeholder="Search students…" value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            {studentSearch && (
                              <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-sm max-h-40 overflow-y-auto">
                                {availableStudents(trip.id!).length === 0
                                  ? <p className="px-3 py-3 text-sm text-slate-400">No students match or all are registered.</p>
                                  : availableStudents(trip.id!).map(s => (
                                    <button key={s.id} disabled={regSaving === s.id}
                                      onClick={() => handleRegister(trip, s)}
                                      className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-sm text-slate-700 transition-colors flex items-center justify-between">
                                      <span>{s.studentName} <span className="text-slate-400 text-xs">· {s.currentClass}</span></span>
                                      {regSaving === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <Plus className="w-3.5 h-3.5 text-indigo-600" />}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Registered students */}
                        {regs.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-xs font-bold text-slate-500 uppercase">Registered ({regs.length})</p>
                            {regs.map(reg => (
                              <div key={reg.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-900">{reg.studentName}</p>
                                  <p className="text-xs text-slate-500">{reg.class}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => toggleField(reg, 'consentReceived')} disabled={regSaving === reg.id}
                                    title="Consent received?" className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors border border-slate-200 bg-white hover:border-emerald-300">
                                    {reg.consentReceived ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5 text-slate-300" />}
                                    <span className={reg.consentReceived ? 'text-emerald-600' : 'text-slate-400'}>Consent</span>
                                  </button>
                                  <button onClick={() => toggleField(reg, 'feePaid')} disabled={regSaving === reg.id}
                                    title="Fee paid?" className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors border border-slate-200 bg-white hover:border-emerald-300">
                                    {reg.feePaid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5 text-slate-300" />}
                                    <span className={reg.feePaid ? 'text-emerald-600' : 'text-slate-400'}>Paid</span>
                                  </button>
                                  <button onClick={() => handleRemoveReg(reg.id!)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {regs.length === 0 && <p className="mt-4 text-xs text-slate-400 text-center py-4">No students registered yet.</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center">
              <Trash2 className="w-10 h-10 text-rose-500 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 text-lg mb-2">Delete Trip?</h3>
              <p className="text-sm text-slate-500 mb-6">This will not remove student registrations automatically.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                <button onClick={() => handleDeleteTrip(deleteConfirm)} className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors text-sm">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
