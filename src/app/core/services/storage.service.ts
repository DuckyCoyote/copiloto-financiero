import { Injectable } from '@angular/core';

/**
 * Wrapper simple sobre `localStorage` con soporte para SSR.
 * Mantiene toda la persistencia en el cliente; no se comparte
 * información con servicios externos.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly memory = new Map<string, string>();
  private readonly isBrowser =
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

  read<T>(key: string, fallback: T): T {
    const raw = this.isBrowser ? window.localStorage.getItem(key) : this.memory.get(key);
    if (raw === null || raw === undefined) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): void {
    const data = JSON.stringify(value);
    if (this.isBrowser) {
      window.localStorage.setItem(key, data);
    } else {
      this.memory.set(key, data);
    }
  }

  remove(key: string): void {
    if (this.isBrowser) {
      window.localStorage.removeItem(key);
    } else {
      this.memory.delete(key);
    }
  }

  clear(prefix?: string): void {
    if (this.isBrowser) {
      const ls = window.localStorage;
      if (!prefix) {
        ls.clear();
        return;
      }
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (k && k.startsWith(prefix)) ls.removeItem(k);
      }
    } else {
      if (!prefix) {
        this.memory.clear();
        return;
      }
      for (const k of Array.from(this.memory.keys())) {
        if (k.startsWith(prefix)) this.memory.delete(k);
      }
    }
  }
}

export const STORAGE_KEYS = {
  expenses: 'cf:expenses',
  income: 'cf:income',
  cards: 'cf:credit-cards',
  loans: 'cf:loans',
  services: 'cf:services',
  subscriptions: 'cf:subscriptions',
  goals: 'cf:goals',
  reminders: 'cf:reminders',
  budgets: 'cf:budgets',
  events: 'cf:events',
  payments: 'cf:payment-history',
  categories: 'cf:categories',
  paymentMethods: 'cf:payment-methods',
  aiSettings: 'cf:ai-settings',
  chatHistory: 'cf:chat-history',
  memory: 'cf:memory',
  theme: 'cf:theme',
  notifications: 'cf:notifications',
  currency: 'cf:currency',
  seeded: 'cf:seeded-v1'
} as const;