/**
 * Notification service — handles:
 *  1. Requesting browser notification permission
 *  2. Registering an FCM token and persisting it in Firestore
 *  3. Showing in-app browser notifications (foreground + background)
 *
 * Push delivery when the browser is closed requires messages to be sent via
 * the FCM HTTP v1 API (e.g. from a Cloud Function).  This service handles
 * the client side: token registration and in-browser display.
 */

import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getMessagingInstance } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;

// ── Permission & Token ────────────────────────────────────────────────────────

/**
 * Requests notification permission, obtains an FCM registration token, and
 * saves it to `fcm_tokens/{uid}` in Firestore.
 *
 * Returns the token string or null when the browser doesn't support push or
 * the user declines permission.
 */
export async function initFCMForUser(uid: string): Promise<string | null> {
  if (!('Notification' in window)) return null;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  if (!VAPID_KEY) {
    console.warn(
      '[FCM] VITE_FCM_VAPID_KEY is not set. ' +
      'Get it from Firebase Console → Project Settings → Cloud Messaging ' +
      '→ Web Push certificates → Generate key pair.'
    );
    return null;
  }

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });

    if (token) {
      await setDoc(doc(db, 'fcm_tokens', uid), {
        token,
        uid,
        platform: 'web',
        updatedAt: serverTimestamp(),
      });
    }

    return token ?? null;
  } catch (err) {
    console.error('[FCM] Failed to get token:', err);
    return null;
  }
}

/**
 * Attach a foreground message listener.
 * FCM suppresses push notifications while the app is in the foreground;
 * this callback lets us handle them manually (e.g. show a toast or badge).
 *
 * Returns an unsubscribe function.
 */
export async function onForegroundMessage(
  callback: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, payload => {
    callback({
      title: payload.notification?.title ?? payload.data?.title,
      body:  payload.notification?.body  ?? payload.data?.body,
      data:  payload.data as Record<string, string> | undefined,
    });
  });
}

// ── Browser Notification helpers ──────────────────────────────────────────────

export type NotificationCategory =
  | 'check_in'
  | 'check_in_out_of_fence'
  | 'check_out'
  | 'idle_class'
  | 'absence_alert';

interface NotifyOptions {
  category: NotificationCategory;
  title: string;
  body: string;
  url?: string;
  urgent?: boolean;
}

/**
 * Shows a browser notification.  Silently no-ops if permission is not granted.
 * Uses `tag` to collapse duplicate alerts for the same category.
 */
export function showBrowserNotification({ category, title, body, url = '/admin', urgent = false }: NotifyOptions) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const n = new Notification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: category,                    // collapses duplicates of the same type
    requireInteraction: urgent,
    silent: !urgent,
    data: { url },
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };
}

// ── Pre-built notification payloads ──────────────────────────────────────────

export function notifyCheckIn(teacherName: string, time: string, withinFence: boolean) {
  if (withinFence) {
    showBrowserNotification({
      category: 'check_in',
      title: `${teacherName} checked in`,
      body: `Arrived at ${time} · Within school boundary`,
      url: '/admin?tab=today',
    });
  } else {
    showBrowserNotification({
      category: 'check_in_out_of_fence',
      title: `⚠️ Out-of-fence check-in`,
      body: `${teacherName} checked in at ${time} from OUTSIDE the school boundary`,
      url: '/admin?tab=today',
      urgent: true,
    });
  }
}

export function notifyCheckOut(teacherName: string, time: string) {
  showBrowserNotification({
    category: 'check_out',
    title: `${teacherName} checked out`,
    body: `Left at ${time}`,
    url: '/admin?tab=today',
  });
}

export function notifyIdleClass(className: string, subject: string, teacher: string, minutesLate: number) {
  showBrowserNotification({
    category: 'idle_class',
    title: `📚 Unattended class — ${className}`,
    body: `${subject} with ${teacher} started ${minutesLate} min ago but teacher has not checked in`,
    url: '/admin?tab=today',
    urgent: true,
  });
}

export function notifyAbsence(teacherName: string) {
  showBrowserNotification({
    category: 'absence_alert',
    title: `Teacher absence — ${teacherName}`,
    body: `${teacherName} has not checked in. Classes may be unattended.`,
    url: '/admin?tab=today',
    urgent: true,
  });
}
