import { Injectable, inject } from '@angular/core';
import { FinanceDataService } from './finance-data.service';
import { RiskDetectionService } from './risk-detection.service';
import { Budget } from '../models';

export type PurchaseVerdict = 'recommended' | 'caution' | 'not_recommended' | 'unavailable';

export interface PurchaseEvaluation {
  verdict: PurchaseVerdict;
  /** 0-100: qué tan prudente es hacer la compra hoy. */
  score: number;
  /** Resumen humano, una línea. */
  summary: string;
  /** Factores que ayudaron a la decisión. */
  factors: { label: string; impact: 'positive' | 'negative' | 'neutral'; detail: string }[];
  /** Recomendaciones concretas. */
  suggestions: string[];
}

export interface PurchaseInput {
  amount: number;
  categoryId?: string;
  description?: string;
}

/**
 * "Debería comprar esto?" — evalúa una compra potencial contra
 * el estado financiero actual del usuario.
 *
 * Criterios:
 *  1. ¿Hay dinero disponible después de la compra?
 *  2. ¿Te deja por debajo del colchón de seguridad?
 *  3. ¿Tienes un presupuesto para esta categoría y lo llenas?
 *  4. ¿Hay pagos grandes próximos que comprometan la compra?
 *  5. ¿Cuánto representa del ingreso mensual?
 *  6. ¿Es un gasto recurrente o único?
 */
@Injectable({ providedIn: 'root' })
export class PurchaseAdvisorService {
  private readonly finance = inject(FinanceDataService);
  private readonly risk = inject(RiskDetectionService);

  evaluate(input: PurchaseInput): PurchaseEvaluation {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount === 0) {
      return {
        verdict: 'unavailable',
        score: 0,
        summary: 'Indica el monto de la compra para evaluarla.',
        factors: [],
        suggestions: []
      };
    }

    const factors: PurchaseEvaluation['factors'] = [];
    const suggestions: string[] = [];
    let score = 100;

    const monthlyIncome = this.risk.estimateMonthlyIncome() || 0;
    const cashBuffer = this.risk.estimateCashBuffer();
    const upcoming = this.risk.upcomingPaymentsTotal(15);
    const incomeVsExpense = monthlyIncome > 0 ? monthlyIncome - this.finance.currentMonthExpenses().reduce((a, e) => a + e.amount.amount, 0) : 0;

    // 1) Liquidez actual
    const available = cashBuffer + upcoming.remainingIncome - upcoming.total;
    const ratio = available > 0 ? amount / available : Infinity;

    if (ratio > 1) {
      score -= 60;
      factors.push({ label: 'Liquidez', impact: 'negative', detail: `No tienes dinero suficiente esta quincena (disponible: ${this.fmt(available)}, compra: ${this.fmt(amount)}).` });
      suggestions.push('Pospón la compra para la próxima quincena.');
    } else if (ratio > 0.5) {
      score -= 30;
      factors.push({ label: 'Liquidez', impact: 'negative', detail: `La compra consume más de la mitad de tu liquidez disponible.` });
      suggestions.push('Revisa si puedes recortar otro gasto este mes.');
    } else if (ratio > 0.25) {
      score -= 15;
      factors.push({ label: 'Liquidez', impact: 'neutral', detail: 'La compra deja la liquidez justa.' });
    } else {
      factors.push({ label: 'Liquidez', impact: 'positive', detail: `Te queda liquidez suficiente tras la compra.` });
    }

    // 2) Colchón de seguridad
    if (available - amount < 0) {
      score -= 20;
      factors.push({ label: 'Colchón', impact: 'negative', detail: 'Te quedarías sin margen de maniobra.' });
    } else if ((available - amount) < monthlyIncome * 0.1) {
      score -= 10;
      factors.push({ label: 'Colchón', impact: 'neutral', detail: 'Tu colchón de seguridad quedaría muy bajo.' });
    }

    // 3) Presupuesto por categoría
    if (input.categoryId) {
      const budget = this.findBudgetForCategory(input.categoryId);
      if (budget) {
        const spent = this.spentInCategoryThisPeriod(input.categoryId, budget);
        const newTotal = spent + amount;
        const utilization = newTotal / budget.amount.amount;
        if (utilization > 1) {
          score -= 20;
          factors.push({
            label: 'Presupuesto',
            impact: 'negative',
            detail: `Te pasarías del presupuesto de "${budget.name}" (${this.fmt(spent)} de ${this.fmt(budget.amount.amount)} + ${this.fmt(amount)}).`
          });
        } else if (utilization > 0.8) {
          score -= 8;
          factors.push({ label: 'Presupuesto', impact: 'neutral', detail: `Tu presupuesto de "${budget.name}" quedaría al ${(utilization * 100).toFixed(0)}%.` });
        } else {
          factors.push({ label: 'Presupuesto', impact: 'positive', detail: `Cabe en el presupuesto de "${budget.name}".` });
        }
      } else {
        factors.push({ label: 'Presupuesto', impact: 'neutral', detail: 'No tienes presupuesto definido para esta categoría.' });
        suggestions.push('Considera crear un presupuesto para esta categoría.');
      }
    }

