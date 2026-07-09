import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="empty card">
      <div class="icon"><app-icon [name]="iconName" [size]="32"></app-icon></div>
      <h3>{{ title }}</h3>
      <p class="text-muted">{{ message }}</p>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .empty {
      text-align: center;
      padding: 40px 24px;
    }
    .icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: var(--color-surface-2);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 12px;
      color: var(--color-text-muted);
    }
    h3 { margin: 0 0 4px 0; }
  `]
})
export class EmptyStateComponent {
  @Input() iconName: IconName = 'folder';
  @Input() title = 'Aún no hay datos';
  @Input() message = 'Empieza agregando un registro para ver tu información aquí.';
}