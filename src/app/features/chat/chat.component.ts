import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../../core/models';
import { AIService, ChatService, FinanceDataService, FormatService, SmartRegisterService, ToastService } from '../../core/services';
import { IconComponent } from '../../shared/icon/icon.component';
import { MarkdownPipe } from '../../shared/markdown.pipe';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, MarkdownPipe],
  template: `
    <div class="chat-header flex-col gap-2">
      <div class="title-block">
        <h1>Chat con tu Copilot IA</h1>
        <p class="text-muted">Pregunta lo que quieras sobre tus finanzas. Tus datos no salen del dispositivo a menos que actives un proveedor externo.</p>
      </div>
      <div class="actions">
        <span class="badge" [class.badge-success]="aiReady()" [class.badge-warning]="!aiReady()">
          {{ aiReady() ? 'IA activa' : 'Modo local' }}
        </span>
        <button type="button" class="btn btn-sm" (click)="reset()">
          <app-icon name="trash" [size]="12"></app-icon> Limpiar
        </button>
      </div>
    </div>

    <div class="chat-shell card">
      <div class="messages" #scrollEl (scroll)="onMessagesScroll()">
        @if (messages().length === 0) {
          <div class="welcome">
            <h2>¿En qué te puedo ayudar?</h2>
            <div class="suggestions">
              @for (s of suggestions; track s) {
                <button type="button" class="btn" (click)="useSuggestion(s)">{{ s }}</button>
              }
            </div>
          </div>
        }
        @for (m of messages(); track m.id) {
          <div class="msg" [class.user]="m.role === 'user'">
            <div class="avatar"><app-icon [name]="m.role === 'user' ? 'home' : 'sparkles'" [size]="14"></app-icon></div>
            <div class="bubble">
              <div class="content markdown" [innerHTML]="m.content | markdown"></div>
              @if (m.registerPreview; as p) {
                <div class="register-card">
                  <div class="register-head">
                    <app-icon name="check-circle" [size]="16"></app-icon>
                    <strong>{{ p.actionLabel }}</strong>
                  </div>
                  <div class="register-row"><span>Concepto</span><strong>{{ p.description }}</strong></div>
                  <div class="register-row"><span>Monto</span><strong class="font-mono">{{ formatMoney(p.amount, p.currency) }}</strong></div>
                  <div class="register-row"><span>Fecha</span><strong>{{ formatDate(p.date) }}</strong></div>
                  <div class="register-row"><span>Categoría</span><strong>{{ categoryName(p.categoryId) || '—' }}</strong></div>
                  <div class="register-row"><span>Método</span><strong>{{ paymentMethodName(p.paymentMethodId) || '—' }}</strong></div>
                  <div class="register-actions">
                    <button type="button" class="btn btn-primary btn-sm" (click)="confirmRegister(m)">
                      <app-icon name="check" [size]="12"></app-icon> Confirmar y guardar
                    </button>
                  </div>
                </div>
              }
              <small class="time">{{ m.timestamp | date:'short' }}</small>
            </div>
          </div>
        }
        @if (busy()) {
          <div class="msg">
            <div class="avatar"><app-icon name="sparkles" [size]="14"></app-icon></div>
            <div class="bubble thinking">Pensando…</div>
          </div>
        }
      </div>
      <div class="suggestions-bar" role="toolbar" aria-label="Sugerencias rápidas">
        @for (s of quickSuggestions; track s) {
          <button type="button" class="suggestion-pill" (click)="useSuggestion(s)" [disabled]="busy()">
            <app-icon name="zap" [size]="12"></app-icon>
            <span>{{ s }}</span>
          </button>
        }
      </div>

      <form class="composer" (submit)="send($event)">
        <input #inputEl type="text" [(ngModel)]="input" name="input" placeholder="Escribe una pregunta o elige una sugerencia arriba…" autocomplete="off" />
        <button type="submit" class="btn btn-primary" [disabled]="busy() || !input.trim()">
          <app-icon name="send" [size]="14"></app-icon> Enviar
        </button>
      </form>
    </div>
  `,
  styles: [`
    /* Header en columna, botones en fila */
    .chat-header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .title-block h1 { margin: 0 0 4px 0; }
    .title-block p { margin: 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

    /* Shell del chat: se ajusta a la altura disponible sin scroll global */
    .chat-shell {
      display: flex; flex-direction: column;
      padding: 0;
      /* 100dvh = dynamic viewport (mejor que vh en móviles con barras dinámicas).
         Restamos la cabecera de la página + topbar + el header del propio chat. */
      height: calc(100dvh - var(--header-height) - 24px - 110px);
      min-height: 360px;
    }
    .messages {
      flex: 1 1 auto;
      min-height: 0;            /* permite que el flex-item se encoja y haga scroll */
      overflow-y: auto;
      padding: 20px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .welcome { text-align: center; padding: 24px; }
    .welcome h2 { font-size: 18px; margin-bottom: 12px; }
    .suggestions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

    /* Mensajes: burbujas que no rompen la pantalla con URLs largas */
    .msg { display: flex; gap: 10px; align-items: flex-start; max-width: 88%; }
    .msg.user { margin-left: auto; flex-direction: row-reverse; }
    .avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--color-surface-2);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
    }
    .bubble {
      padding: 10px 14px; border-radius: 14px;
      background: var(--color-surface-2);
      max-width: 100%;
      white-space: pre-wrap;
      line-height: 1.45;
      /* Rompe palabras y URLs largas */
      overflow-wrap: anywhere;
      word-break: break-word;
      min-width: 0;
    }
    .bubble .content { font-size: 14px; }
    .bubble .content.markdown { white-space: normal; }
    .bubble .content.markdown :first-child { margin-top: 0; }
    .bubble .content.markdown :last-child { margin-bottom: 0; }
    .bubble .content.markdown p { margin: 0 0 8px 0; }
    .bubble .content.markdown p:last-child { margin-bottom: 0; }
    .bubble .content.markdown h1,
    .bubble .content.markdown h2,
    .bubble .content.markdown h3 { font-size: 15px; margin: 8px 0 4px 0; }
    .bubble .content.markdown ul,
    .bubble .content.markdown ol { margin: 4px 0 8px 18px; padding: 0; }
    .bubble .content.markdown li { margin-bottom: 2px; }
    .bubble .content.markdown code {
      background: var(--color-surface-3);
      padding: 1px 5px; border-radius: 3px;
      font-family: var(--font-mono); font-size: 12.5px;
    }
    .bubble .content.markdown pre {
      background: var(--color-surface-3);
      padding: 8px; border-radius: 6px;
      overflow-x: auto;
    }
    .bubble .content.markdown blockquote {
      border-left: 3px solid var(--color-border);
      padding-left: 10px;
      margin: 6px 0;
      color: var(--color-text-muted);
    }
    .bubble .content.markdown a {
      color: var(--color-text);
      text-decoration: underline;
    }
    .bubble .time { display: block; margin-top: 4px; opacity: 0.6; }

    /* Burbuja del usuario: usa --color-text como fondo y --color-bg como texto
       para que el contraste se mantenga en cualquier tema. */
    .msg.user .bubble {
      background: var(--color-text);
      color: var(--color-bg);
    }
    .msg.user .bubble .time { color: var(--color-bg); opacity: 0.6; }

    .bubble.thinking { color: var(--color-text-muted); font-style: italic; }

    /* Tarjeta de preview para registro */
    .register-card {
      margin-top: 10px;
      padding: 12px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      display: flex; flex-direction: column; gap: 6px;
    }
    .register-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .register-row {
      display: flex; justify-content: space-between; gap: 12px;
      font-size: 13px; padding: 2px 0;
    }
    .register-row span { color: var(--color-text-muted); }
    .register-row strong { word-break: break-word; }
    .register-actions { display: flex; gap: 6px; margin-top: 6px; }
    .register-actions .btn { flex: 1; }

    /* Composer anclado abajo, siempre visible */
    .composer {
      display: flex; gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
      flex-shrink: 0;
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }
    .composer input { flex: 1; min-width: 0; }

    /* Barra de sugerencias flotante */
    .suggestions-bar {
      display: flex; gap: 6px; flex-wrap: nowrap;
      padding: 10px 12px 6px 12px;
      overflow-x: auto;
      scrollbar-width: thin;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .suggestion-pill {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      cursor: pointer;
      font-family: inherit;
      transition: background .12s ease, transform .05s ease;
    }
    .suggestion-pill:hover:not(:disabled) { background: var(--color-surface-3); }
    .suggestion-pill:active { transform: translateY(1px); }
    .suggestion-pill:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Móvil: el shell ocupa todo el alto disponible, el header se hace más compacto */
    @media (max-width: 600px) {
      .chat-shell { height: calc(100dvh - var(--header-height) - 16px - 180px); min-height: 320px; }
      .messages { padding: 14px; gap: 10px; }
      .msg { max-width: 95%; }
      .avatar { width: 28px; height: 28px; }
      .bubble { padding: 9px 12px; font-size: 14px; }
      .composer { padding: 10px 12px; }
    }
  `]
})
export class ChatComponent implements AfterViewChecked {
  readonly ai = inject(AIService);
  readonly chat = inject(ChatService);
  private readonly toast = inject(ToastService);
  readonly finance = inject(FinanceDataService);
  readonly fmt = inject(FormatService);
  private readonly smartRegister = inject(SmartRegisterService);

