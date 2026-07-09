import { Injectable, inject } from '@angular/core';
import { ClassifiedDraft, Expense, MoneyAmount, uuid } from '../models';
import { AIService } from './ai.service';
import { FinanceDataService } from './finance-data.service';

/**
 * Servicio de Registro Inteligente de Gastos.
 *
 * Combina un clasificador heurístico local (rápido y privado) con
 * la IA cuando está disponible. La IA se usa solo si el usuario
 * dio su consentimiento para compartir datos.
 *
 * Ejemplos que entiende:
 *  - "Compré una pizza por $280 con la tarjeta BBVA."
 *  - "Pagué la luz, fueron $1,250."
 *  - "Transferí $4,000 para la renta."
 *  - "Compré gasolina."
 */
@Injectable({ providedIn: 'root' })
export class ClassifierService {
  private readonly finance = inject(FinanceDataService);
  private readonly ai = inject(AIService);

  private readonly CURRENCY_PATTERN = /(mxn|usd|eur|ars|cop|clp|pen|brl|gbp|\$|€|£)/i;
  private readonly AMOUNT_PATTERN = /(\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+)/g;
  private readonly KEYWORD_CATEGORY: Record<string, string> = {
    'pizza': 'cat-comida', 'comida': 'cat-comida', 'restaurant': 'cat-comida', 'restaurante': 'cat-comida',
    'taco': 'cat-comida', 'oxxo': 'cat-comida', 'super': 'cat-comida', 'supermercado': 'cat-comida',
    'cafe': 'cat-comida', 'café': 'cat-comida', 'starbucks': 'cat-comida',
    'gasolina': 'cat-gasolina', 'gasolinera': 'cat-gasolina', 'combustible': 'cat-gasolina',
    'magna': 'cat-gasolina', 'premium': 'cat-gasolina', 'diesel': 'cat-gasolina', 'diésel': 'cat-gasolina',
    'pasaje': 'cat-pasajes', 'pasajes': 'cat-pasajes', 'boleto': 'cat-pasajes', 'boletos': 'cat-pasajes',
    'metro': 'cat-pasajes', 'metrobus': 'cat-pasajes', 'autobus': 'cat-pasajes', 'camion': 'cat-pasajes',
    'tren': 'cat-pasajes', 'subte': 'cat-pasajes', 'tranvia': 'cat-pasajes',
    'uber': 'cat-transporte', 'didi': 'cat-transporte', 'taxi': 'cat-transporte', 'cabify': 'cat-transporte',
    'renta': 'cat-vivienda', 'alquiler': 'cat-vivienda', 'departamento': 'cat-vivienda', 'casa': 'cat-vivienda',
    'luz': 'cat-servicios', 'agua': 'cat-servicios', 'gas': 'cat-servicios', 'internet': 'cat-servicios',
    'telefono': 'cat-servicios', 'teléfono': 'cat-servicios', 'cfe': 'cat-servicios',
    'medico': 'cat-salud', 'médico': 'cat-salud', 'doctor': 'cat-salud', 'farmacia': 'cat-salud', 'medicina': 'cat-salud',
    'cine': 'cat-entretenimiento', 'netflix': 'cat-suscripciones', 'spotify': 'cat-suscripciones',
    'amazon': 'cat-compras', 'mercadolibre': 'cat-compras', 'mercado libre': 'cat-compras', 'tienda': 'cat-compras',
    'libro': 'cat-educacion', 'libros': 'cat-educacion', 'curso': 'cat-educacion', 'universidad': 'cat-educacion',
    'prestamo': 'cat-prestamos', 'préstamo': 'cat-prestamos', 'banco': 'cat-prestamos',
    'sueldo': 'cat-sueldo', 'salario': 'cat-sueldo', 'nomina': 'cat-sueldo', 'nómina': 'cat-sueldo',
    'freelance': 'cat-freelance', 'cliente': 'cat-freelance', 'proyecto': 'cat-freelance',
    'inversion': 'cat-inversiones', 'inversión': 'cat-inversiones', 'dividendo': 'cat-inversiones'
  };

  private readonly CARD_KEYWORDS = ['tarjeta', 'card', 'bbva', 'banamex', 'santander', 'hsbc', 'scotiabank', 'amex', 'amex', 'banorte'];
  private readonly CASH_KEYWORDS = ['efectivo', 'cash'];
  private readonly TRANSFER_KEYWORDS = ['transferi', 'transferí', 'transfieri', 'transferencia'];

