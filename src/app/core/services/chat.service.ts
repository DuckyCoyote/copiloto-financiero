import { Injectable, computed, inject, signal } from '@angular/core';
import { ChatMessage, uuid } from '../models';
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
      this.messages.update(list => [...list, answer]);
      this.persist();
      return answer;
    } finally {
      this.busy.set(false);
    }
  }

  private async generateAnswer(userText: string): Promise<ChatMessage> {
    const lower = userText.toLowerCase();
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

    // 2) Intentar respuesta local (rápida y privada)
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

    const system = this.buildSystemPrompt(userText);

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

  private buildSystemPrompt(userText?: string): string {
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

=== RESUMEN MÍNIMO ===
- ${this.finance.income().length} ingresos, ${this.finance.expenses().length} gastos, ${this.finance.creditCards().length} tarjetas, ${this.finance.loans().length} préstamos.
- Total adeudado: ${totals.totalDebt.toFixed(2)} | Suscripciones/mes: ${totals.subscriptionsMonthly.toFixed(2)}.

=== DATOS COMPLETOS (úsalo siempre que la pregunta lo requiera) ===
${JSON.stringify(snap)}`;

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

  persist(): void {
    this.finance['storage'].write('cf:chat-history', this.messages());
  }
}