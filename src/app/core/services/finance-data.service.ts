import { Injectable, computed, signal } from '@angular/core';
import {
  Budget,
  CalendarEvent,
  Category,
  CreditCard,
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  Expense,
  Income,
  Loan,
  PaymentMethod,
  PaymentRecord,
  Reminder,
  SavingsGoal,
  Service,
  Subscription
} from '../models';
import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * Servicio central de datos financieros.
 *
 * Mantiene signals para todas las entidades y los sincroniza con
 * `localStorage`. Cualquier componente puede leerlos y los cambios
 * se persisten automáticamente.
 *
 * Para mantener la coherencia con el principio de "store único",
 * NO se debe escribir directamente a `localStorage` desde otros
 * servicios. Todas las mutaciones pasan por aquí.
 */
@Injectable({ providedIn: 'root' })
export class FinanceDataService {
  private readonly seedFlagKey = STORAGE_KEYS.seeded;

  readonly expenses = signal<Expense[]>([]);
  readonly income = signal<Income[]>([]);
  readonly creditCards = signal<CreditCard[]>([]);
  readonly loans = signal<Loan[]>([]);
  readonly services = signal<Service[]>([]);
  readonly subscriptions = signal<Subscription[]>([]);
  readonly goals = signal<SavingsGoal[]>([]);
  readonly reminders = signal<Reminder[]>([]);
  readonly budgets = signal<Budget[]>([]);
  readonly events = signal<CalendarEvent[]>([]);
  readonly paymentHistory = signal<PaymentRecord[]>([]);
  readonly categories = signal<Category[]>(DEFAULT_CATEGORIES);
  readonly paymentMethods = signal<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);

  /** Resumen agregado (kpis del dashboard). */
  readonly totals = computed(() => {
    const exp = this.expenses().reduce((acc, e) => acc + e.amount.amount, 0);
    const inc = this.income().reduce((acc, i) => acc + i.amount.amount, 0);
    const cardDebt = this.creditCards().reduce((acc, c) => acc + c.currentBalance.amount, 0);
    const loanDebt = this.loans().reduce((acc, l) => acc + l.remainingBalance.amount, 0);
    return {
      expenses: exp,
      income: inc,
      net: inc - exp,
      cardDebt,
      loanDebt,
      totalDebt: cardDebt + loanDebt,
      subscriptionsMonthly: this.subscriptions()
        .filter(s => s.active)
        .reduce((acc, s) => acc + (s.frequency === 'monthly' ? s.amount.amount : s.amount.amount / 12), 0),
      servicesMonthly: this.services().reduce((acc, s) => {
        switch (s.frequency) {
          case 'weekly': return acc + s.amount.amount * 4;
          case 'biweekly': return acc + s.amount.amount * 2;
          case 'monthly': return acc + s.amount.amount;
          case 'bimonthly': return acc + s.amount.amount / 2;
          case 'yearly': return acc + s.amount.amount / 12;
          default: return acc;
        }
      }, 0)
    };
  });

  constructor(private readonly storage: StorageService) {
    this.load();
  }

  // ---------------------------------------------------------------------
  // Carga / persistencia
  // ---------------------------------------------------------------------

  private load(): void {
    this.expenses.set(this.storage.read<Expense[]>(STORAGE_KEYS.expenses, []));
    this.income.set(this.storage.read<Income[]>(STORAGE_KEYS.income, []));
    this.creditCards.set(this.storage.read<CreditCard[]>(STORAGE_KEYS.cards, []));
    this.loans.set(this.storage.read<Loan[]>(STORAGE_KEYS.loans, []));
    this.services.set(this.storage.read<Service[]>(STORAGE_KEYS.services, []));
    this.subscriptions.set(this.storage.read<Subscription[]>(STORAGE_KEYS.subscriptions, []));
    this.goals.set(this.storage.read<SavingsGoal[]>(STORAGE_KEYS.goals, []));
    this.reminders.set(this.storage.read<Reminder[]>(STORAGE_KEYS.reminders, []));
    this.budgets.set(this.storage.read<Budget[]>(STORAGE_KEYS.budgets, []));
    this.events.set(this.storage.read<CalendarEvent[]>(STORAGE_KEYS.events, []));
    this.paymentHistory.set(this.storage.read<PaymentRecord[]>(STORAGE_KEYS.payments, []));
    const cats = this.storage.read<Category[]>(STORAGE_KEYS.categories, []);
    this.categories.set(cats.length ? cats : DEFAULT_CATEGORIES);
    const pms = this.storage.read<PaymentMethod[]>(STORAGE_KEYS.paymentMethods, []);
    this.paymentMethods.set(pms.length ? pms : DEFAULT_PAYMENT_METHODS);
  }

  private persistAll(): void {
    this.storage.write(STORAGE_KEYS.expenses, this.expenses());
    this.storage.write(STORAGE_KEYS.income, this.income());
    this.storage.write(STORAGE_KEYS.cards, this.creditCards());
    this.storage.write(STORAGE_KEYS.loans, this.loans());
    this.storage.write(STORAGE_KEYS.services, this.services());
    this.storage.write(STORAGE_KEYS.subscriptions, this.subscriptions());
    this.storage.write(STORAGE_KEYS.goals, this.goals());
    this.storage.write(STORAGE_KEYS.reminders, this.reminders());
    this.storage.write(STORAGE_KEYS.budgets, this.budgets());
    this.storage.write(STORAGE_KEYS.events, this.events());
    this.storage.write(STORAGE_KEYS.payments, this.paymentHistory());
    this.storage.write(STORAGE_KEYS.categories, this.categories());
    this.storage.write(STORAGE_KEYS.paymentMethods, this.paymentMethods());
  }

  /** Reemplaza todos los datos y los persiste. */
  saveAll(): void {
    this.persistAll();
  }

  /** Carga un set de datos completo (sobrescribe). */
  hydrate(payload: Partial<AppSnapshot>): void {
    if (payload.expenses) this.expenses.set(payload.expenses);
    if (payload.income) this.income.set(payload.income);
    if (payload.creditCards) this.creditCards.set(payload.creditCards);
    if (payload.loans) this.loans.set(payload.loans);
    if (payload.services) this.services.set(payload.services);
    if (payload.subscriptions) this.subscriptions.set(payload.subscriptions);
    if (payload.goals) this.goals.set(payload.goals);
    if (payload.reminders) this.reminders.set(payload.reminders);
    if (payload.budgets) this.budgets.set(payload.budgets);
    if (payload.events) this.events.set(payload.events);
    if (payload.paymentHistory) this.paymentHistory.set(payload.paymentHistory);
    if (payload.categories) this.categories.set(payload.categories);
    if (payload.paymentMethods) this.paymentMethods.set(payload.paymentMethods);
    this.persistAll();
  }

  /** Devuelve un snapshot completo (útil para respaldos / IA). */
  snapshot(): AppSnapshot {
    return {
      expenses: this.expenses(),
      income: this.income(),
      creditCards: this.creditCards(),
      loans: this.loans(),
      services: this.services(),
      subscriptions: this.subscriptions(),
      goals: this.goals(),
      reminders: this.reminders(),
      budgets: this.budgets(),
      events: this.events(),
      paymentHistory: this.paymentHistory(),
      categories: this.categories(),
      paymentMethods: this.paymentMethods()
    };
  }

  /** Elimina todos los datos y deja solo los defaults. */
  reset(): void {
    this.expenses.set([]);
    this.income.set([]);
    this.creditCards.set([]);
    this.loans.set([]);
    this.services.set([]);
    this.subscriptions.set([]);
    this.goals.set([]);
    this.reminders.set([]);
    this.budgets.set([]);
    this.events.set([]);
    this.paymentHistory.set([]);
    this.categories.set(DEFAULT_CATEGORIES);
    this.paymentMethods.set(DEFAULT_PAYMENT_METHODS);
    this.persistAll();
  }

  // ---------------------------------------------------------------------
  // Helpers CRUD genéricos
  // ---------------------------------------------------------------------

  upsertExpense(e: Expense): void {
    this.expenses.update(list => {
      const idx = list.findIndex(x => x.id === e.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = e;
        return next;
      }
      return [e, ...list];
    });
    this.storage.write(STORAGE_KEYS.expenses, this.expenses());
  }

  removeExpense(id: string): void {
    this.expenses.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.expenses, this.expenses());
  }

  upsertIncome(i: Income): void {
    this.income.update(list => {
      const idx = list.findIndex(x => x.id === i.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = i;
        return next;
      }
      return [i, ...list];
    });
    this.storage.write(STORAGE_KEYS.income, this.income());
  }

  removeIncome(id: string): void {
    this.income.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.income, this.income());
  }

  upsertCard(c: CreditCard): void {
    this.creditCards.update(list => {
      const idx = list.findIndex(x => x.id === c.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = c;
        return next;
      }
      return [c, ...list];
    });
    this.storage.write(STORAGE_KEYS.cards, this.creditCards());
  }

  removeCard(id: string): void {
    this.creditCards.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.cards, this.creditCards());
  }

  upsertLoan(l: Loan): void {
    this.loans.update(list => {
      const idx = list.findIndex(x => x.id === l.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = l;
        return next;
      }
      return [l, ...list];
    });
    this.storage.write(STORAGE_KEYS.loans, this.loans());
  }

  removeLoan(id: string): void {
    this.loans.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.loans, this.loans());
  }

  upsertService(s: Service): void {
    this.services.update(list => {
      const idx = list.findIndex(x => x.id === s.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = s;
        return next;
      }
      return [s, ...list];
    });
    this.storage.write(STORAGE_KEYS.services, this.services());
  }

  removeService(id: string): void {
    this.services.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.services, this.services());
  }

  upsertSubscription(s: Subscription): void {
    this.subscriptions.update(list => {
      const idx = list.findIndex(x => x.id === s.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = s;
        return next;
      }
      return [s, ...list];
    });
    this.storage.write(STORAGE_KEYS.subscriptions, this.subscriptions());
  }

  removeSubscription(id: string): void {
    this.subscriptions.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.subscriptions, this.subscriptions());
  }

  upsertGoal(g: SavingsGoal): void {
    this.goals.update(list => {
      const idx = list.findIndex(x => x.id === g.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = g;
        return next;
      }
      return [g, ...list];
    });
    this.storage.write(STORAGE_KEYS.goals, this.goals());
  }

  removeGoal(id: string): void {
    this.goals.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.goals, this.goals());
  }

  upsertReminder(r: Reminder): void {
    this.reminders.update(list => {
      const idx = list.findIndex(x => x.id === r.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = r;
        return next;
      }
      return [r, ...list];
    });
    this.storage.write(STORAGE_KEYS.reminders, this.reminders());
  }

  removeReminder(id: string): void {
    this.reminders.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.reminders, this.reminders());
  }

  upsertBudget(b: Budget): void {
    this.budgets.update(list => {
      const idx = list.findIndex(x => x.id === b.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = b;
        return next;
      }
      return [b, ...list];
    });
    this.storage.write(STORAGE_KEYS.budgets, this.budgets());
  }

  removeBudget(id: string): void {
    this.budgets.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.budgets, this.budgets());
  }

  upsertEvent(e: CalendarEvent): void {
    this.events.update(list => {
      const idx = list.findIndex(x => x.id === e.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = e;
        return next;
      }
      return [e, ...list];
    });
    this.storage.write(STORAGE_KEYS.events, this.events());
  }

  removeEvent(id: string): void {
    this.events.update(list => list.filter(x => x.id !== id));
    this.storage.write(STORAGE_KEYS.events, this.events());
  }

  addPaymentRecord(p: PaymentRecord): void {
    this.paymentHistory.update(list => [p, ...list]);
    this.storage.write(STORAGE_KEYS.payments, this.paymentHistory());
  }

  // ---------------------------------------------------------------------
  // Helpers de dominio
  // ---------------------------------------------------------------------

  findCategory(id: string): Category | undefined {
    return this.categories().find(c => c.id === id);
  }

  findPaymentMethod(id: string): PaymentMethod | undefined {
    return this.paymentMethods().find(p => p.id === id);
  }

  /** Devuelve los gastos del mes en curso. */
  currentMonthExpenses(): Expense[] {
    const now = new Date();
    return this.expenses().filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }

  /** Devuelve los gastos del mes anterior. */
  previousMonthExpenses(): Expense[] {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return this.expenses().filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
    });
  }

  /** Top categorías del mes en curso. */
  topCategoriesThisMonth(limit = 5): { categoryId: string; total: number }[] {
    const map = new Map<string, number>();
    for (const e of this.currentMonthExpenses()) {
      map.set(e.categoryId, (map.get(e.categoryId) || 0) + e.amount.amount);
    }
    return Array.from(map.entries())
      .map(([categoryId, total]) => ({ categoryId, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}

export interface AppSnapshot {
  expenses: Expense[];
  income: Income[];
  creditCards: CreditCard[];
  loans: Loan[];
  services: Service[];
  subscriptions: Subscription[];
  goals: SavingsGoal[];
  reminders: Reminder[];
  budgets: Budget[];
  events: CalendarEvent[];
  paymentHistory: PaymentRecord[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
}