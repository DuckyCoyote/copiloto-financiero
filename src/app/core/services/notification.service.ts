import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { uuid } from '../models';
import { STORAGE_KEYS, StorageService } from './storage.service';
import { ToastService } from './toast.service';
import { FinanceDataService } from './finance-data.service';
import { RiskDetectionService } from './risk-detection.service';

/**
 * Notificaciones in-app persistentes.
 *
 * Una notificación es un mensaje que el sistema genera a partir
 * de los datos del usuario (alertas de riesgo, pagos próximos,
 * recordatorios) y que aparece en una bandeja accesible desde la
 * topbar. Se persiste en `localStorage` y se mantiene entre
 * sesiones hasta que el usuario la marque como leída o la
 * descarte.
 *
 * La integración con `ToastService` permite que, además, las
 * notificaciones críticas aparezcan como toasts efímeros.
 */
export interface AppNotification {
  id: string;
  /** Título visible. */
  title: string;
  /** Descripción. */
  description?: string;
  /** Severidad / tono. */
  severity: 'info' | 'success' | 'warning' | 'danger';
  /** Categoría: alerta, recordatorio, sistema. */
  category: 'risk' | 'reminder' | 'payment' | 'system';
  /** Fecha de creación (ISO). */
  createdAt: string;
  /** ¿Ya fue leída? */
  read: boolean;
  /** Indica si debe mostrarse también como toast al crearse. */
  announce: boolean;
  /** ID de la entidad relacionada (préstamo, tarjeta, recordatorio). */
  referenceId?: string;
  /** Ruta opcional para navegar al detalle. */
  link?: string;
}

const MAX_NOTIFICATIONS = 50;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly finance = inject(FinanceDataService);
  private readonly risk = inject(RiskDetectionService);

  private readonly _items = signal<AppNotification[]>(
    this.storage.read<AppNotification[]>(STORAGE_KEYS.notifications, [])
  );
  readonly items = this._items.asReadonly();

  readonly unreadCount = computed(() => this._items().filter(n => !n.read).length);

  constructor() {
    // Sincroniza automáticamente con localStorage
    effect(() => {
      this.storage.write(STORAGE_KEYS.notifications, this._items());
    }, { allowSignalWrites: true });

    // Genera alertas automáticas cada vez que cambian los datos.
    effect(() => {
      // Lee las señales que nos interesan para crear la dependencia.
      this.finance.loans();
      this.finance.creditCards();
      this.finance.expenses();
      this.finance.income();
      this.finance.subscriptions();
      this.finance.reminders();
      this.syncFromData();
    }, { allowSignalWrites: true });
  }

  // ---------------------------------------------------------------------
  // Operaciones sobre la bandeja
  // ---------------------------------------------------------------------

  push(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
    const notification: AppNotification = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      read: false,
      ...n
    };
    this._items.update(list => [notification, ...list].slice(0, MAX_NOTIFICATIONS));
    if (notification.announce) {
      this.toast.show(
        notification.severity === 'danger' ? 'danger'
          : notification.severity === 'warning' ? 'warning'
            : notification.severity === 'success' ? 'success' : 'info',
        notification.title,
        notification.description
      );
    }
    return notification;
  }

  markAsRead(id: string): void {
    this._items.update(list => list.map(n => (n.id === id ? { ...n, read: true } : n)));
  }

  markAllAsRead(): void {
    this._items.update(list => list.map(n => ({ ...n, read: true })));
  }

  dismiss(id: string): void {
    this._items.update(list => list.filter(n => n.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }

  // ---------------------------------------------------------------------
  // Generación automática de notificaciones
  // ---------------------------------------------------------------------

  /**
   * Compara el set actual con el anterior para evitar duplicados:
   * sólo añade notificaciones cuyo `title + referenceId` no exista.
   */
  private syncFromData(): void {
    const alerts = this.risk.alerts();
    const existing = new Set(this._items().map(n => `${n.category}:${n.title}:${n.referenceId ?? ''}`));

    for (const a of alerts) {
      const ref = a.id;
      const key = `risk:${a.title}:${ref}`;
      if (existing.has(key)) continue;
      this.push({
        title: a.title,
        description: a.description,
        severity: a.severity === 'danger' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info',
        category: 'risk',
        announce: a.severity === 'danger' || a.severity === 'warning',
        referenceId: ref
      });
    }

    // Recordatorios vencidos
    const now = new Date();
    for (const r of this.finance.reminders()) {
      if (r.done) continue;
      const d = new Date(r.date);
      if (d < now) {
        const key = `reminder:${r.title}:${r.id}`;
        if (existing.has(key)) continue;
        this.push({
          title: `Recordatorio: ${r.title}`,
          description: r.description,
          severity: 'info',
          category: 'reminder',
          announce: false,
          referenceId: r.id
        });
      }
    }
  }
}