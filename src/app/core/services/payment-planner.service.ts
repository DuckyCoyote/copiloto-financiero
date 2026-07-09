import { Injectable, inject } from '@angular/core';
import { PaymentPlan, PaymentPlanItem } from '../models';
import { FinanceDataService } from './finance-data.service';
import { RiskDetectionService } from './risk-detection.service';

/**
 * Planificador Inteligente de Pagos.
 *
 * Genera un calendario priorizado de pagos en función de:
 *  - saldo disponible
 *  - ingresos esperados
 *  - fechas de pago
 *  - prioridad calculada por CAT/interés
 *  - gastos obligatorios
 *
 * El resultado es un plan que el usuario puede aceptar,
 * modificar o rechazar. Nunca aplica cambios al store sin
 * confirmación.
 */
@Injectable({ providedIn: 'root' })
export class PaymentPlannerService {
  private readonly finance = inject(FinanceDataService);
  private readonly risk = inject(RiskDetectionService);

  generatePlan(horizonDays = 30): PaymentPlan {
    const now = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + horizonDays);

    const items: PaymentPlanItem[] = [];

    // 1. Préstamos
    for (const loan of this.finance.loans().filter(l => l.active)) {
      const due = new Date(now.getFullYear(), now.getMonth(), loan.paymentDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due > horizon) continue;
      const priority = this.computeLoanPriority(loan);
      items.push({
        date: due.toISOString().slice(0, 10),
        referenceId: loan.id,
        description: `Pago ${loan.name}`,
        amount: loan.monthlyPayment.amount,
        currency: loan.monthlyPayment.currency,
        priority,
        reason: priority <= 2
          ? `Tasa ${loan.annualInterestRate.toFixed(1)}%, priorízalo`
          : `Cuota mensual estándar`,
        optional: false
      });
    }

    // 2. Tarjetas de crédito
    for (const card of this.finance.creditCards()) {
      const due = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due > horizon) continue;
      const min = card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1;
      const priority = this.computeCardPriority(card);
      items.push({
        date: due.toISOString().slice(0, 10),
        referenceId: card.id,
        description: `Pago mínimo ${card.name}`,
        amount: min,
        currency: card.currentBalance.currency,
        priority,
        reason: priority <= 2
          ? `Saldo alto (${(card.currentBalance.amount / Math.max(card.creditLimit.amount, 1) * 100).toFixed(0)}% del límite)`
          : `Pago mínimo estándar`,
        optional: false
      });
    }

    // 3. Servicios esenciales
    for (const s of this.finance.services().filter(srv => srv.essential)) {
      const due = new Date(s.nextPaymentDate);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due > horizon) continue;
      items.push({
        date: due.toISOString().slice(0, 10),
        referenceId: s.id,
        description: `Servicio esencial ${s.name}`,
        amount: s.amount.amount,
        currency: s.amount.currency,
        priority: 4,
        reason: 'Servicio esencial (no negociable)',
        optional: false
      });
    }

    // 4. Suscripciones (prioridad baja)
    for (const sub of this.finance.subscriptions().filter(s => s.active)) {
      const due = new Date(sub.nextBillingDate);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due > horizon) continue;
      items.push({
        date: due.toISOString().slice(0, 10),
        referenceId: sub.id,
        description: `Suscripción ${sub.name}`,
        amount: sub.amount.amount,
        currency: sub.amount.currency,
        priority: sub.usageLevel === 'never' || sub.usageLevel === 'rarely' ? 8 : 6,
        reason: sub.usageLevel === 'never'
          ? 'Marcada como "nunca usada" — considera cancelar'
          : 'Suscripción activa',
        optional: sub.usageLevel === 'rarely' || sub.usageLevel === 'never'
      });
    }

    // Ordenar por prioridad y fecha
    items.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date));

    const total = items.reduce((acc, i) => acc + i.amount, 0);
    const startingLiquidity = this.risk.estimateCashBuffer();
    const expectedIncome = this.risk.estimateMonthlyIncome() * (horizonDays / 30);
    const totalToReserve = total;

    const summary = this.buildSummary(items, startingLiquidity, expectedIncome);

    return {
      generatedAt: now.toISOString(),
      summary,
      items,
      startingLiquidity,
      expectedIncome,
      totalToReserve
    };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private computeLoanPriority(loan: { annualInterestRate: number; remainingBalance: { amount: number } }): number {
    // Más alta la tasa y más alto el saldo, mayor prioridad.
    if (loan.annualInterestRate >= 60) return 1;
    if (loan.annualInterestRate >= 40) return 2;
    if (loan.annualInterestRate >= 25) return 3;
    return 5;
  }

  private computeCardPriority(card: { currentBalance: { amount: number }; creditLimit: { amount: number }; annualInterestRate: number }): number {
    const usage = card.currentBalance.amount / Math.max(card.creditLimit.amount, 1);
    if (usage >= 0.9) return 1;
    if (usage >= 0.7) return 2;
    if (card.annualInterestRate >= 60) return 3;
    return 5;
  }

  private buildSummary(items: PaymentPlanItem[], liquidity: number, expectedIncome: number): string {
    const total = items.reduce((acc, i) => acc + i.amount, 0);
    const available = liquidity + expectedIncome;
    if (total > available) {
      return `Necesitas ${total.toFixed(2)} pero solo dispondrás de ${available.toFixed(2)}. Considera renegociar o aplazar pagos de prioridad baja.`;
    }
    const remaining = available - total;
    return `Reservar ${total.toFixed(2)} en los próximos pagos. Te quedarán aproximadamente ${remaining.toFixed(2)} libres.`;
  }
}