    // 4) Pagos grandes próximos
    const bigPayment = this.biggestUpcomingPayment(15);
    if (bigPayment && bigPayment.amount > monthlyIncome * 0.3) {
      const days = Math.ceil((bigPayment.date.getTime() - Date.now()) / 86400000);
      if (amount > cashBuffer * 0.4) {
        score -= 15;
        factors.push({
          label: 'Pagos grandes',
          impact: 'negative',
          detail: `Tienes un pago de ${this.fmt(bigPayment.amount)} en ${days} días. No comprometas la compra.`
        });
      } else {
        factors.push({
          label: 'Pagos grandes',
          impact: 'neutral',
          detail: `Tienes un pago importante de ${this.fmt(bigPayment.amount)} en ${days} días.`
        });
      }
    }

    // 5) Ratio vs ingreso mensual
    if (monthlyIncome > 0) {
      const vsIncome = amount / monthlyIncome;
      if (vsIncome > 0.5) {
        score -= 15;
        factors.push({ label: 'Vs. ingreso', impact: 'negative', detail: `La compra es más del 50% de tu ingreso mensual.` });
      } else if (vsIncome > 0.2) {
        factors.push({ label: 'Vs. ingreso', impact: 'neutral', detail: `Representa ${(vsIncome * 100).toFixed(0)}% de tu ingreso mensual.` });
      } else {
        factors.push({ label: 'Vs. ingreso', impact: 'positive', detail: `Es un gasto pequeño vs. tu ingreso (${(vsIncome * 100).toFixed(0)}%).` });
      }
    }

    // 6) Categoría esencial vs. discrecional
    if (input.categoryId) {
      const cat = this.finance.findCategory(input.categoryId);
      const discretionary = cat && ['cat-entretenimiento', 'cat-compras', 'cat-suscripciones', 'cat-otros'].includes(cat.id);
      if (discretionary && ratio > 0.4) {
        score -= 10;
        suggestions.push('Es un gasto discrecional; revisa si es necesario ahora.');
      } else if (cat && ['cat-vivienda', 'cat-salud', 'cat-servicios', 'cat-educacion'].includes(cat.id)) {
        factors.push({ label: 'Tipo de gasto', impact: 'positive', detail: 'Es un gasto esencial.' });
      }
    }

    // Si no hay ingreso, la evaluación es limitada
    if (monthlyIncome === 0) {
      factors.push({ label: 'Sin ingresos registrados', impact: 'neutral', detail: 'Aún no registras ingresos. La evaluación es aproximada.' });
      score = Math.max(20, Math.min(score, 60));
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const verdict: PurchaseVerdict =
      score >= 70 ? 'recommended' :
      score >= 40 ? 'caution' :
      'not_recommended';

    const summary =
      verdict === 'recommended' ? `Es un buen momento para esta compra (${this.fmt(amount)}).` :
      verdict === 'caution' ? `Compra con precaución: ${this.fmt(amount)}.` :
      `Mejor espera: esta compra compromete tu estabilidad.`;

    return { verdict, score, summary, factors, suggestions };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private findBudgetForCategory(categoryId: string): Budget | undefined {
    return this.finance.budgets().find(b => b.categoryId === categoryId);
  }

  private spentInCategoryThisPeriod(categoryId: string, budget: Budget): number {
    const now = new Date();
    return this.finance.expenses()
      .filter(e => e.categoryId === categoryId)
      .filter(e => {
        const d = new Date(e.date);
        if (budget.period === 'yearly') return d.getFullYear() === now.getFullYear();
        if (budget.period === 'weekly') {
          const start = new Date(now);
          start.setDate(now.getDate() - now.getDay());
          return d >= start;
        }
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((acc, e) => acc + e.amount.amount, 0);
  }

  private biggestUpcomingPayment(days: number): { date: Date; amount: number } | undefined {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);
    const events: { date: Date; amount: number }[] = [];
    for (const loan of this.finance.loans().filter(l => l.active)) {
      const due = new Date(now.getFullYear(), now.getMonth(), loan.paymentDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due <= until) events.push({ date: due, amount: loan.monthlyPayment.amount });
    }
    for (const card of this.finance.creditCards()) {
      const due = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due <= until) events.push({ date: due, amount: card.minimumPayment?.amount ?? 0 });
    }
    return events.sort((a, b) => b.amount - a.amount)[0];
  }

  private fmt(n: number): string {
    try {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
    } catch {
      return `$${n.toFixed(0)}`;
    }
  }
}