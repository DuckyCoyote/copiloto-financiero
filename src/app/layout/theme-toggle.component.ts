import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { ThemeMode, ThemeService } from '../core/services/theme.service';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="wrap">
      <button type="button" class="trigger" (click)="open.set(!open())" [attr.aria-expanded]="open()" aria-label="Cambiar tema">
        <app-icon [name]="theme.mode() === 'dark' ? 'moon' : 'sun'" [size]="16"></app-icon>
        <small>{{ theme.mode() === 'dark' ? 'Oscuro' : 'Claro' }}</small>
      </button>
      @if (open()) {
        <div class="menu card-flat">
          <button type="button" class="opt" [class.active]="theme.mode() === 'dark'" (click)="set('dark')">
            <app-icon name="moon" [size]="16"></app-icon>
            <div>
              <strong>Oscuro</strong>
              <small class="text-muted">Reduce la fatiga visual</small>
            </div>
          </button>
          <button type="button" class="opt" [class.active]="theme.mode() === 'light'" (click)="set('light')">
            <app-icon name="sun" [size]="16"></app-icon>
            <div>
              <strong>Claro</strong>
              <small class="text-muted">Blanco y gris plano</small>
            </div>
          </button>
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
    .menu {
      position: fixed;
      top: calc(var(--header-height) + 8px);
      right: 8px;
      width: min(220px, calc(100vw - 16px));
      padding: 6px; z-index: 80;
      box-shadow: var(--shadow-md);
    }
    .opt {
      width: 100%; display: flex; align-items: center; gap: 10px;
      padding: 10px; border-radius: var(--radius-md);
      background: transparent; border: 1px solid transparent;
      color: var(--color-text); cursor: pointer; text-align: left;
      font-family: inherit; font-size: 13px;
    }
    .opt:hover { background: var(--color-surface-2); }
    .opt.active { background: var(--color-surface-2); border-color: var(--color-text); }
    .opt strong { display: block; }
    .opt small { display: block; }
  `]
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  readonly open = signal(false);
  private readonly el = inject(ElementRef);

  set(mode: ThemeMode): void {
    this.theme.set(mode);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.el.nativeElement.contains(ev.target)) this.open.set(false);
  }
}