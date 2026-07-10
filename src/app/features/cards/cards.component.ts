import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreditCard, uuid } from '../../core/models';
import { FinanceDataService, FormatService, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

type ViewMode = 'full' | 'payments';

interface CardPaymentInfo {
  card: CreditCard;
  cutOffDate: string;       // ISO
  paymentDueDate: string;   // ISO
  minimumPayment: number;
  noInterestPayment: number;
  currency: string;
}

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
        <div class="view-toggle">
          <button type="button" class="toggle-btn" [class.active]="view() === 'full'" (click)="view.set('full')">
            <app-icon name="list-checks" [size]="14"></app-icon> Info completa
          </button>
          <button type="button" class="toggle-btn" [class.active]="view() === 'payments'" (click)="view.set('payments')">
            <app-icon name="calendar" [size]="14"></app-icon> Solo pagos
          </button>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nueva tarjeta
        </button>
      </div>
    </div>

    @if (cards().length > 0) {
      <div class="card-flat filters mb-4">
        <div class="flex gap-2 items-center flex-wrap">
          <strong class="text-sm" style="margin-right: 4px;">
            <app-icon name="card" [size]="14"></app-icon> Filtrar tarjetas:
          </strong>
          <button type="button" class="btn btn-sm" (click)="selectAllCards()">
            {{ allCardsSelected() ? 'Ninguna' : 'Todas' }}
          </button>
          @for (c of cards(); track c.id) {
            <label class="chip" [class.active]="isCardSelected(c.id)">
              <input type="checkbox" [checked]="isCardSelected(c.id)" (change)="toggleCard(c.id)" />
              <span>{{ c.name }}</span>
            </label>
          }
        </div>
      </div>
    }

    @if (filteredCards().length === 0) {
      <app-empty-state iconName="card" title="Sin tarjetas" message="Agrega tus tarjetas para llevar control del crédito."></app-empty-state>
    } @else {
      @if (view() === 'full') {
        <div class="card-list">
          @for (c of filteredCards(); track c.id) {
            <div class="card-row">
              <div class="row-head">
                <div>
                  <strong>{{ c.name }}</strong>
                  @if (c.institutionPlan) {
                    <span class="badge badge-info" style="margin-left:6px;">Plan con el banco</span>
                  }
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
      } @else {
        <!-- Vista "Solo pagos" -->
        <div class="card">
          <div class="payments-head">
            <div>
              <h2 style="margin: 0;">Fechas y montos clave</h2>
              <small class="text-muted">Para evitar intereses paga el monto "Sin intereses" antes del corte; el mínimo sólo evita recargos.</small>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarjeta</th>
                  <th>Día de corte</th>
                  <th>Día límite de pago</th>
                  <th class="num">Sin intereses</th>
                  <th class="num">Mínimo</th>
                  <th class="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                @for (info of paymentInfo(); track info.card.id) {
                  <tr>
                    <td>
                      <strong>{{ info.card.name }}</strong>
                      @if (info.card.institutionPlan) {
                        <span class="badge badge-info" style="margin-left:6px;">Plan con el banco</span>
                      }
                      <small class="text-muted d-block">{{ info.card.issuer }} • •••• {{ info.card.last4 || '0000' }}</small>
                    </td>
                    <td>
                      <strong>día {{ info.card.cutOffDay }}</strong>
                      <small class="text-muted d-block">próx: {{ fmt.formatDate(info.cutOffDate) }}</small>
                    </td>
                    <td>
                      <strong>día {{ info.card.paymentDueDay }}</strong>
                      <small class="text-muted d-block">próx: {{ fmt.formatDate(info.paymentDueDate) }}</small>
                    </td>
                    @if (info.card.institutionPlan; as plan) {
                      <td class="num" colspan="2">
                        <strong class="text-noi">{{ fmt.formatMoney(plan.fixedMonthlyPayment.amount, plan.fixedMonthlyPayment.currency) }}</strong>
                        <small class="text-muted d-block">pago fijo del plan{{ plan.remainingMonths ? ' · ' + plan.remainingMonths + ' meses restantes' : '' }}</small>
                      </td>
                    } @else {
                      <td class="num">
                        <strong class="text-noi">{{ fmt.formatMoney(info.noInterestPayment, info.currency) }}</strong>
                        @if (info.noInterestPayment === info.card.currentBalance.amount && !info.card.noInterestPayment) {
                          <small class="text-muted d-block">(saldo total)</small>
                        }
                      </td>
                      <td class="num">
                        <strong class="font-mono">{{ fmt.formatMoney(info.minimumPayment, info.currency) }}</strong>
                      </td>
                    }
                    <td class="num">
                      <strong class="font-mono">{{ fmt.formatMoney(info.card.currentBalance.amount, info.currency) }}</strong>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="hint">
            <app-icon name="info" [size]="12"></app-icon>
            Para evitar intereses paga el monto "Sin intereses" antes del <strong>día de corte</strong>.
            El <strong>mínimo</strong> sólo evita recargos, pero el resto genera intereses hasta el siguiente corte.
            Las tarjetas con <strong>plan con el banco</strong> ya tienen un pago fijo acordado y se excluyen de esas heurísticas.
          </p>
        </div>
      }
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
          <div class="field full">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="form.institutionPlanActive" name="institutionPlanActive" />
              Esta tarjeta ya está en un plan de pagos fijo con el banco (reestructura / domiciliación a meses)
            </label>
          </div>
          @if (form.institutionPlanActive) {
            <div class="field"><label>Pago fijo mensual del plan</label><input type="number" required min="0" step="0.01" [(ngModel)]="form.institutionPlanFixedPayment" name="institutionPlanFixedPayment" /></div>
            <div class="field"><label>Meses restantes (opcional)</label><input type="number" min="0" step="1" [(ngModel)]="form.institutionPlanRemainingMonths" name="institutionPlanRemainingMonths" /></div>
            <div class="field full"><label>Notas del plan (opcional)</label><input type="text" [(ngModel)]="form.institutionPlanNotes" name="institutionPlanNotes" placeholder="Ej. Plan a 12 meses sin intereses BBVA" /></div>
          }
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
    .view-toggle { display: inline-flex; gap: 2px; padding: 2px; background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .toggle-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--color-text-muted);
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      transition: background .12s ease, color .12s ease;
    }
    .toggle-btn:hover { color: var(--color-text); }
    .toggle-btn.active { background: var(--color-text); color: var(--color-bg); }
    .toggle-btn.active app-icon { color: var(--color-bg); }

    /* Filtros */
    .filters { padding: 12px 16px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      font-size: 12px; cursor: pointer;
      user-select: none;
      transition: background .12s ease, color .12s ease;
    }
    .chip:hover { background: var(--color-surface-3); }
    .chip.active { background: var(--color-text); color: var(--color-bg); border-color: var(--color-text); }
    .chip input { display: none; }
    .chip span { white-space: nowrap; }

    /* Vista info completa */
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

    /* Vista solo pagos */
    .payments-head { padding-bottom: 12px; border-bottom: 1px solid var(--color-border); margin-bottom: 12px; }
    .payments-head small { display: block; margin-top: 4px; }
    .text-noi { color: var(--color-success, #22c55e); }
    .d-block { display: block; }
    .hint { padding: 12px 16px; color: var(--color-text-muted); font-size: 12px; margin: 0; display: flex; gap: 6px; align-items: flex-start; }
    .hint app-icon { flex-shrink: 0; margin-top: 2px; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text); cursor: pointer; }
    .checkbox-label input { width: auto; }
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
  readonly view = signal<ViewMode>('full');
  readonly selectedCards = signal<Set<string>>(new Set());

  form = this.emptyForm();

  readonly list = computed(() => this.finance.creditCards());
  readonly filteredCards = computed(() => {
    const set = this.selectedCards();
    if (set.size === 0) return this.list();
    return this.list().filter(c => set.has(c.id));
  });
  readonly allCardsSelected = computed(() => this.selectedCards().size === 0);

  isCardSelected(id: string): boolean {
    const set = this.selectedCards();
    return set.size === 0 || set.has(id);
  }

  toggleCard(id: string): void {
    const set = new Set(this.selectedCards());
    if (set.size === 0) {
      const all = this.cards().map(c => c.id);
      all.forEach(c => set.delete(c));
      set.add(id);
    } else if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.selectedCards.set(set);
  }

  selectAllCards(): void {
    if (this.allCardsSelected()) {
      const first = this.cards()[0];
      this.selectedCards.set(new Set(first ? [first.id] : []));
    } else {
      this.selectedCards.set(new Set());
    }
  }

  cards(): CreditCard[] {
    return this.list();
  }

  /** Información de pagos por tarjeta (corte, pago, mínimo, sin intereses). */
  readonly paymentInfo = computed<CardPaymentInfo[]>(() => {
    return this.filteredCards().map(card => {
      const now = new Date();
      // Próxima fecha de corte
      let cutOff = new Date(now.getFullYear(), now.getMonth(), card.cutOffDay);
      if (cutOff < now) cutOff = new Date(now.getFullYear(), now.getMonth() + 1, card.cutOffDay);
      // Próxima fecha de pago (después del corte, en el mes siguiente)
      let payment = new Date(cutOff.getFullYear(), cutOff.getMonth(), card.paymentDueDay);
      if (payment <= cutOff) payment = new Date(cutOff.getFullYear(), cutOff.getMonth() + 1, card.paymentDueDay);
      return {
        card,
        cutOffDate: cutOff.toISOString().slice(0, 10),
        paymentDueDate: payment.toISOString().slice(0, 10),
        minimumPayment: card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1,
        noInterestPayment: card.noInterestPayment?.amount ?? card.currentBalance.amount,
        currency: card.currentBalance.currency
      };
    });
  });

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
      noInterestPayment: c.noInterestPayment?.amount,
      institutionPlanActive: !!c.institutionPlan,
      institutionPlanFixedPayment: c.institutionPlan?.fixedMonthlyPayment.amount,
      institutionPlanRemainingMonths: c.institutionPlan?.remainingMonths,
      institutionPlanNotes: c.institutionPlan?.notes ?? ''
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const currency = this.form.currency as 'MXN';
    const card: CreditCard = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      issuer: this.form.issuer,
      last4: this.form.last4,
      creditLimit: { amount: Number(this.form.creditLimit), currency },
      currentBalance: { amount: Number(this.form.currentBalance), currency },
      annualInterestRate: Number(this.form.annualInterestRate),
      cat: this.form.cat ? Number(this.form.cat) : undefined,
      cutOffDay: Number(this.form.cutOffDay),
      paymentDueDay: Number(this.form.paymentDueDay),
      minimumPayment: this.form.minimumPayment ? { amount: Number(this.form.minimumPayment), currency } : undefined,
      noInterestPayment: this.form.noInterestPayment ? { amount: Number(this.form.noInterestPayment), currency } : undefined,
      institutionPlan: this.form.institutionPlanActive && this.form.institutionPlanFixedPayment
        ? {
            fixedMonthlyPayment: { amount: Number(this.form.institutionPlanFixedPayment), currency },
            remainingMonths: this.form.institutionPlanRemainingMonths ? Number(this.form.institutionPlanRemainingMonths) : undefined,
            notes: this.form.institutionPlanNotes || undefined
          }
        : undefined,
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
      noInterestPayment: undefined as number | undefined,
      institutionPlanActive: false,
      institutionPlanFixedPayment: undefined as number | undefined,
      institutionPlanRemainingMonths: undefined as number | undefined,
      institutionPlanNotes: ''
    };
  }
}