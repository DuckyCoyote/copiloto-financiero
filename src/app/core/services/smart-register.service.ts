import { Injectable, inject } from '@angular/core';
import { ClassifiedDraft } from '../models';
import { ClassifierService } from './classifier.service';
import { FinanceDataService } from './finance-data.service';
import { ToastService } from './toast.service';

export type RegisterKind = 'expense' | 'service' | 'subscription';

export interface RegisterPreview {
  kind: RegisterKind;
  description: string;
  amount: number;
  currency: string;
  date: string;
  categoryId?: string;
  paymentMethodId?: string;
  /** Si algún dato es ambiguo. */
  ambiguous: boolean;
  /** Lo que entendió del input. */
  hints: string[];
  /** Texto humano para mostrar al usuario. */
  prettyKind: string;
  /** Etiqueta del botón de acción. */
  actionLabel: string;
}

const EXPENSE_HINTS = ['gast', 'compré', 'pagué', 'pague', 'gasto', 'compra', 'consumí', 'consumi'];
const SERVICE_HINTS = ['servicio', 'recibo', 'factura', 'luz', 'agua', 'gas', 'internet', 'cfe', 'telmex', 'att', 'telefonía', 'telefonia'];
const SUBSCRIPTION_HINTS = ['suscripción', 'suscripcion', 'mensualidad', 'netflix', 'spotify', 'icloud', 'disney', 'hbo', 'amazon prime', 'apple'];

/**
 * Detecta la intención de "registrar" en un texto y extrae un
 * borrador listo para crear. Diseñado para responder en el chat
 * con una vista previa que el usuario puede confirmar.
 */
@Injectable({ providedIn: 'root' })
export class SmartRegisterService {
  private readonly finance = inject(FinanceDataService);
  private readonly classifier = inject(ClassifierService);
  private readonly toast = inject(ToastService);

  /**
   * Detecta si el mensaje del usuario tiene intención de registrar
   * algo y devuelve un preview listo para confirmar.
   */
  async detect(text: string): Promise<RegisterPreview | null> {
    const lower = text.toLowerCase();
    const wantsToRegister = this.isRegisterIntent(lower);
    if (!wantsToRegister) return null;

    // Reutilizamos el clasificador para extraer monto/categoría/método/fecha
    const draft = await this.classifier.classify(text);

    // Si no detectó monto, no es un registro válido
    if (!draft.amount) return null;

    // Tipo según palabras clave. El orden importa:
    //   1. Si el usuario usa verbos de GASTO (gasté, compré, pagué…)
    //      gana sobre cualquier otra cosa. Decir "gasto de mi servicio de
    //      internet" es un GASTO, no un servicio.
    //   2. Si el clasificador ya lo marcó como expense, es expense.
    //   3. Si no, miramos suscripción (netflix, spotify, mensualidad…).
    //   4. Después servicio (luz, agua, cfe, telmex…).
    //   5. Fallback al kind del clasificador.
    const userSaidExpense = EXPENSE_HINTS.some(k => lower.includes(k));
    const userSaidSubscription = SUBSCRIPTION_HINTS.some(k => lower.includes(k));
    const userSaidService = SERVICE_HINTS.some(k => lower.includes(k));

    let kind: RegisterKind;
    if (userSaidExpense) {
      kind = 'expense';
    } else if (userSaidSubscription) {
      kind = 'subscription';
    } else if (userSaidService) {
      kind = 'service';
    } else if (draft.kind === 'expense' || draft.kind === 'service' || draft.kind === 'subscription') {
      kind = draft.kind;
    } else {
      kind = 'expense';
    }

    // Categoría específica según el tipo
    const categoryId = this.pickCategoryId(kind, draft, lower);

    return {
      kind,
      description: draft.description,
      amount: draft.amount,
      currency: draft.currency || 'MXN',
      date: draft.date,
      categoryId,
      paymentMethodId: draft.paymentMethodId ?? this.defaultPaymentMethodId(),
      ambiguous: !!draft.ambiguous || !categoryId,
      hints: draft.hints ?? [],
      prettyKind: kind === 'expense' ? 'gasto' : kind === 'service' ? 'servicio' : 'suscripción',
      actionLabel: kind === 'expense' ? 'Registrar gasto' : kind === 'service' ? 'Registrar servicio' : 'Registrar suscripción'
    };
  }

