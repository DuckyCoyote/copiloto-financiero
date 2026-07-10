import { Injectable, computed, inject, signal } from '@angular/core';
import { ChatMessage, ChatRegisterPreview, uuid } from '../models';
import { AIService } from './ai.service';
import { AppSnapshot, FinanceDataService } from './finance-data.service';
import { OptimizationService } from './optimization.service';
import { PaymentPlannerService } from './payment-planner.service';
import { RiskDetectionService } from './risk-detection.service';
import { SimulationService } from './simulation.service';
import { SmartRegisterService, RegisterPreview } from './smart-register.service';
import { SummaryService } from './summary.service';
import { FormatService } from './format.service';

/**
 * Chat Financiero.
 *
 * Convierte la pregunta del usuario en un mensaje contextualizado
 * con todos los datos del usuario, y devuelve una respuesta. Si la
 * IA está habilitada, la usa; en caso contrario, responde con
 * reglas locales (simulación, optimización, riesgos, etc.).
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly ai = inject(AIService);
  private readonly finance = inject(FinanceDataService);
  private readonly sim = inject(SimulationService);
  private readonly opt = inject(OptimizationService);
  private readonly risk = inject(RiskDetectionService);
  private readonly planner = inject(PaymentPlannerService);
  private readonly summary = inject(SummaryService);
  private readonly smartRegister = inject(SmartRegisterService);
  private readonly fmt = inject(FormatService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);

  readonly hasMessages = computed(() => this.messages().length > 0);

  constructor() {
    this.messages.set(this.finance['storage'].read<ChatMessage[]>('cf:chat-history', []));
  }

  reset(): void {
    this.messages.set([]);
    this.persist();
  }

  /**
   * Confirma el registro del último preview. Llamado por la UI
   * cuando el usuario pulsa "Confirmar" sobre una preview.
   */
  confirmLastRegister(): boolean {
    const last = [...this.messages()].reverse().find(m => m.registerPreview);
    if (!last || !last.registerPreview) return false;
    const preview = last.registerPreview;
    this.smartRegister.commit(preview);
    // Marcar el mensaje como confirmado reemplazando el preview por un texto
    this.messages.update(list => list.map(m =>
      m === last
        ? { ...m, registerPreview: undefined, content: `✅ Listo, ${preview.prettyKind} guardado.` }
        : m
    ));
    this.persist();
    return true;
  }

  async ask(userText: string): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString()
    };
    this.messages.update(list => [...list, userMessage]);
    this.persist();
    this.busy.set(true);
    try {
      const answer = await this.generateAnswer(userText);
      // Si la respuesta ya está en la lista (actualización in-place de un
      // preview existente), no la duplicamos. Esto ocurre cuando el
      // usuario confirma o corrige el último preview textualmente.
      this.messages.update(list => {
        if (answer.id && list.some(m => m.id === answer.id)) return list;
        return [...list, answer];
      });
      this.persist();
      return answer;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Busca la última vista previa de registro pendiente. Solo considera
   * el ÚLTIMO mensaje del asistente: si el asistente ya respondió con
   * otra cosa después, la conversación avanzó y el preview anterior ya
   * no está pendiente.
   */
  private findLastPendingPreview(): { preview: ChatRegisterPreview; messageId: string } | undefined {
    const list = this.messages();
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role !== 'assistant') continue;
      if (m.registerPreview && m.id) return { preview: m.registerPreview, messageId: m.id };
      return undefined;
    }
    return undefined;
  }

  /**
   * Detecta si el mensaje del usuario es una confirmación simple
   * aplicable a la última vista previa ("sí", "ok", "confirmar", …).
   */
  private isConfirmation(text: string): boolean {
    const t = text.trim();
    return /^(s[íi]|ok(?:ay)?|confirm[ao]|conf[ií]rmalo|guardar|guarda|guardo|dale|va|adelante|exacto|correcto|hecho|hazlo|apl[íi]calo|aplicar)\s*[.!]?$/i.test(t);
  }

  /**
   * Intenta extraer de la respuesta del usuario un campo faltante o
   * corregido de la vista previa pendiente: método de pago, categoría
   * o monto. Devuelve la vista previa actualizada o null si no detectó
   * nada útil.
   */
  private tryFixPendingPreview(
    userText: string,
    prev: ChatRegisterPreview
  ): { updated: ChatRegisterPreview; changes: string[] } | null {
    const updates: Partial<ChatRegisterPreview> = {};
    const changes: string[] = [];
    const lower = userText.toLowerCase();

    // Método de pago: si el texto contiene exactamente un nombre conocido
    // y difiere del actual, lo tomamos como corrección.
    const pmCandidates = this.finance.paymentMethods().filter(p => {
      const name = p.name.toLowerCase();
      return name.length >= 3 && lower.includes(name);
    });
    if (pmCandidates.length === 1 && pmCandidates[0].id !== prev.paymentMethodId) {
      updates.paymentMethodId = pmCandidates[0].id;
      changes.push(`método de pago → **${pmCandidates[0].name}**`);
    }

    // Categoría: igual, pero permitir también si el usuario añade la
    // categoría (no solo si corrige). Excluimos la categoría ya asignada
    // para no reportar un "cambio" que no lo es.
    const catCandidates = this.finance.categories().filter(c => {
      const name = c.name.toLowerCase();
      return name.length >= 3 && lower.includes(name);
    });
    const catChange = catCandidates.find(c => c.id !== prev.categoryId);
    if (catChange) {
      updates.categoryId = catChange.id;
      changes.push(`categoría → **${catChange.name}**`);
    }

    // Monto: extraer un número del texto. Si difiere del actual, actualizar.
    const amountMatch = userText.match(/(?:\$|mxn|pesos)?\s*(\d{1,7}(?:[.,]\d{1,2})?)/i);
    if (amountMatch) {
      const parsed = parseFloat(amountMatch[1].replace(',', '.'));
      if (!isNaN(parsed) && Math.abs(parsed - prev.amount) > 0.01) {
        updates.amount = parsed;
        changes.push(`monto → **$${parsed.toFixed(2)}**`);
      }
    }

    if (changes.length === 0) return null;

    return {
      updated: { ...prev, ...updates, ambiguous: false },
      changes
    };
  }

  /**
   * Aplica una corrección al preview pendiente: actualiza el mensaje
   * del asistente existente y devuelve el mismo mensaje (con mismo id)
   * para que `ask` lo detecte y no lo duplique.
   */
  private applyCorrectionToPending(
    correction: { updated: ChatRegisterPreview; changes: string[] },
    pendingMessageId: string
  ): ChatMessage {
    const updated = correction.updated;
    const cat = updated.categoryId
      ? this.finance.findCategory(updated.categoryId)?.name ?? '(por definir)'
      : '(por definir)';
    const pm = updated.paymentMethodId
      ? this.finance.findPaymentMethod(updated.paymentMethodId)?.name ?? '(por definir)'
      : '(por definir)';
    const date = this.fmt.formatDate(updated.date);
    const cambios = correction.changes.length ? `\n\nCambios aplicados: ${correction.changes.join(', ')}` : '';

    const content =
      `Tengo este ${updated.prettyKind} pendiente de confirmación (corregido):\n\n` +
      `• Concepto: **${updated.description}**\n` +
      `• Monto: **$${updated.amount.toFixed(2)} ${updated.currency}**\n` +
      `• Fecha: **${date}**\n` +
      `• Categoría: **${cat}**\n` +
      `• Método: **${pm}**\n\n` +
      `Pulsa **${updated.actionLabel}** para guardarlo.` +
      cambios;

    this.messages.update(list => list.map(m =>
      m.id === pendingMessageId
        ? { ...m, content, registerPreview: updated }
        : m
    ));

    return {
      id: pendingMessageId,
      role: 'assistant',
      content,
      registerPreview: updated,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Confirma la última vista previa pendiente: registra el movimiento y
   * reemplaza el mensaje del asistente por uno de confirmación. Devuelve
   * el mismo mensaje (mismo id) para evitar duplicación en `ask`.
   */
  private confirmPendingPreview(
    pendingMessageId: string,
    pendingPreview: ChatRegisterPreview
  ): ChatMessage {
    this.smartRegister.commit(pendingPreview);
    const content = `✅ Listo, ${pendingPreview.prettyKind} guardado.`;
    this.messages.update(list => list.map(m =>
      m.id === pendingMessageId
        ? { ...m, registerPreview: undefined, content }
        : m
    ));
    return {
      id: pendingMessageId,
      role: 'assistant',
      content,
      timestamp: new Date().toISOString()
    };
  }

  private async generateAnswer(userText: string): Promise<ChatMessage> {
    const lower = userText.toLowerCase();

    // 0) Si el último mensaje del asistente es una vista previa pendiente,
    //    primero intentamos resolverla SIN la IA: es más rápido, más fiable
    //    y evita errores del modelo. Cubre:
    //      a) confirmación textual ("sí", "ok", "confirmar"…)
    //      b) corrección de un campo (método, categoría, monto)
    const pending = this.findLastPendingPreview();
    if (pending) {
      if (this.isConfirmation(userText)) {
        return this.confirmPendingPreview(pending.messageId, pending.preview);
      }
      const correction = this.tryFixPendingPreview(userText, pending.preview);
      if (correction) {
        return this.applyCorrectionToPending(correction, pending.messageId);
      }
    }

    // 1) Detectar intención de registro y preparar preview
    try {
      const preview = await this.smartRegister.detect(userText);
      if (preview) {
        return {
          id: uuid(),
          role: 'assistant',
          content: this.buildRegisterReply(preview),
          registerPreview: preview,
          timestamp: new Date().toISOString()
        };
      }
    } catch (e) {
      console.warn('Smart register failed:', e);
    }

    // 2) Detectar solicitud de crear un plan/estrategia de pagos personalizado
    //    con IA (con la especificación que el usuario escriba). Si aplica,
    //    la estrategia resultante queda guardada como opción en la sección
    //    "Planes de pago", no solo como texto en el chat.
    const createdStrategy = await this.tryCreatePaymentStrategy(userText);
    if (createdStrategy) return createdStrategy;

    // 3) Intentar respuesta local (rápida y privada)
    const local = this.tryLocalAnswer(lower, userText);
    if (local) return { ...local, id: uuid(), role: 'assistant', timestamp: new Date().toISOString() };

    if (!this.ai.isConfigured()) {
      return {
        id: uuid(),
        role: 'assistant',
        content: 'No tengo IA habilitada. Activa el proveedor externo en Configuración o haz una pregunta específica (ej. "plan de pagos", "deuda más cara").',
        timestamp: new Date().toISOString()
      };
    }

    // Pasamos la vista previa pendiente al system prompt para que la IA
    // tenga contexto explícito de qué le acaban de preguntar al usuario.
    const system = this.buildSystemPrompt(userText, pending?.preview);

    // Construimos el historial completo de la conversación para que
    // la IA recuerde los turnos anteriores y dé respuestas
    // puntuales sin tener que pedir confirmación otra vez.
    const history = this.messages().slice(-20).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: userText }
    ];

    try {
      const reply = await this.ai.chat(messages);
      return { ...reply, id: reply.id ?? uuid() };
    } catch (e: unknown) {
      return {
        id: uuid(),
        role: 'assistant',
        content: `Error contactando al proveedor de IA: ${(e as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /** Detecta pedidos de crear/generar un plan o estrategia de pagos con una especificación libre. */
  private readonly createPlanIntentRe =
    /\b(crea|cr[ée]ame|creame|genera|g[ée]nerame|generame|arma|[áa]rmame|armame|hazme|haz|dise[ñn]a|dise[ñn]ame|quiero|necesito)\b[^.!?]{0,60}\b(plan(?:es)? de pagos?|estrategia(?:s)? de pagos?)\b/i;

  /**
   * Si el usuario pide crear un plan de pagos con una especificación
   * propia ("hazme un plan que priorice liquidar mi tarjeta X primero"),
   * genera una estrategia con IA usando ese texto como instrucción y la
   * deja guardada en `PaymentPlannerService` para que aparezca como
   * opción en la sección "Planes de pago", no solo como texto aquí.
   * Devuelve `null` si el mensaje no corresponde a este tipo de pedido.
   */
  private async tryCreatePaymentStrategy(userText: string): Promise<ChatMessage | null> {
    if (!this.createPlanIntentRe.test(userText)) return null;

    if (!this.ai.isConfigured()) {
      return {
        id: uuid(),
        role: 'assistant',
        content: 'Para crear un plan de pagos personalizado con IA necesito que actives la IA en Configuración (y aceptes compartir datos con el proveedor). Mientras tanto, escribe "plan de pagos" y te doy el resumen estándar.',
        timestamp: new Date().toISOString()
      };
    }

    try {
      const horizonDays = 30;
      const base = this.planner.generateStrategies(horizonDays);
      const [strategy] = await this.planner.generateAiStrategies(horizonDays, undefined, base, userText);
      this.planner.addCustomStrategy(strategy);

      const cardLines = strategy.cardDecisions
        .map(d => `- ${d.cardName}: ${d.action === 'pay_full' ? 'liquidar (sin intereses)' : d.action === 'pay_minimum' ? 'pago mínimo' : 'sin pago este ciclo'}`)
        .join('\n');

      return {
        id: uuid(),
        role: 'assistant',
        content:
          `Creé la estrategia **${strategy.name}** según lo que pediste:\n\n${strategy.description}\n\n` +
          (cardLines ? `${cardLines}\n\n` : '') +
          `${strategy.summary}\n\n` +
          `Ya quedó guardada como opción en la sección **Planes de pago**, donde puedes revisarla, ajustarla y aplicarla.`,
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      return {
        id: uuid(),
        role: 'assistant',
        content: `No pude crear el plan con IA: ${(e as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  private tryLocalAnswer(lower: string, original: string): ChatMessage | null {
    if (/en qu[ée]\s+gast[ée]\s+m[áa]s|categor[íi]a\s+m[áa]s/.test(lower)) {
      const top = this.finance.topCategoriesThisMonth(3);
      const lines = top.map((t, i) => {
        const cat = this.finance.findCategory(t.categoryId);
        return `${i + 1}. ${cat?.icon ?? '🏷️'} ${cat?.name ?? 'Sin categoría'}: ${t.total.toFixed(2)}`;
      });
      return {
        id: uuid(),
        role: 'assistant',
        content: `Tus categorías con más gasto este mes:\n${lines.join('\n')}`,
        timestamp: new Date().toISOString()
      };
    }
    if (/cu[áa]nto\s+debo|deuda\s+total/.test(lower)) {
      const t = this.finance.totals();
      return {
        id: uuid(),
        role: 'assistant',
        content: `Debes en total ${t.totalDebt.toFixed(2)} (${t.cardDebt.toFixed(2)} en tarjetas y ${t.loanDebt.toFixed(2)} en préstamos).`,
        timestamp: new Date().toISOString()
      };
    }
    if (/plan\s+de\s+pagos|c[óo]mo\s+pago/.test(lower)) {
      const plan = this.planner.generatePlan();
      const items = plan.items.slice(0, 8).map(i => `- ${i.date}: ${i.description} (${i.amount.toFixed(2)})`).join('\n');
      return {
        id: uuid(),
        role: 'assistant',
        content: `${plan.summary}\n\n${items}\n\n(Puedes ver el plan completo en la sección "Plan de pagos")`,
        timestamp: new Date().toISOString()
      };
    }
    if (/riesgo|alerta/.test(lower)) {
      const alerts = this.risk.alerts();
      if (alerts.length === 0) {
        return {
          id: uuid(),
          role: 'assistant',
          content: 'No detecté riesgos importantes. ¡Buen manejo!',
          timestamp: new Date().toISOString()
        };
      }
      return {
        id: uuid(),
        role: 'assistant',
        content: alerts.map(a => `• [${a.severity}] ${a.title} — ${a.description}`).join('\n'),
        timestamp: new Date().toISOString()
      };
    }
    if (/qu[ée]\s+pasa\s+si|simul/.test(lower)) {
      const sim = this.sim.simulate(original);
      return {
        id: uuid(),
        role: 'assistant',
        content: `${sim.summary}\n${sim.table?.map(r => `• ${r.label}: ${r.value}`).join('\n') ?? ''}`,
        timestamp: new Date().toISOString()
      };
    }
    if (/anali[zs]a|resumen/.test(lower)) {
      const insights = this.summary.insights();
      if (insights.length === 0) {
        return {
          id: uuid(),
          role: 'assistant',
          content: 'Aún no tengo suficiente información para generar un análisis. Registra algunos gastos o ingresos.',
          timestamp: new Date().toISOString()
        };
      }
      return {
        id: uuid(),
        role: 'assistant',
        content: insights.map(i => `${i.icon} ${i.text}`).join('\n'),
        timestamp: new Date().toISOString()
      };
    }
    return null;
  }

  private buildRegisterReply(preview: RegisterPreview): string {
    const cat = preview.categoryId ? this.finance.findCategory(preview.categoryId) : undefined;
    const catName = cat?.name ?? '(por definir)';
    const pm = preview.paymentMethodId ? this.finance.findPaymentMethod(preview.paymentMethodId) : undefined;
    const pmName = pm?.name ?? '(por definir)';
    const date = this.fmt.formatDate(preview.date);
    return `Tengo detectado este ${preview.prettyKind} pendiente de confirmación:\n\n` +
      `• Concepto: **${preview.description}**\n` +
      `• Monto: **$${preview.amount.toFixed(2)} ${preview.currency}**\n` +
      `• Fecha: **${date}**\n` +
      `• Categoría: **${catName}**\n` +
      `• Método: **${pmName}**\n\n` +
      `Pulsa **${preview.actionLabel}** para guardarlo. Si algo no encaja, dime qué corregir.`;
  }

  private buildSystemPrompt(userText?: string, pendingPreview?: ChatRegisterPreview): string {
    const snap: AppSnapshot = this.finance.snapshot();
    const totals = this.finance.totals();
    const lc = userText?.toLowerCase() ?? '';
    const wantsSummary = /resumen|resúmen|análisis|analisis|estado general|cómo estoy|cómo voy|dame el panorama|overview/.test(lc);
    const wantsRecs = /recomiend|sugerenc|qué hago|qué debería|consejo|aconseja/.test(lc);
    const wantsPlan = /plan|tabla|calendario|fechas?|montos? exactos?|simulaci[oó]n|c[oó]mo (puedo|debo|hago)/.test(lc);

    // Prompt directo: la IA debe responder YA con datos concretos,
    // NO pedir confirmación ni preguntar "¿quieres que...?".
    let base = `Eres el Copilot Financiero del usuario. Tienes acceso a sus datos locales guardados en la app.

REGLAS CRÍTICAS (léelas y respétalas siempre):
1. RESPONDE DIRECTAMENTE. Nunca preguntes "¿quieres que te lo prepare?" o "¿lo armo?". Si el usuario pidió algo, HAZLO en la misma respuesta.
2. NO pidas confirmación para hacer algo que el usuario ya pidió explícitamente.
3. Si el usuario pide un plan, una tabla, una simulación, fechas, montos exactos: GENERA la respuesta completa con los datos que tienes. No digas "podría hacerlo" — hazlo.
4. Si el usuario pide fechas y montos exactos, calcula y muestra los números concretos (fechas del mes, cantidades, prioridades). NO digas "necesito más datos" a menos que REALMENTE te falten.
5. Si el usuario hace una pregunta concreta, respóndela de forma directa y breve.
6. No inventes datos. Si falta algún dato del usuario, di claramente cuál.
7. Puedes usar Markdown breve: **negrita**, listas, \`código\`, tablas.
8. Mantén la memoria de la conversación: si el usuario ya mencionó algo antes (como "mis quincenas son de 15000"), recuérdalo.
9. Si el usuario pide "sugerencias" o "qué hago", da una lista concreta de acciones, no más preguntas.
${pendingPreview ? `10. ACLARACIÓN PENDIENTE: tu último mensaje fue una vista previa de registro al usuario. La respuesta actual del usuario debe interpretarse como confirmación, corrección o aclaración de ESE registro, NO como un registro nuevo desde cero.` : ''}

=== RESUMEN MÍNIMO ===
- ${this.finance.income().length} ingresos, ${this.finance.expenses().length} gastos, ${this.finance.creditCards().length} tarjetas, ${this.finance.loans().length} préstamos.
- Total adeudado: ${totals.totalDebt.toFixed(2)} | Suscripciones/mes: ${totals.subscriptionsMonthly.toFixed(2)}.

=== DATOS COMPLETOS (úsalo siempre que la pregunta lo requiera) ===
${JSON.stringify(snap)}`;

    if (pendingPreview) {
      base += `\n\n=== ACLARACIÓN PENDIENTE ===\n` +
        `Tu último mensaje al usuario fue esta vista previa de registro:\n` +
        this.formatPendingPreview(pendingPreview) +
        `\n\nEl usuario acaba de responder: "${userText}"\n\n` +
        `INSTRUCCIONES PARA ESTA RESPUESTA:\n` +
        `- Si confirma ("sí", "ok", "guardar"): di brevemente que está listo y pídele pulsar el botón de confirmación de la tarjeta.\n` +
        `- Si corrige un campo: muestra el campo corregido y pide que confirme.\n` +
        `- Si sigue siendo ambigua: pregunta UNA sola cosa concreta para avanzar.`;
    }

    if (wantsSummary) {
      const insights = this.summary.insights();
      base += `\n\n=== INSIGHTS (el usuario pidió un resumen) ===\n${insights.map(i => `- ${i.icon} ${i.text}`).join('\n') || 'Sin insights este mes.'}`;
    }
    if (wantsRecs) {
      const recs = this.opt.recommendations();
      base += `\n\n=== RECOMENDACIONES (el usuario pidió sugerencias) ===\n${recs.map(r => `- ${r.title}: ${r.description}`).join('\n') || 'No hay recomendaciones pendientes.'}`;
    }
    return base;
  }

  /** Da formato legible a una vista previa para incluirla en el system prompt. */
  private formatPendingPreview(p: ChatRegisterPreview): string {
    const cat = p.categoryId ? this.finance.findCategory(p.categoryId)?.name : undefined;
    const pm = p.paymentMethodId ? this.finance.findPaymentMethod(p.paymentMethodId)?.name : undefined;
    const lines = [
      `  • Tipo: ${p.prettyKind}`,
      `  • Concepto: ${p.description}`,
      `  • Monto: $${p.amount.toFixed(2)} ${p.currency}`,
      `  • Fecha: ${p.date}`
    ];
    lines.push(cat ? `  • Categoría: ${cat}` : `  • (Falta: categoría)`);
    lines.push(pm ? `  • Método: ${pm}` : `  • (Falta: método de pago)`);
    return lines.join('\n');
  }

  persist(): void {
    this.finance['storage'].write('cf:chat-history', this.messages());
  }
}