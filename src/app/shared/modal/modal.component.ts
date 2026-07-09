import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="overlay" (click)="onClose()">
      <div class="modal card" [style.maxWidth.px]="maxWidth" (click)="$event.stopPropagation()">
        <header class="flex justify-between items-center mb-4">
          <h3 style="margin:0;">{{ title }}</h3>
          <button type="button" class="btn btn-ghost btn-sm" (click)="onClose()" aria-label="Cerrar">
            <app-icon name="x" [size]="14"></app-icon>
          </button>
        </header>
        <div class="content">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
      display: flex; align-items: flex-start; justify-content: center;
      z-index: 90; padding: 40px 16px; overflow-y: auto;
    }
    .modal {
      width: 100%; max-width: 640px;
      animation: fadeIn .2s ease;
    }
    .content {
      max-height: calc(100vh - 220px);
      overflow-y: auto;
      padding-right: 4px;
    }
    @media (max-width: 600px) {
      .overlay { padding: 16px 8px; }
      .content { max-height: calc(100vh - 140px); }
    }
  `]
})
export class ModalComponent {
  @Input() title = '';
  @Input() maxWidth = 640;
  @Output() close = new EventEmitter<void>();
  onClose(): void { this.close.emit(); }
}