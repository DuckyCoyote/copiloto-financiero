import { Injectable, inject } from '@angular/core';
import { SimulationResult, uuid } from '../models';
import { FinanceDataService } from './finance-data.service';
import { RiskDetectionService } from './risk-detection.service';

/**
 * Simulación Financiera.
 *
 * Permite responder preguntas de tipo "qué pasa si..." sin
 * modificar datos reales. La simulación es local y aproximada;
 * la IA puede enriquecer las consideraciones cuando está
 * disponible.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly finance = inject(FinanceDataService);
  private readonly risk = inject(RiskDetectionService);

  /**
   * Detecta la intención de la pregunta y devuelve una simulación.
   * No modifica el store.
   */
  simulate(question: string): SimulationResult {
    const lower = question.toLowerCase();
    if (/pago\s+(adicional|extra)/.test(lower)) return this.simulateExtraPayment(question);
    if (/liquidar|qué\s+tarjeta/.test(lower)) return this.simulateCardPayoff(question);
    if (/cuesta\s+más|deuda\s+m[áa]s/.test(lower)) return this.mostExpensiveDebt();
    if (/suscripci[oó]n|cancel/.test(lower)) return this.simulateCancelSubs();
    if (/sueldo|ingreso\s+baja|sueldo\s+baja/.test(lower)) return this.simulateIncomeChange(question);
    if (/salir\s+de\s+deudas/.test(lower)) return this.simulateDebtFree(question);
    if (/pago\s+m[ií]nimo/.test(lower)) return this.simulateMinimumPayments(question);
    if (/compr[ao]\s+(una?|un)?\s?\$?\d/.test(lower)) return this.simulatePurchase(question);
    return this.simulateGeneral(question);
  }

  // ---------------------------------------------------------------------
  // Simulaciones específicas
  // ---------------------------------------------------------------------

  simulateExtraPayment(question: string): SimulationResult {
    const amount = this.extractAmount(question) ?? 1000;
    const targetLoan = this.findLoanInText(question) ?? this.finance.loans().find(l => l.active);
    if (!targetLoan) {
      return this.makeResult(question, 0, 'No encontré un préstamo activo para simular.', [], ['Registra un préstamo para usar esta simulación.']);
    }
    const months = Math.ceil(targetLoan.remainingBalance.amount / (targetLoan.monthlyPayment.amount + amount));
    const monthsStandard = Math.ceil(targetLoan.remainingBalance.amount / targetLoan.monthlyPayment.amount);
    const interestSaved = this.estimateInterest(targetLoan, amount);
    return this.makeResult(
      question,
      interestSaved,
      `Si pagas ${amount.toFixed(2)} adicionales a "${targetLoan.name}", terminarías en ${months} meses en lugar de ${monthsStandard}.`,
      [
        { label: 'Préstamo', value: targetLoan.name },
        { label: 'Saldo actual', value: targetLoan.remainingBalance.amount.toFixed(2) },
        { label: 'Pago mensual actual', value: targetLoan.monthlyPayment.amount.toFixed(2) },
        { label: 'Pago mensual simulado', value: (targetLoan.monthlyPayment.amount + amount).toFixed(2) },
        { label: 'Meses restantes (estándar)', value: monthsStandard.toString() },
        { label: 'Meses restantes (simulado)', value: months.toString() },
        { label: 'Interés estimado ahorrado', value: interestSaved.toFixed(2) }
      ],
      [
        'Confirma con tu banco que no hay penalización por anticipar pagos.',
        'Considera mantener el fondo de emergencia antes de acelerar pagos.'
      ]
    );
  }

  simulateCardPayoff(question: string): SimulationResult {
    const cards = this.finance.creditCards();
    if (cards.length === 0) {
      return this.makeResult(question, 0, 'No tienes tarjetas registradas.', [], ['Registra tus tarjetas para obtener una recomendación.']);
    }
    const sorted = [...cards].sort((a, b) => a.annualInterestRate - b.annualInterestRate);
    const cheapest = sorted[0];
    return this.makeResult(
      question,
      0,
      `La mejor tarjeta para liquidar primero es "${cheapest.name}" (${cheapest.annualInterestRate.toFixed(1)}% anual). Liquida primero la de mayor tasa.`,
      sorted.map(c => ({
        label: `${c.name} (${c.issuer})`,
        value: `${c.annualInterestRate.toFixed(1)}% — saldo ${c.currentBalance.amount.toFixed(2)}`
      })),
      ['Usa el método "avalancha": paga el mínimo en todas y el máximo en la más cara.']
    );
  }

  mostExpensiveDebt(): SimulationResult {
    const debts = this.finance.loans().filter(l => l.active);
    if (debts.length === 0) {
      return this.makeResult('¿Qué deuda me cuesta más dinero?', 0, 'No hay deudas activas.', [], []);
    }
    const top = [...debts].sort((a, b) => b.annualInterestRate - a.annualInterestRate)[0];
    return this.makeResult(
      '¿Qué deuda me cuesta más dinero?',
      top.monthlyPayment.amount * 12 * (top.annualInterestRate / 100),
      `"${top.name}" es tu deuda más cara con una tasa de ${top.annualInterestRate.toFixed(1)}%.`,
      [
        { label: 'Deuda', value: top.name },
        { label: 'Tasa anual', value: `${top.annualInterestRate.toFixed(1)}%` },
        { label: 'Pago mensual', value: top.monthlyPayment.amount.toFixed(2) },
        { label: 'Saldo', value: top.remainingBalance.amount.toFixed(2) }
      ],
      ['Liquidarla primero reduce el costo total del financiamiento.']
    );
  }

  simulateCancelSubs(): SimulationResult {
    const subs = this.finance.subscriptions().filter(s => s.active);
    const monthly = subs.reduce((acc, s) => acc + (s.frequency === 'monthly' ? s.amount.amount : s.amount.amount / 12), 0);
    const yearly = monthly * 12;
    return this.makeResult(
      'Cancelar suscripciones',
      yearly,
      `Si cancelas todas tus suscripciones, ahorrarías ~${monthly.toFixed(2)} al mes (${yearly.toFixed(2)} al año).`,
      subs.map(s => ({ label: s.name, value: `${s.amount.amount.toFixed(2)} / ${s.frequency}` })),
      ['Empieza por las que tengan usageLevel "rarely" o "never".']
    );
  }

  simulateIncomeChange(question: string): SimulationResult {
    const dropMatch = question.match(/(\d{1,2})\s?%/);
    const drop = dropMatch ? parseInt(dropMatch[1], 10) / 100 : 0.15;
    const monthly = this.risk.estimateMonthlyIncome();
    const newIncome = monthly * (1 - drop);
    const fixed = this.finance.totals().servicesMonthly + this.finance.totals().subscriptionsMonthly;
    const surplus = newIncome - fixed;
    return this.makeResult(
      question,
      surplus,
      `Si tu ingreso baja ${(drop * 100).toFixed(0)}%, pasarías de ${monthly.toFixed(2)} a ${newIncome.toFixed(2)} mensuales.`,
      [
        { label: 'Ingreso actual', value: monthly.toFixed(2) },
        { label: 'Nuevo ingreso', value: newIncome.toFixed(2) },
        { label: 'Gastos fijos', value: fixed.toFixed(2) },
        { label: 'Disponible', value: surplus.toFixed(2) }
      ],
      ['Reduce gastos discrecionales y prioriza el fondo de emergencia.']
    );
  }

  simulateDebtFree(_question: string): SimulationResult {
    const debts = this.finance.loans().filter(l => l.active);
    const total = debts.reduce((acc, d) => acc + d.remainingBalance.amount, 0);
    const monthly = debts.reduce((acc, d) => acc + d.monthlyPayment.amount, 0);
    const months = monthly > 0 ? Math.ceil(total / monthly) : 0;
    return this.makeResult(
      'Plan para salir de deudas',
      0,
      `Con tus pagos actuales liquidarías ${total.toFixed(2)} en aproximadamente ${months} meses.`,
      [
        { label: 'Deuda total', value: total.toFixed(2) },
        { label: 'Pago mensual actual', value: monthly.toFixed(2) },
        { label: 'Tiempo estimado', value: `${months} meses` }
      ],
      ['Considera la estrategia bola de nieve (más pequeñas primero) o avalancha (mayor tasa).']
    );
  }

  simulateMinimumPayments(question: string): SimulationResult {
    const cards = this.finance.creditCards();
    const months = question.match(/\b(\d{1,2})\s+mes/);
    const m = months ? parseInt(months[1], 10) : 6;
    let interest = 0;
    for (const c of cards) {
      const monthlyRate = c.annualInterestRate / 100 / 12;
      const min = c.minimumPayment?.amount ?? c.currentBalance.amount * 0.05;
      let balance = c.currentBalance.amount;
      let total = 0;
      for (let i = 0; i < m && balance > 0; i++) {
        const iAmount = balance * monthlyRate;
        balance = Math.max(balance + iAmount - min, 0);
        total += iAmount;
      }
      interest += total;
    }
    return this.makeResult(
      question,
      interest,
      `Pagar solo el mínimo durante ${m} meses te costaría aproximadamente ${interest.toFixed(2)} en intereses.`,
      cards.map(c => ({ label: c.name, value: `Saldo ${c.currentBalance.amount.toFixed(2)}` })),
      ['Liquidar antes del corte evita el cobro de intereses.']
    );
  }

  simulatePurchase(question: string): SimulationResult {
    const amount = this.extractAmount(question) ?? 1000;
    const months = 12;
    const monthlyRate = 0.35 / 12; // estimación conservadora
    const payment = amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
    const total = payment * months;
    const interest = total - amount;
    return this.makeResult(
      question,
      -interest,
      `Comprar ${amount.toFixed(2)} a meses sin intereses (asumiendo 35% TAE) costaría ${payment.toFixed(2)} al mes y ${interest.toFixed(2)} de interés total.`,
      [
        { label: 'Precio', value: amount.toFixed(2) },
        { label: 'Pago mensual', value: payment.toFixed(2) },
        { label: 'Total a pagar', value: total.toFixed(2) },
        { label: 'Interés', value: interest.toFixed(2) }
      ],
      ['Si puedes pagarlo de contado, evita el interés por completo.']
    );
  }

  simulateGeneral(question: string): SimulationResult {
    const income = this.risk.estimateMonthlyIncome();
    const spent = this.finance.currentMonthExpenses().reduce((a, e) => a + e.amount.amount, 0);
    return this.makeResult(
      question,
      income - spent,
      `Este mes llevas ${spent.toFixed(2)} de gastos y ${income.toFixed(2)} de ingresos.`,
      [
        { label: 'Ingreso', value: income.toFixed(2) },
        { label: 'Gasto', value: spent.toFixed(2) },
        { label: 'Balance', value: (income - spent).toFixed(2) }
      ],
      ['Haz una pregunta más específica para obtener una simulación dirigida.']
    );
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private extractAmount(text: string): number | undefined {
    const m = text.match(/\$?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);
    if (!m) return undefined;
    return parseFloat(m[1].replace(/,/g, ''));
  }

  private findLoanInText(text: string) {
    const lower = text.toLowerCase();
    return this.finance.loans().find(l => lower.includes(l.name.toLowerCase()));
  }

  private estimateInterest(loan: { monthlyPayment: { amount: number }; remainingBalance: { amount: number }; annualInterestRate: number }, extra: number): number {
    const months = Math.ceil(loan.remainingBalance.amount / (loan.monthlyPayment.amount + extra));
    const monthlyRate = loan.annualInterestRate / 100 / 12;
    const totalPaid = (loan.monthlyPayment.amount + extra) * months;
    return Math.max(totalPaid - loan.remainingBalance.amount, 0);
  }

  private makeResult(question: string, impact: number, summary: string, table: { label: string; value: string }[], considerations: string[]): SimulationResult {
    return {
      id: uuid(),
      question,
      summary,
      impactAmount: Math.round(impact),
      currency: 'MXN',
      table,
      considerations,
      createdAt: new Date().toISOString()
    };
  }
}