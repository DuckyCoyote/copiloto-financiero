import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconName } from '../../shared/icon/icon.component';
import { PaymentCardDecision, PaymentPlanOverrides, PaymentStrategy, PaymentStrategyAction, PaymentStrategyKind } from '../../core/models';
import { FinanceDataService, FormatService, PaymentPlannerService, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

const KIND_ICON: Record<PaymentStrategyKind, IconName> = {
  no_interest: 'shield-alert',
  avalanche: 'flame',
  snowball: 'circle-dot',
  liquidity: 'wallet',
  ai_custom: 'sparkles'
};

const ACTION_LABEL: Record<PaymentStrategyAction, string> = {
  pay_full: 'Liquidar (sin intereses)',
  pay_minimum: 'Pago mínimo',
  skip: 'Sin pago (en espera)'
};

const ACTION_BADGE: Record<PaymentStrategyAction, string> = {
  pay_full: 'badge-success',
  pay_minimum: 'badge-warning',
  skip: 'badge-danger'
};

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent, IconComponent, ModalComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Estrategias de pago</h1>
        <p class="text-muted">Compara varias formas de repartir tus ingresos entre tarjetas, préstamos y gastos fijos en los próximos {{ horizon() }} días.</p>
      </div>
      <div class="actions">
        <label style="margin: 0;">Horizonte:</label>
        <select [(ngModel)]="horizonValue">
          <option [ngValue]="15">15 días</option>
          <option [ngValue]="30">30 días</option>
          <option [ngValue]="60">60 días</option>
          <option [ngValue]="90">90 días</option>
        </select>
        <button type="button" class="btn btn-primary" (click)="regenerate()">
          <app-icon name="refresh" [size]="14"></app-icon> Actualizar planes
        </button>
        <button type="button" class="btn" (click)="generateWithAi()" [disabled]="aiLoading()">
          <app-icon name="sparkles" [size]="14"></app-icon> {{ aiLoading() ? 'Analizando…' : 'Generar con IA' }}
        </button>
      </div>
    </div>

    @if (finance.creditCards().length === 0) {
      <div class="card mb-4">
        <p class="text-muted" style="margin:0;">Agrega al menos una tarjeta de crédito en la sección "Tarjetas" para poder generar estrategias de pago.</p>
      </div>
    }

    @if (cardsWithInstitutionPlan().length) {
      <div class="card mb-4">
        <p class="text-muted text-sm" style="margin:0;">
          <app-icon name="landmark" [size]="12"></app-icon>
          {{ cardsWithInstitutionPlan().length }} tarjeta(s) ya están en un plan de pagos fijo con el banco y se excluyen de las decisiones (se contabilizan como pago obligatorio):
          {{ cardsWithInstitutionPlan().join(', ') }}.
        </p>
      </div>
    }

    <div class="card ai-instructions mb-4">
      <label>Instrucciones para la IA (opcional)</label>
      <textarea rows="2" [(ngModel)]="aiInstructions" placeholder="Ej. Prioriza liquidar mi tarjeta Banamex primero porque quiero cerrarla; a las demás solo dales el mínimo."></textarea>
      <small class="text-muted">Se usa al pulsar "Generar con IA". La estrategia resultante queda guardada como opción aquí, aunque cambies de página.</small>
    </div>

    <div class="card income-panel mb-4">
      <button type="button" class="income-toggle" (click)="showOverrides.set(!showOverrides())">
        <app-icon name="coins" [size]="16"></app-icon>
        <strong>Ingresos y liquidez usados en el cálculo</strong>
        <app-icon [name]="showOverrides() ? 'chevron-up' : 'chevron-down'" [size]="14"></app-icon>
      </button>

      @if (noRecurringIncome()) {
        <p class="hint text-warning">
          <app-icon name="alert-triangle" [size]="12"></app-icon>
          No tienes ingresos marcados como recurrentes (quincena, mensual, etc.). Sin eso no podemos saber cuándo te llega dinero antes de un corte — agrega tu ingreso en "Ingresos" o usa el ajuste manual abajo.
        </p>
      }

      @if (showOverrides()) {
        <div class="overrides-grid">
          <div class="field">
            <label>Ingreso extra puntual (aguinaldo, bono, venta…)</label>
            <input type="number" min="0" step="0.01" [(ngModel)]="extraIncomeAmount" placeholder="0.00" />
          </div>
          <div class="field">
            <label>Fecha en que llega ese ingreso extra</label>
            <input type="date" [(ngModel)]="extraIncomeDate" />
          </div>
          <div class="field">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="useCashOverride" />
              Ajustar manualmente la liquidez inicial
            </label>
            <input type="number" min="0" step="0.01" [(ngModel)]="cashBufferOverride" [disabled]="!useCashOverride" placeholder="0.00" />
          </div>
        </div>
        <div class="flex justify-end mt-2">
          <button type="button" class="btn btn-sm" (click)="regenerate()">Aplicar ajustes y actualizar</button>
        </div>

        @if (detectedPaydays().length) {
          <div class="paydays mt-2">
            <small class="text-muted">Quincenas/ingresos detectados en el horizonte:</small>
            <div class="payday-chips">
              @for (p of detectedPaydays(); track p.date + p.source) {
                <span class="chip-static">{{ fmt.formatDate(p.date) }} · {{ p.source }} · {{ fmt.formatMoney(p.amount) }}</span>
              }
            </div>
          </div>
        }
      }
    </div>

    @if (strategies().length > 0) {
      <div class="strategy-grid mb-4">
        @for (s of strategies(); track s.id) {
          <button type="button" class="strategy-card" [class.active]="s.id === selectedId()" (click)="selectStrategy(s.id)">
            <div class="strategy-card-head">
              <app-icon [name]="kindIcon(s.kind)" [size]="18"></app-icon>
              <strong>{{ s.name }}</strong>
              @if (s.source === 'ai') {
                <button type="button" class="btn btn-ghost btn-sm strategy-remove" (click)="removeCustomStrategy(s.id, $event)" aria-label="Quitar estrategia">
                  <app-icon name="x" [size]="12"></app-icon>
                </button>
              }
            </div>
            <p class="text-muted text-sm strategy-desc">{{ s.description }}</p>
            <div class="strategy-badges">
              @if (s.recommended) { <span class="badge badge-primary">Recomendada</span> }
              @if (s.source === 'ai') { <span class="badge badge-info">IA</span> }
              @if (!s.feasible) { <span class="badge badge-danger">No alcanza</span> }
            </div>
            <div class="strategy-metrics">
              <div>
                <small class="text-muted">A pagar</small>
                <strong class="font-mono d-block">{{ fmt.formatMoney(s.totals.totalToPay) }}</strong>
              </div>
              <div>
                <small class="text-muted">Interés proy.</small>
                <strong class="font-mono d-block" [class.text-danger]="s.totals.projectedInterest > 0">{{ fmt.formatMoney(s.totals.projectedInterest) }}</strong>
              </div>
              <div>
                <small class="text-muted">Tarjetas</small>
                <strong class="d-block text-sm">{{ s.totals.cardsSettled }} liq · {{ s.totals.cardsMinimumOnly }} mín · {{ s.totals.cardsSkipped }} espera</strong>
              </div>
            </div>
          </button>
        }
      </div>
    }

    @if (selected(); as p) {
      <div class="card ai-summary mb-4">
        <strong>{{ p.name }}:</strong> {{ p.summary }}
        @if (p.aiRationale) {
          <p class="text-muted text-sm mt-2" style="margin-bottom:0;"><app-icon name="sparkles" [size]="12"></app-icon> {{ p.aiRationale }}</p>
        }
      </div>

      @if (p.warnings.length) {
        <div class="card warnings mb-4">
          @for (w of p.warnings; track w) {
            <p class="warning-line"><app-icon name="alert-triangle" [size]="14"></app-icon> {{ w }}</p>
          }
        </div>
      }

      <div class="grid grid-cols-4 mb-4">
        <div class="card">
          <small class="text-muted">Liquidez inicial</small>
          <strong class="font-mono d-block">{{ fmt.formatMoney(p.startingLiquidity) }}</strong>
        </div>
        <div class="card">
          <small class="text-muted">Ingresos esperados</small>
          <strong class="font-mono d-block text-success">+{{ fmt.formatMoney(p.expectedIncome) }}</strong>
        </div>
        <div class="card">
          <small class="text-muted">A reservar</small>
          <strong class="font-mono d-block text-danger">-{{ fmt.formatMoney(p.totals.totalToPay) }}</strong>
        </div>
        <div class="card">
          <small class="text-muted">Restante</small>
          <strong class="font-mono d-block" [class.text-danger]="!p.feasible" [class.text-success]="p.feasible">{{ fmt.formatMoney(p.remainingAfter) }}</strong>
        </div>
      </div>

      @if (p.cardDecisions.length) {
        <div class="card-flat table-wrap mb-4">
          <table>
            <thead>
              <tr>
                <th>Tarjeta</th>
                <th>Acción</th>
                <th class="num">Monto</th>
                <th>Corte</th>
                <th>Límite de pago</th>
                <th>Financiado por</th>
                <th class="num">Interés proy.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (d of p.cardDecisions; track d.cardId) {
                <tr>
                  <td><strong>{{ d.cardName }}</strong></td>
                  <td><span class="badge" [class]="actionBadge(d.action)">{{ actionLabel(d.action) }}</span></td>
                  <td class="num font-mono">{{ fmt.formatMoney(d.amount, d.currency) }}</td>
                  <td class="text-sm">{{ fmt.formatDate(d.cutOffDate) }}</td>
                  <td class="text-sm">{{ fmt.formatDate(d.paymentDueDate) }}</td>
                  <td class="text-sm">
                    @if (d.fundedByPayday) {
                      {{ fmt.formatDate(d.fundedByPayday) }}
                    } @else {
                      <span class="text-warning">sin ingreso a tiempo</span>
                    }
                  </td>
                  <td class="num font-mono" [class.text-danger]="d.projectedInterest > 0">{{ fmt.formatMoney(d.projectedInterest, d.currency) }}</td>
                  <td class="num">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openCardOverride(d)" aria-label="Cambiar decisión">
                      <app-icon name="pencil" [size]="12"></app-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (p.items.length) {
        <div class="card-flat table-wrap">
          <table>
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Razón</th>
                <th class="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              @for (i of p.items; track i.referenceId || i.description) {
                <tr [class.muted]="i.optional">
                  <td><span class="badge" [class]="priorityClass(i.priority)">P{{ i.priority }}</span></td>
                  <td>{{ fmt.formatDate(i.date) }}</td>
                  <td>
                    {{ i.description }}
                    @if (i.optional) { <span class="badge badge-warning" style="margin-left:6px;">opcional</span> }
                  </td>
                  <td class="text-sm text-muted">{{ i.reason }}</td>
                  <td class="num font-mono">{{ fmt.formatMoney(i.amount, i.currency) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <div class="flex justify-end mt-4 gap-2 flex-wrap">
        <button type="button" class="btn" (click)="downloadJson()">
          <app-icon name="download" [size]="14"></app-icon> Descargar JSON
        </button>
        <button type="button" class="btn btn-primary" (click)="confirmApply.set(true)">
          <app-icon name="check" [size]="14"></app-icon> Aplicar «{{ p.name }}»
        </button>
      </div>
    } @else if (strategies().length === 0) {
      <p class="text-muted">Sin estrategias generadas todavía.</p>
    }

    @if (cardOverrideTarget(); as target) {
      <app-modal title="Cambiar decisión de pago" [maxWidth]="420" (close)="cardOverrideTarget.set(null)">
        <p class="text-muted text-sm">{{ target.cardName }} — decide manualmente qué hacer con esta tarjeta en «{{ selected()?.name }}». Los totales se recalculan al instante.</p>
        <div class="field">
          <label>Acción</label>
          <select [(ngModel)]="selectedCardAction">
            <option value="pay_full">Liquidar (pagar sin intereses antes del corte)</option>
            <option value="pay_minimum">Pagar solo el mínimo</option>
            <option value="skip">No pagar este ciclo</option>
          </select>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button type="button" class="btn" (click)="cardOverrideTarget.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" (click)="applyCardOverride()">Aplicar cambio</button>
        </div>
      </app-modal>
    }

    @if (confirmApply()) {
      <app-confirm-dialog
        title="Aplicar estrategia"
        [message]="'Se crearán recordatorios para cada pago de «' + (selected()?.name ?? '') + '». No se modifican tarjetas ni préstamos hasta que confirmes cada pago individualmente.'"
        (confirm)="applyPlan()"
        (cancel)="confirmApply.set(false)">
      </app-confirm-dialog>
    }
  `,
  styles: [`
    .d-block { display: block; }
    .ai-summary { background: linear-gradient(135deg, var(--color-primary-soft), rgba(6, 182, 212, 0.08)); border-color: var(--color-primary); }
    .table-wrap { padding: 0; overflow: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--color-border); }
    th { color: var(--color-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .num { text-align: right; }
    .muted td { color: var(--color-text-muted); }

    /* Panel de ingresos */
    .income-panel { padding: var(--space-4) var(--space-5); }
    .income-toggle {
      display: flex; align-items: center; gap: 8px; width: 100%;
      background: none; border: none; padding: 0; margin: 0;
      color: var(--color-text); font-family: inherit; font-size: 14px; cursor: pointer;
    }
    .income-toggle strong { flex: 1; text-align: left; }
    .hint { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; margin: 10px 0 0; }
    .overrides-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
    .checkbox-label { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .checkbox-label input { width: auto; }
    .paydays { padding-top: 10px; border-top: 1px solid var(--color-border); }
    .payday-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chip-static {
      display: inline-flex; padding: 4px 10px; border-radius: 999px;
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      font-size: 12px; white-space: nowrap;
    }
    @media (max-width: 700px) { .overrides-grid { grid-template-columns: 1fr; } }

    /* Instrucciones para la IA */
    .ai-instructions { padding: var(--space-4) var(--space-5); }
    .ai-instructions label { margin-bottom: 6px; }
    .ai-instructions textarea {
      width: 100%; resize: vertical; font-family: inherit; font-size: 13px;
      padding: 8px 10px; border-radius: var(--radius-md); border: 1px solid var(--color-border);
      background: var(--color-surface); color: var(--color-text); margin-bottom: 6px;
    }

    /* Selector de estrategias */
    .strategy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .strategy-card {
      text-align: left;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      cursor: pointer;
      font-family: inherit;
      color: var(--color-text);
      display: flex; flex-direction: column; gap: 8px;
      transition: border-color .12s ease, background .12s ease;
    }
    .strategy-card:hover { border-color: var(--color-text-muted); }
    .strategy-card.active { border-color: var(--color-primary); background: var(--color-primary-soft); }
    .strategy-card-head { display: flex; align-items: center; gap: 8px; }
    .strategy-remove { margin-left: auto; }
    .strategy-desc { margin: 0; min-height: 34px; }
    .strategy-badges { display: flex; gap: 6px; flex-wrap: wrap; min-height: 20px; }
    .strategy-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 4px; }

    /* Avisos */
    .warnings { border-color: var(--color-warning); background: var(--color-warning-soft); }
    .warning-line { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13px; }
    .warning-line + .warning-line { margin-top: 8px; }
  `]
})
export class PlannerComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);
  private readonly planner = inject(PaymentPlannerService);
  private readonly toast = inject(ToastService);

  readonly horizon = signal(30);
  readonly localStrategies = signal<PaymentStrategy[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly aiLoading = signal(false);
  readonly showOverrides = signal(false);
  readonly confirmApply = signal(false);
  readonly cardOverrideTarget = signal<PaymentCardDecision | null>(null);

  selectedCardAction: PaymentStrategyAction = 'pay_minimum';
  horizonValue = 30;
  extraIncomeAmount: number | null = null;
  extraIncomeDate = '';
  useCashOverride = false;
  cashBufferOverride: number | null = null;
  aiInstructions = '';

  /**
   * Estrategias locales (recalculadas al vuelo) + las persistidas por IA
   * (guardadas por `PaymentPlannerService`, así que también aparecen aquí
   * si se generaron desde el chat).
   */
  readonly strategies = computed<PaymentStrategy[]>(() => [...this.localStrategies(), ...this.planner.customStrategies()]);
  readonly selected = computed(() => this.strategies().find(s => s.id === this.selectedId()) ?? null);
  readonly detectedPaydays = computed(() => this.strategies()[0]?.paydays ?? []);
  readonly noRecurringIncome = computed(() => this.finance.income().every(i => !i.recurring || i.recurring === 'none'));
  readonly cardsWithInstitutionPlan = computed(() => this.finance.creditCards().filter(c => c.institutionPlan).map(c => c.name));

  constructor() {
    this.regenerate();
  }

  regenerate(): void {
    this.horizon.set(this.horizonValue);
    const overrides = this.buildOverrides();
    const currentId = this.selectedId();
    const local = this.planner.generateStrategies(this.horizonValue, overrides);
    this.localStrategies.set(local);
    // Las estrategias de IA persistidas se recalculan bajo el nuevo
    // horizonte/ingresos manteniendo su clasificación por tarjeta, en vez
    // de descartarlas o dejarlas con cifras obsoletas.
    for (const s of this.planner.customStrategies()) {
      this.planner.addCustomStrategy(this.planner.recomputeStrategy(s, this.horizonValue, overrides));
    }
    const stillExists = this.strategies().some(s => s.id === currentId);
    this.selectedId.set(stillExists ? currentId : (local.find(s => s.recommended)?.id ?? local[0]?.id ?? null));
  }

  async generateWithAi(): Promise<void> {
    if (this.aiLoading()) return;
    this.aiLoading.set(true);
    try {
      const overrides = this.buildOverrides();
      const instructions = this.aiInstructions.trim() || undefined;
      const aiStrategies = await this.planner.generateAiStrategies(this.horizonValue, overrides, this.localStrategies(), instructions);
      for (const s of aiStrategies) this.planner.addCustomStrategy(s);
      this.selectedId.set(aiStrategies[0].id);
      this.toast.success('Estrategias generadas', `La IA propuso ${aiStrategies.length} estrategia(s) adicional(es).`);
    } catch (err) {
      this.toast.danger('No se pudo generar con IA', err instanceof Error ? err.message : String(err));
    } finally {
      this.aiLoading.set(false);
    }
  }

  removeCustomStrategy(id: string, ev: Event): void {
    ev.stopPropagation();
    this.planner.removeCustomStrategy(id);
    if (this.selectedId() === id) {
      const local = this.localStrategies();
      this.selectedId.set(local.find(s => s.recommended)?.id ?? local[0]?.id ?? null);
    }
  }

  private buildOverrides(): PaymentPlanOverrides | undefined {
    const overrides: PaymentPlanOverrides = {};
    if (this.extraIncomeAmount && this.extraIncomeAmount > 0) {
      overrides.extraIncomeAmount = this.extraIncomeAmount;
      if (this.extraIncomeDate) overrides.extraIncomeDate = this.extraIncomeDate;
    }
    if (this.useCashOverride && this.cashBufferOverride !== null && this.cashBufferOverride >= 0) {
      overrides.cashBufferOverride = this.cashBufferOverride;
    }
    return Object.keys(overrides).length ? overrides : undefined;
  }

  selectStrategy(id: string): void {
    this.selectedId.set(id);
  }

  kindIcon(kind: PaymentStrategyKind): IconName {
    return KIND_ICON[kind];
  }

  actionLabel(action: PaymentStrategyAction): string {
    return ACTION_LABEL[action];
  }

  actionBadge(action: PaymentStrategyAction): string {
    return ACTION_BADGE[action];
  }

  priorityClass(p: number): string {
    if (p <= 2) return 'badge-danger';
    if (p <= 4) return 'badge-warning';
    return 'badge-info';
  }

  openCardOverride(decision: PaymentCardDecision): void {
    this.selectedCardAction = decision.action;
    this.cardOverrideTarget.set(decision);
  }

  applyCardOverride(): void {
    const target = this.cardOverrideTarget();
    const current = this.selected();
    if (!target || !current) return;
    const overrides = this.buildOverrides();
    const updated = this.planner.applyManualCardOverride(current, target.cardId, this.selectedCardAction, this.horizon(), overrides);
    if (updated.source === 'ai') {
      this.planner.addCustomStrategy(updated);
    } else {
      this.localStrategies.update(list => list.map(s => (s.id === updated.id ? updated : s)));
    }
    this.cardOverrideTarget.set(null);
  }

  downloadJson(): void {
    const data = JSON.stringify(this.selected(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estrategia-pagos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  applyPlan(): void {
    const p = this.selected();
    if (!p) return;
    for (const item of p.items) {
      this.finance.upsertReminder({
        id: `plan-${p.id}-${item.referenceId}-${item.date}`,
        title: `Pago: ${item.description}`,
        description: item.reason,
        date: item.date,
        kind: 'payment',
        done: false,
        referenceId: item.referenceId,
        createdAt: new Date().toISOString()
      });
    }
    for (const d of p.cardDecisions) {
      if (d.action === 'skip') continue;
      this.finance.upsertReminder({
        id: `plan-${p.id}-card-${d.cardId}`,
        title: `${this.actionLabel(d.action)}: ${d.cardName}`,
        description: d.reason,
        date: d.payBy,
        kind: 'payment',
        done: false,
        referenceId: d.cardId,
        createdAt: new Date().toISOString()
      });
    }
    this.confirmApply.set(false);
    this.toast.success('Estrategia aplicada', `${p.items.length + p.cardDecisions.filter(d => d.action !== 'skip').length} recordatorios creados.`);
  }
}
