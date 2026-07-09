import { Injectable, computed, inject } from '@angular/core';
import { RiskAlert } from '../models';
import { FinanceDataService } from './finance-data.service';

/**
 * Detección de Riesgos.
 *
 * Calcula alertas automáticamente a partir del estado financiero
 * sin necesidad de IA externa. La IA puede enriquecer las
 * sugerencias, pero este servicio siempre funciona localmente.
 */
@Injectable({ providedIn: 'root' })
export class RiskDetectionService {
  private readonly finance = inject(FinanceDataService);

  /** Liquidez efectiva: ingresos recurrentes - gastos recurrentes. */
  readonly recurringBalance = computed(() => {
    const t = this.finance.totals();
    const monthlyFixedExpenses =
      t.servicesMonthly +
      t.subscriptionsMonthly +
      this.finance.loans().reduce((acc, l) => acc + l.monthlyPayment.amount, 0);
    return t.income / Math.max(this.finance.paymentHistory().length ? 1 : 1, 1) - monthlyFixedExpenses;
  });

  alerts(): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    const data = this.finance.snapshot();
    const now = new Date();

    // 1. Falta de liquidez antes del siguiente ingreso
    const cashBuffer = this.estimateCashBuffer();
    const nextIncome = this.estimateNextIncomeDate();
    const daysUntilIncome = nextIncome
      ? Math.ceil((nextIncome.getTime() - now.getTime()) / 86400000)
      : 30;
    const upcoming = this.upcomingPaymentsTotal(daysUntilIncome);
    if (cashBuffer + upcoming.remainingIncome < upcoming.total && upcoming.total > 0) {
      alerts.push({
        id: 'risk-liquidity',
        title: 'Posible falta de liquidez',
        description: `En los próximos ${daysUntilIncome} días tienes pagos por ${upcoming.total.toFixed(2)} pero solo ${(cashBuffer + upcoming.remainingIncome).toFixed(2)} disponibles.`,
        severity: 'danger',
        suggestion: 'Adelanta ingresos, pospón gastos no esenciales o activa una línea de crédito de respaldo.',
        createdAt: now.toISOString()
      });
    }

    // 2. Riesgo de incumplimiento (pagos prioritarios sin presupuesto)
    const urgent = this.finance
      .loans()
      .filter(l => l.active)
      .filter(l => {
        const due = new Date(now.getFullYear(), now.getMonth(), l.paymentDay);
        if (due < now) due.setMonth(due.getMonth() + 1);
        const diff = (due.getTime() - now.getTime()) / 86400000;
        return diff <= 5;
      });
    if (urgent.length) {
      alerts.push({
        id: 'risk-default',
        title: 'Riesgo de incumplir pagos',
        description: `${urgent.length} préstamo(s) vencen en los próximos 5 días.`,
        severity: 'warning',
        suggestion: 'Asegúrate de reservar el monto mínimo para evitar moratorios.',
        createdAt: now.toISOString()
      });
    }

    // 3. Uso excesivo de tarjetas (más del 70% del límite)
    for (const card of this.finance.creditCards()) {
      const utilization = card.currentBalance.amount / Math.max(card.creditLimit.amount, 1);
      if (utilization >= 0.7) {
        alerts.push({
          id: `risk-card-${card.id}`,
          title: `Uso elevado en ${card.name}`,
          description: `Estás usando el ${(utilization * 100).toFixed(0)}% de tu línea ${card.issuer}.`,
          severity: utilization >= 0.9 ? 'danger' : 'warning',
          suggestion: 'Reduce cargos o liquida para mejorar tu salud crediticia.',
          createdAt: now.toISOString()
        });
      }
    }

    // 4. Incremento anormal del gasto (>30% vs mes anterior)
    const current = this.finance.currentMonthExpenses().reduce((acc, e) => acc + e.amount.amount, 0);
    const previous = this.finance.previousMonthExpenses().reduce((acc, e) => acc + e.amount.amount, 0);
    if (previous > 0 && current / previous >= 1.3) {
      alerts.push({
        id: 'risk-spend-spike',
        title: 'Gasto en aumento',
        description: `Este mes llevas un ${(((current / previous) - 1) * 100).toFixed(0)}% más de gasto que el mes anterior.`,
        severity: 'warning',
        suggestion: 'Revisa las categorías con mayor crecimiento y ajusta presupuestos.',
        createdAt: now.toISOString()
      });
    }

