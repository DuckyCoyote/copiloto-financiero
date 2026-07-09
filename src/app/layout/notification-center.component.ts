import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../core/services/notification.service';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="wrap">
      <button type="button" class="bell" (click)="toggle()" [attr.aria-expanded]="open()" aria-label="Notificaciones">
        <app-icon name="bell" [size]="16"></app-icon>
        @if (notif.unreadCount() > 0) {
          <span class="dot">{{ notif.unreadCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="panel card-flat">
          <header class="panel-head">
            <div>
              <strong>Notificaciones</strong>
              <small class="text-muted">{{ notif.items().length }} en total</small>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost btn-sm" (click)="markAll()">Marcar leídas</button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="notif.clear()">Limpiar</button>
            </div>
          </header>

          <div class="list">
            @if (notif.items().length === 0) {
              <div class="empty">
                <app-icon name="check-circle" [size]="28" color="var(--color-text-muted)"></app-icon>
                <p class="text-muted text-sm" style="margin: 6px 0 0 0;">Sin notificaciones.</p>
              </div>
            }
            @for (n of notif.items(); track n.id) {
              <div class="item tone-{{ n.severity }}" [class.unread]="!n.read" (click)="openItem(n)">
                <span class="badge badge-info">{{ label(n.category) }}</span>
                <strong class="title">{{ n.title }}</strong>
                @if (n.description) {
                  <p class="text-sm text-muted" style="margin: 2px 0 0 0;">{{ n.description }}</p>
                }
                <small class="text-dim">{{ timeAgo(n.createdAt) }}</small>
                <button type="button" class="btn btn-ghost btn-sm dismiss" (click)="$event.stopPropagation(); notif.dismiss(n.id)" aria-label="Descartar">
                  <app-icon name="x" [size]="12"></app-icon>
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { position: relative; }
    .bell {
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      position: relative;
      flex-shrink: 0;
    }
    .bell:hover { background: var(--color-surface-3); }
    .dot {
      position: absolute; top: -2px; right: -2px;
      min-width: 18px; height: 18px;
      background: var(--color-text);
      color: var(--color-bg);
      border-radius: 999px;
      font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      padding: 0 5px;
      border: 2px solid var(--color-bg);
    }
    .panel {
      position: fixed;
      top: calc(var(--header-height) + 8px);
      right: 8px;
      left: auto;
      width: min(360px, calc(100vw - 16px));
      max-height: calc(100dvh - var(--header-height) - 24px);
      padding: 0;
      z-index: 80;
      display: flex; flex-direction: column;
      box-shadow: var(--shadow-md);
    }
    .panel-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border);
      gap: 8px;
    }
    .panel-head strong { font-size: 14px; }
    .panel-head small { display: block; }
    .panel-head .flex { gap: 4px; }
    .panel-head .btn { padding: 4px 8px; font-size: 11px; }
    .list { overflow-y: auto; flex: 1; padding: 8px; }
    .empty { padding: 32px; text-align: center; }
    .item {
      padding: 10px 12px;
      border-radius: var(--radius-md);
      margin-bottom: 6px;
      cursor: pointer;
      background: var(--color-surface-2);
      border-left: 3px solid var(--color-text-muted);
      position: relative;
      transition: background .12s ease;
    }
    .item:hover { background: var(--color-surface-3); }
    .item.unread { background: var(--color-surface); border-left-color: var(--color-text); }
    .item.tone-success { border-left-color: var(--color-text); }
    .item.tone-warning { border-left-color: var(--color-text-muted); }
    .item.tone-danger { border-left-color: var(--color-text); border-left-width: 5px; }
    .item.tone-info { border-left-color: var(--color-text-dim); }
    .title { display: block; margin-top: 4px; font-size: 13px; word-break: break-word; }
    .item p { word-break: break-word; }
    .dismiss { position: absolute; top: 6px; right: 6px; padding: 4px; }
  `]
})
export class NotificationCenterComponent {
  readonly notif = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef);

  readonly open = signal(false);

  toggle(): void { this.open.update(v => !v); }

  markAll(): void { this.notif.markAllAsRead(); }

  openItem(n: ReturnType<NotificationService['items']>[number]): void {
    this.notif.markAsRead(n.id);
    if (n.link) this.router.navigateByUrl(n.link);
    this.open.set(false);
  }

  label(c: 'risk' | 'reminder' | 'payment' | 'system'): string {
    return { risk: 'Riesgo', reminder: 'Recordatorio', payment: 'Pago', system: 'Sistema' }[c];
  }

  timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.round(ms / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return `hace ${d} d`;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.el.nativeElement.contains(ev.target)) this.open.set(false);
  }
}