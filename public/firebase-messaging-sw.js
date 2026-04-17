/**
 * Firebase Cloud Messaging service worker.
 *
 * This file must live at /firebase-messaging-sw.js (public root) so the
 * browser can register it at the correct scope for web push.
 *
 * It uses the Firebase compat CDN scripts because service workers cannot
 * import ES-module bundles via a build tool.
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Initialise Firebase inside the SW with the same project config.
// Keep this in sync with firebase-applet-config.json.
firebase.initializeApp({
  apiKey:            'AIzaSyAGOgrl7k2lz2I-yiI6Mt2BwJvOoOsAq_E',
  authDomain:        'avenir-33ab7.firebaseapp.com',
  projectId:         'avenir-33ab7',
  storageBucket:     'avenir-33ab7.firebasestorage.app',
  messagingSenderId: '667778034571',
  appId:             '1:667778034571:web:66bade60c95f36b4a79d8e',
});

const messaging = firebase.messaging();

/**
 * Handle background push messages (app is closed or in a background tab).
 * FCM automatically shows a notification for messages that contain a
 * `notification` payload; this handler lets you customise the behaviour for
 * data-only messages or add extra actions.
 */
messaging.onBackgroundMessage(payload => {
  const { title = 'Avenir SIS', body = '', icon = '/favicon.svg', tag, data } = {
    title: payload.notification?.title || payload.data?.title,
    body:  payload.notification?.body  || payload.data?.body,
    icon:  payload.notification?.icon  || '/favicon.svg',
    tag:   payload.data?.tag,
    data:  payload.data,
  };

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/favicon.svg',
    tag,                          // collapses duplicate alerts of the same type
    requireInteraction: data?.urgent === 'true',
    data,
  });
});

// Open / focus the app when the user clicks the notification.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
