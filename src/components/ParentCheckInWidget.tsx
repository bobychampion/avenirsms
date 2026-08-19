/**
 * ParentCheckInWidget — lets a parent register a drop-off or pickup for
 * their child(ren). Deliberately no GPS/geofence — just a timestamped log
 * the parent taps themselves, written to pickup_dropoff_logs (separate from
 * the staff GPS attendance_checkins collection, which this has nothing to
 * do with).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, limit as fbLimit, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { Student, PickupDropoffLog } from '../types';
import { Car, Footprints, Loader2, Clock, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ParentCheckInWidget() {
  const { user, profile } = useAuth();
  const schoolId = useSchoolId();
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recentLogs, setRecentLogs] = useState<PickupDropoffLog[]>([]);
  const [loading, setLoading] = useState<'dropoff' | 'pickup' | null>(null);

  useEffect(() => {
    if (!user || !schoolId) return;
    const strategies = [
      query(collection(db, 'students'), where('schoolId', '==', schoolId), where('guardianEmail', '==', user.email)),
      query(collection(db, 'students'), where('schoolId', '==', schoolId), where('guardianUserId', '==', user.uid)),
      query(collection(db, 'students'), where('schoolId', '==', schoolId), where('guardian2Email', '==', user.email)),
      query(collection(db, 'students'), where('schoolId', '==', schoolId), where('guardian2UserId', '==', user.uid)),
    ];
    Promise.all(strategies.map(q => getDocs(q))).then(snaps => {
      const map = new Map<string, Student>();
      snaps.forEach(snap => snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() } as Student)));
      const all = Array.from(map.values());
      setChildren(all);
      setSelectedIds(new Set(all.map(c => c.id!)));
    }).catch(() => {});
  }, [user?.uid, user?.email, schoolId]);

  useEffect(() => {
    if (!user || !schoolId) return;
    getDocs(query(
      collection(db, 'pickup_dropoff_logs'),
      where('schoolId', '==', schoolId),
      where('parentUid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      fbLimit(5),
    )).then(snap => {
      setRecentLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as PickupDropoffLog)));
    }).catch(() => {});
  }, [user?.uid, schoolId]);

  const toggleChild = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const log = async (type: 'dropoff' | 'pickup') => {
    if (!user || !profile || !schoolId) return;
    if (selectedIds.size === 0) { toast.error('Select at least one child'); return; }
    setLoading(type);
    try {
      const selected = children.filter(c => selectedIds.has(c.id!));
      const newLog: Omit<PickupDropoffLog, 'id'> = {
        schoolId,
        parentUid: user.uid,
        parentName: profile.displayName,
        type,
        childIds: selected.map(c => c.id!),
        childNames: selected.map(c => c.studentName),
        timestamp: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'pickup_dropoff_logs'), newLog);
      setRecentLogs(prev => [{ id: ref.id, ...newLog, timestamp: { toDate: () => new Date() } }, ...prev].slice(0, 5));
      toast.success(`${type === 'dropoff' ? 'Drop-off' : 'Pickup'} registered for ${selected.map(c => c.studentName).join(', ')}`);
    } catch {
      toast.error('Failed to register — please try again');
    } finally {
      setLoading(null);
    }
  };

  const fmtTime = (log: PickupDropoffLog) => {
    const d = log.timestamp?.toDate?.();
    if (!d) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 flex items-center gap-3">
        <Car className="w-5 h-5 text-slate-300 shrink-0" />
        <p className="text-sm text-slate-400">No linked children found yet — once a child is linked to your account, you can register their drop-off/pickup here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {children.map(c => (
            <button key={c.id} onClick={() => toggleChild(c.id!)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                selectedIds.has(c.id!) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-sky-300'
              }`}
            >
              {selectedIds.has(c.id!) && <Check className="w-3 h-3" />} {c.studentName}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => log('dropoff')} disabled={loading !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
        >
          {loading === 'dropoff' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Footprints className="w-4 h-4" />}
          Drop-off
        </button>
        <button onClick={() => log('pickup')} disabled={loading !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
        >
          {loading === 'pickup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
          Pickup
        </button>
      </div>

      {recentLogs.length > 0 && (
        <div className="pt-4 mt-4 border-t border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3" /> Recent
          </p>
          <div className="space-y-1.5">
            {recentLogs.map(l => (
              <div key={l.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  <span className={`font-semibold ${l.type === 'dropoff' ? 'text-sky-600' : 'text-emerald-600'}`}>
                    {l.type === 'dropoff' ? 'Dropped off' : 'Picked up'}
                  </span> {l.childNames.join(', ')}
                </span>
                <span className="text-slate-400">{fmtTime(l)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
