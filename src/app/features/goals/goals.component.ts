import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SavingsGoal, uuid } from '../../core/models';
import { FinanceDataService, FormatService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Metas de ahorro</h1>
        <p class="text-muted">Define objetivos y mide tu progreso.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nueva meta
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="goal" title="Sin metas" message="Crea metas de ahorro para mantenerte motivado."></app-empty-state>
    } @else {
      <div class="grid grid-cols-2">
        @for (g of list(); track g.id) {
          <div class="card">
            <div class="flex justify-between items-start">
              <div>
                <span style="font-size: 28px;">{{ g.icon || '🎯' }}</span>
                <h3 style="margin: 4px 0;">{{ g.name }}</h3>
                @if (g.description) {
                  <p class="text-muted text-sm" style="margin:0;">{{ g.description }}</p>
                }
              </div>
              <span class="badge" [class]="progress(g) >= 1 ? 'badge-success' : 'badge-info'">{{ (progress(g) * 100).toFixed(0) }}%</span>
            </div>
            <div class="mt-3 text-sm">
              <span class="text-muted">Acumulado</span>
              <strong class="font-mono ml-2">{{ fmt.formatMoney(g.currentAmount.amount) }}</strong>
              <span class="text-muted"> / {{ fmt.formatMoney(g.targetAmount.amount) }}</span>
            </div>
            <div class="progress mt-2">
              <div class="bar" [style.width.%]="Math.min(progress(g) * 100, 100)" [style.background]="g.color || 'var(--color-primary)'"></div>
            </div>
            @if (g.targetDate) {
              <small class="text-muted">Fecha objetivo: {{ fmt.formatDate(g.targetDate) }}</small>
            }
            <div class="flex gap-2 mt-3">
              <button type="button" class="btn btn-sm" (click)="contribute(g, 100)">+100</button>
              <button type="button" class="btn btn-sm" (click)="contribute(g, 500)">+500</button>
              <button type="button" class="btn btn-sm" (click)="contribute(g, 1000)">+1,000</button>
              <div class="flex-1"></div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="edit(g)" aria-label="Editar">
                <app-icon name="pencil" [size]="12"></app-icon>
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="toRemove.set(g)" aria-label="Eliminar">
                <app-icon name="trash" [size]="12"></app-icon>
              </button>
            </div>
          </div>
        }
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar meta' : 'Nueva meta'" (close)="close()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field full"><label>Nombre</label><input type="text" required [(ngModel)]="form.name" name="name" /></div>
          <div class="field full"><label>Descripción</label><input type="text" [(ngModel)]="form.description" name="description" /></div>
          <div class="field"><label>Monto objetivo</label><input type="number" required min="0" step="0.01" [(ngModel)]="form.targetAmount" name="targetAmount" /></div>
          <div class="field"><label>Monto actual</label><input type="number" required min="0" step="0.01" [(ngModel)]="form.currentAmount" name="currentAmount" /></div>
          <div class="field"><label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency"><option value="MXN">MXN</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
          </div>
          <div class="field"><label>Fecha objetivo</label><input type="date" [(ngModel)]="form.targetDate" name="targetDate" /></div>
          <div class="field"><label>Icono (emoji)</label><input type="text" [(ngModel)]="form.icon" name="icon" maxlength="2" /></div>
          <div class="field"><label>Color</label><input type="color" [(ngModel)]="form.color" name="color" /></div>
          <div class="field"><label>Activa</label>
            <select [(ngModel)]="form.active" name="active">
              <option [ngValue]="true">Sí</option>
              <option [ngValue]="false">No</option>
            </select>
          </div>
          <div class="full flex justify-between mt-2">
            <button type="button" class="btn" (click)="close()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar' : 'Crear' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog title="Eliminar meta" [message]="'Vas a eliminar «' + toRemove()!.name + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
    }
  `,
  styles: [`
    .progress { background: var(--color-surface-2); border-radius: 6px; height: 8px; overflow: hidden; }
    .bar { height: 100%; transition: width .3s ease; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
  `]
})
export class GoalsComponent {
  readonly Math = Math;
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);

  readonly showForm = signal(false);
  readonly editing = signal<SavingsGoal | null>(null);
  readonly toRemove = signal<SavingsGoal | null>(null);

  form = this.emptyForm();
  readonly list = computed(() => this.finance.goals());

  progress(g: SavingsGoal): number {
    return Math.min(g.currentAmount.amount / Math.max(g.targetAmount.amount, 1), 1);
  }

  contribute(g: SavingsGoal, amount: number): void {
    this.finance.upsertGoal({
      ...g,
      currentAmount: { amount: g.currentAmount.amount + amount, currency: g.currentAmount.currency },
      updatedAt: new Date().toISOString()
    });
  }

  open(): void { this.editing.set(null); this.form = this.emptyForm(); this.showForm.set(true); }
  edit(g: SavingsGoal): void {
    this.editing.set(g);
    this.form = {
      name: g.name, description: g.description ?? '', targetAmount: g.targetAmount.amount,
      currentAmount: g.currentAmount.amount, currency: g.currentAmount.currency,
      targetDate: g.targetDate ?? '', icon: g.icon ?? '🎯', color: g.color ?? '#6366f1', active: g.active
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const goal: SavingsGoal = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      description: this.form.description,
      targetAmount: { amount: Number(this.form.targetAmount), currency: this.form.currency as 'MXN' },
      currentAmount: { amount: Number(this.form.currentAmount), currency: this.form.currency as 'MXN' },
      targetDate: this.form.targetDate || undefined,
      icon: this.form.icon,
      color: this.form.color,
      active: this.form.active,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertGoal(goal);
    this.close();
  }

  confirmRemove(): void {
    const g = this.toRemove();
    if (g) this.finance.removeGoal(g.id);
    this.toRemove.set(null);
  }

  private emptyForm() {
    return {
      name: '',
      description: '',
      targetAmount: 0,
      currentAmount: 0,
      currency: 'MXN',
      targetDate: '',
      icon: '🎯',
      color: '#6366f1',
      active: true
    };
  }
}