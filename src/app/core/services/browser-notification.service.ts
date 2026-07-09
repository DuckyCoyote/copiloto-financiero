import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { STORAGE_KEYS, StorageService } from './storage.service';
import { FinanceDataService } from './finance-data.service';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';

/**
 * Notificaciones del navegador (Web Notifications API).
 *
 * - El usuario debe conceder permiso explícitamente.
 * - Cuando está activo, agenda avisos a las 09:00, 14:00 y 20:00
 *   hora local con un resumen de los pagos del día siguiente.
 * - Si la app está cerrada no se pueden enviar (limitación de la
 *   Web Notifications API). El programador se reinicia cada vez
 *   que la app se abre o se cambian los datos.
 * - Convive con `NotificationService` (bandeja in-app) y con
 *   `ToastService` (toasts efímeros): las notificaciones críticas
 *   aparecen también como toast y como entrada en la bandeja.
 */

const SCHEDULE_HOURS = [9, 14, 20]; // hora local a la que se envía el aviso

const STORAGE_KEY = 'cf:browser-notifications';

interface PersistedState {
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class BrowserNotificationService {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceDataService);
  private readonly toast = inject(ToastService);
  private readonly notifications: NotificationService = inject(NotificationService);

  private readonly _enabled = signal<boolean>(
    this.storage.read<PersistedState>(STORAGE_KEY, { enabled: false }).enabled
  );
  readonly enabled = this._enabled.asReadonly();

  private readonly _permission = signal<NotificationPermission>(
    this.detectPermission()
  );
  readonly permission = this._permission.asReadonly();

  readonly supported = typeof window !== 'undefined' && 'Notification' in window;
  readonly blocked = computed(() => this.supported && this._permission() === 'denied');
  readonly ready = computed(() => this.supported && this._enabled() && this._permission() === 'granted');

  /** Próximo envío programado. */
  readonly nextRun = signal<Date | null>(null);

  private timeoutRef: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Cuando cambia la configuración o los datos, recalcula el siguiente envío.
    effect(() => {
      const enabled = this._enabled();
      const perm = this._permission();
      this.storage.write<PersistedState>(STORAGE_KEY, { enabled });

      if (enabled && perm === 'granted' && this.supported) {
        this.scheduleNext();
      } else {
        this.cancelSchedule();
        this.nextRun.set(null);
      }
    }, { allowSignalWrites: true });