  readonly messages = this.chat.messages;
  readonly busy = this.chat.busy;
  readonly aiReady = computed(() => this.ai.isConfigured());

  input = '';

  @ViewChild('scrollEl') scrollEl?: ElementRef<HTMLElement>;
  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;

  /** Si el usuario ha scrolleado hacia arriba, dejamos de auto-scroll. */
  userScrolledUp = false;
  private lastMessageCount = 0;
  private resizeObserver?: ResizeObserver;

  readonly suggestions = [
    '¿En qué gasté más este mes?',
    '¿Cuánto debo en total?',
    'Genera un plan de pagos para los próximos 30 días',
    '¿Qué deuda debería pagar primero?',
    '¿Cuánto puedo gastar este fin de semana?',
    'Analiza mis finanzas'
  ];

  /** Sugerencias cortas para los botones flotantes (≤ 32 chars). */
  readonly quickSuggestions = [
    '¿Cuánto debo?',
    'Plan de pagos',
    'Mejor tarjeta',
    'Categorías top',
    'Próximos pagos',
    'Suscr. a cancelar',
    '¿Cuánto ahorro?',
    'Resumen del mes'
  ];

  useSuggestion(s: string): void {
    this.input = s;
    this.inputEl?.nativeElement?.focus();
  }

  reset(): void { this.chat.reset(); this.toast.info('Conversación limpiada'); }

