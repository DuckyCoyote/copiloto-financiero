import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Income, uuid } from '../../core/models';
import { FinanceDataService, FormatService, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

type IncomeForm = {
  description: string;
  amount: number;
  currency: string;
  categoryId: string;
  date: string;
  recurring: Income['recurring'];
  notes?: string;
};

@Component({
  selector: 'app-income',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Ingresos</h1>
        <p class="text-muted">Sueldo, freelance, ventas, intereses u otras entradas de dinero.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nuevo ingreso
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="income" title="Sin ingresos" message="Registra tu primer ingreso para empezar."></app-empty-state>
    } @else {
      <div class="card-flat table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Recurrencia</th>
              <th class="num">Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (i of list(); track i.id) {
              <tr>
                <td>{{ fmt.formatDate(i.date) }}</td>
                <td>{{ i.description }}</td>
                <td>{{ finance.findCategory(i.categoryId)?.icon }} {{ finance.findCategory(i.categoryId)?.name }}</td>
                <td>{{ recurrenceLabel(i.recurring) }}</td>
                <td class="num font-mono text-success">+{{ fmt.formatMoney(i.amount.amount, i.amount.currency) }}</td>
                <td class="num">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="edit(i)" aria-label="Editar">
                    <app-icon name="pencil" [size]="12"></app-icon>
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="toRemove.set(i)" aria-label="Eliminar">
                    <app-icon name="trash" [size]="12"></app-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar ingreso' : 'Nuevo ingreso'" (close)="close()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field full">
            <label>Descripción</label>
            <input type="text" required [(ngModel)]="form.description" name="description" />
          </div>
          <div class="field">
            <label>Monto</label>
            <input type="number" required min="0" step="0.01" [(ngModel)]="form.amount" name="amount" />
          </div>
          <div class="field">
            <label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency">
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div class="field">
            <label>Categoría</label>
            <select required [(ngModel)]="form.categoryId" name="categoryId">
              @for (c of incomeCategories(); track c.id) {
                <option [value]="c.id">{{ c.icon }} {{ c.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label>Recurrencia</label>
            <select [(ngModel)]="form.recurring" name="recurring">
              <option value="none">No</option>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div class="field full">
            <label>Fecha</label>
            <input type="date" required [(ngModel)]="form.date" name="date" />
          </div>
          <div class="field full">
            <label>Notas</label>
            <textarea rows="2" [(ngModel)]="form.notes" name="notes"></textarea>
          </div>
          <div class="full flex justify-between mt-2">
            <button type="button" class="btn" (click)="close()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar cambios' : 'Crear ingreso' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog title="Eliminar ingreso" [message]="'Vas a eliminar «' + toRemove()!.description + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
    }
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
  `]
})
export class IncomeComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);
  private readonly toast = inject(ToastService);

  readonly showForm = signal(false);
  readonly editing = signal<Income | null>(null);
  readonly toRemove = signal<Income | null>(null);

  readonly list = computed(() =>
    [...this.finance.income()].sort((a, b) => b.date.localeCompare(a.date))
  );

  readonly incomeCategories = computed(() => this.finance.categories().filter(c => c.kind !== 'expense'));

  form: IncomeForm = this.emptyForm();

  open(): void {
    this.editing.set(null);
    this.form = this.emptyForm();
    this.showForm.set(true);
  }
  edit(i: Income): void {
    this.editing.set(i);
    this.form = {
      description: i.description,
      amount: i.amount.amount,
      currency: i.amount.currency,
      categoryId: i.categoryId,
      date: i.date,
      recurring: i.recurring ?? 'none',
      notes: i.notes ?? undefined
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const income: Income = {
      id: editing?.id ?? uuid(),
      description: this.form.description,
      amount: { amount: Number(this.form.amount), currency: (this.form.currency as 'MXN') },
      categoryId: this.form.categoryId,
      date: this.form.date,
      recurring: this.form.recurring,
      notes: this.form.notes,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertIncome(income);
    this.close();
    this.toast.success('Ingreso guardado', `${income.description} • ${this.fmt.formatMoney(income.amount.amount)}`);
  }

  confirmRemove(): void {
    const i = this.toRemove();
    if (i) this.finance.removeIncome(i.id);
    this.toRemove.set(null);
  }

  recurrenceLabel(r?: Income['recurring']): string {
    switch (r) {
      case 'weekly': return 'Semanal';
      case 'biweekly': return 'Quincenal';
      case 'monthly': return 'Mensual';
      case 'yearly': return 'Anual';
      default: return '—';
    }
  }

  private emptyForm(): IncomeForm {
    return {
      description: '',
      amount: 0,
      currency: 'MXN',
      categoryId: this.incomeCategories()[0]?.id ?? '',
      date: new Date().toISOString().slice(0, 10),
      recurring: 'none' as Income['recurring'],
      notes: undefined
    };
  }
}