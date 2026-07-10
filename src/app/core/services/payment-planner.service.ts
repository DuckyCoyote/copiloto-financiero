import { Injectable, inject, signal } from '@angular/core';
import {
  CreditCard,
  PaymentCardDecision,
  PaymentPlan,
  PaymentPlanItem,
  PaymentPlanOverrides,
  PaymentStrategy,
  PaymentStrategyAction,
  PaymentStrategyKind,
  ProjectedPayday
} from '../models';
import { AIService } from './ai.service';
import { FinanceDataService } from './finance-data.service';
import { RiskDetectionService } from './risk-detection.service';
import { STORAGE_KEYS, StorageService } from './storage.service';

interface AiStrategyDraft {
  name: string;
  description: string;
  rationale: string;
  settle: Set<string>;
  skip: Set<string>;
}

/**
 * Planificador Inteligente de Pagos.
 *
 * Genera varias estrategias de pago comparables (anti-intereses,
 * avalancha, bola de nieve, conservadora) a partir de:
 *  - saldo y tasa de cada tarjeta
 *  - fechas de corte / pago
 *  - quincenas e ingresos proyectados
 *  - gastos obligatorios (préstamos, servicios esenciales, suscripciones)
 *
 * Toda la aritmética (montos, intereses proyectados, viabilidad) la
 * calcula este servicio de forma determinista. La IA (opcional) solo
 * decide, tarjeta por tarjeta, si conviene liquidar, pagar mínimo o
 * dejar en espera, y aporta el razonamiento — nunca hace el cálculo
 * numérico, para evitar que alucine cifras.
 *
 * Ningún método aplica cambios al store sin que el usuario confirme
 * explícitamente (ver `applyPlan` en `PlannerComponent`).
 */
@Injectable({ providedIn: 'root' })
export class PaymentPlannerService {
  private readonly finance = inject(FinanceDataService);
  private readonly risk = inject(RiskDetectionService);
  private readonly ai = inject(AIService);
  private readonly storage = inject(StorageService);

  /**
   * Estrategias generadas por IA (desde el planificador o desde el chat),
   * persistidas para que aparezcan como opción en la sección "Planes de
   * pago" aunque se hayan creado desde otra pantalla.
   */
  private readonly _customStrategies = signal<PaymentStrategy[]>(
    this.storage.read<PaymentStrategy[]>(STORAGE_KEYS.paymentStrategies, [])
  );
  readonly customStrategies = this._customStrategies.asReadonly();

  /** Crea o reemplaza (por id) una estrategia personalizada persistida. */
  addCustomStrategy(strategy: PaymentStrategy): void {
    this._customStrategies.update(list => {
      const idx = list.findIndex(s => s.id === strategy.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = strategy;
        return next;
      }
      return [strategy, ...list];
    });
    this.storage.write(STORAGE_KEYS.paymentStrategies, this._customStrategies());
  }

  removeCustomStrategy(id: string): void {
    this._customStrategies.update(list => list.filter(s => s.id !== id));
    this.storage.write(STORAGE_KEYS.paymentStrategies, this._customStrategies());
  }

  // ---------------------------------------------------------------------
  // API legado (un único plan). Se mantiene para compatibilidad con
  // el asistente de chat, que da una respuesta rápida sin IA.
  // ---------------------------------------------------------------------

  generatePlan(horizonDays = 30): PaymentPlan {
    const now = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + horizonDays);

    const items: PaymentPlanItem[] = this.buildMandatoryItems(horizonDays);

