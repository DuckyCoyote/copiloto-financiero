export type PurchaseVerdict = 'recommended' | 'caution' | 'not_recommended' | 'unavailable';

export interface PurchaseFactor {
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
  detail: string;
}

export interface PurchaseEvaluation {
  verdict: PurchaseVerdict;
  /** 0-100: qué tan prudente es hacer la compra hoy. */
  score: number;
  /** Resumen humano, una línea. */
  summary: string;
  factors: PurchaseFactor[];
  suggestions: string[];
}

export interface PurchaseInput {
  amount: number;
  categoryId?: string;
  description?: string;
}