  async send(ev: Event): Promise<void> {
    ev.preventDefault();
    const text = this.input.trim();
    if (!text) return;
    this.input = '';
    this.userScrolledUp = false;
    await this.chat.ask(text);
    this.scrollToBottom();
  }

  /**
   * Hace scroll al final del contenedor de mensajes, pero solo si
   * el usuario no ha scrolleado hacia arriba. Si el usuario está
   * cerca del fondo, también vuelve a activar el auto-scroll.
   */
  scrollToBottom(): void {
    if (this.userScrolledUp) return;
    const el = this.scrollEl?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  /**
   * Detecta si el usuario scrolleó hacia arriba. Si está cerca del
   * fondo, asume que quiere seguir el auto-scroll.
   */
  onMessagesScroll(): void {
    const el = this.scrollEl?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // 40px de tolerancia
    this.userScrolledUp = distanceFromBottom > 40;
  }

  ngAfterViewChecked(): void {
    // Detecta mensajes nuevos y hace scroll automático si el usuario
    // no ha scrolleado hacia arriba.
    const current = this.chat.messages().length;
    if (current !== this.lastMessageCount) {
      this.lastMessageCount = current;
      this.scrollToBottom();
    }
  }

  confirmRegister(m: any): void {
    this.smartRegister.commit(m.registerPreview);
    // Reemplaza la preview por un texto de confirmación
    this.chat.messages.update(list => list.map(x =>
      x === m
        ? { ...x, registerPreview: undefined, content: '✅ Listo, ' + m.registerPreview.prettyKind + ' guardado.' }
        : x
    ));
  }

  formatMoney(amount: number, currency: string): string {
    return this.fmt.formatMoney(amount, currency as 'MXN');
  }

  formatDate(iso: string): string {
    return this.fmt.formatDate(iso);
  }

  categoryName(id?: string): string | undefined {
    if (!id) return undefined;
    return this.finance.findCategory(id)?.name;
  }

  paymentMethodName(id?: string): string | undefined {
    if (!id) return undefined;
    return this.finance.findPaymentMethod(id)?.name;
  }
}