    // 5. Endeudamiento creciente
    const totalDebt = this.finance.totals().totalDebt;
    const monthlyIncome = this.estimateMonthlyIncome();
    if (monthlyIncome > 0 && totalDebt / monthlyIncome >= 6) {
      alerts.push({
        id: 'risk-debt-ratio',
        title: 'Endeudamiento elevado',
        description: `Tu deuda equivale a ${(totalDebt / monthlyIncome).toFixed(1)} meses de ingreso.`,
        severity: 'danger',
        suggestion: 'Considera un plan de aceleración de pagos para reducir intereses.',
        createdAt: now.toISOString()
      });
    }

    // 6. Suscripciones olvidadas (sin uso declarado)
    const forgotten = this.finance.subscriptions().filter(s => s.active && (s.usageLevel === 'rarely' || s.usageLevel === 'never'));
    if (forgotten.length > 0) {
      alerts.push({
        id: 'risk-forgotten-subs',
        title: 'Suscripciones poco usadas',
        description: `Tienes ${forgotten.length} suscripciones marcadas como "raras" o "nunca usadas".`,
        severity: 'info',
        suggestion: 'Revisa si vale la pena cancelarlas para ahorrar mensualmente.',
        createdAt: now.toISOString()
      });
    }

    // 7. Gastos duplicados
    const dupes = this.findDuplicates(data.expenses);
    if (dupes.length > 0) {
      alerts.push({
        id: 'risk-duplicates',
        title: 'Posibles gastos duplicados',
        description: `Detectamos ${dupes.length} cargos similares en los últimos 30 días.`,
        severity: 'warning',
        suggestion: 'Verifica si alguno fue un cobro duplicado del banco o comercio.',
        createdAt: now.toISOString()
      });
    }

    return alerts;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  estimateMonthlyIncome(): number {
    const incomes = this.finance.income();
    if (incomes.length === 0) return 0;
    const now = new Date();
    const months: Record<number, number> = {};
    for (const i of incomes) {
      const m = new Date(i.date).getMonth();
      months[m] = (months[m] ?? 0) + i.amount.amount;
    }
    const current = months[now.getMonth()] ?? 0;
    if (current > 0) return current;
    return Object.values(months).reduce((a, b) => a + b, 0) / Math.max(Object.keys(months).length, 1);
  }

  estimateCashBuffer(): number {
    // Buffer estimado: ingresos del mes - gastos ya registrados
    const income = this.estimateMonthlyIncome();
    const spent = this.finance.currentMonthExpenses().reduce((acc, e) => acc + e.amount.amount, 0);
    return Math.max(income - spent, 0);
  }

  estimateNextIncomeDate(): Date | undefined {
    const recurring = this.finance.income().filter(i => i.recurring && i.recurring !== 'none');
    if (recurring.length === 0) return undefined;
    const now = new Date();
    const sorted = recurring
      .map(i => {
        const d = new Date(i.date);
        d.setFullYear(now.getFullYear(), now.getMonth(), d.getDate());
        if (d < now) d.setMonth(d.getMonth() + 1);
        return d;
      })
      .sort((a, b) => a.getTime() - b.getTime());
    return sorted[0];
  }

  upcomingPaymentsTotal(days = 30): { total: number; remainingIncome: number } {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);
    let total = 0;
    for (const loan of this.finance.loans()) {
      if (!loan.active) continue;
      const due = new Date(now.getFullYear(), now.getMonth(), loan.paymentDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due <= until) total += loan.monthlyPayment.amount;
    }
    for (const card of this.finance.creditCards()) {
      const due = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due <= until) total += card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1;
    }
    const remainingIncome = this.estimateMonthlyIncome() * (days / 30);
    return { total, remainingIncome };
  }

  findDuplicates(expenses: { amount: { amount: number }; date: string; description: string }[]): string[] {
    const matches: string[] = [];
    const recent = expenses.filter(e => {
      const d = new Date(e.date);
      const diff = (Date.now() - d.getTime()) / 86400000;
      return diff <= 30;
    });
    for (let i = 0; i < recent.length; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        if (
          recent[i].amount.amount === recent[j].amount.amount &&
          recent[i].description.toLowerCase().includes(recent[j].description.toLowerCase().slice(0, 5))
        ) {
          matches.push(`${recent[i].description} / ${recent[j].description}`);
        }
      }
    }
    return matches;
  }
}