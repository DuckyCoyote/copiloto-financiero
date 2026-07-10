import { ID, ISODate, MoneyAmount, Timestamped } from './common.model';

/** Objetivo de ahorro. */
export interface SavingsGoal extends Timestamped {
  id: ID;
  name: string;
  description?: string;
  /** Monto objetivo. */
  targetAmount: MoneyAmount;
  /** Fecha límite opcional. */
  targetDate?: ISODate;
  /** Monto actualmente acumulado. */
  currentAmount: MoneyAmount;
  /** Color representativo. */
  color?: string;
  /** Icono. */
  icon?: string;
  /** Indica si el objetivo está activo. */
  active: boolean;
}

/** Recordatorio financiero. */
export interface Reminder extends Timestamped {
  id: ID;
  title: string;
  description?: string;
  /** Fecha del recordatorio. */
  date: ISODate;
  /** Tipo de evento. */
  kind: 'payment' | 'goal' | 'budget' | 'review' | 'custom';
  /** Repetición opcional. */
  repeat?: 'none' | 'weekly' | 'monthly' | 'yearly';
  /** Indica si ya se completó. */
  done: boolean;
  /** ID de la entidad relacionada (préstamo, tarjeta, etc.). */
  referenceId?: ID;
}

/** Presupuesto por categoría. */
export interface Budget extends Timestamped {
  id: ID;
  name: string;
  /** Categoría a la que aplica. */
  categoryId: ID;
  /** Monto total del presupuesto. */
  amount: MoneyAmount;
  /** Período del presupuesto. */
  period: 'weekly' | 'monthly' | 'yearly';
  /** Fecha de inicio del período actual. */
  periodStart?: ISODate;
  /** Indica si se renovó automáticamente al cambiar el período. */
  rollover?: boolean;
  notes?: string;
}

/** Entrada de calendario financiero (pagos futuros). */
export interface CalendarEvent extends Timestamped {
  id: ID;
  title: string;
  description?: string;
  /** Fecha del evento. */
  date: ISODate;
  /** Tipo de evento. */
  kind:
    | 'income'
    | 'expense'
    | 'service_payment'
    | 'subscription_payment'
    | 'loan_payment'
    | 'credit_card_payment'
    | 'reminder'
    | 'goal'
    | 'other';
  /** ID de la entidad asociada. */
  referenceId?: ID;
  /** Monto estimado o confirmado. */
  amount?: MoneyAmount;
  /** Metadata adicional del evento (montos extra, fechas, etc.). */
  meta?: {
    /** Pago mínimo (para tarjetas). */
    minimumPayment?: MoneyAmount;
    /** Pago para no generar intereses (para tarjetas). */
    noInterestPayment?: MoneyAmount;
    /** Saldo actual (para tarjetas). */
    currentBalance?: MoneyAmount;
    /** Día de corte (para tarjetas). */
    cutOffDay?: number;
    /** Día límite de pago (para tarjetas). */
    paymentDueDay?: number;
    /** Fecha de corte ISO. */
    cutOffDate?: ISODate;
  };
  /** Indica si el evento ya fue confirmado/pagado. */
  status: 'planned' | 'confirmed' | 'paid' | 'overdue' | 'cancelled';
}