import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Notification } from '../types';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from './useSchoolId';

const RECENT_LIMIT = 30;

/**
 * Live feed of the signed-in user's notifications (their own uid plus any
 * school-wide 'all' broadcasts), most recent first. Backs the notification
 * bell shown in Layout.tsx / StaffLayout.tsx.
 */
export function useNotifications() {
  const { user } = useAuth();
  const schoolId = useSchoolId();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !schoolId) { setNotifications([]); setLoading(false); return; }
    const q = query(
      collection(db, 'notifications'),
      where('schoolId', '==', schoolId),
      where('recipientId', 'in', [user.uid, 'all']),
      orderBy('createdAt', 'desc'),
      limit(RECENT_LIMIT)
    );
    const unsub = onSnapshot(q, snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user, schoolId]);

  // 'all' broadcasts have no per-user read receipt (firestore.rules only lets
  // the exact recipientId match flip `read`, and 'all' never matches a uid) —
  // they stay visible in the list but don't count toward the unread badge,
  // and clicking one never attempts a write that the rules would reject.
  const unreadCount = notifications.filter(n => !n.read && n.recipientId !== 'all').length;

  const markRead = async (id: string) => {
    const target = notifications.find(n => n.id === id);
    if (!target || target.recipientId === 'all') return;
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err: any) {
      console.error('[useNotifications] markRead failed:', err.code, err.message);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read && n.id && n.recipientId !== 'all');
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id!), { read: true }));
    try {
      await batch.commit();
    } catch (err: any) {
      console.error('[useNotifications] markAllRead failed:', err.code, err.message);
    }
  };

  return { notifications, unreadCount, loading, markRead, markAllRead };
}
