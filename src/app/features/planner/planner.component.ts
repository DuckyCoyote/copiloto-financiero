import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentPlan } from '../../core/models';
import { FinanceDataService, FormatService, PaymentPlannerService, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Plan inteligente de pagos</h1>
        <p class="text-muted">Genera un calendario priorizado para los próximos {{ horizon() }} días.</p>
      </div>
      <div class="actions">
        <label style="margin: 0;">Horizonte:</label>
        <select [(ngModel)]="horizonValue" (change)="regenerate()">
          <option [ngValue]="15">15 días</option>
          <option [ngValue]="30">30 días</option>
          <option [ngValue]="60">60 días</option>
          <option [ngValue]="90">90 días</option>
        </select>
        <button type="button" class="btn btn-primary" (click)="regenerate()">
          <app-icon name="refresh" [size]="14"></app-icon> Regenerar
        </button>
      </div>
    </div>

    @if (plan(); as p) {
      <div class="card ai-summary mb-4">
        <strong>Resumen:</strong> {{ p.summary }}
      </div>
      <div class="grid grid-cols-3 mb-4">
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
          <strong class="font-mono d-block text-danger">-{{ fmt.formatMoney(p.totalToReserve) }}</strong>
        </div>
      </div>

      <div class="card-flat table-wrap">
        <table>
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Razón</th>
              <th class="num">Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (i of p.items; track i.referenceId || i.description) {
              <tr [class.muted]="i.optional">
                <td>
                  <span class="badge" [class]="priorityClass(i.priority)">P{{ i.priority }}</span>
                </td>
                <td>{{ fmt.formatDate(i.date) }}</td>
                <td>
                  {{ i.description }}
                  @if (i.optional) {
                    <span class="badge badge-warning" style="margin-left:6px;">opcional</span>
                  }
                </td>
                <td class="text-sm text-muted">{{ i.reason }}</td>
                <td class="num font-mono">{{ fmt.formatMoney(i.amount, i.currency) }}</td>
                <td class="num">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="override.set(i)" aria-label="Ajustar">
                    <app-icon name="pencil" [size]="12"></app-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="flex justify-end mt-4 gap-2 flex-wrap">
        <button type="button" class="btn" (click)="downloadJson()">
          <app-icon name="download" [size]="14"></app-icon> Descargar JSON
        </button>
        <button type="button" class="btn btn-primary" (click)="confirmApply.set(true)">
          <app-icon name="check" [size]="14"></app-icon> Aceptar plan
        </button>
      </div>
    } @else {
      <p class="text-muted">Sin plan generado todavía.</p>
    }

    @if (override(); as o) {
      <app-confirm-dialog
        title="Ajustar pago"
        [message]="'Indica el monto que prefieres para «' + o.description + '». (Solo se refleja en la previsualización; los datos reales no se modifican hasta aceptar el plan completo).'"
        (confirm)="applyOverride()"
        (cancel)="override.set(null)">
      </app-confirm-dialog>
    }

    @if (confirmApply()) {
      <app-confirm-dialog
        title="Aplicar plan"
        message="Se crearán recordatorios para los pagos incluidos en el plan. No se modifican gastos ni préstamos hasta que confirmes cada pago individualmente."
        (confirm)="applyPlan()"
        (cancel)="confirmApply.set(false)">
      </app-confirm-dialog>
    }
  `,
  styles: [`
    .d-block { display: block; }
    .ai-summary { background: linear-gradient(135deg, var(--color-primary-soft), rgba(6, 182, 212, 0.08)); border-color: var(--color-primary); }
    .table-wrap { padding: 0; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--color-border); }
    th { color: var(--color-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .num { text-align: right; }
    .muted td { color: var(--color-text-muted); }
  `]
})
export class PlannerComponent {
  readonly fmt = inject(FormatService);
  private readonly planner = inject(PaymentPlannerService);
  private readonly finance = inject(FinanceDataService);
  private readonly toast = inject(ToastService);

  readonly horizon = signal(30);
  readonly plan = signal<PaymentPlan | null>(null);
  readonly override = signal<PaymentPlan['items'][number] | null>(null);
  readonly confirmApply = signal(false);

  horizonValue = 30;

  constructor() {
    this.regenerate();
  }

  regenerate(): void {
    this.horizon.set(this.horizonValue);
    this.plan.set(this.planner.generatePlan(this.horizonValue));
  }

  priorityClass(p: number): string {
    if (p <= 2) return 'badge-danger';
    if (p <= 4) return 'badge-warning';
    return 'badge-info';
  }

  applyOverride(): void {
    // En esta versión solo cerramos el diálogo; el plan no aplica
    // cambios automáticamente.
    this.override.set(null);
  }

  downloadJson(): void {
    const data = JSON.stringify(this.plan(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-pagos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  applyPlan(): void {
    const p = this.plan();
    if (!p) return;
    // Crea recordatorios (no modifica gastos ni préstamos).
    for (const item of p.items) {
      this.finance.upsertReminder({
        id: `plan-${item.referenceId}-${item.date}`,
        title: `Pago: ${item.description}`,
        description: item.reason,
        date: item.date,
        kind: 'payment',
        done: false,
        referenceId: item.referenceId,
        createdAt: new Date().toISOString()
      });
    }
    this.confirmApply.set(false);
    this.toast.success('Plan aplicado', `${p.items.length} recordatorios creados.`);
  }
}