  /**
   * Clasifica un texto en lenguaje natural. Si la IA está
   * habilitada y dio consentimiento, intenta una clasificación
   * más rica; de lo contrario, usa el heurístico local.
   */
  async classify(text: string): Promise<ClassifiedDraft> {
    if (this.ai.isConfigured()) {
      try {
        const aiResult = await this.classifyWithAI(text);
        if (aiResult) return aiResult;
      } catch (e) {
        console.warn('Clasificador IA falló, usando heurístico:', e);
      }
    }
    return this.classifyHeuristic(text);
  }

  // ---------------------------------------------------------------------
  // Heurístico local
  // ---------------------------------------------------------------------

  classifyHeuristic(text: string): ClassifiedDraft {
    const lower = text.toLowerCase();
    const detected = this.detectAmount(text);
    const date = this.detectDate(lower) ?? new Date().toISOString().slice(0, 10);
    const currency = detected.currency ?? 'MXN';
    const amount = detected.amount ?? 0;
    const description = text.trim();
    const categoryId = this.detectCategory(lower);
    const paymentMethod = this.detectPaymentMethod(lower);
    const kind = this.detectKind(lower);

    const ambiguous = amount === 0 || !categoryId || !paymentMethod;

    return {
      description,
      amount,
      currency,
      categoryId,
      paymentMethodId: paymentMethod?.id,
      date,
      kind,
      ambiguous,
      hints: this.collectHints(lower)
    };
  }

