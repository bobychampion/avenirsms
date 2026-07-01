/**
 * StaffClockWidget — GPS clock-in/out for any staff role.
 * Used in MyProfile for HR, accountant, librarian, admin, etc.
 * Teachers have this built into TeacherPortal; all other roles use this widget.
 */
import React, { useEffect, useRef, useState } from 'react';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { GeoFence, TeacherCheckIn } from '../types';
import {
  getCurrentPosition, isWithinFence, isAccuracyAcceptable, isSpoofedVelocity,
} from '../services/geofenceService';
import { doc, onSnapshot as onSnapDoc } from 'firebase/firestore';
import { MapPin, LogIn, LogOut, Clock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtTime(ev: TeacherCheckIn): string {
  const d = ev.timestamp?.toDate?.();
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function totalMinutesOnSite(events: TeacherCheckIn[]): number {
  let total = 0;
  let openIn: number | null = null;
  for (const ev of events) {
    const ms = ev.timestamp?.toMillis?.() ?? null;
    if (!ms) continue;
    if (ev.type === 'check_in') { openIn = ms; }
    else if (ev.type === 'check_out' && openIn !== null) { total += ms - openIn; openIn = null; }
  }
  if (openIn !== null) total += Date.now() - openIn;
  return Math.max(0, Math.round(total / 60000));
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function StaffClockWidget() {
  const { user, profile } = useAuth();
  const schoolId = useSchoolId();
  const [geofence, setGeofence] = useState<GeoFence | null>(null);
  const [todayEvents, setTodayEvents] = useState<TeacherCheckIn[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentlyInFence, setCurrentlyInFence] = useState<boolean | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastEventRef = useRef<TeacherCheckIn | null>(null);
  const prevInsideRef = useRef<boolean | null>(null);
  const processingRef = useRef(false);

  useEffect(() => { lastEventRef.current = todayEvents[todayEvents.length - 1] ?? null; }, [todayEvents]);

  // Subscribe to geofence
  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapDoc(doc(db, 'geofences', schoolId), snap => {
      setGeofence(snap.exists() ? ({ id: snap.id, ...snap.data() } as GeoFence) : null);
    });
    return () => unsub();
  }, [schoolId]);

  // Subscribe to today's events
  useEffect(() => {
    if (!user || !schoolId) return;
    const today = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'attendance_checkins'),
      where('schoolId', '==', schoolId),
      where('staffId', '==', user.uid),
      where('date', '==', today),
    );
    const unsub = onSnapshot(q, snap => {
      const events = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as TeacherCheckIn))
        .sort((a, b) => (a.timestamp?.toMillis?.() ?? 0) - (b.timestamp?.toMillis?.() ?? 0));
      setTodayEvents(events);
    });
    return () => unsub();
  }, [user?.uid, schoolId]);

  // Auto-detection via watchPosition
  useEffect(() => {
    if (!user || !profile || !schoolId) return;
    if (!navigator.geolocation) return;

    const recordAuto = async (type: 'check_in' | 'check_out', lat: number, lng: number, accuracy: number) => {
      if (processingRef.current) return;
      processingRef.current = true;
      try {
        const today = new Date().toISOString().split('T')[0];
        await addDoc(collection(db, 'attendance_checkins'), {
          staffId: user.uid,
          staffName: profile.displayName,
          staffRole: profile.role ?? 'staff',
          teacherId: user.uid,
          teacherName: profile.displayName,
          type,
          date: today,
          timestamp: serverTimestamp(),
          lat, lng,
          accuracy: Math.round(accuracy),
          withinFence: type === 'check_in',
          spoofDetected: false,
          autoDetected: true,
          schoolId,
        } satisfies Omit<TeacherCheckIn, 'id'>);
      } catch (e) {
        console.warn('Auto clock-in write failed:', e);
      } finally {
        processingRef.current = false;
      }
    };

    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const fence = geofence;
        if (accuracy > 150 || !fence) return;

        const inside = isWithinFence(lat, lng, fence);
        const prev = prevInsideRef.current;
        setCurrentlyInFence(inside);

        if (inside && prev === false && lastEventRef.current?.type !== 'check_in') {
          void recordAuto('check_in', lat, lng, accuracy);
        }
        if (!inside && prev === true && lastEventRef.current?.type === 'check_in') {
          void recordAuto('check_out', lat, lng, accuracy);
        }
        prevInsideRef.current = inside;
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.displayName, schoolId, geofence]);

  const handleManual = async (type: 'check_in' | 'check_out') => {
    if (!user || !profile || !schoolId) return;
    setLoading(true);
    const tid = toast.loading(type === 'check_in' ? 'Verifying location…' : 'Recording clock-out…');
    try {
      const gps = await getCurrentPosition();

      if (!isAccuracyAcceptable(gps.accuracy)) {
        toast.error(`GPS too weak (±${Math.round(gps.accuracy)} m). Move to an open area and try again.`, { id: tid });
        return;
      }

      if (geofence && type === 'check_in') {
        if (!isWithinFence(gps.lat, gps.lng, geofence)) {
          toast.error('You must be on school premises to clock in.', { id: tid, duration: 5000 });
          return;
        }
      }

      const lastEv = todayEvents[todayEvents.length - 1] ?? null;
      const previous = lastEv
        ? { lat: lastEv.lat, lng: lastEv.lng, timestamp: lastEv.timestamp?.toMillis?.() ?? Date.now() }
        : null;
      const spoofed = isSpoofedVelocity({ lat: gps.lat, lng: gps.lng, timestamp: gps.timestamp }, previous);

      const today = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'attendance_checkins'), {
        staffId: user.uid,
        staffName: profile.displayName,
        staffRole: profile.role ?? 'staff',
        teacherId: user.uid,
        teacherName: profile.displayName,
        type,
        date: today,
        timestamp: serverTimestamp(),
        lat: gps.lat,
        lng: gps.lng,
        accuracy: Math.round(gps.accuracy),
        withinFence: type === 'check_in',
        spoofDetected: spoofed,
        autoDetected: false,
        schoolId,
      } satisfies Omit<TeacherCheckIn, 'id'>);

      toast.success(
        spoofed
          ? 'Recorded — flagged for admin review (unusual location jump).'
          : type === 'check_in' ? 'Clocked in!' : 'Clocked out!',
        { id: tid },
      );
    } catch (err: any) {
      toast.error(err.message || 'Location error. Please try again.', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  if (!geofence) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 flex items-center gap-3">
        <MapPin className="w-5 h-5 text-slate-300 shrink-0" />
        <p className="text-sm text-slate-400">GPS attendance not configured — ask your admin to set the school boundary in Settings.</p>
      </div>
    );
  }

  const lastEvent = todayEvents[todayEvents.length - 1] ?? null;
  const currentlyIn = lastEvent?.type === 'check_in';
  const firstCheckIn = todayEvents.find(e => e.type === 'check_in') ?? null;
  const totalMin = firstCheckIn ? totalMinutesOnSite(todayEvents) : null;

  return (
    <div className={`rounded-2xl border p-5 ${
      currentlyIn
        ? 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-700 text-white'
        : 'bg-white border-slate-200'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            currentlyIn ? 'bg-white/15' : 'bg-emerald-50'
          }`}>
            <MapPin className={`w-5 h-5 ${currentlyIn ? 'text-white' : 'text-emerald-600'}`} />
          </div>
          <div>
            <p className={`text-sm font-bold ${currentlyIn ? 'text-white' : 'text-slate-900'}`}>
              {!firstCheckIn ? 'Not yet clocked in' : currentlyIn ? 'On campus' : 'Off campus'}
            </p>
            <p className={`text-xs mt-0.5 ${currentlyIn ? 'text-white/70' : 'text-slate-400'}`}>
              {currentlyInFence === true ? 'Inside school boundary' :
               currentlyInFence === false ? 'Outside school boundary' :
               'GPS monitoring active'}
              {totalMin !== null && ` · ${fmtDuration(totalMin)} today`}
            </p>
          </div>
        </div>

        {/* Action button */}
        {!currentlyIn ? (
          <button
            onClick={() => handleManual('check_in')}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? '…' : firstCheckIn ? 'Clock In Again' : 'Clock In'}
          </button>
        ) : (
          <button
            onClick={() => handleManual('check_out')}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 text-white text-sm font-bold rounded-xl hover:bg-rose-600 disabled:opacity-60 transition-colors shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {loading ? '…' : 'Clock Out'}
          </button>
        )}
      </div>

      {/* Event timeline */}
      {todayEvents.length > 0 && (
        <div className={`pt-3 border-t ${currentlyIn ? 'border-white/20' : 'border-slate-100'}`}>
          <p className={`text-[11px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${
            currentlyIn ? 'text-white/60' : 'text-slate-400'
          }`}>
            <Clock className="w-3 h-3" /> Today
          </p>
          <div className="flex flex-wrap gap-2">
            {todayEvents.map((ev, i) => (
              <span key={ev.id ?? i} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                ev.type === 'check_in'
                  ? currentlyIn ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                  : currentlyIn ? 'bg-rose-500/30 text-white' : 'bg-rose-50 text-rose-700'
              }`}>
                {ev.type === 'check_in' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                {ev.type === 'check_in' ? 'In' : 'Out'} {fmtTime(ev)}
                {ev.spoofDetected && ' ⚠️'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
