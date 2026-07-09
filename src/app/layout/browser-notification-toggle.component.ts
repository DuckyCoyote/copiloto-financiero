import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { BrowserNotificationService } from '../core/services/browser-notification.service';
import { NotificationService } from '../core/services/notification.service';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-browser-notification-toggle',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="wrap">
      <button type="button" class="trigger" (click)="open.set(!open())" [attr.aria-expanded]="open()" aria-label="Notificaciones del navegador" [class.active]="bns.enabled()">
        <app-icon [name]="statusIconName()" [size]="16"></app-icon>
        <small>{{ statusLabel() }}</small>
      </button>

      @if (open()) {
        <div class="menu card-flat">
          <div class="menu-head">
            <strong>Notificaciones del navegador</strong>
            <small class="text-muted">Avisos a las 09:00, 14:00 y 20:00 con tus pagos del día.</small>
          </div>

          @if (!bns.supported) {
            <p class="text-warning text-sm" style="margin: 8px 0 0 0;">
              Tu navegador no soporta notificaciones del sistema.
            </p>
          } @else if (bns.blocked()) {
            <p class="text-warning text-sm" style="margin: 8px 0 0 0;">
              Has bloqueado los avisos. Actívalos desde los permisos del navegador.
            </p>
          } @else {
            <div class="status-row">
              <span class="text-muted text-sm">Permiso del navegador</span>
              <span class="badge" [class]="bns.permission() === 'granted' ? 'badge-success' : 'badge-warning'">
                {{ permissionLabel() }}
              </span>
            </div>
            <div class="status-row">
              <span class="text-muted text-sm">Estado</span>
              <span class="badge" [class]="bns.enabled() ? 'badge-success' : 'badge-info'">
                {{ bns.enabled() ? 'Activadas' : 'Desactivadas' }}
              </span>
            </div>
            @if (bns.enabled() && bns.nextRun(); as next) {
              <div class="status-row">
                <span class="text-muted text-sm">Próximo aviso</span>
                <span class="text-sm font-mono">{{ next | date:'EEE d, HH:mm' }}</span>
              </div>
            }
          }

          <div class="actions">
            <button type="button" class="btn" (click)="testInApp()">
              <app-icon name="bell" [size]="14"></app-icon> Crear in-app
            </button>
            @if (bns.supported && !bns.blocked()) {
              @if (bns.enabled()) {
                <button type="button" class="btn" (click)="disable()">Desactivar</button>
                <button type="button" class="btn" (click)="test()">Probar ahora</button>
                <button type="button" class="btn" (click)="testIn5()">Probar en 5s</button>
              } @else {
                <button type="button" class="btn btn-primary btn-block" (click)="enable()">
                  <app-icon name="bell" [size]="14"></app-icon> Activar
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { position: relative; }
    .trigger {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px; border-radius: var(--radius-md);
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      cursor: pointer; font-size: 13px;
    }
    .trigger:hover { background: var(--color-surface-3); }
    .trigger.active {
      background: var(--color-text);
      color: var(--color-bg);
      border-color: var(--color-text);
    }
    .menu {
      position: fixed;
      top: calc(var(--header-height) + 8px);
      right: 8px;
      width: min(300px, calc(100vw - 16px));
      max-height: calc(100dvh - var(--header-height) - 24px);
      padding: 14px; z-index: 90;
      box-shadow: var(--shadow-md);
      overflow-y: auto;
    }
    .menu-head strong { display: block; }
    .menu-head small { display: block; margin-top: 2px; }
    .status-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0; border-bottom: 1px solid var(--color-border);
    }
    .status-row:last-of-type { border-bottom: none; }
    .actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 6px; }
  `]
})
export class BrowserNotificationToggleComponent {
  readonly bns = inject(BrowserNotificationService);
  readonly notif = inject(NotificationService);
  readonly open = signal(false);
  private readonly el = inject(ElementRef);

  statusIconName(): 'bell' | 'bell-off' | 'shield-alert' {
    if (!this.bns.supported) return 'shield-alert';
    if (this.bns.blocked()) return 'shield-alert';
    if (this.bns.enabled()) return 'bell';
    return 'bell-off';
  }

  statusLabel(): string {
    if (!this.bns.supported) return 'No disp.';
    if (this.bns.blocked()) return 'Bloqueado';
    if (this.bns.enabled()) return 'Activo';
    return 'Apagado';
  }

  permissionLabel(): string {
    const p = this.bns.permission();
    if (p === 'granted') return 'Concedido';
    if (p === 'denied') return 'Bloqueado';
    return 'Sin pedir';
  }

  async enable(): Promise<void> {
    this.open.set(false);
    await this.bns.enable();
  }

  disable(): void {
    this.bns.disable();
    this.open.set(false);
  }

  test(): void {
    this.bns.sendTest();
    this.open.set(false);
  }

  testIn5(): void {
    this.bns.sendTestIn5Seconds();
    this.open.set(false);
  }

  testInApp(): void {
    this.notif.pushTest();
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.el.nativeElement.contains(ev.target)) this.open.set(false);
  }
}