  private detectAmount(text: string): { amount: number; currency?: string } {
    const matches = text.match(this.AMOUNT_PATTERN) ?? [];
    let amount = 0;
    let currency: string | undefined;
    for (const m of matches) {
      const cleaned = m.replace(/[\$€£\s]/g, '').replace(',', '');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > amount) amount = n;
    }
    if (/\$/.test(text)) currency = 'MXN';
    else if (/€/.test(text)) currency = 'EUR';
    else if (/£/.test(text)) currency = 'GBP';
    return { amount, currency };
  }

  private detectDate(text: string): string | undefined {
    const today = new Date();
    if (/\bayer\b/.test(text)) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    if (/\bhoy\b/.test(text)) {
      return today.toISOString().slice(0, 10);
    }
    if (/\banteayer\b/.test(text)) {
      const d = new Date(today);
      d.setDate(d.getDate() - 2);
      return d.toISOString().slice(0, 10);
    }
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    for (let i = 0; i < months.length; i++) {
      const idx = text.indexOf(months[i]);
      if (idx >= 0) {
        const m = i;
        const numMatch = text.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+${months[i]}`));
        if (numMatch) {
          const day = parseInt(numMatch[1], 10);
          const y = text.match(/\b(20\d{2})\b/);
          const year = y ? parseInt(y[1], 10) : today.getFullYear();
          return `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
    return undefined;
  }

  private detectCategory(text: string): string | undefined {
    for (const [keyword, catId] of Object.entries(this.KEYWORD_CATEGORY)) {
      if (text.includes(keyword)) {
        // Verificar que la categoría existe en el store
        if (this.finance.categories().some(c => c.id === catId)) return catId;
      }
    }
    // Fallback: recordar últimas categorías frecuentes (memoria simple)
    const expenses = this.finance.expenses();
    const counter = new Map<string, number>();
    for (const e of expenses) {
      counter.set(e.categoryId, (counter.get(e.categoryId) ?? 0) + 1);
    }
    if (counter.size === 0) return undefined;
    const sorted = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  private detectPaymentMethod(text: string) {
    const lower = text.toLowerCase();
    const allCards = this.finance.creditCards();
    // Buscar coincidencias con el nombre de tarjetas existentes
    for (const card of allCards) {
      const tokens = [
        card.name.toLowerCase(),
        card.issuer.toLowerCase(),
        ...(card.last4 ? [`*${card.last4}`, `•••• ${card.last4}`] : [])
      ];
      for (const t of tokens) {
        if (t && lower.includes(t)) {
          const pm = this.finance.paymentMethods().find(p => p.creditCardId === card.id);
          if (pm) return pm;
        }
      }
    }
    for (const keyword of this.CARD_KEYWORDS) {
      if (lower.includes(keyword)) {
        return this.finance.paymentMethods().find(p => p.type === 'credit_card');
      }
    }
    for (const keyword of this.TRANSFER_KEYWORDS) {
      if (lower.includes(keyword)) {
        return this.finance.paymentMethods().find(p => p.type === 'bank_transfer');
      }
    }
    for (const keyword of this.CASH_KEYWORDS) {
      if (lower.includes(keyword)) {
        return this.finance.paymentMethods().find(p => p.type === 'cash');
      }
    }
    return undefined;
  }

  private detectKind(text: string): ClassifiedDraft['kind'] {
    if (text.includes('renta') || text.includes('alquiler')) return 'transfer';
    if (/\bsueldo\b|\bsalario\b|\bnómina\b|\bnomina\b|\bfreelance\b|\bcliente\b/.test(text)) return 'income';
    if (/\bsuscripci[oó]n\b|\bnetflix\b|\bspotify\b/.test(text)) return 'subscription';
    if (/\bservicio\b|\bluz\b|\bagua\b|\binternet\b|\bteléfono\b|\btelefono\b|\bcfe\b/.test(text)) return 'service';
    if (/\bpr[eé]stamo\b|\bcuota\b|\bbanco\b/.test(text)) return 'loan_payment';
    return 'expense';
  }

  private collectHints(text: string): string[] {
    const hints: string[] = [];
    for (const kw of Object.keys(this.KEYWORD_CATEGORY)) {
      if (text.includes(kw)) hints.push(`categoría: ${kw}`);
    }
    for (const kw of this.CARD_KEYWORDS) {
      if (text.includes(kw)) hints.push(`método: ${kw}`);
    }
    for (const kw of this.TRANSFER_KEYWORDS) {
      if (text.includes(kw)) hints.push(`método: ${kw}`);
    }
    return hints;
  }

  // ---------------------------------------------------------------------
  // Clasificación con IA
  // ---------------------------------------------------------------------

  private async classifyWithAI(text: string): Promise<ClassifiedDraft | null> {
    const categories = this.finance.categories();
    const paymentMethods = this.finance.paymentMethods();
    const systemPrompt = `Eres un clasificador de gastos personales. Devuelve SOLO JSON válido con esta forma exacta:
{
  "description": string,
  "amount": number,
  "currency": string,
  "categoryId": string,
  "paymentMethodId": string,
  "date": "YYYY-MM-DD",
  "kind": "expense" | "income" | "service" | "subscription" | "loan_payment" | "transfer"
}
Categorías válidas: ${categories.map(c => `${c.id}=${c.name}`).join(', ')}.
Métodos de pago válidos: ${paymentMethods.map(p => `${p.id}=${p.name}`).join(', ')}.
Si falta información, usa la categoría "cat-otros" para gastos o "cat-otros-ingresos" para ingresos.`;

    const result = await this.ai.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ]);

    try {
      const json = this.extractJson(result.content);
      if (!json) return null;
      const parsed = JSON.parse(json);
      return {
        description: parsed.description || text,
        amount: Number(parsed.amount) || 0,
        currency: parsed.currency || 'MXN',
        categoryId: parsed.categoryId,
        paymentMethodId: parsed.paymentMethodId,
        date: parsed.date || new Date().toISOString().slice(0, 10),
        kind: parsed.kind || 'expense',
        ambiguous: !parsed.amount || !parsed.categoryId,
        hints: ['clasificación IA']
      };
    } catch {
      return null;
    }
  }

  private extractJson(content: string): string | null {
    const fenced = content.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (fenced) return fenced[1].trim();
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) return content.slice(start, end + 1);
    return null;
  }

  // ---------------------------------------------------------------------
  // Conversión a Expense
  // ---------------------------------------------------------------------

  toExpense(draft: ClassifiedDraft): Omit<Expense, 'id' | 'createdAt'> {
    const amount: MoneyAmount = { amount: draft.amount, currency: (draft.currency as MoneyAmount['currency']) || 'MXN' };
    return {
      description: draft.description,
      amount,
      categoryId: draft.categoryId ?? 'cat-otros',
      paymentMethodId: draft.paymentMethodId ?? 'pm-efectivo',
      date: draft.date,
      autoRegistered: true
    };
  }
}