import React from 'react';
import { MapPin, LogIn, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import { TeacherCheckIn, GeoFence } from '../../types';

interface ClockInHeroProps {
  geofence: GeoFence | null;
  todayCheckIn: TeacherCheckIn | null;
  todayCheckOut: TeacherCheckIn | null;
  currentlyInFence: boolean | null;
  autoTracking: boolean;
  checkInLoading: boolean;
  onGpsEvent: (type: 'check_in' | 'check_out') => void;
}

function hoursWorkedToday(checkIn: TeacherCheckIn | null, checkOut: TeacherCheckIn | null) {
  if (!checkIn) return null;
  const inMs = checkIn.timestamp?.toDate?.()?.getTime?.() ?? null;
  if (!inMs) return null;
  const outMs = checkOut ? (checkOut.timestamp?.toDate?.()?.getTime?.() ?? Date.now()) : Date.now();
  const diffMin = Math.max(0, Math.round((outMs - inMs) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}min`;
}

/**
 * Restyled hero version of the GPS clock-in widget. Pure presentation —
 * all geofence/watchPosition state and Firestore writes stay in TeacherPortal.tsx
 * so the underlying tracking logic is untouched by this visual pass.
 */
export default function ClockInHero({
  geofence, todayCheckIn, todayCheckOut, currentlyInFence, autoTracking, checkInLoading, onGpsEvent,
}: ClockInHeroProps) {
  if (!geofence) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center shrink-0">
          <MapPin className="w-6 h-6 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-600">GPS clock-in isn't set up for this school yet</p>
          <p className="text-xs text-slate-400 mt-0.5">Ask your school admin to set the school's location boundary in School Settings to enable clock-in/out.</p>
        </div>
      </div>
    );
  }

  const hours = hoursWorkedToday(todayCheckIn, todayCheckOut);
  const fmtTime = (ev: TeacherCheckIn | null) =>
    ev ? new Date(ev.timestamp?.toDate?.() ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className={`relative overflow-hidden rounded-2xl shadow-sm p-6 mb-6 border ${
      todayCheckIn?.spoofDetected
        ? 'bg-amber-50 border-amber-200'
        : 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-700 text-white'
    }`}>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Status / greeting */}
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 relative ${
            todayCheckIn?.spoofDetected ? 'bg-amber-100' : 'bg-white/15'
          }`}>
            <MapPin className={`w-7 h-7 ${todayCheckIn?.spoofDetected ? 'text-amber-600' : 'text-white'}`} />
            {autoTracking && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-400 rounded-full border-2 border-white animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-bold ${todayCheckIn?.spoofDetected ? 'text-slate-900' : 'text-white'}`}>
              {todayCheckIn && todayCheckOut
                ? 'Done for today — have a great evening 👋'
                : todayCheckIn
                  ? 'Your teaching day is underway'
                  : 'Your teaching day starts here'}
            </p>
            <p className={`text-sm mt-0.5 ${todayCheckIn?.spoofDetected ? 'text-amber-700' : 'text-white/80'}`}>
              {todayCheckIn
                ? `In: ${fmtTime(todayCheckIn)}${todayCheckOut ? `  ·  Out: ${fmtTime(todayCheckOut)}` : '  ·  Still on campus'}${todayCheckIn.spoofDetected ? '  ·  ⚠️ Flagged for admin review' : ''}`
                : currentlyInFence === true
                  ? 'You are inside school premises — ready to check in'
                  : currentlyInFence === false
                    ? 'You are outside school premises'
                    : autoTracking ? 'Waiting for GPS signal…' : 'Open this page to activate GPS monitoring'}
            </p>
          </div>
        </div>

        {/* Stats + CTA */}
        <div className="flex items-center gap-6 shrink-0">
          {hours && (
            <div className="text-center">
              <p className={`text-2xl font-extrabold ${todayCheckIn?.spoofDetected ? 'text-slate-900' : 'text-white'}`}>{hours}</p>
              <p className={`text-xs font-medium ${todayCheckIn?.spoofDetected ? 'text-amber-600' : 'text-white/70'}`}>Hours Today</p>
            </div>
          )}

          {!todayCheckIn && (
            <button
              onClick={() => onGpsEvent('check_in')}
              disabled={checkInLoading}
              className="flex items-center gap-2 px-6 py-3.5 bg-white text-emerald-700 font-extrabold rounded-xl hover:bg-emerald-50 transition-colors text-sm disabled:opacity-60 shadow-lg shadow-black/10 shrink-0"
            >
              {checkInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {checkInLoading ? 'Verifying…' : 'CLOCK IN NOW'}
            </button>
          )}
          {todayCheckIn && !todayCheckOut && (
            <button
              onClick={() => onGpsEvent('check_out')}
              disabled={checkInLoading}
              className="flex items-center gap-2 px-6 py-3.5 bg-rose-600 text-white font-extrabold rounded-xl hover:bg-rose-700 transition-colors text-sm disabled:opacity-60 shadow-lg shadow-black/10 shrink-0"
            >
              {checkInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
              CLOCK OUT
            </button>
          )}
          {todayCheckIn && todayCheckOut && (
            <span className={`flex items-center gap-2 px-5 py-3 font-bold rounded-xl text-sm shrink-0 ${
              todayCheckIn.spoofDetected ? 'bg-white text-amber-700' : 'bg-white/15 text-white'
            }`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-300" /> Present ✓
            </span>
          )}
        </div>
      </div>

      {autoTracking && (
        <div className={`mt-4 pt-4 border-t flex items-center gap-2 text-xs font-medium ${
          todayCheckIn?.spoofDetected ? 'border-amber-200 text-amber-700' : 'border-white/20 text-white/80'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            currentlyInFence === true ? 'bg-emerald-300 animate-pulse' :
            currentlyInFence === false ? 'bg-rose-300' : 'bg-white/40'
          }`} />
          {currentlyInFence === true ? 'Currently INSIDE school boundary — GPS tracking active' :
           currentlyInFence === false ? 'Currently OUTSIDE school boundary' :
           'Acquiring GPS position…'}
          <span className="ml-auto font-normal">Auto-monitoring on</span>
        </div>
      )}
    </div>
  );
}
