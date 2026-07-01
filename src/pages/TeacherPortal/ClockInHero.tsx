import React from 'react';
import { MapPin, LogIn, LogOut, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { TeacherCheckIn } from '../../types';

interface ClockInHeroProps {
  geofence: { lat: number; lng: number; radius: number } | null;
  todayEvents: TeacherCheckIn[];
  currentlyInFence: boolean | null;
  autoTracking: boolean;
  checkInLoading: boolean;
  onGpsEvent: (type: 'check_in' | 'check_out') => void;
}

function fmtTime(ev: TeacherCheckIn): string {
  const d = ev.timestamp?.toDate?.();
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Total minutes on-premises: sum each (check_out - check_in) pair; add ongoing if still inside. */
function totalMinutesOnSite(events: TeacherCheckIn[]): number {
  let total = 0;
  let openIn: number | null = null;
  for (const ev of events) {
    const ms = ev.timestamp?.toMillis?.() ?? null;
    if (!ms) continue;
    if (ev.type === 'check_in') {
      openIn = ms;
    } else if (ev.type === 'check_out' && openIn !== null) {
      total += ms - openIn;
      openIn = null;
    }
  }
  // still inside
  if (openIn !== null) total += Date.now() - openIn;
  return Math.max(0, Math.round(total / 60000));
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function ClockInHero({
  geofence, todayEvents, currentlyInFence, autoTracking, checkInLoading, onGpsEvent,
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

  const lastEvent = todayEvents[todayEvents.length - 1] ?? null;
  const currentlyIn = lastEvent?.type === 'check_in';
  const firstCheckIn = todayEvents.find(e => e.type === 'check_in') ?? null;
  const anySpoofed = todayEvents.some(e => e.spoofDetected);
  const totalMin = firstCheckIn ? totalMinutesOnSite(todayEvents) : null;

  return (
    <div className={`relative overflow-hidden rounded-2xl shadow-sm p-6 mb-6 border ${
      anySpoofed
        ? 'bg-amber-50 border-amber-200'
        : 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-700 text-white'
    }`}>
      {/* ── Header row ── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Status */}
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 relative ${
            anySpoofed ? 'bg-amber-100' : 'bg-white/15'
          }`}>
            <MapPin className={`w-7 h-7 ${anySpoofed ? 'text-amber-600' : 'text-white'}`} />
            {autoTracking && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-400 rounded-full border-2 border-white animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-bold ${anySpoofed ? 'text-slate-900' : 'text-white'}`}>
              {!firstCheckIn
                ? 'Your day starts here'
                : currentlyIn
                  ? 'You are on campus'
                  : 'Currently off campus'}
            </p>
            <p className={`text-sm mt-0.5 ${anySpoofed ? 'text-amber-700' : 'text-white/80'}`}>
              {!firstCheckIn
                ? currentlyInFence === true
                  ? 'You are inside school premises — ready to clock in'
                  : currentlyInFence === false
                    ? 'You are outside school premises'
                    : autoTracking ? 'Waiting for GPS signal…' : 'Open this page to activate GPS monitoring'
                : anySpoofed
                  ? '⚠️ One or more events flagged for admin review'
                  : `${todayEvents.filter(e => e.type === 'check_in').length} check-in${todayEvents.filter(e => e.type === 'check_in').length !== 1 ? 's' : ''} recorded today`}
            </p>
          </div>
        </div>

        {/* Total time + CTA */}
        <div className="flex items-center gap-6 shrink-0">
          {totalMin !== null && (
            <div className="text-center">
              <p className={`text-2xl font-extrabold ${anySpoofed ? 'text-slate-900' : 'text-white'}`}>
                {fmtDuration(totalMin)}
              </p>
              <p className={`text-xs font-medium ${anySpoofed ? 'text-amber-600' : 'text-white/70'}`}>On Campus</p>
            </div>
          )}

          {!currentlyIn && (
            <button
              onClick={() => onGpsEvent('check_in')}
              disabled={checkInLoading}
              className="flex items-center gap-2 px-6 py-3.5 bg-white text-emerald-700 font-extrabold rounded-xl hover:bg-emerald-50 transition-colors text-sm disabled:opacity-60 shadow-lg shadow-black/10 shrink-0"
            >
              {checkInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {checkInLoading ? 'Verifying…' : firstCheckIn ? 'CLOCK IN AGAIN' : 'CLOCK IN'}
            </button>
          )}
          {currentlyIn && (
            <button
              onClick={() => onGpsEvent('check_out')}
              disabled={checkInLoading}
              className="flex items-center gap-2 px-6 py-3.5 bg-rose-600 text-white font-extrabold rounded-xl hover:bg-rose-700 transition-colors text-sm disabled:opacity-60 shadow-lg shadow-black/10 shrink-0"
            >
              {checkInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
              CLOCK OUT
            </button>
          )}
        </div>
      </div>

      {/* ── Today's event timeline ── */}
      {todayEvents.length > 0 && (
        <div className={`mt-5 pt-4 border-t ${anySpoofed ? 'border-amber-200' : 'border-white/20'}`}>
          <p className={`text-[11px] font-bold uppercase tracking-widest mb-2.5 flex items-center gap-1.5 ${anySpoofed ? 'text-slate-500' : 'text-white/60'}`}>
            <Clock className="w-3 h-3" /> Today's timeline
          </p>
          <div className="flex flex-wrap gap-2">
            {todayEvents.map((ev, i) => (
              <div key={ev.id ?? i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                ev.type === 'check_in'
                  ? anySpoofed ? 'bg-emerald-100 text-emerald-800' : 'bg-white/20 text-white'
                  : anySpoofed ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/40 text-white'
              }`}>
                {ev.type === 'check_in'
                  ? <LogIn className="w-3.5 h-3.5" />
                  : <LogOut className="w-3.5 h-3.5" />}
                {ev.type === 'check_in' ? 'In' : 'Out'} {fmtTime(ev)}
                {ev.spoofDetected && <span className="ml-1">⚠️</span>}
                {ev.autoDetected && <span title="Auto-detected" className={`w-1.5 h-1.5 rounded-full ${anySpoofed ? 'bg-blue-400' : 'bg-blue-300'}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GPS tracking status bar ── */}
      {autoTracking && (
        <div className={`mt-3 pt-3 border-t flex items-center gap-2 text-xs font-medium ${
          anySpoofed ? 'border-amber-200 text-amber-700' : 'border-white/20 text-white/80'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            currentlyInFence === true ? 'bg-emerald-300 animate-pulse' :
            currentlyInFence === false ? 'bg-rose-300' : 'bg-white/40'
          }`} />
          {currentlyInFence === true ? 'Inside school boundary' :
           currentlyInFence === false ? 'Outside school boundary' :
           'Acquiring GPS…'}
          <span className="ml-auto font-normal opacity-70">Auto-monitoring on</span>
        </div>
      )}

      {/* ── "All good" badge when clocked out for the day ── */}
      {!currentlyIn && firstCheckIn && todayEvents.length >= 2 && (
        <div className={`mt-3 flex items-center gap-2 text-xs font-semibold ${anySpoofed ? 'text-amber-700' : 'text-white/80'}`}>
          <CheckCircle2 className="w-4 h-4" />
          Attendance recorded — clock in again if you return to campus.
        </div>
      )}
    </div>
  );
}
