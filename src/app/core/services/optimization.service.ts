import { Injectable, inject } from '@angular/core';
import { AIRecommendation } from '../models';
import { FinanceDataService } from './finance-data.service';

/**
 * Optimización Financiera.
 *
 * Genera recomendaciones accionables (qué deuda pagar primero,
 * qué tarjeta conviene usar, qué servicios recortar, etc.) sin
 * depender de un proveedor externo.
 */
@Injectable({ providedIn: 'root' })
export class OptimizationService {
  private readonly finance = inject(FinanceDataService);

  recommendations(): AIRecommendation[] {
    const recs: AIRecommendation[] = [];
    recs.push(...this.recommendDebtPriority());
    recs.push(...this.recommendCreditCard());
    recs.push(...this.recommendAdvancePayments());
    recs.push(...this.recommendCancelSubscriptions());
    recs.push(...this.recommendSavings());
    return recs.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }

  // ---------------------------------------------------------------------
  // Estrategias
  // ---------------------------------------------------------------------

  /** Qué deuda pagar primero (avalancha: mayor interés). */
  recommendDebtPriority(): AIRecommendation[] {
    const debts = this.finance
      .loans()
      .filter(l => l.active)
      .sort((a, b) => b.annualInterestRate - a.annualInterestRate);
    if (debts.length < 2) return [];
    const top = debts[0];
    return [
      {
        id: 'rec-debt-priority',
        title: 'Prioriza la deuda con mayor interés',
        description: `"${top.name}" tiene la tasa más alta (${top.annualInterestRate.toFixed(1)}%). Enfócate en liquidarla primero para reducir el costo total.`,
        severity: 'warning',
        createdAt: new Date().toISOString()
      }
    ];
  }

  /** Qué tarjeta usar para minimizar intereses. */
  recommendCreditCard(): AIRecommendation[] {
    const cards = this.finance.creditCards();
    if (cards.length === 0) return [];
    const sorted = [...cards].sort((a, b) => a.annualInterestRate - b.annualInterestRate);
    const cheapest = sorted[0];
    const mostExpensive = sorted[sorted.length - 1];
    const recs: AIRecommendation[] = [
      {
        id: 'rec-card-cheapest',
        title: `Usa ${cheapest.name} para compras a meses`,
        description: `Es la tarjeta con la tasa más baja (${cheapest.annualInterestRate.toFixed(1)}%). Aplazar pagos aquí cuesta menos.`,
        severity: 'info',
        createdAt: new Date().toISOString()
      }
    ];
    if (mostExpensive.id !== cheapest.id) {
      recs.push({
        id: 'rec-card-expensive',
        title: `Evita aplazar en ${mostExpensive.name}`,
        description: `Su tasa es ${mostExpensive.annualInterestRate.toFixed(1)}%. Si puedes, paga el total antes del corte para no pagar intereses.`,
        severity: 'warning',
        createdAt: new Date().toISOString()
      });
    }
    return recs;
  }

  /** Adelantar pagos en créditos con mayor CAT. */
  recommendAdvancePayments(): AIRecommendation[] {
    const debts = this.finance.loans().filter(l => l.active);
    if (debts.length === 0) return [];
    const highestCat = [...debts].sort((a, b) => (b.cat ?? 0) - (a.cat ?? 0))[0];
    if ((highestCat.cat ?? 0) < 30) return [];
    return [
      {
        id: 'rec-advance',
        title: `Adelanta pagos en "${highestCat.name}"`,
        description: `Su CAT es ${(highestCat.cat ?? 0).toFixed(1)}%. Adelantar pagos reduce el interés compuesto.`,
        severity: 'warning',
        actionLabel: 'Crear recordatorio',
        createdAt: new Date().toISOString()
      }
    ];
  }

  /** Cancelar suscripciones poco usadas. */
  recommendCancelSubscriptions(): AIRecommendation[] {
    const subs = this.finance.subscriptions().filter(s => s.active && (s.usageLevel === 'rarely' || s.usageLevel === 'never'));
    if (subs.length === 0) return [];
    const monthlySavings = subs.reduce((acc, s) => acc + (s.frequency === 'monthly' ? s.amount.amount : s.amount.amount / 12), 0);
    return [
      {
        id: 'rec-cancel-subs',
        title: `${subs.length} suscripción(es) podrían cancelarse`,
        description: `Podrías ahorrar aproximadamente ${monthlySavings.toFixed(2)} al mes.`,
        severity: 'info',
        createdAt: new Date().toISOString()
      }
    ];
  }

  /** Cuánto se puede ahorrar este mes. */
  recommendSavings(): AIRecommendation[] {
    const income = this.finance.totals().income;
    const spent = this.finance.currentMonthExpenses().reduce((acc, e) => acc + e.amount.amount, 0);
    if (income === 0) return [];
    const available = Math.max(income - spent, 0);
    if (available <= 0) return [];
    const suggested = Math.round(available * 0.2);
    if (suggested < 100) return [];
    return [
      {
        id: 'rec-save',
        title: 'Reserva para ahorro',
        description: `Tienes ${available.toFixed(2)} disponibles este mes. Sugerimos reservar al menos ${suggested.toFixed(2)} (20%) para tu meta de ahorro.`,
        severity: 'success',
        createdAt: new Date().toISOString()
      }
    ];
  }
}

function severityRank(s: AIRecommendation['severity']): number {
  switch (s) {
    case 'danger': return 4;
    case 'warning': return 3;
    case 'info': return 2;
    case 'success': return 1;
  }
}