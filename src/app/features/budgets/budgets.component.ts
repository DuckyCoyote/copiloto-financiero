import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Budget, uuid } from '../../core/models';
import { FinanceDataService, FormatService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

type BudgetForm = {
  name: string;
  categoryId: string;
  amount: number;
  period: Budget['period'];
  currency: string;
  rollover: boolean;
  notes?: string;
};

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Presupuestos</h1>
        <p class="text-muted">Define límites por categoría y revisa tu progreso cada mes.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nuevo presupuesto
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="budget" title="Sin presupuestos" message="Crea presupuestos para controlar tus gastos por categoría."></app-empty-state>
    } @else {
      <div class="grid grid-cols-2">
        @for (b of withProgress(); track b.budget.id) {
          <div class="card">
            <div class="flex justify-between items-start">
              <div>
                <small class="text-muted">{{ finance.findCategory(b.budget.categoryId)?.icon }} Categoría</small>
                <h3 style="margin: 4px 0;">{{ finance.findCategory(b.budget.categoryId)?.name }}</h3>
              </div>
              <span class="badge badge-info">{{ periodLabel(b.budget.period) }}</span>
            </div>
            <div class="mt-3 text-sm">
              <span class="text-muted">Gastado</span>
              <strong class="font-mono ml-2">{{ fmt.formatMoney(b.spent) }}</strong>
              <span class="text-muted"> / {{ fmt.formatMoney(b.budget.amount.amount) }}</span>
            </div>
            <div class="progress mt-2">
              <div class="bar" [style.width.%]="Math.min(b.percent, 100)" [style.background]="barColor(b.percent)"></div>
            </div>
            <small class="text-muted">{{ b.percent.toFixed(0) }}% — quedan {{ fmt.formatMoney(Math.max(b.budget.amount.amount - b.spent, 0)) }}</small>
            <div class="flex justify-between mt-3">
              <button type="button" class="btn btn-ghost btn-sm" (click)="edit(b.budget)" aria-label="Editar">
                <app-icon name="pencil" [size]="12"></app-icon>
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="toRemove.set(b.budget)" aria-label="Eliminar">
                <app-icon name="trash" [size]="12"></app-icon>
              </button>
            </div>
          </div>
        }
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar presupuesto' : 'Nuevo presupuesto'" (close)="close()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" required [(ngModel)]="form.name" name="name" /></div>
          <div class="field"><label>Categoría</label>
            <select required [(ngModel)]="form.categoryId" name="categoryId">
              @for (c of expenseCategories(); track c.id) {
                <option [value]="c.id">{{ c.icon }} {{ c.name }}</option>
              }
            </select>
          </div>
          <div class="field"><label>Monto</label><input type="number" min="0" step="0.01" [(ngModel)]="form.amount" name="amount" /></div>
          <div class="field"><label>Periodo</label>
            <select [(ngModel)]="form.period" name="period">
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div class="field"><label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency"><option value="MXN">MXN</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
          </div>
          <div class="field"><label>Rollover</label>
            <select [(ngModel)]="form.rollover" name="rollover">
              <option [ngValue]="false">No</option>
              <option [ngValue]="true">Sí</option>
            </select>
          </div>
          <div class="field full"><label>Notas</label><textarea rows="2" [(ngModel)]="form.notes" name="notes"></textarea></div>
          <div class="full flex justify-between mt-2">
            <button type="button" class="btn" (click)="close()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar' : 'Crear' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog title="Eliminar presupuesto" [message]="'Vas a eliminar «' + toRemove()!.name + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
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
export class BudgetsComponent {
  readonly Math = Math;
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);

  readonly showForm = signal(false);
  readonly editing = signal<Budget | null>(null);
  readonly toRemove = signal<Budget | null>(null);

  readonly list = computed(() => this.finance.budgets());
  readonly expenseCategories = computed(() => this.finance.categories().filter(c => c.kind !== 'income'));

  form: BudgetForm = this.emptyForm();

  readonly withProgress = computed(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return this.list().map(b => {
      const spent = this.finance.expenses()
        .filter(e => {
          const d = new Date(e.date);
          if (b.period === 'yearly') return d.getFullYear() === year;
          if (b.period === 'weekly') {
            const start = new Date(now);
            start.setDate(now.getDate() - now.getDay());
            return d >= start;
          }
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .filter(e => e.categoryId === b.categoryId)
        .reduce((acc, e) => acc + e.amount.amount, 0);
      const percent = b.amount.amount > 0 ? (spent / b.amount.amount) * 100 : 0;
      return { budget: b, spent, percent };
    });
  });

  periodLabel(p: Budget['period']): string {
    const map = { weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual' };
    return map[p];
  }

  barColor(percent: number): string {
    if (percent >= 100) return 'var(--color-danger)';
    if (percent >= 80) return 'var(--color-warning)';
    return 'var(--color-success)';
  }

  open(): void { this.editing.set(null); this.form = this.emptyForm(); this.showForm.set(true); }
  edit(b: Budget): void {
    this.editing.set(b);
    this.form = {
      name: b.name, categoryId: b.categoryId, amount: b.amount.amount, period: b.period,
      currency: b.amount.currency, rollover: !!b.rollover, notes: b.notes ?? undefined
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const budget: Budget = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      categoryId: this.form.categoryId,
      amount: { amount: Number(this.form.amount), currency: this.form.currency as 'MXN' },
      period: this.form.period,
      rollover: this.form.rollover,
      notes: this.form.notes,
      periodStart: new Date().toISOString().slice(0, 10),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertBudget(budget);
    this.close();
  }

  confirmRemove(): void {
    const b = this.toRemove();
    if (b) this.finance.removeBudget(b.id);
    this.toRemove.set(null);
  }

  private emptyForm(): BudgetForm {
    return {
      name: '',
      categoryId: this.expenseCategories()[0]?.id ?? '',
      amount: 0,
      period: 'monthly' as Budget['period'],
      currency: 'MXN',
      rollover: false,
      notes: undefined
    };
  }
}