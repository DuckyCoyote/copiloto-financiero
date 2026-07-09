import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreditCard, uuid } from '../../core/models';
import { FinanceDataService, FormatService, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Tarjetas de crédito</h1>
        <p class="text-muted">Línea, saldo, tasas y fechas clave.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nueva tarjeta
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="card" title="Sin tarjetas" message="Agrega tus tarjetas para llevar control del crédito."></app-empty-state>
    } @else {
      <div class="card-list">
        @for (c of list(); track c.id) {
          <div class="card-row">
            <div class="row-head">
              <div>
                <strong>{{ c.name }}</strong>
                <small class="text-muted">{{ c.issuer }} • •••• {{ c.last4 || '0000' }}</small>
              </div>
              <div class="row-actions">
                <button type="button" class="btn btn-ghost btn-sm" (click)="edit(c)" aria-label="Editar">
                  <app-icon name="pencil" [size]="14"></app-icon>
                </button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="toRemove.set(c)" aria-label="Eliminar">
                  <app-icon name="trash" [size]="14"></app-icon>
                </button>
              </div>
            </div>
            <div class="row-body">
              <div class="balance">
                <small class="text-muted">Saldo</small>
                <strong class="font-mono">{{ fmt.formatMoney(c.currentBalance.amount) }}</strong>
              </div>
              <div class="balance">
                <small class="text-muted">Límite</small>
                <strong class="font-mono">{{ fmt.formatMoney(c.creditLimit.amount) }}</strong>
              </div>
              <div class="balance">
                <small class="text-muted">Tasa</small>
                <strong class="font-mono">{{ c.annualInterestRate.toFixed(1) }}%</strong>
              </div>
              <div class="balance">
                <small class="text-muted">CAT</small>
                <strong class="font-mono">{{ c.cat?.toFixed(1) ?? '—' }}%</strong>
              </div>
              <div class="balance">
                <small class="text-muted">Corte</small>
                <strong class="font-mono">día {{ c.cutOffDay }}</strong>
              </div>
              <div class="balance">
                <small class="text-muted">Pago</small>
                <strong class="font-mono">día {{ c.paymentDueDay }}</strong>
              </div>
            </div>
            <div class="utilization">
              <div class="bar">
                <div class="fill" [style.width.%]="Math.min(utilization(c) * 100, 100)" [class.warn]="utilization(c) >= 0.7" [class.danger]="utilization(c) >= 0.9"></div>
              </div>
              <small class="text-muted">{{ (utilization(c) * 100).toFixed(0) }}% utilizado</small>
            </div>
          </div>
        }
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar tarjeta' : 'Nueva tarjeta'" (close)="close()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" required [(ngModel)]="form.name" name="name" /></div>
          <div class="field"><label>Emisor</label><input type="text" required [(ngModel)]="form.issuer" name="issuer" /></div>
          <div class="field"><label>Últimos 4 dígitos</label><input type="text" maxlength="4" [(ngModel)]="form.last4" name="last4" /></div>
          <div class="field"><label>Línea de crédito</label><input type="number" required min="0" [(ngModel)]="form.creditLimit" name="creditLimit" /></div>
          <div class="field"><label>Saldo actual</label><input type="number" required min="0" [(ngModel)]="form.currentBalance" name="currentBalance" /></div>
          <div class="field"><label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency"><option value="MXN">MXN</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
          </div>
          <div class="field"><label>Tasa anual (%)</label><input type="number" step="0.1" min="0" [(ngModel)]="form.annualInterestRate" name="annualInterestRate" /></div>
          <div class="field"><label>CAT (%)</label><input type="number" step="0.1" min="0" [(ngModel)]="form.cat" name="cat" /></div>
          <div class="field"><label>Día de corte</label><input type="number" min="1" max="31" [(ngModel)]="form.cutOffDay" name="cutOffDay" /></div>
          <div class="field"><label>Día límite de pago</label><input type="number" min="1" max="31" [(ngModel)]="form.paymentDueDay" name="paymentDueDay" /></div>
          <div class="field"><label>Pago mínimo</label><input type="number" min="0" step="0.01" [(ngModel)]="form.minimumPayment" name="minimumPayment" /></div>
          <div class="field"><label>Pago sin intereses</label><input type="number" min="0" step="0.01" [(ngModel)]="form.noInterestPayment" name="noInterestPayment" /></div>
          <div class="full flex justify-between mt-2">
            <button type="button" class="btn" (click)="close()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar' : 'Crear tarjeta' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog title="Eliminar tarjeta" [message]="'Vas a eliminar «' + toRemove()!.name + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
    }
  `,
  styles: [`
    .card-list { display: flex; flex-direction: column; gap: 8px; }
    .card-row {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 14px 16px;
    }
    .row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .row-head small { display: block; font-size: 11px; margin-top: 2px; letter-spacing: 0.02em; }
    .row-actions { display: flex; gap: 2px; }
    .row-body {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 12px;
    }
    .balance { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .balance strong { font-size: 14px; }
    .utilization { display: flex; align-items: center; gap: 12px; }
    .bar { flex: 1; height: 6px; background: var(--color-surface-2); border-radius: 3px; overflow: hidden; }
    .fill { height: 100%; background: var(--color-text); transition: width .3s ease; }
    .fill.warn { background: var(--color-text-muted); }
    .fill.danger { background: var(--color-text); }
    .utilization small { white-space: nowrap; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 800px) {
      .row-body { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 480px) {
      .row-body { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .utilization { flex-direction: column; align-items: stretch; gap: 4px; }
      .utilization small { text-align: right; }
    }
  `]
})
export class CardsComponent {
  readonly Math = Math;
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);
  private readonly toast = inject(ToastService);

  readonly showForm = signal(false);
  readonly editing = signal<CreditCard | null>(null);
  readonly toRemove = signal<CreditCard | null>(null);

  form = this.emptyForm();

  readonly list = computed(() => this.finance.creditCards());

  utilization(c: CreditCard): number {
    return c.currentBalance.amount / Math.max(c.creditLimit.amount, 1);
  }

  open(): void {
    this.editing.set(null);
    this.form = this.emptyForm();
    this.showForm.set(true);
  }
  edit(c: CreditCard): void {
    this.editing.set(c);
    this.form = {
      name: c.name,
      issuer: c.issuer,
      last4: c.last4 ?? '',
      creditLimit: c.creditLimit.amount,
      currentBalance: c.currentBalance.amount,
      currency: c.currentBalance.currency,
      annualInterestRate: c.annualInterestRate,
      cat: c.cat,
      cutOffDay: c.cutOffDay,
      paymentDueDay: c.paymentDueDay,
      minimumPayment: c.minimumPayment?.amount,
      noInterestPayment: c.noInterestPayment?.amount
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const card: CreditCard = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      issuer: this.form.issuer,
      last4: this.form.last4,
      creditLimit: { amount: Number(this.form.creditLimit), currency: this.form.currency as 'MXN' },
      currentBalance: { amount: Number(this.form.currentBalance), currency: this.form.currency as 'MXN' },
      annualInterestRate: Number(this.form.annualInterestRate),
      cat: this.form.cat ? Number(this.form.cat) : undefined,
      cutOffDay: Number(this.form.cutOffDay),
      paymentDueDay: Number(this.form.paymentDueDay),
      minimumPayment: this.form.minimumPayment ? { amount: Number(this.form.minimumPayment), currency: this.form.currency as 'MXN' } : undefined,
      noInterestPayment: this.form.noInterestPayment ? { amount: Number(this.form.noInterestPayment), currency: this.form.currency as 'MXN' } : undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertCard(card);
    this.close();
    this.toast.success('Tarjeta guardada', card.name);
  }

  confirmRemove(): void {
    const c = this.toRemove();
    if (c) this.finance.removeCard(c.id);
    this.toRemove.set(null);
    this.toast.info('Tarjeta eliminada');
  }

  private emptyForm() {
    return {
      name: '',
      issuer: '',
      last4: '',
      creditLimit: 0,
      currentBalance: 0,
      currency: 'MXN',
      annualInterestRate: 0,
      cat: undefined as number | undefined,
      cutOffDay: 1,
      paymentDueDay: 15,
      minimumPayment: undefined as number | undefined,
      noInterestPayment: undefined as number | undefined
    };
  }
}