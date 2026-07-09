import { Injectable, computed, inject } from '@angular/core';
import { FinanceDataService } from './finance-data.service';

/**
 * Resumen Inteligente para el Dashboard.
 *
 * Genera mensajes cortos y accionables a partir del estado
 * financiero actual. Replica el comportamiento descrito en
 * la sección "Resumen Inteligente" del prompt:
 *
 *   "Este mes gastaste un 18% más en comida que el mes anterior."
 *   "Si adelantas el pago de tu tarjeta HSBC ahorrarás $1,250..."
 *   ...
 */
@Injectable({ providedIn: 'root' })
export class SummaryService {
  private readonly finance = inject(FinanceDataService);

  readonly insights = computed(() => this.compute());

  private compute(): { icon: string; text: string; tone: 'success' | 'warning' | 'danger' | 'info' }[] {
    const insights: { icon: string; text: string; tone: 'success' | 'warning' | 'danger' | 'info' }[] = [];
    const now = new Date();
    const currentExpenses = this.finance.currentMonthExpenses();
    const previousExpenses = this.finance.previousMonthExpenses();

    // 1. Comparativa con el mes anterior
    const currentTotal = currentExpenses.reduce((a, e) => a + e.amount.amount, 0);
    const previousTotal = previousExpenses.reduce((a, e) => a + e.amount.amount, 0);
    if (previousTotal > 0) {
      const diff = (currentTotal / previousTotal - 1) * 100;
      if (Math.abs(diff) >= 5) {
        insights.push({
          icon: diff > 0 ? '📈' : '📉',
          text: `Este mes llevas un ${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'más' : 'menos'} de gasto que el mes anterior.`,
          tone: diff > 0 ? 'warning' : 'success'
        });
      }
    }

    // 2. Categoría con mayor crecimiento
    const categoryGrowth = this.compareCategoryGrowth(currentExpenses, previousExpenses);
    if (categoryGrowth) {
      const cat = this.finance.findCategory(categoryGrowth.categoryId);
      if (cat) {
        insights.push({
          icon: cat.icon || '🏷️',
          text: `Gastas un ${categoryGrowth.percent.toFixed(0)}% más en ${cat.name} que el mes anterior.`,
          tone: categoryGrowth.percent > 30 ? 'warning' : 'info'
        });
      }
    }

    // 3. Adelantar tarjeta
    for (const card of this.finance.creditCards()) {
      if (card.currentBalance.amount > 0) {
        const months = Math.ceil(card.currentBalance.amount / (card.minimumPayment?.amount ?? 0));
        const interest = this.estimateInterestMonths(card.currentBalance.amount, card.annualInterestRate, months);
        const minInterest = this.estimateInterestMonths(card.currentBalance.amount, card.annualInterestRate, 1);
        if (interest - minInterest > 100) {
          insights.push({
            icon: '💳',
            text: `Si liquidas ${card.name} este mes evitarás aproximadamente ${(interest - minInterest).toFixed(0)} de intereses futuros.`,
            tone: 'success'
          });
          break;
        }
      }
    }

    // 4. Próximos pagos
    const upcoming = this.upcomingPayments(10);
    if (upcoming.length > 0) {
      const total = upcoming.reduce((a, e) => a + e.amount, 0);
      insights.push({
        icon: '📅',
        text: `En los próximos 10 días tienes ${upcoming.length} pagos por ${total.toFixed(2)}.`,
        tone: 'info'
      });
    }

    // 5. Flujo de efectivo
    const cashBuffer = this.estimateBuffer();
    const nextPayment = this.nextBigPayment();
    if (nextPayment && cashBuffer < nextPayment.amount * 0.5) {
      const d = nextPayment.date.getDate();
      insights.push({
        icon: '⚠️',
        text: `Tu flujo de efectivo podría ser negativo el día ${d}. Reserva al menos ${(nextPayment.amount * 0.5).toFixed(2)}.`,
        tone: 'danger'
      });
    }

    // 6. Suscripciones cancelables
    const cancellable = this.finance.subscriptions().filter(s => s.active && (s.usageLevel === 'rarely' || s.usageLevel === 'never'));
    if (cancellable.length > 0) {
      const saving = cancellable.reduce((acc, s) => acc + (s.frequency === 'monthly' ? s.amount.amount : s.amount.amount / 12), 0);
      insights.push({
        icon: '🔁',
        text: `Podrías ahorrar ~${saving.toFixed(0)} mensuales cancelando ${cancellable.length} suscripciones poco usadas.`,
        tone: 'success'
      });
    }

    // 7. Progreso de metas
    for (const goal of this.finance.goals().filter(g => g.active)) {
      const progress = goal.currentAmount.amount / Math.max(goal.targetAmount.amount, 1);
      if (progress >= 0.8 && progress < 1) {
        insights.push({
          icon: '🎯',
          text: `Estás a ${((1 - progress) * goal.targetAmount.amount).toFixed(0)} de alcanzar tu meta "${goal.name}".`,
          tone: 'success'
        });
      }
    }

    return insights;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private compareCategoryGrowth(current: { categoryId: string; amount: { amount: number } }[], previous: { categoryId: string; amount: { amount: number } }[]): { categoryId: string; percent: number } | null {
    const curMap = new Map<string, number>();
    const prevMap = new Map<string, number>();
    for (const e of current) curMap.set(e.categoryId, (curMap.get(e.categoryId) ?? 0) + e.amount.amount);
    for (const e of previous) prevMap.set(e.categoryId, (prevMap.get(e.categoryId) ?? 0) + e.amount.amount);
    let best: { categoryId: string; percent: number } | null = null;
    for (const [cat, cur] of curMap.entries()) {
      const prev = prevMap.get(cat) ?? 0;
      if (prev <= 0) continue;
      const percent = ((cur / prev) - 1) * 100;
      if (percent >= 15 && (!best || percent > best.percent)) {
        best = { categoryId: cat, percent };
      }
    }
    return best;
  }

  private estimateInterestMonths(principal: number, annualRate: number, months: number): number {
    const r = annualRate / 100 / 12;
    return principal * r * months;
  }

  private upcomingPayments(days: number): { date: Date; amount: number }[] {
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
      if (due <= until) events.push({ date: due, amount: card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1 });
    }
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private estimateBuffer(): number {
    const income = this.finance.totals().income;
    const spent = this.finance.currentMonthExpenses().reduce((a, e) => a + e.amount.amount, 0);
    return Math.max(income - spent, 0);
  }

  private nextBigPayment(): { date: Date; amount: number } | undefined {
    const payments = this.upcomingPayments(20);
    const big = payments.filter(p => p.amount > 500);
    if (big.length === 0) return payments[0];
    return big.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  }
}