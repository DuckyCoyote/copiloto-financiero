import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastKind, ToastService } from '../../core/services/toast.service';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'app-toaster',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="toaster">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast tone-{{ t.kind }}" role="status">
          <span class="icon"><app-icon [name]="icon(t.kind)" [size]="16"></app-icon></span>
          <div class="body">
            <strong>{{ t.title }}</strong>
            @if (t.message) {<p class="text-sm text-muted" style="margin: 2px 0 0 0;">{{ t.message }}</p>}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="toast.dismiss(t.id)" aria-label="Cerrar">
            <app-icon name="x" [size]="14"></app-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toaster {
      position: fixed; bottom: 20px; right: 20px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 1000; max-width: 360px;
      width: calc(100% - 40px);
    }
    .toast {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--color-text-muted);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      animation: fadeIn .2s ease;
    }
    .toast .body { flex: 1; }
    .toast strong { display: block; }
    .toast.tone-success { border-left-color: var(--color-text); }
    .toast.tone-warning { border-left-color: var(--color-text-muted); }
    .toast.tone-danger { border-left-color: var(--color-text); border-left-width: 6px; }
    .toast.tone-info { border-left-color: var(--color-text-dim); }
    .icon { display: inline-flex; line-height: 1; padding-top: 2px; }
    @media (max-width: 480px) {
      .toaster { right: 12px; bottom: 12px; max-width: none; }
    }
  `]
})
export class ToasterComponent {
  readonly toast = inject(ToastService);

  icon(k: ToastKind): IconName {
    const map: Record<ToastKind, IconName> = {
      success: 'check-circle',
      warning: 'alert-triangle',
      danger: 'alert-octagon',
      info: 'info'
    };
    return map[k];
  }
}