    // Si cambian los datos, podría haber nuevos pagos que valga la
    // pena mencionar. Reprogramamos para incorporar la información
    // más reciente al siguiente envío.
    effect(() => {
      this.finance.loans();
      this.finance.creditCards();
      this.finance.services();
      this.finance.subscriptions();
      this.finance.events();
      if (this._enabled() && this._permission() === 'granted') {
        this.scheduleNext();
      }
    }, { allowSignalWrites: true });
  }

  // ---------------------------------------------------------------------
  // Acciones del usuario
  // ---------------------------------------------------------------------

  /**
   * Activa las notificaciones. Si no hay permiso, lo solicita.
   * Devuelve `true` si quedaron activas.
   */
  async enable(): Promise<boolean> {
    if (!this.supported) {
      this.toast.warning('No compatible', 'Tu navegador no soporta notificaciones del sistema.');
      return false;
    }
    if (this._permission() === 'denied') {
      this.toast.warning(
        'Permiso bloqueado',
        'Has bloqueado las notificaciones. Actívalas desde la configuración del navegador.'
      );
      return false;
    }
    if (this._permission() === 'default') {
      try {
        const result = await Notification.requestPermission();
        this._permission.set(result);
        if (result !== 'granted') {
          this.toast.info('Sin permiso', 'No se han concedido permisos de notificación.');
          return false;
        }
      } catch {
        return false;
      }
    }
    this._enabled.set(true);
    this.toast.success(
      'Notificaciones activadas',
      'Recibirás avisos a las 09:00, 14:00 y 20:00 con tus pagos del día.'
    );
    return true;
  }

  /**
   * Desactiva las notificaciones. Si hay permiso, lo conservamos
   * para no tener que volver a pedirlo; sólo apagamos el programador.
   */
  disable(): void {
    this._enabled.set(false);
    this.cancelSchedule();
    this.toast.info('Notificaciones desactivadas', 'Volverás a recibirlas cuando las actives de nuevo.');
  }

  /**
   * Envía un aviso inmediato con el resumen del día (útil para
   * probar el funcionamiento o para "avisar ya").
   */
  sendTest(): void {
    this.fire('manual');
  }

  /**
   * Programa una notificación de prueba 5 segundos después.
   * Sirve para verificar que el programador de avisos
   * diferidos funciona correctamente.
   */
  sendTestIn5Seconds(): void {
    if (!this.supported) {
      this.toast.warning('No compatible', 'Tu navegador no soporta notificaciones del sistema.');
      return;
    }
    if (this._permission() !== 'granted') {
      this.toast.warning('Sin permiso', 'Concede permiso para enviar la prueba.');
      return;
    }
    this.toast.info('Notificación programada', 'Recibirás una de prueba en 5 segundos.');
    setTimeout(() => this.fire('test-5s'), 5000);
  }

  // ---------------------------------------------------------------------
  // Programador
  // ---------------------------------------------------------------------

  private scheduleNext(): void {
    if (!this.supported) return;
    this.cancelSchedule();
    const next = this.computeNextRun();
    this.nextRun.set(next);
    const ms = Math.max(0, next.getTime() - Date.now());
    this.timeoutRef = setTimeout(() => {
      this.fire();
      // Tras disparar, programa el siguiente día.
      this.scheduleNext();
    }, ms);
  }

  private cancelSchedule(): void {
    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }
  }

  /** Próximo momento de las 09:00, 14:00 ó 20:00 (hora local). */
  private computeNextRun(): Date {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const h of SCHEDULE_HOURS) {
      const candidate = new Date(today);
      candidate.setHours(h, 0, 0, 0);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
    // Si ya pasaron las 20:00, el próximo envío es mañana a las 09:00.
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(SCHEDULE_HOURS[0], 0, 0, 0);
    return tomorrow;
  }

  private detectPermission(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  // ---------------------------------------------------------------------
  // Envío
  // ---------------------------------------------------------------------

  private fire(reason: 'schedule' | 'manual' | 'test-5s' = 'schedule'): void {
    console.log('[BrowserNotification] fire() reason=' + reason, {
      supported: this.supported,
      permission: this._permission(),
      iOS: this.isIOS(),
      standalone: this.isStandalone(),
      private: this.isPrivateMode(),
      hidden: this.isPageHidden()
    });

    if (!this.supported) {
      this.fallbackInApp('Tu navegador no soporta notificaciones del sistema.', 'warning');
      return;
    }
    if (this._permission() !== 'granted') {
      this.fallbackInApp('Concede permiso para enviar la notificación.', 'warning');
      return;
    }
    if (this.isPrivateMode()) {
      this.fallbackInApp('El modo privado/incógnito desactiva las notificaciones del navegador.', 'warning');
      return;
    }

    const summary = this.buildSummary() ?? 'Esta es una notificación de prueba del Copilot Financiero.';

    if (this.isIOS() && !this.isStandalone()) {
      this.fallbackInApp('En iOS las notificaciones sólo funcionan si instalas la app desde Safari (Compartir → Añadir a pantalla de inicio).', 'warning');
      // Aún así intentamos.
    }

    // Refuerzo háptico en móvil. Muchos navegadores lo soportan
    // aunque las notificaciones nativas fallen.
    this.tryVibrate();

    try {
      requestAnimationFrame(() => {
        try {
          const options: NotificationOptions = {
            body: summary,
            icon: '/economico.png',
            badge: '/economico.png',
            silent: false,
            requireInteraction: true,
            tag: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          };
          console.log('[BrowserNotification] creando Notification con opciones:', options);
          const n = new Notification('💠 Copilot Financiero', options);

          // Si el navegador descarta la notificación, dispara `error`.
          let notificationFailed = false;
          n.onerror = (ev: Event) => {
            notificationFailed = true;
            const msg = (ev as ErrorEvent).message || 'desconocido';
            const errFull = `Event error: ${msg}`;
            console.error('[BrowserNotification] ✗ onerror:', errFull);
            this.toast.danger('Notificación descartada por el navegador', errFull);
            this.notifications.push({
              title: '⚠ Notificación descartada',
              description: errFull,
              severity: 'danger',
              category: 'system',
              announce: true,
              referenceId: 'browser-discarded-' + Date.now()
            });
          };
          n.onclick = () => { window.focus(); n.close(); };

          // A los 800ms verificamos si la notificación se mantuvo
          // visible o fue descartada silenciosamente.
          setTimeout(() => {
            if (notificationFailed) return;
            console.log('[BrowserNotification] verificación 800ms — failed?', notificationFailed, 'perm:', Notification.permission);
            this.toast.success(
              'Notificación del SO creada',
              summary + ' — si no la ves, desliza la barra de notificaciones del teléfono.'
            );
          }, 800);

          console.log('[BrowserNotification] ✓ Notificación nativa creada. Permiso:', Notification.permission, 'Tag:', options.tag);
          this.notifications.push({
            title: '💠 Copilot Financiero',
            description: summary,
            severity: 'info',
            category: 'system',
            announce: false,
            referenceId: 'browser-sent-' + Date.now()
          });
        } catch (innerErr: any) {
          // Imprime el error COMPLETO en la notificación toast Y en la campana
          const errFull = innerErr?.message
            ? `${innerErr.name || 'Error'}: ${innerErr.message}`
            : String(innerErr);
          const errStack = innerErr?.stack ? '\nStack: ' + innerErr.stack.split('\n').slice(0, 3).join(' | ') : '';
          console.error('[BrowserNotification] ✗ error creando Notification (completo):', innerErr);
          this.toast.danger('Error al crear la notificación', errFull);
          this.notifications.push({
            title: '⚠ Error: notificación del SO',
            description: `${errFull}${errStack}`,
            severity: 'danger',
            category: 'system',
            announce: true,
            referenceId: 'browser-error-' + Date.now()
          });
        }
      });
    } catch (e: any) {
      const errFull = e?.message ? `${e.name || 'Error'}: ${e.message}` : String(e);
      const errStack = e?.stack ? '\nStack: ' + e.stack.split('\n').slice(0, 3).join(' | ') : '';
      console.error('[BrowserNotification] ✗ error en rAF (completo):', e);
      this.toast.danger('Error al programar la notificación', errFull);
      this.notifications.push({
        title: '⚠ Error: notificación del SO',
        description: `${errFull}${errStack}`,
        severity: 'danger',
        category: 'system',
        announce: true,
        referenceId: 'browser-error-' + Date.now()
      });
    }
  }

  /**
   * Vibración háptica. En muchos móviles vibra aunque la
   * notificación nativa no se haya podido crear.
   */
  private tryVibrate(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        (navigator as any).vibrate([200, 100, 200]);
      }
    } catch { /* ignore */ }
  }

  /** Detecta modo privado/incógnito (las notificaciones suelen estar deshabilitadas). */
  private isPrivateMode(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      // En Chrome, los archivos de cuota están deshabilitados en incognito
      const fs = (navigator as any).webkitTemporaryStorage;
      return !fs;
    } catch { return false; }
  }

  /**
   * Cuando la notificación del SO no se puede enviar, registramos
   * el aviso en la bandeja in-app (campana) y mostramos un toast.
   * Así el usuario SIEMPRE recibe la información, incluso si su
   * navegador bloquea las notificaciones nativas.
   */
  private fallbackInApp(summary: string, tone: 'info' | 'warning' | 'danger'): void {
    this.notifications.push({
      title: 'Aviso del Copilot Financiero',
      description: summary,
      severity: tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info',
      category: 'system',
      announce: true,
      referenceId: 'browser-fallback'
    });
    if (tone === 'info') this.toast.info('Aviso (in-app)', summary);
    else if (tone === 'warning') this.toast.warning('Aviso (in-app)', summary);
    else this.toast.danger('Aviso (in-app)', summary);
  }

  private explainError(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e);
    if (/denied/i.test(msg)) return 'Permiso denegado por el navegador.';
    if (/secure|https/i.test(msg)) return 'Las notificaciones requieren HTTPS.';
    return 'Tu navegador bloqueó la solicitud. Revisa los permisos del sitio.';
  }

  private isPageHidden(): boolean {
    if (typeof document === 'undefined') return false;
    return document.visibilityState === 'hidden' || document.hidden;
  }

  private isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  }

  private isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  /**
   * Construye el texto del aviso. Devuelve `null` si no hay nada
   * relevante (así evitamos notificar en días sin pagos).
   */
  private buildSummary(): string | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const events: { description: string; amount: number }[] = [];

    for (const loan of this.finance.loans().filter(l => l.active)) {
      const due = new Date(today.getFullYear(), today.getMonth(), loan.paymentDay);
      if (due >= today && due < tomorrow) {
        events.push({ description: `Préstamo ${loan.name}`, amount: loan.monthlyPayment.amount });
      }
    }
    for (const card of this.finance.creditCards()) {
      const due = new Date(today.getFullYear(), today.getMonth(), card.paymentDueDay);
      if (due >= today && due < tomorrow) {
        events.push({
          description: `Tarjeta ${card.name}`,
          amount: card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1
        });
      }
    }
    for (const s of this.finance.services()) {
      const due = new Date(s.nextPaymentDate);
      if (due >= today && due < tomorrow) {
        events.push({ description: `Servicio ${s.name}`, amount: s.amount.amount });
      }
    }
    for (const sub of this.finance.subscriptions().filter(s => s.active)) {
      const due = new Date(sub.nextBillingDate);
      if (due >= today && due < tomorrow) {
        events.push({ description: `Suscripción ${sub.name}`, amount: sub.amount.amount });
      }
    }

    if (events.length === 0) return null;

    const total = events.reduce((a, e) => a + e.amount, 0);
    const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
    if (events.length === 1) {
      return `${events[0].description} hoy — ${fmt.format(events[0].amount)}`;
    }
    return `Hoy tienes ${events.length} pagos por ${fmt.format(total)}: ` +
      events.slice(0, 3).map(e => e.description).join(', ') +
      (events.length > 3 ? '…' : '');
  }
}