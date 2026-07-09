import { Injectable, signal } from '@angular/core';
import { uuid } from '../models';

export type ToastKind = 'success' | 'warning' | 'danger' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Milisegundos. Si es 0, no se cierra automáticamente. */
  duration: number;
  createdAt: string;
}

/**
 * Servicio de toasts (mensajes efímeros en la esquina inferior derecha).
 *
 * Se usa para confirmar acciones puntuales:
 *  - "Gasto guardado"
 *  - "Plan aplicado: 5 recordatorios creados"
 *  - "Error al contactar al proveedor de IA"
 *  - etc.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(kind: ToastKind, title: string, message?: string, duration = 4000): Toast {
    const toast: Toast = {
      id: uuid(),
      kind,
      title,
      message,
      duration,
      createdAt: new Date().toISOString()
    };
    this.toasts.update(list => [...list, toast]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast.id), duration);
    }
    return toast;
  }

  success(title: string, message?: string): Toast { return this.show('success', title, message); }
  info(title: string, message?: string): Toast { return this.show('info', title, message); }
  warning(title: string, message?: string): Toast { return this.show('warning', title, message); }
  danger(title: string, message?: string): Toast { return this.show('danger', title, message); }

  dismiss(id: string): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  clear(): void {
    this.toasts.set([]);
  }
}