    // Las tarjetas con plan fijo ya están incluidas en `buildMandatoryItems`.
    for (const card of this.finance.creditCards().filter(c => !c.institutionPlan)) {
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

    items.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date));

    const total = items.reduce((acc, i) => acc + i.amount, 0);
    const startingLiquidity = this.risk.estimateCashBuffer();
    const expectedIncome = this.risk.estimateMonthlyIncome() * (horizonDays / 30);
    const totalToReserve = total;

    const summary = this.buildLegacySummary(items, startingLiquidity, expectedIncome);

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
  // Estrategias múltiples (nuevo motor)
  // ---------------------------------------------------------------------

  /** Genera las 4 estrategias heurísticas locales, sin llamar a la IA. */
  generateStrategies(horizonDays = 30, overrides?: PaymentPlanOverrides): PaymentStrategy[] {
    const now = new Date();
    // Las tarjetas ya enroladas en un plan de pagos fijo con el banco no
    // participan de las heurísticas de liquidar/mínimo/espera: su pago
    // fijo ya se contabiliza como obligatorio en `buildMandatoryItems`.
    const cards = this.finance.creditCards().filter(c => !c.institutionPlan);
    const mandatoryTotal = this.buildMandatoryItems(horizonDays).reduce((acc, i) => acc + i.amount, 0);
    const paydays = this.projectPaydays(horizonDays, overrides);
    const startingLiquidity = overrides?.cashBufferOverride ?? this.risk.estimateCashBuffer();
    const expectedIncome = paydays.reduce((acc, p) => acc + p.amount, 0);
    const availableForCards = Math.max(startingLiquidity + expectedIncome - mandatoryTotal, 0);

    const noInterestDecisions = this.allocateCards(
      cards,
      (a, b) => {
        // Prioriza lo más urgente (corte más próximo); en empate, tasa más alta primero.
        const diff = this.cardKeyDates(a, now).cutOffDate.getTime() - this.cardKeyDates(b, now).cutOffDate.getTime();
        return diff !== 0 ? diff : b.annualInterestRate - a.annualInterestRate;
      },
      availableForCards, now, paydays
    );

    const avalancheDecisions = this.allocateCards(cards, (a, b) => b.annualInterestRate - a.annualInterestRate, availableForCards, now, paydays);

    const snowballDecisions = this.allocateCards(cards, (a, b) => a.currentBalance.amount - b.currentBalance.amount, availableForCards, now, paydays);

    const liquidityDecisions = this.allocateMinimumOnly(cards, availableForCards, now, paydays);

    const strategies: PaymentStrategy[] = [
      this.assembleStrategy({
        id: 'no_interest',
        kind: 'no_interest',
        name: 'Blindaje anti-intereses',
        description: 'Liquida cada tarjeta antes de su fecha de corte usando tus próximas quincenas, para no generar intereses en ninguna. Si el presupuesto no alcanza para todas, protege primero las que cortan más pronto.',
        horizonDays, overrides, source: 'local', cardDecisions: noInterestDecisions
      }),
      this.assembleStrategy({
        id: 'avalanche',
        kind: 'avalanche',
        name: 'Avalancha (mayor interés primero)',
        description: 'Liquida primero las tarjetas con la tasa de interés más alta; el resto recibe solo el pago mínimo (o queda en espera si no alcanza) para minimizar el interés total pagado.',
        horizonDays, overrides, source: 'local', cardDecisions: avalancheDecisions
      }),
      this.assembleStrategy({
        id: 'snowball',
        kind: 'snowball',
        name: 'Bola de nieve (saldo menor primero)',
        description: 'Liquida primero las tarjetas con menor saldo para cerrarlas rápido y liberar pagos mínimos cuanto antes; el resto recibe pago mínimo o queda en espera.',
        horizonDays, overrides, source: 'local', cardDecisions: snowballDecisions
      }),
      this.assembleStrategy({
        id: 'liquidity',
        kind: 'liquidity',
        name: 'Conservadora (protege tu liquidez)',
        description: 'Paga solo el mínimo en todas las tarjetas para conservar efectivo disponible. Genera más interés con el tiempo, pero reduce el riesgo de quedarte sin liquidez para gastos esenciales.',
        horizonDays, overrides, source: 'local', cardDecisions: liquidityDecisions
      })
    ];

    this.markRecommended(strategies);
    return strategies;
  }

  /**
   * Pide a la IA que proponga hasta 2 estrategias adicionales, dado el
   * mismo contexto financiero y las estrategias locales ya calculadas
   * (para que compare y no las repita). La IA solo clasifica tarjetas
   * en "liquidar" / "mínimo" / "dejar en espera"; los montos, el
   * interés proyectado y la viabilidad los calcula este servicio.
   */
  async generateAiStrategies(
    horizonDays: number,
    overrides: PaymentPlanOverrides | undefined,
    baseStrategies: PaymentStrategy[],
    instructions?: string
  ): Promise<PaymentStrategy[]> {
    if (!this.ai.isConfigured()) {
      throw new Error('La IA no está configurada. Actívala en Configuración para generar estrategias con IA.');
    }
    // Las tarjetas ya enroladas en un plan de pagos fijo con el banco no
    // son decidibles por la IA (settle/minimum/skip): su pago ya está
    // comprometido. Se le informan como contexto, no como opción.
    const cards = this.finance.creditCards().filter(c => !c.institutionPlan);
    const committedCards = this.finance.creditCards().filter(c => c.institutionPlan);
    if (cards.length === 0 && committedCards.length === 0) {
      throw new Error('No hay tarjetas registradas para analizar.');
    }

    const now = new Date();
    const paydays = this.projectPaydays(horizonDays, overrides);
    const startingLiquidity = overrides?.cashBufferOverride ?? this.risk.estimateCashBuffer();
    const expectedIncome = paydays.reduce((acc, p) => acc + p.amount, 0);
    const mandatoryTotal = this.buildMandatoryItems(horizonDays).reduce((acc, i) => acc + i.amount, 0);

    const cardsInfo = cards.map(c => {
      const { cutOffDate, paymentDueDate } = this.cardKeyDates(c, now);
      return {
        id: c.id,
        name: c.name,
        balance: c.currentBalance.amount,
        limit: c.creditLimit.amount,
        annualRate: c.annualInterestRate,
        minimumPayment: c.minimumPayment?.amount ?? c.currentBalance.amount * 0.1,
        noInterestPayment: c.noInterestPayment?.amount ?? c.currentBalance.amount,
        cutOffDate: this.toISODate(cutOffDate),
        paymentDueDate: this.toISODate(paymentDueDate)
      };
    });

    const committedInfo = committedCards.map(c => ({
      name: c.name,
      issuer: c.issuer,
      fixedMonthlyPayment: c.institutionPlan!.fixedMonthlyPayment.amount,
      remainingMonths: c.institutionPlan!.remainingMonths
    }));

    const { system, user } = this.buildAiPrompt({
      cardsInfo, committedInfo, paydays, startingLiquidity, expectedIncome, mandatoryTotal, horizonDays, baseStrategies, instructions
    });

    const response = await this.ai.chat([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]);

    const drafts = this.parseAiStrategies(response.content, cards.map(c => c.id));
    if (drafts.length === 0) {
      throw new Error('La IA no devolvió estrategias válidas. Intenta de nuevo.');
    }

    return drafts.map((draft, idx) => {
      const decisions = cards.map(card => {
        const action: PaymentStrategyAction = draft.settle.has(card.id)
          ? 'pay_full'
          : draft.skip.has(card.id)
            ? 'skip'
            : 'pay_minimum';
        return this.buildCardDecision(card, action, now, paydays);
      });
      return this.assembleStrategy({
        id: `ai-${idx + 1}-${Date.now()}`,
        kind: 'ai_custom',
        name: draft.name,
        description: draft.description,
        horizonDays, overrides, source: 'ai',
        cardDecisions: decisions,
        aiRationale: draft.rationale
      });
    });
  }

  /**
   * Recalcula una estrategia completa (local o de IA) bajo un nuevo
   * horizonte/overrides, conservando la clasificación por tarjeta
   * (pay_full/pay_minimum/skip) que ya tenía. Se usa al pulsar
   * "Actualizar planes" para que las estrategias generadas por IA no
   * queden con cifras obsoletas cuando cambian los ingresos u horizonte.
   */
  recomputeStrategy(strategy: PaymentStrategy, horizonDays: number, overrides?: PaymentPlanOverrides): PaymentStrategy {
    const now = new Date();
    // Si una tarjeta se enroló en un plan con el banco después de generar
    // la estrategia, se retira de las decisiones (pasa a partida obligatoria).
    const cards = this.finance.creditCards().filter(c => !c.institutionPlan);
    const paydays = this.projectPaydays(horizonDays, overrides);
    const cardDecisions = strategy.cardDecisions
      .map(d => {
        const card = cards.find(c => c.id === d.cardId);
        return card ? this.buildCardDecision(card, d.action, now, paydays) : null;
      })
      .filter((d): d is PaymentCardDecision => d !== null);
    return this.assembleStrategy({
      id: strategy.id,
      kind: strategy.kind,
      name: strategy.name,
      description: strategy.description,
      horizonDays, overrides, source: strategy.source,
      cardDecisions,
      aiRationale: strategy.aiRationale
    });
  }

  /**
   * Recalcula una estrategia existente forzando la acción de UNA tarjeta
   * (p. ej. el usuario decide manualmente liquidar una tarjeta que la
   * estrategia dejaba en espera). El resto de las tarjetas conserva su
   * decisión original; los totales se recalculan de forma determinista.
   */
  applyManualCardOverride(
    strategy: PaymentStrategy,
    cardId: string,
    action: PaymentStrategyAction,
    horizonDays: number,
    overrides?: PaymentPlanOverrides
  ): PaymentStrategy {
    const now = new Date();
    const card = this.finance.creditCards().find(c => c.id === cardId && !c.institutionPlan);
    if (!card) return strategy;
    const cardDecisions = strategy.cardDecisions.map(d =>
      d.cardId === cardId ? this.buildCardDecision(card, action, now, strategy.paydays) : d
    );
    return this.assembleStrategy({
      id: strategy.id,
      kind: strategy.kind,
      name: strategy.name,
      description: strategy.description,
      horizonDays, overrides, source: strategy.source,
      cardDecisions,
      aiRationale: strategy.aiRationale
    });
  }

  // ---------------------------------------------------------------------
  // Ingresos / quincenas
  // ---------------------------------------------------------------------

  /**
   * Proyecta las fechas de ingreso ("quincenas") dentro del horizonte a
   * partir de los ingresos recurrentes registrados. Para `biweekly` se
   * usa la convención de nómina mexicana (día 15 y último día de mes);
   * el resto usa la periodicidad indicada.
   */
  projectPaydays(horizonDays: number, overrides?: PaymentPlanOverrides): ProjectedPayday[] {
    const now = new Date();
    const horizonEnd = new Date();
    horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
    const paydays: ProjectedPayday[] = [];

    // Solo la fuente de ingreso recurrente más reciente por descripción,
    // para no proyectar duplicados si hay varios registros históricos.
    const bySource = new Map<string, { date: string; amount: number; description: string; recurring: string }>();
    for (const inc of this.finance.income().filter(i => i.recurring && i.recurring !== 'none')) {
      const key = `${inc.description}|${inc.recurring}`;
      const existing = bySource.get(key);
      if (!existing || inc.date > existing.date) {
        bySource.set(key, { date: inc.date, amount: inc.amount.amount, description: inc.description, recurring: inc.recurring! });
      }
    }

    for (const src of bySource.values()) {
      const anchor = new Date(src.date);
      if (isNaN(anchor.getTime())) continue;

      if (src.recurring === 'biweekly') {
        let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
        while (cursor <= horizonEnd) {
          const fifteenth = new Date(cursor.getFullYear(), cursor.getMonth(), 15);
          const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
          for (const d of [fifteenth, lastDay]) {
            if (d >= this.startOfDay(now) && d <= horizonEnd) {
              paydays.push({ date: this.toISODate(d), amount: src.amount, source: src.description });
            }
          }
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
      } else if (src.recurring === 'weekly') {
        let d = new Date(now.getFullYear(), now.getMonth(), anchor.getDate());
        while (d < this.startOfDay(now)) d.setDate(d.getDate() + 7);
        while (d <= horizonEnd) {
          paydays.push({ date: this.toISODate(d), amount: src.amount, source: src.description });
          d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
        }
      } else if (src.recurring === 'monthly') {
        let d = new Date(now.getFullYear(), now.getMonth(), anchor.getDate());
        if (d < this.startOfDay(now)) d = new Date(d.getFullYear(), d.getMonth() + 1, anchor.getDate());
        while (d <= horizonEnd) {
          paydays.push({ date: this.toISODate(d), amount: src.amount, source: src.description });
          d = new Date(d.getFullYear(), d.getMonth() + 1, anchor.getDate());
        }
      } else if (src.recurring === 'yearly') {
        let d = new Date(now.getFullYear(), anchor.getMonth(), anchor.getDate());
        if (d < this.startOfDay(now)) d = new Date(d.getFullYear() + 1, anchor.getMonth(), anchor.getDate());
        if (d <= horizonEnd) paydays.push({ date: this.toISODate(d), amount: src.amount, source: src.description });
      }
    }

    if (overrides?.extraIncomeAmount && overrides.extraIncomeAmount > 0) {
      const date = overrides.extraIncomeDate ?? this.toISODate(now);
      paydays.push({ date, amount: overrides.extraIncomeAmount, source: 'Ingreso extra' });
    }

    paydays.sort((a, b) => a.date.localeCompare(b.date));
    return paydays;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private assembleStrategy(params: {
    id: string;
    kind: PaymentStrategyKind;
    name: string;
    description: string;
    source: 'local' | 'ai';
    horizonDays: number;
    overrides?: PaymentPlanOverrides;
    cardDecisions: PaymentCardDecision[];
    aiRationale?: string;
  }): PaymentStrategy {
    const now = new Date();
    const items = this.buildMandatoryItems(params.horizonDays);
    const paydays = this.projectPaydays(params.horizonDays, params.overrides);

    const mandatoryTotal = items.reduce((acc, i) => acc + i.amount, 0);
    const cardsTotal = params.cardDecisions.reduce((acc, d) => acc + d.amount, 0);
    const totalToPay = mandatoryTotal + cardsTotal;
    const projectedInterest = params.cardDecisions.reduce((acc, d) => acc + d.projectedInterest, 0);

    const startingLiquidity = params.overrides?.cashBufferOverride ?? this.risk.estimateCashBuffer();
    const expectedIncome = paydays.reduce((acc, p) => acc + p.amount, 0);
    const available = startingLiquidity + expectedIncome;
    const remainingAfter = available - totalToPay;
    const feasible = remainingAfter >= -0.01;

    const cardsSettled = params.cardDecisions.filter(d => d.action === 'pay_full').length;
    const cardsMinimumOnly = params.cardDecisions.filter(d => d.action === 'pay_minimum').length;
    const cardsSkipped = params.cardDecisions.filter(d => d.action === 'skip').length;

    const warnings: string[] = [];
    if (!feasible) {
      warnings.push(`No alcanza: faltan ${Math.abs(remainingAfter).toFixed(2)} para cubrir esta estrategia con tu liquidez e ingresos proyectados.`);
    }
    const notFundedFull = params.cardDecisions.filter(d => d.action === 'pay_full' && !d.fundedInTime);
    if (notFundedFull.length) {
      warnings.push(`${notFundedFull.length} tarjeta(s) se liquidan sin que un ingreso proyectado llegue antes del corte: ${notFundedFull.map(d => d.cardName).join(', ')}.`);
    }
    const risky = params.cardDecisions.filter(d => d.action !== 'pay_full' && d.projectedInterest > 0);
    if (risky.length) {
      const interestSum = risky.reduce((acc, d) => acc + d.projectedInterest, 0);
      warnings.push(`${risky.length} tarjeta(s) seguirán generando interés este ciclo (~${interestSum.toFixed(2)} en total): ${risky.map(d => d.cardName).join(', ')}.`);
    }
    if (cardsSkipped > 0) {
      const skipped = params.cardDecisions.filter(d => d.action === 'skip');
      warnings.push(`${cardsSkipped} tarjeta(s) quedan totalmente sin pago este ciclo, con riesgo de comisión por pago tardío: ${skipped.map(d => d.cardName).join(', ')}.`);
    }

    const summary = feasible
      ? `Necesitas ${totalToPay.toFixed(2)} este periodo; te quedarán ~${remainingAfter.toFixed(2)} libres. Interés proyectado: ${projectedInterest.toFixed(2)}.`
      : `Esta estrategia requiere ${totalToPay.toFixed(2)} pero solo dispondrás de ${available.toFixed(2)}. Interés proyectado: ${projectedInterest.toFixed(2)}.`;

    return {
      id: params.id,
      kind: params.kind,
      name: params.name,
      description: params.description,
      summary,
      source: params.source,
      generatedAt: now.toISOString(),
      items,
      cardDecisions: params.cardDecisions,
      paydays,
      totals: { totalToPay, projectedInterest, cardsSettled, cardsMinimumOnly, cardsSkipped },
      startingLiquidity,
      expectedIncome,
      remainingAfter,
      feasible,
      warnings,
      aiRationale: params.aiRationale
    };
  }

  private markRecommended(strategies: PaymentStrategy[]): void {
    strategies.forEach(s => (s.recommended = false));
    const feasible = strategies.filter(s => s.feasible);
    const pool = feasible.length ? feasible : strategies;
    const best = pool.reduce((a, b) => {
      if (a.totals.projectedInterest !== b.totals.projectedInterest) {
        return a.totals.projectedInterest < b.totals.projectedInterest ? a : b;
      }
      return a.remainingAfter > b.remainingAfter ? a : b;
    });
    best.recommended = true;
  }

  /** Fechas clave de una tarjeta (próximo corte y próximo límite de pago). */
  private cardKeyDates(card: CreditCard, now: Date): { cutOffDate: Date; paymentDueDate: Date } {
    let cutOff = new Date(now.getFullYear(), now.getMonth(), card.cutOffDay);
    if (cutOff < this.startOfDay(now)) cutOff = new Date(now.getFullYear(), now.getMonth() + 1, card.cutOffDay);
    let payment = new Date(cutOff.getFullYear(), cutOff.getMonth(), card.paymentDueDay);
    if (payment <= cutOff) payment = new Date(cutOff.getFullYear(), cutOff.getMonth() + 1, card.paymentDueDay);
    return { cutOffDate: cutOff, paymentDueDate: payment };
  }

  /** Construye la decisión completa (montos, interés, viabilidad de tiempo) para una tarjeta y una acción dadas. */
  private buildCardDecision(card: CreditCard, action: PaymentStrategyAction, now: Date, paydays: ProjectedPayday[]): PaymentCardDecision {
    const { cutOffDate, paymentDueDate } = this.cardKeyDates(card, now);
    const balance = card.currentBalance.amount;
    const minimum = card.minimumPayment?.amount ?? balance * 0.1;
    const noInterest = card.noInterestPayment?.amount ?? balance;
    const monthlyRate = card.annualInterestRate / 100 / 12;
    const cutOffIso = this.toISODate(cutOffDate);
    const dueIso = this.toISODate(paymentDueDate);
    const fundingBefore = (limit: Date) => paydays.find(p => new Date(p.date) <= limit);

    if (action === 'pay_full') {
      const funding = fundingBefore(cutOffDate);
      const fundedInTime = !!funding;
      return {
        cardId: card.id, cardName: card.name, action, amount: noInterest,
        currency: card.currentBalance.currency, cutOffDate: cutOffIso, paymentDueDate: dueIso,
        payBy: cutOffIso, fundedByPayday: funding?.date, fundedInTime, projectedInterest: 0,
        reason: fundedInTime
          ? `Liquidar antes del corte (día ${card.cutOffDay}) evita intereses; el ingreso del ${funding!.date} lo cubre.`
          : `Liquidarla antes del corte (día ${card.cutOffDay}) evita intereses, pero no hay un ingreso proyectado a tiempo: verifica que tu liquidez actual lo cubra.`
      };
    }

    if (action === 'pay_minimum') {
      const funding = fundingBefore(paymentDueDate);
      const fundedInTime = !!funding;
      const projectedInterest = Math.max(balance - minimum, 0) * monthlyRate;
      return {
        cardId: card.id, cardName: card.name, action, amount: minimum,
        currency: card.currentBalance.currency, cutOffDate: cutOffIso, paymentDueDate: dueIso,
        payBy: dueIso, fundedByPayday: funding?.date, fundedInTime, projectedInterest,
        reason: `Pago mínimo antes del día ${card.paymentDueDay} evita la comisión por pago tardío; el saldo restante seguirá generando interés (~${projectedInterest.toFixed(2)}).`
      };
    }

    const projectedInterest = balance * monthlyRate;
    return {
      cardId: card.id, cardName: card.name, action: 'skip', amount: 0,
      currency: card.currentBalance.currency, cutOffDate: cutOffIso, paymentDueDate: dueIso,
      payBy: dueIso, fundedInTime: false, projectedInterest,
      reason: `Se deja sin pagar este ciclo: riesgo de comisión por pago tardío y de interés sobre el saldo completo (~${projectedInterest.toFixed(2)}).`
    };
  }

  /**
   * Reparte un presupuesto entre tarjetas según un orden de prioridad:
   * para cada tarjeta (en orden), intenta liquidarla por completo; si
   * no alcanza, paga el mínimo; si ni eso alcanza, la deja en espera.
   */
  private allocateCards(
    cards: CreditCard[],
    compare: (a: CreditCard, b: CreditCard) => number,
    availableForCards: number,
    now: Date,
    paydays: ProjectedPayday[]
  ): PaymentCardDecision[] {
    const sorted = [...cards].sort(compare);
    let budget = availableForCards;
    const decisions = new Map<string, PaymentCardDecision>();
    for (const card of sorted) {
      const noInterest = card.noInterestPayment?.amount ?? card.currentBalance.amount;
      const minimum = card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1;
      if (noInterest <= budget) {
        decisions.set(card.id, this.buildCardDecision(card, 'pay_full', now, paydays));
        budget -= noInterest;
      } else if (minimum <= budget) {
        decisions.set(card.id, this.buildCardDecision(card, 'pay_minimum', now, paydays));
        budget -= minimum;
      } else {
        decisions.set(card.id, this.buildCardDecision(card, 'skip', now, paydays));
      }
    }
    return cards.map(c => decisions.get(c.id)!);
  }

  /** Estrategia conservadora: solo pago mínimo, protegiendo primero las tarjetas cuyo límite de pago está más cerca. */
  private allocateMinimumOnly(cards: CreditCard[], availableForCards: number, now: Date, paydays: ProjectedPayday[]): PaymentCardDecision[] {
    const sorted = [...cards].sort((a, b) => {
      const da = this.cardKeyDates(a, now).paymentDueDate.getTime();
      const db = this.cardKeyDates(b, now).paymentDueDate.getTime();
      return da - db;
    });
    let budget = availableForCards;
    const decisions = new Map<string, PaymentCardDecision>();
    for (const card of sorted) {
      const minimum = card.minimumPayment?.amount ?? card.currentBalance.amount * 0.1;
      if (minimum <= budget) {
        decisions.set(card.id, this.buildCardDecision(card, 'pay_minimum', now, paydays));
        budget -= minimum;
      } else {
        decisions.set(card.id, this.buildCardDecision(card, 'skip', now, paydays));
      }
    }
    return cards.map(c => decisions.get(c.id)!);
  }

  /** Préstamos activos, servicios esenciales y suscripciones dentro del horizonte (comunes a toda estrategia). */
  private buildMandatoryItems(horizonDays: number): PaymentPlanItem[] {
    const now = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + horizonDays);
    const items: PaymentPlanItem[] = [];

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

    for (const card of this.finance.creditCards().filter(c => c.institutionPlan)) {
      const plan = card.institutionPlan!;
      const due = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay);
      if (due < now) due.setMonth(due.getMonth() + 1);
      if (due > horizon) continue;
      items.push({
        date: due.toISOString().slice(0, 10),
        referenceId: card.id,
        description: `Plan de pagos ${card.issuer} — ${card.name}`,
        amount: plan.fixedMonthlyPayment.amount,
        currency: plan.fixedMonthlyPayment.currency,
        priority: 2,
        reason: `Pago fijo acordado con ${card.issuer}${plan.remainingMonths ? ` (${plan.remainingMonths} meses restantes)` : ''}. Si no se paga, el banco puede cancelar el plan y aplicar intereses sobre el saldo total.`,
        optional: false
      });
    }

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

    items.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date));
    return items;
  }

  private buildAiPrompt(ctx: {
    cardsInfo: unknown[];
    committedInfo: unknown[];
    paydays: ProjectedPayday[];
    startingLiquidity: number;
    expectedIncome: number;
    mandatoryTotal: number;
    horizonDays: number;
    baseStrategies: PaymentStrategy[];
    instructions?: string;
  }): { system: string; user: string } {
    const system =
      'Eres un asesor financiero experto en tarjetas de crédito en México. Tu tarea es proponer HASTA 2 ' +
      'estrategias de pago ALTERNATIVAS a 4 heurísticas estándar (anti-intereses, avalancha, bola de nieve, ' +
      'conservadora) que ya se calcularon con las cifras reales del usuario.\n' +
      'Debes decidir, tarjeta por tarjeta (solo entre las tarjetas "decidibles" que se te dan), si conviene: ' +
      'liquidarla por completo ("settle"), dejarla sin pagar este ciclo ("skip"), o pagar solo el mínimo ' +
      '(si no la incluyes en ninguna lista).\n' +
      'Reglas de negocio que DEBES respetar:\n' +
      '- El pago mínimo evita la comisión por pago tardío si se paga antes del día límite de pago.\n' +
      '- Solo pagar el monto "sin intereses" completo ANTES del día de corte evita que se generen intereses.\n' +
      '- Si no hay una quincena/ingreso que llegue antes del corte de una tarjeta, liquidarla es más arriesgado.\n' +
      '- Las tarjetas de la lista "tarjetas con plan fijo del banco" NO son decidibles: ya tienen un pago fijo ' +
      'acordado directamente con el banco (reestructura). No las incluyas en "settle" ni "skip"; ya están ' +
      'contabilizadas como obligatorias en el total. Menciónalas en tu razonamiento solo si es relevante.\n' +
      '- No inventes tarjetas: usa únicamente los IDs de tarjeta proporcionados en "tarjetas decidibles".\n' +
      '- NO calcules montos ni intereses: el sistema los calcula. Tú solo clasificas cada tarjeta y explicas el porqué.\n' +
      '- Si el usuario da una instrucción específica, síguela con la mayor fidelidad posible sin romper las reglas anteriores; ' +
      'si su instrucción contradice una regla de negocio (por ejemplo, pedir que "no genere intereses" una tarjeta sin ' +
      'ingreso a tiempo), cúmplela de todas formas pero adviértelo en "rationale".\n' +
      'Responde ÚNICAMENTE con JSON válido (sin texto adicional, sin bloques de código), con esta forma exacta:\n' +
      '{"strategies":[{"name":"string corto","description":"1-2 frases: en qué consiste",' +
      '"rationale":"por qué conviene dado este caso","settle":["cardId", "..."],"skip":["cardId", "..."]}]}\n' +
      'Las tarjetas decidibles que no aparezcan en "settle" ni en "skip" recibirán pago mínimo por defecto. Máximo 2 estrategias.';

    const user =
      `Situación financiera:\n` +
      `- Horizonte: ${ctx.horizonDays} días\n` +
      `- Liquidez inicial estimada: ${ctx.startingLiquidity.toFixed(2)}\n` +
      `- Ingresos/quincenas proyectados en el horizonte: ${ctx.expectedIncome.toFixed(2)}\n` +
      `- Pagos obligatorios (préstamos, servicios esenciales, suscripciones, planes fijos con el banco) en el horizonte: ${ctx.mandatoryTotal.toFixed(2)}\n` +
      `- Quincenas proyectadas: ${JSON.stringify(ctx.paydays)}\n\n` +
      `Tarjetas decidibles:\n${JSON.stringify(ctx.cardsInfo)}\n\n` +
      `Tarjetas con plan fijo del banco (NO decidibles, ya incluidas en pagos obligatorios):\n${JSON.stringify(ctx.committedInfo)}\n\n` +
      `Estrategias estándar ya calculadas (propón algo distinto o complementario, no las repitas):\n` +
      ctx.baseStrategies.map(s =>
        `- ${s.name}: total ${s.totals.totalToPay.toFixed(2)}, interés proyectado ${s.totals.projectedInterest.toFixed(2)}, ${s.feasible ? 'factible' : 'NO factible'}`
      ).join('\n') +
      (ctx.instructions
        ? `\n\nInstrucción específica del usuario (dale prioridad al diseñar tu(s) estrategia(s)):\n"${ctx.instructions}"`
        : '') +
      `\n\nDevuelve el JSON con tus estrategias.`;

    return { system, user };
  }

  private parseAiStrategies(raw: string, validCardIds: string[]): AiStrategyDraft[] {
    const validSet = new Set(validCardIds);
    try {
      const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```$/gim, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
      const parsed = JSON.parse(jsonStr) as { strategies?: unknown[] };
      if (!Array.isArray(parsed.strategies)) return [];
      return parsed.strategies.slice(0, 2).map((entry): AiStrategyDraft => {
        const s = entry as Record<string, unknown>;
        const settleList = Array.isArray(s['settle']) ? (s['settle'] as unknown[]) : [];
        const skipList = Array.isArray(s['skip']) ? (s['skip'] as unknown[]) : [];
        return {
          name: typeof s['name'] === 'string' && (s['name'] as string).trim() ? (s['name'] as string).trim().slice(0, 60) : 'Estrategia IA',
          description: typeof s['description'] === 'string' ? (s['description'] as string).trim().slice(0, 300) : '',
          rationale: typeof s['rationale'] === 'string' ? (s['rationale'] as string).trim().slice(0, 500) : '',
          settle: new Set(settleList.filter((id): id is string => typeof id === 'string' && validSet.has(id))),
          skip: new Set(skipList.filter((id): id is string => typeof id === 'string' && validSet.has(id)))
        };
      });
    } catch {
      return [];
    }
  }

  private computeLoanPriority(loan: { annualInterestRate: number; remainingBalance: { amount: number } }): number {
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

  private buildLegacySummary(items: PaymentPlanItem[], liquidity: number, expectedIncome: number): string {
    const total = items.reduce((acc, i) => acc + i.amount, 0);
    const available = liquidity + expectedIncome;
    if (total > available) {
      return `Necesitas ${total.toFixed(2)} pero solo dispondrás de ${available.toFixed(2)}. Considera renegociar o aplazar pagos de prioridad baja.`;
    }
    const remaining = available - total;
    return `Reservar ${total.toFixed(2)} en los próximos pagos. Te quedarán aproximadamente ${remaining.toFixed(2)} libres.`;
  }

  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
