import { ID, ISODate, MoneyAmount, Timestamped } from './common.model';

/** Préstamo o crédito. */
export interface Loan extends Timestamped {
  id: ID;
  /** Nombre descriptivo (ej. "Crédito auto"). */
  name: string;
  /** Tipo. */
  kind: 'personal' | 'mortgage' | 'auto' | 'credit_line' | 'credit_card_finance' | 'other';
  /** Acreedor (banco, persona, etc.). */
  creditor: string;
  /** Capital total adeudado. */
  principal: MoneyAmount;
  /** Saldo restante actual. */
  remainingBalance: MoneyAmount;
  /** Tasa de interés anual (%). */
  annualInterestRate: number;
  /** Tasa moratoria anual (%). */
  lateInterestRate?: number;
  /** CAT si aplica. */
  cat?: number;
  /** Pago mensual acordado. */
  monthlyPayment: MoneyAmount;
  /** Día del mes de pago. */
  paymentDay: number;
  /** Fecha de inicio. */
  startDate: ISODate;
  /** Fecha estimada de liquidación. */
  expectedEndDate?: ISODate;
  /** Penalizaciones por pago tardío. */
  latePenalty?: MoneyAmount;
  /** Indica si el préstamo está activo. */
  active: boolean;
  /** ID de tarjeta si es financiación de tarjeta. */
  creditCardId?: ID;
  notes?: string;
}

/** Registro histórico de un pago realizado. */
export interface PaymentRecord extends Timestamped {
  id: ID;
  /** Tipo de la obligación. */
  kind: 'loan' | 'credit_card' | 'service' | 'subscription' | 'other';
  /** ID del préstamo o tarjeta. */
  referenceId?: ID;
  /** Descripción humana. */
  description: string;
  /** Monto del pago. */
  amount: MoneyAmount;
  /** Fecha en que se pagó. */
  paidAt: ISODate;
  /** Si fue puntual. */
  onTime?: boolean;
  notes?: string;
}