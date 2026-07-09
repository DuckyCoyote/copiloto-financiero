import { Injectable, inject } from '@angular/core';
import {
  Budget,
  CreditCard,
  Expense,
  Income,
  Loan,
  SavingsGoal,
  Service,
  Subscription,
  uuid
} from '../models';
import { FinanceDataService } from './finance-data.service';
import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * Si el usuario parte de un almacenamiento vacío, sembramos
 * datos de demostración realistas (en español, moneda MXN).
 * El usuario puede limpiarlos desde Configuración.
 */
@Injectable({ providedIn: 'root' })
export class DemoDataService {
  private readonly finance = inject(FinanceDataService);
  private readonly storage = inject(StorageService);

  seedIfEmpty(): void {
    if (this.storage.read<boolean>(STORAGE_KEYS.seeded, false)) return;
    if (this.finance.expenses().length > 0) {
      this.storage.write(STORAGE_KEYS.seeded, true);
      return;
    }
    this.seed();
    this.storage.write(STORAGE_KEYS.seeded, true);
  }

  seed(): void {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const daysAgo = (n: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      return iso(d);
    };

    const incomes: Income[] = [
      {
        id: uuid(),
        description: 'Sueldo quincenal',
        amount: { amount: 18500, currency: 'MXN' },
        categoryId: 'cat-sueldo',
        date: daysAgo(5),
        recurring: 'biweekly',
        createdAt: now.toISOString()
      }
    ];

    const expenses: Expense[] = [
      { id: uuid(), description: 'Pizza con amigos', amount: { amount: 280, currency: 'MXN' }, categoryId: 'cat-comida', paymentMethodId: 'pm-efectivo', date: daysAgo(1), createdAt: now.toISOString() },
      { id: uuid(), description: 'Recarga de gasolina', amount: { amount: 950, currency: 'MXN' }, categoryId: 'cat-transporte', paymentMethodId: 'pm-efectivo', date: daysAgo(3), createdAt: now.toISOString() },
      { id: uuid(), description: 'Pago de luz CFE', amount: { amount: 1250, currency: 'MXN' }, categoryId: 'cat-servicios', paymentMethodId: 'pm-transferencia', date: daysAgo(7), createdAt: now.toISOString() },
      { id: uuid(), description: 'Súper de la semana', amount: { amount: 1820, currency: 'MXN' }, categoryId: 'cat-comida', paymentMethodId: 'pm-efectivo', date: daysAgo(2), createdAt: now.toISOString() },
      { id: uuid(), description: 'Renta mensual', amount: { amount: 6500, currency: 'MXN' }, categoryId: 'cat-vivienda', paymentMethodId: 'pm-transferencia', date: daysAgo(10), createdAt: now.toISOString() }
    ];

    const cards: CreditCard[] = [
      {
        id: uuid(),
        name: 'BBVA Oro',
        issuer: 'BBVA',
        last4: '4521',
        creditLimit: { amount: 40000, currency: 'MXN' },
        currentBalance: { amount: 12450, currency: 'MXN' },
        annualInterestRate: 48.0,
        cat: 56,
        cutOffDay: 20,
        paymentDueDay: 5,
        minimumPayment: { amount: 1200, currency: 'MXN' },
        noInterestPayment: { amount: 4500, currency: 'MXN' },
        color: '#1e40af',
        createdAt: now.toISOString()
      },
      {
        id: uuid(),
        name: 'HSBC Cash',
        issuer: 'HSBC',
        last4: '8821',
        creditLimit: { amount: 25000, currency: 'MXN' },
        currentBalance: { amount: 3210, currency: 'MXN' },
        annualInterestRate: 52.5,
        cat: 62,
        cutOffDay: 25,
        paymentDueDay: 15,
        minimumPayment: { amount: 450, currency: 'MXN' },
        noInterestPayment: { amount: 3210, currency: 'MXN' },
        color: '#dc2626',
        createdAt: now.toISOString()
      }
    ];

    const loans: Loan[] = [
      {
        id: uuid(),
        name: 'Crédito personal Banorte',
        kind: 'personal',
        creditor: 'Banorte',
        principal: { amount: 50000, currency: 'MXN' },
        remainingBalance: { amount: 28400, currency: 'MXN' },
        annualInterestRate: 38.5,
        cat: 44,
        monthlyPayment: { amount: 2350, currency: 'MXN' },
        paymentDay: 12,
        startDate: daysAgo(380),
        expectedEndDate: daysAgo(-180),
        active: true,
        createdAt: now.toISOString()
      }
    ];

    const services: Service[] = [
      { id: uuid(), name: 'Internet Telmex', provider: 'Telmex', categoryId: 'cat-servicios', amount: { amount: 599, currency: 'MXN' }, frequency: 'monthly', nextPaymentDate: daysAgo(-15), essential: true, createdAt: now.toISOString() },
      { id: uuid(), name: 'Luz CFE', provider: 'CFE', categoryId: 'cat-servicios', amount: { amount: 1250, currency: 'MXN' }, frequency: 'monthly', nextPaymentDate: daysAgo(-22), essential: true, createdAt: now.toISOString() },
      { id: uuid(), name: 'Plan celular', provider: 'AT&T', categoryId: 'cat-servicios', amount: { amount: 399, currency: 'MXN' }, frequency: 'monthly', nextPaymentDate: daysAgo(-8), essential: true, createdAt: now.toISOString() }
    ];

    const subscriptions: Subscription[] = [
      { id: uuid(), name: 'Netflix', provider: 'Netflix', categoryId: 'cat-suscripciones', amount: { amount: 269, currency: 'MXN' }, frequency: 'monthly', nextBillingDate: daysAgo(-20), active: true, usageLevel: 'weekly', createdAt: now.toISOString() },
      { id: uuid(), name: 'Spotify', provider: 'Spotify', categoryId: 'cat-suscripciones', amount: { amount: 115, currency: 'MXN' }, frequency: 'monthly', nextBillingDate: daysAgo(-12), active: true, usageLevel: 'daily', createdAt: now.toISOString() },
      { id: uuid(), name: 'iCloud+', provider: 'Apple', categoryId: 'cat-suscripciones', amount: { amount: 99, currency: 'MXN' }, frequency: 'monthly', nextBillingDate: daysAgo(-3), active: true, usageLevel: 'daily', createdAt: now.toISOString() },
      { id: uuid(), name: 'Disney+', provider: 'Disney', categoryId: 'cat-suscripciones', amount: { amount: 199, currency: 'MXN' }, frequency: 'monthly', nextBillingDate: daysAgo(-25), active: true, usageLevel: 'rarely', createdAt: now.toISOString() }
    ];

    const goals: SavingsGoal[] = [
      {
        id: uuid(),
        name: 'Fondo de emergencia',
        description: '6 meses de gastos básicos',
        targetAmount: { amount: 90000, currency: 'MXN' },
        currentAmount: { amount: 32500, currency: 'MXN' },
        active: true,
        color: '#22c55e',
        icon: '🛡️',
        createdAt: now.toISOString()
      },
      {
        id: uuid(),
        name: 'Viaje a Japón',
        targetAmount: { amount: 80000, currency: 'MXN' },
        currentAmount: { amount: 18400, currency: 'MXN' },
        targetDate: daysAgo(-365),
        active: true,
        color: '#f97316',
        icon: '✈️',
        createdAt: now.toISOString()
      }
    ];

    const budgets: Budget[] = [
      { id: uuid(), name: 'Comida', categoryId: 'cat-comida', amount: { amount: 4500, currency: 'MXN' }, period: 'monthly', createdAt: now.toISOString() },
      { id: uuid(), name: 'Transporte', categoryId: 'cat-transporte', amount: { amount: 1800, currency: 'MXN' }, period: 'monthly', createdAt: now.toISOString() },
      { id: uuid(), name: 'Entretenimiento', categoryId: 'cat-entretenimiento', amount: { amount: 1200, currency: 'MXN' }, period: 'monthly', createdAt: now.toISOString() }
    ];

    this.finance.hydrate({
      expenses,
      income: incomes,
      creditCards: cards,
      loans,
      services,
      subscriptions,
      goals,
      budgets
    });
  }
}