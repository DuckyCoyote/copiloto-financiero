import { ID, ISODate, MoneyAmount, PaymentMethod, Timestamped } from './common.model';

/** Gasto registrado por el usuario. */
export interface Expense extends Timestamped {
  id: ID;
  /** Descripción corta. */
  description: string;
  /** Monto del gasto. */
  amount: MoneyAmount;
  /** Categoría del gasto. */
  categoryId: ID;
  /** Método de pago utilizado. */
  paymentMethodId: ID;
  /** Fecha en la que se realizó el gasto. */
  date: ISODate;
  /** Etiquetas libres para búsqueda. */
  tags?: string[];
  /** Notas adicionales. */
  notes?: string;
  /** Si el gasto es recurrente, referencia a la suscripción o servicio. */
  recurringRefId?: ID;
  /** Si es parte del pago de un préstamo, referencia. */
  loanPaymentRefId?: ID;
  /** Si fue detectado/registrado automáticamente por IA. */
  autoRegistered?: boolean;
}

export interface ExpenseDraft {
  description?: string;
  amount?: number;
  currency?: string;
  categoryId?: ID;
  paymentMethodId?: ID;
  date?: ISODate;
  notes?: string;
  paymentMethod?: PaymentMethod;
}

/** Ingreso. */
export interface Income extends Timestamped {
  id: ID;
  description: string;
  amount: MoneyAmount;
  categoryId: ID;
  /** Fecha en que se recibió. */
  date: ISODate;
  /** Si es recurrente, indica la frecuencia. */
  recurring?: 'none' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  notes?: string;
  autoRegistered?: boolean;
}