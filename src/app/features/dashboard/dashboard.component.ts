import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FinanceDataService, FormatService, OptimizationService, RiskDetectionService, SummaryService } from '../../core/services';
import { BarChartComponent, BarChartDatum } from '../../shared/charts/bar-chart.component';
import { IconComponent, IconName } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BarChartComponent, IconComponent],
  template: `
    <header class="hero">
      <div>
        <h1>Hola, bienvenido a tu Copilot Financiero</h1>
        <p class="text-muted">Aquí tienes un resumen generado automáticamente con tus datos.</p>
      </div>
      <div class="ai-card card">
        <div class="ai-header">
          <app-icon name="sparkles" [size]="18"></app-icon>
          <strong>Resumen inteligente</strong>
        </div>
        @if (insights().length === 0) {
          <p class="text-muted text-sm" style="margin:0;">Registra gastos e ingresos para ver análisis automáticos.</p>
        }
        @for (i of insights(); track i.text) {
          <div class="insight tone-{{ i.tone }}">
            <span>{{ i.icon }}</span>
            <span>{{ i.text }}</span>
          </div>
        }
      </div>
    </header>

    <section class="kpis grid mt-6">
      <div class="card kpi">
        <span class="text-muted text-sm">Ingresos del mes</span>
        <strong class="font-mono">{{ fmt.formatMoney(monthlyIncome()) }}</strong>
      </div>
      <div class="card kpi">
        <span class="text-muted text-sm">Gastos del mes</span>
        <strong class="font-mono text-danger">{{ fmt.formatMoney(monthlyExpense()) }}</strong>
      </div>
      <div class="card kpi">
        <span class="text-muted text-sm">Deuda total</span>
        <strong class="font-mono text-warning">{{ fmt.formatMoney(totals().totalDebt) }}</strong>
      </div>
      <div class="card kpi">
        <span class="text-muted text-sm">Suscripciones / mes</span>
        <strong class="font-mono">{{ fmt.formatMoney(totals().subscriptionsMonthly) }}</strong>
      </div>
    </section>

    <section class="grid mt-6">
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 style="margin:0;">Top categorías del mes</h2>
          <a routerLink="/expenses" class="text-sm">Ver todos →</a>
        </div>
        <app-bar-chart [data]="categoryData()"></app-bar-chart>
      </div>
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 style="margin:0;">Recomendaciones</h2>
          <a routerLink="/chat" class="text-sm">Hablar con IA →</a>
        </div>
        @if (recommendations().length === 0) {
          <p class="text-muted text-sm" style="margin:0;">Aún no hay recomendaciones. Agrega más datos.</p>
        }
        @for (r of recommendations(); track r.id) {
          <div class="rec tone-{{ r.severity }}">
            <strong>{{ r.title }}</strong>
            <p class="text-sm text-muted" style="margin: 4px 0 0 0;">{{ r.description }}</p>
          </div>
        }
      </div>
    </section>

    <section class="grid mt-6">
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 style="margin:0;">Próximos pagos</h2>
          <a routerLink="/planner" class="text-sm">Ver plan →</a>
        </div>
        @if (upcomingPayments().length === 0) {
          <p class="text-muted text-sm" style="margin:0;">No hay pagos próximos.</p>
        }
        @for (p of upcomingPayments(); track p.date) {
          <div class="payment">
            <span class="text-muted">{{ fmt.formatDate(p.date) }}</span>
            <span>{{ p.description }}</span>
            <strong class="font-mono">{{ fmt.formatMoney(p.amount) }}</strong>
          </div>
        }
      </div>
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 style="margin:0;">Alertas</h2>
          <span class="badge" [class.badge-danger]="alerts().length > 0" [class.badge-success]="alerts().length === 0">
            {{ alerts().length }} activas
          </span>
        </div>
        @if (alerts().length === 0) {
          <p class="text-success text-sm" style="margin:0;">Sin alertas activas. ¡Buen trabajo!</p>
        }
        @for (a of alerts(); track a.id) {
          <div class="alert tone-{{ a.severity }}">
            <strong>{{ a.title }}</strong>
            <p class="text-sm text-muted" style="margin: 4px 0 0 0;">{{ a.description }}</p>
            @if (a.suggestion) {
              <p class="text-sm" style="margin: 4px 0 0 0;">💡 {{ a.suggestion }}</p>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: stretch; }
    @media (max-width: 900px) { .hero { grid-template-columns: 1fr; } }
    .hero h1 { font-size: 22px; margin-bottom: 4px; }
    .ai-card { background: var(--color-surface-2); }
    .ai-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .insight {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 10px; border-radius: 8px;
      background: var(--color-surface);
      font-size: 13px; margin-bottom: 6px;
    }
    .insight.tone-success { border-left: 3px solid var(--color-text); }
    .insight.tone-warning { border-left: 3px solid var(--color-text-muted); }
    .insight.tone-danger { border-left: 3px solid var(--color-text); border-left-width: 5px; }
    .insight.tone-info { border-left: 3px solid var(--color-text-dim); }
    .kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .kpi { display: flex; flex-direction: column; gap: 6px; }
    .kpi strong { font-size: 22px; }
    .rec, .alert {
      padding: 10px 12px; border-radius: var(--radius-md);
      background: var(--color-surface-2);
      margin-bottom: 8px;
    }
    .rec.tone-success, .alert.tone-success { border-left: 3px solid var(--color-text); }
    .rec.tone-warning, .alert.tone-warning { border-left: 3px solid var(--color-text-muted); }
    .rec.tone-danger, .alert.tone-danger { border-left: 3px solid var(--color-text); border-left-width: 5px; }
    .rec.tone-info, .alert.tone-info { border-left: 3px solid var(--color-text-dim); }
    .payment {
      display: grid; grid-template-columns: 100px 1fr auto;
      align-items: center; padding: 8px 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 13px; gap: 12px;
    }
    .payment:last-child { border-bottom: none; }
    @media (max-width: 600px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .payment { grid-template-columns: 1fr auto; }
      .payment .text-muted { display: none; }
    }
  `]
})
export class DashboardComponent {
  readonly fmt = inject(FormatService);
  private readonly finance = inject(FinanceDataService);
  private readonly summary = inject(SummaryService);
  private readonly optimization = inject(OptimizationService);
  private readonly risk = inject(RiskDetectionService);