  /**
   * Aplica el preview al store. Si es un servicio y tiene
   * frecuencia, deja la fecha como próximo pago.
   */
  commit(preview: RegisterPreview): { id: string } {
    const id = this.makeId();
    const currency = preview.currency as 'MXN';
    if (preview.kind === 'expense') {
      this.finance.upsertExpense({
        id,
        description: preview.description,
        amount: { amount: preview.amount, currency },
        categoryId: preview.categoryId ?? 'cat-otros',
        paymentMethodId: preview.paymentMethodId ?? 'pm-efectivo',
        date: preview.date,
        autoRegistered: true,
        createdAt: new Date().toISOString()
      });
      this.toast.success('Gasto registrado', `${preview.description} • $${preview.amount.toFixed(2)}`);
    } else if (preview.kind === 'service') {
      this.finance.upsertService({
        id,
        name: preview.description,
        categoryId: preview.categoryId ?? 'cat-servicios',
        amount: { amount: preview.amount, currency },
        frequency: 'monthly',
        nextPaymentDate: preview.date,
        essential: true,
        createdAt: new Date().toISOString()
      });
      this.toast.success('Servicio registrado', `${preview.description} • $${preview.amount.toFixed(2)}`);
    } else {
      this.finance.upsertSubscription({
        id,
        name: preview.description,
        categoryId: preview.categoryId ?? 'cat-suscripciones',
        amount: { amount: preview.amount, currency },
        frequency: 'monthly',
        nextBillingDate: preview.date,
        active: true,
        createdAt: new Date().toISOString()
      });
      this.toast.success('Suscripción registrada', `${preview.description} • $${preview.amount.toFixed(2)}`);
    }
    return { id };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private isRegisterIntent(lower: string): boolean {
    return [...EXPENSE_HINTS, ...SERVICE_HINTS, ...SUBSCRIPTION_HINTS]
      .some(k => lower.includes(k));
  }

  private pickCategoryId(kind: RegisterKind, draft: ClassifiedDraft, lower: string): string | undefined {
    // Primero usar la del clasificador si existe
    if (draft.categoryId) return draft.categoryId;

    // Luego intentar matchear palabras clave
    const byKeyword: Record<string, string> = {
      'pizza': 'cat-comida', 'comida': 'cat-comida', 'restaurant': 'cat-comida', 'restaurante': 'cat-comida',
      'taco': 'cat-comida', 'oxxo': 'cat-comida', 'super': 'cat-comida',
      'luz': 'cat-servicios', 'agua': 'cat-servicios', 'gas': 'cat-servicios',
      'internet': 'cat-servicios', 'cfe': 'cat-servicios',
      'netflix': 'cat-suscripciones', 'spotify': 'cat-suscripciones', 'icloud': 'cat-suscripciones'
    };
    for (const [kw, id] of Object.entries(byKeyword)) {
      if (lower.includes(kw)) return id;
    }

    // Fallback por tipo
    if (kind === 'service') return 'cat-servicios';
    if (kind === 'subscription') return 'cat-suscripciones';
    return undefined;
  }

  private defaultPaymentMethodId(): string {
    const pms = this.finance.paymentMethods();
    if (pms.length === 0) return 'pm-efectivo';
    // Preferir transferencia o tarjeta si existen
    const transfer = pms.find(p => p.type === 'bank_transfer');
    if (transfer) return transfer.id;
    return pms[0].id;
  }

  private makeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `reg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}