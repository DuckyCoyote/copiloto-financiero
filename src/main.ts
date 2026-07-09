import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

/**
 * Registra el service worker para poder mostrar notificaciones
 * desde la app (Chrome requiere `registration.showNotification()`
 * en lugar de `new Notification()` cuando hay un SW activo).
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.log('[SW] registrado, scope:', reg.scope),
      (err) => console.warn('[SW] error al registrar:', err)
    );
  });
}
