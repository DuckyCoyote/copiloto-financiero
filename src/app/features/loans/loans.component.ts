import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Loan, uuid } from '../../core/models';
import { FinanceDataService, FormatService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

type LoanForm = {
  name: string;
  kind: Loan['kind'];
  creditor: string;
  principal: number;
  remainingBalance: number;
  monthlyPayment: number;
  currency: string;
  annualInterestRate: number;
  lateInterestRate?: number;
  cat?: number;
  paymentDay: number;
  startDate: string;
  expectedEndDate?: string;
  latePenalty?: number;
  active: boolean;
  notes?: string;
};

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Préstamos y créditos</h1>
        <p class="text-muted">Lleva el seguimiento de capital, tasas, pagos y fechas.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nuevo préstamo
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="loan" title="Sin préstamos" message="Registra tus créditos para gestionar pagos y priorizar."></app-empty-state>
    } @else {
      <div class="grid grid-cols-2">
        @for (l of list(); track l.id) {
          <div class="card">
            <div class="flex justify-between items-start">
              <div>
                <small class="text-muted">{{ l.creditor }}</small>
                <h3 style="margin: 4px 0;">{{ l.name }}</h3>
                <span class="badge badge-info">{{ kindLabel(l.kind) }}</span>
              </div>
              <span class="badge" [class]="l.active ? 'badge-success' : 'badge-warning'">{{ l.active ? 'Activo' : 'Inactivo' }}</span>
            </div>
            <div class="grid grid-cols-2 mt-4 text-sm">
              <div>
                <small class="text-muted">Saldo</small>
                <strong class="font-mono d-block">{{ fmt.formatMoney(l.remainingBalance.amount) }}</strong>
              </div>
              <div>
                <small class="text-muted">Pago mensual</small>
                <strong class="font-mono d-block">{{ fmt.formatMoney(l.monthlyPayment.amount) }}</strong>
              </div>
              <div>
                <small class="text-muted">Tasa anual</small>
                <strong class="font-mono d-block">{{ l.annualInterestRate.toFixed(1) }}%</strong>
              </div>
              <div>
                <small class="text-muted">CAT</small>
                <strong class="font-mono d-block">{{ l.cat?.toFixed(1) ?? '—' }}%</strong>
              </div>
              <div>
                <small class="text-muted">Día de pago</small>
                <strong class="font-mono d-block">día {{ l.paymentDay }}</strong>
              </div>
              <div>
                <small class="text-muted">Liquidación</small>
                <strong class="font-mono d-block">{{ l.expectedEndDate ? fmt.formatDate(l.expectedEndDate) : '—' }}</strong>
              </div>
            </div>
            <div class="progress mt-3">
              <div class="bar" [style.width.%]="progress(l)"></div>
            </div>
            <small class="text-muted">{{ progress(l).toFixed(0) }}% liquidado</small>
            <div class="flex justify-between mt-4">
              <button type="button" class="btn btn-ghost btn-sm" (click)="edit(l)" aria-label="Editar">
                <app-icon name="pencil" [size]="12"></app-icon>
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="toRemove.set(l)" aria-label="Eliminar">
                <app-icon name="trash" [size]="12"></app-icon>
              </button>
            </div>
          </div>
        }
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar préstamo' : 'Nuevo préstamo'" (close)="close()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" required [(ngModel)]="form.name" name="name" /></div>
          <div class="field">
            <label>Tipo</label>
            <select [(ngModel)]="form.kind" name="kind">
              <option value="personal">Personal</option>
              <option value="mortgage">Hipoteca</option>
              <option value="auto">Auto</option>
              <option value="credit_line">Línea de crédito</option>
              <option value="credit_card_finance">Financiamiento tarjeta</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div class="field"><label>Acreedor</label><input type="text" required [(ngModel)]="form.creditor" name="creditor" /></div>
          <div class="field"><label>Capital inicial</label><input type="number" min="0" [(ngModel)]="form.principal" name="principal" /></div>
          <div class="field"><label>Saldo actual</label><input type="number" min="0" [(ngModel)]="form.remainingBalance" name="remainingBalance" /></div>
          <div class="field"><label>Pago mensual</label><input type="number" min="0" step="0.01" [(ngModel)]="form.monthlyPayment" name="monthlyPayment" /></div>
          <div class="field"><label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency"><option value="MXN">MXN</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
          </div>
          <div class="field"><label>Tasa anual (%)</label><input type="number" step="0.1" min="0" [(ngModel)]="form.annualInterestRate" name="annualInterestRate" /></div>
          <div class="field"><label>Tasa moratoria (%)</label><input type="number" step="0.1" min="0" [(ngModel)]="form.lateInterestRate" name="lateInterestRate" /></div>
          <div class="field"><label>CAT (%)</label><input type="number" step="0.1" min="0" [(ngModel)]="form.cat" name="cat" /></div>
          <div class="field"><label>Día de pago</label><input type="number" min="1" max="31" [(ngModel)]="form.paymentDay" name="paymentDay" /></div>
          <div class="field"><label>Fecha de inicio</label><input type="date" [(ngModel)]="form.startDate" name="startDate" /></div>
          <div class="field"><label>Liquidación estimada</label><input type="date" [(ngModel)]="form.expectedEndDate" name="expectedEndDate" /></div>
          <div class="field"><label>Penalización</label><input type="number" min="0" step="0.01" [(ngModel)]="form.latePenalty" name="latePenalty" /></div>
          <div class="field"><label>Activo</label>
            <select [(ngModel)]="form.active" name="active">
              <option [ngValue]="true">Sí</option>
              <option [ngValue]="false">No</option>
            </select>
          </div>
          <div class="field full"><label>Notas</label><textarea rows="2" [(ngModel)]="form.notes" name="notes"></textarea></div>
          <div class="full flex justify-between mt-2">
            <button type="button" class="btn" (click)="close()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar' : 'Crear préstamo' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog title="Eliminar préstamo" [message]="'Vas a eliminar «' + toRemove()!.name + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
    }
  `,
  styles: [`
    .d-block { display: block; }
    .progress { background: var(--color-surface-2); border-radius: 6px; height: 6px; overflow: hidden; }
    .bar { height: 100%; background: linear-gradient(90deg, var(--color-success), var(--color-info)); transition: width .3s ease; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
  `]
})
export class LoansComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);

  readonly showForm = signal(false);
  readonly editing = signal<Loan | null>(null);
  readonly toRemove = signal<Loan | null>(null);

  form: LoanForm = this.emptyForm();

  readonly list = computed(() => this.finance.loans());

  progress(l: Loan): number {
    if (!l.principal.amount) return 0;
    return Math.min(100, Math.max(0, ((l.principal.amount - l.remainingBalance.amount) / l.principal.amount) * 100));
  }

  kindLabel(k: Loan['kind']): string {
    const map: Record<Loan['kind'], string> = {
      personal: 'Personal',
      mortgage: 'Hipoteca',
      auto: 'Auto',
      credit_line: 'Línea de crédito',
      credit_card_finance: 'Financiamiento',
      other: 'Otro'
    };
    return map[k];
  }

  open(): void {
    this.editing.set(null);
    this.form = this.emptyForm();
    this.showForm.set(true);
  }
  edit(l: Loan): void {
    this.editing.set(l);
    this.form = {
      name: l.name,
      kind: l.kind,
      creditor: l.creditor,
      principal: l.principal.amount,
      remainingBalance: l.remainingBalance.amount,
      monthlyPayment: l.monthlyPayment.amount,
      currency: l.monthlyPayment.currency,
      annualInterestRate: l.annualInterestRate,
      lateInterestRate: l.lateInterestRate,
      cat: l.cat,
      paymentDay: l.paymentDay,
      startDate: l.startDate,
      expectedEndDate: l.expectedEndDate,
      latePenalty: l.latePenalty?.amount,
      active: l.active,
      notes: l.notes
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const loan: Loan = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      kind: this.form.kind,
      creditor: this.form.creditor,
      principal: { amount: Number(this.form.principal), currency: this.form.currency as 'MXN' },
      remainingBalance: { amount: Number(this.form.remainingBalance), currency: this.form.currency as 'MXN' },
      monthlyPayment: { amount: Number(this.form.monthlyPayment), currency: this.form.currency as 'MXN' },
      annualInterestRate: Number(this.form.annualInterestRate),
      lateInterestRate: this.form.lateInterestRate ? Number(this.form.lateInterestRate) : undefined,
      cat: this.form.cat ? Number(this.form.cat) : undefined,
      paymentDay: Number(this.form.paymentDay),
      startDate: this.form.startDate,
      expectedEndDate: this.form.expectedEndDate,
      latePenalty: this.form.latePenalty ? { amount: Number(this.form.latePenalty), currency: this.form.currency as 'MXN' } : undefined,
      active: this.form.active,
      notes: this.form.notes,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertLoan(loan);
    this.close();
  }

  confirmRemove(): void {
    const l = this.toRemove();
    if (l) this.finance.removeLoan(l.id);
    this.toRemove.set(null);
  }

  private emptyForm(): LoanForm {
    return {
      name: '',
      kind: 'personal' as Loan['kind'],
      creditor: '',
      principal: 0,
      remainingBalance: 0,
      monthlyPayment: 0,
      currency: 'MXN',
      annualInterestRate: 0,
      lateInterestRate: undefined,
      cat: undefined,
      paymentDay: 15,
      startDate: new Date().toISOString().slice(0, 10),
      expectedEndDate: undefined,
      latePenalty: undefined,
      active: true,
      notes: undefined
    };
  }
}