  readonly totals = this.finance.totals;
  readonly insights = this.summary.insights;
  readonly recommendations = computed(() => this.optimization.recommendations().slice(0, 4));
  readonly alerts = computed(() => this.risk.alerts());

  readonly categoryData = computed<BarChartDatum[]>(() => {
    const top = this.finance.topCategoriesThisMonth(5);
    return top.map(t => {
      const cat = this.finance.findCategory(t.categoryId);
      return {
        label: cat?.name ?? 'Sin categoría',
        value: Math.round(t.total),
        color: cat?.color
      };
    });
  });

  readonly upcomingPayments = computed(() => {
    const list: { date: string; description: string; amount: number }[] = [];
    const now = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 20);
    for (const loan of this.finance.loans().filter(l => l.active)) {
      const due = new Date(now.getFullYear(), now.getMonth(), loan.paymentDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due <= horizon) list.push({ date: due.toISOString().slice(0, 10), description: loan.name, amount: loan.monthlyPayment.amount });
    }
    for (const card of this.finance.creditCards()) {
      const due = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due <= horizon) list.push({ date: due.toISOString().slice(0, 10), description: card.name, amount: card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1 });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  });

  readonly monthlyIncome = computed(() => {
    const now = new Date();
    return this.finance.income()
      .filter(i => {
        const d = new Date(i.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((acc, i) => acc + i.amount.amount, 0);
  });

  readonly monthlyExpense = computed(() =>
    this.finance.currentMonthExpenses().reduce((acc, e) => acc + e.amount.amount, 0)
  );
}