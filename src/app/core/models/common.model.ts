/**
 * Modelos base y utilidades comunes del dominio financiero.
 *
 * Todas las entidades comparten un `id` (UUID v4) y timestamps
 * de creación/actualización que son opcionales pero recomendados.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export interface Timestamped {
  createdAt?: ISODateTime;
  updatedAt?: ISODateTime;
}

export type Currency = 'MXN' | 'USD' | 'EUR' | 'ARS' | 'COP' | 'CLP' | 'PEN' | 'BRL' | 'GBP';

export interface MoneyAmount {
  amount: number;
  currency: Currency;
}

/** Categoría por defecto de gastos (extendible por el usuario). */
export interface Category extends Timestamped {
  id: ID;
  name: string;
  icon?: string;
  color?: string;
  /** Tipo: expense, income o both. */
  kind: 'expense' | 'income' | 'both';
}

/** Método de pago genérico. Puede ser tarjeta, efectivo, transferencia, etc. */
export interface PaymentMethod extends Timestamped {
  id: ID;
  name: string;
  type: 'cash' | 'debit_card' | 'credit_card' | 'bank_transfer' | 'wallet' | 'other';
  /** ID opcional de la tarjeta de crédito asociada. */
  creditCardId?: ID;
}

export const DEFAULT_CURRENCY: Currency = 'MXN';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-comida', name: 'Comida', kind: 'expense', icon: '🍔', color: '#f97316' },
  { id: 'cat-gasolina', name: 'Gasolina', kind: 'expense', icon: '⛽', color: '#0ea5e9' },
  { id: 'cat-pasajes', name: 'Pasajes / Transporte público', kind: 'expense', icon: '🚌', color: '#3b82f6' },
  { id: 'cat-transporte', name: 'Otro transporte', kind: 'expense', icon: '🚗', color: '#3b82f6' },
  { id: 'cat-vivienda', name: 'Vivienda', kind: 'expense', icon: '🏠', color: '#a855f7' },
  { id: 'cat-servicios', name: 'Servicios', kind: 'expense', icon: '💡', color: '#eab308' },
  { id: 'cat-salud', name: 'Salud', kind: 'expense', icon: '⚕️', color: '#ef4444' },
  { id: 'cat-entretenimiento', name: 'Entretenimiento', kind: 'expense', icon: '🎬', color: '#ec4899' },
  { id: 'cat-compras', name: 'Compras', kind: 'expense', icon: '🛍️', color: '#06b6d4' },
  { id: 'cat-educacion', name: 'Educación', kind: 'expense', icon: '📚', color: '#8b5cf6' },
  { id: 'cat-suscripciones', name: 'Suscripciones', kind: 'expense', icon: '🔁', color: '#22c55e' },
  { id: 'cat-prestamos', name: 'Préstamos', kind: 'expense', icon: '🏦', color: '#64748b' },
  { id: 'cat-otros', name: 'Otros', kind: 'expense', icon: '📦', color: '#94a3b8' },
  { id: 'cat-sueldo', name: 'Sueldo', kind: 'income', icon: '💼', color: '#22c55e' },
  { id: 'cat-freelance', name: 'Freelance', kind: 'income', icon: '💻', color: '#10b981' },
  { id: 'cat-inversiones', name: 'Inversiones', kind: 'income', icon: '📈', color: '#14b8a6' },
  { id: 'cat-otros-ingresos', name: 'Otros ingresos', kind: 'income', icon: '💰', color: '#84cc16' }
];

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-efectivo', name: 'Efectivo', type: 'cash' },
  { id: 'pm-transferencia', name: 'Transferencia', type: 'bank_transfer' }
];

/** Utilidad: nuevo identificador único compatible con navegadores antiguos. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}