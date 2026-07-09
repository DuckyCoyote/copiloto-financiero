/**
 * Service Worker del Copilot Financiero.
 *
 * Se registra desde main.ts. Su propósito principal es permitir
 * `self.registration.showNotification(...)` para que las
 * notificaciones funcionen en contextos donde Chrome bloquea
 * `new Notification(...)` (por ejemplo, cuando la app está
 * instalada como PWA).
 */

self.addEventListener('install', (event) => {
  // Activa el SW inmediatamente sin esperar a que se cierren pestañas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Toma el control de las páginas abiertas al activarse
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  // Cuando el usuario hace clic en la notificación, abre/enfoca la app
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una pestaña abierta, la enfocamos
      for (const client of clientList) {
        if ('focus' in client && 'visibilityState' in client) {
          return client.focus();
        }
      }
      // Si no, abrimos una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Mensaje desde la app para mostrar una notificación
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options).catch((err) => {
      console.error('[SW] showNotification error:', err);
    });
  }
});
