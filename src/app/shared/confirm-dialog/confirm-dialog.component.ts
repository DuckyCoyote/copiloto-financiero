import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="overlay" (click)="onCancel()">
      <div class="dialog card" (click)="$event.stopPropagation()">
        <div class="icon-wrap"><app-icon name="alert-triangle" [size]="20"></app-icon></div>
        <h3>{{ title }}</h3>
        <p class="text-muted">{{ message }}</p>
        <div class="actions">
          <button type="button" class="btn" (click)="onCancel()">{{ cancelLabel }}</button>
          <button type="button" class="btn btn-primary" (click)="onConfirm()">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 100; padding: 16px;
    }
    .dialog {
      max-width: 420px; width: 100%;
      text-align: center;
      animation: fadeIn .2s ease;
    }
    .icon-wrap {
      width: 48px; height: 48px;
      margin: 0 auto 12px;
      border-radius: 50%;
      background: var(--color-surface-2);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-text);
    }
    .actions {
      display: flex; justify-content: center; gap: 8px; margin-top: 16px;
    }
    h3 { margin: 0 0 6px 0; }
  `]
})
export class ConfirmDialogComponent {
  @Input() title = '¿Confirmas esta acción?';
  @Input() message = 'Esta acción no se puede deshacer.';
  @Input() confirmLabel = 'Confirmar';
  @Input() cancelLabel = 'Cancelar';
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void { this.confirm.emit(); }
  onCancel(): void { this.cancel.emit(); }
}