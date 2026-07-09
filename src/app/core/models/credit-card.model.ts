import { ID, MoneyAmount, Timestamped } from './common.model';

/** Tarjeta de crédito. */
export interface CreditCard extends Timestamped {
  id: ID;
  /** Nombre comercial (ej. "BBVA Oro"). */
  name: string;
  /** Emisor (BBVA, Banamex, HSBC, etc.). */
  issuer: string;
  /** últimos 4 dígitos. */
  last4?: string;
  /** Línea de crédito total. */
  creditLimit: MoneyAmount;
  /** Saldo actual utilizado. */
  currentBalance: MoneyAmount;
  /** Tasa de interés anual (%). */
  annualInterestRate: number;
  /** Costo Anual Total (%). */
  cat?: number;
  /** Día del mes en que se realiza el corte. */
  cutOffDay: number;
  /** Día del mes límite de pago. */
  paymentDueDay: number;
  /** Pago mínimo calculado o registrado. */
  minimumPayment?: MoneyAmount;
  /** Pago para no generar intereses. */
  noInterestPayment?: MoneyAmount;
  /** Color para mostrar en UI. */
  color?: string;
}

/** Servicio recurrente (luz, agua, internet, etc.). */
export interface Service extends Timestamped {
  id: ID;
  name: string;
  provider?: string;
  categoryId: ID;
  /** Costo esperado por ciclo. */
  amount: MoneyAmount;
  /** Frecuencia de pago. */
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'yearly';
  /** Próxima fecha de pago. */
  nextPaymentDate: string;
  /** Fecha de vencimiento del servicio (contrato). */
  contractEndsOn?: string;
  /** Indica si es prioritario. */
  essential: boolean;
  /** Notas. */
  notes?: string;
}

/** Suscripción (Netflix, Spotify, etc.). */
export interface Subscription extends Timestamped {
  id: ID;
  name: string;
  provider?: string;
  categoryId: ID;
  amount: MoneyAmount;
  /** Frecuencia del cobro. */
  frequency: 'monthly' | 'yearly';
  /** Fecha del próximo cobro. */
  nextBillingDate: string;
  /** Fecha en que se inició. */
  startedOn?: string;
  /** Indica si está activa. */
  active: boolean;
  /** Marca personal de uso (ej. "lo uso a diario"). */
  usageLevel?: 'daily' | 'weekly' | 'monthly' | 'rarely' | 'never';
  notes?: string;
}