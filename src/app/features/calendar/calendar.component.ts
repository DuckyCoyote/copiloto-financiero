import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CalendarEvent } from '../../core/models';
import { FinanceDataService, FormatService } from '../../core/services';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

interface DayCell {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

interface AgendaDay {
  date: Date;
  iso: string;
  events: CalendarEvent[];
  total: number;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, IconComponent, ModalComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Calendario financiero</h1>
        <p class="text-muted">Pagos, ingresos y eventos recurrentes.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost btn-sm icon-btn" (click)="prevMonth()" aria-label="Mes anterior">
          <app-icon name="chevron-left" [size]="16"></app-icon>
        </button>
        <strong class="month-label">{{ monthLabel() }}</strong>
        <button type="button" class="btn btn-ghost btn-sm icon-btn" (click)="nextMonth()" aria-label="Mes siguiente">
          <app-icon name="chevron-right" [size]="16"></app-icon>
        </button>
        <button type="button" class="btn btn-sm view-toggle" (click)="view.set('agenda')" [class.active]="view() === 'agenda'">
          <app-icon name="list-checks" [size]="14"></app-icon> Agenda
        </button>
        <button type="button" class="btn btn-sm view-toggle" (click)="view.set('grid')" [class.active]="view() === 'grid'">
          <app-icon name="calendar" [size]="14"></app-icon> Mes
        </button>
      </div>
    </div>

    @if (view() === 'grid') {
      <div class="card calendar">
        <div class="dow">
          @for (d of dows; track d) {
            <div class="dow-cell">{{ d }}</div>
          }
        </div>
        <div class="grid7">
          @for (cell of cells(); track cell.iso) {
            <button type="button" class="cell-btn cell" [class.out]="!cell.inMonth" [class.today]="cell.isToday" [class.selected]="cell.isSelected" (click)="selectDay(cell)">
              <div class="day-num">{{ cell.date.getDate() }}</div>
              @if (cell.events.length > 0) {
                <div class="event-pill" [class.tone-loan]="hasKind(cell.events, 'loan_payment')" [class.tone-card]="hasKind(cell.events, 'credit_card_payment')" [class.tone-sub]="hasKind(cell.events, 'subscription_payment')" [class.tone-svc]="hasKind(cell.events, 'service_payment')">
                  <span class="dot"></span>
                  <span class="label">{{ totalLabel(cell.events) }}</span>
                </div>
                @if (cell.events.length > 1) {
                  <div class="more-events">+{{ cell.events.length - 1 }} más</div>
                }
              }
            </button>
          }
        </div>
        <p class="hint">Toca un día para ver el detalle de los pagos.</p>
      </div>
    } @else {
      <div class="card agenda">
        @if (agenda().length === 0) {
          <p class="text-muted text-center" style="margin: 24px 0;">No hay eventos en los próximos 60 días.</p>
        }
        @for (day of agenda(); track day.iso) {
          <div class="agenda-day">
            <div class="agenda-head">
              <div>
                <strong>{{ day.date | date:'EEEE d' }}</strong>
                <small class="text-muted">{{ day.date | date:'LLLL y' }}</small>
              </div>
              <span class="badge">{{ day.events.length }} evento{{ day.events.length === 1 ? '' : 's' }}</span>
            </div>
            @for (e of day.events; track e.id) {
              <div class="agenda-item tone-{{ e.kind }} status-{{ e.status }}">
                <app-icon [name]="kindIcon(e.kind)" [size]="16"></app-icon>
                <div class="agenda-body">
                  <strong>{{ e.title }}</strong>
                  @if (e.description) {<small class="text-muted">{{ e.description }}</small>}
                </div>
                @if (e.amount) {
                  <span class="font-mono text-sm">{{ fmt.formatMoney(e.amount.amount, e.amount.currency) }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    }

    @if (selectedCell(); as cell) {
      <app-modal [title]="selectedDayTitle(cell)" (close)="selectedCell.set(null)">
        @if (cell.events.length === 0) {
          <p class="text-muted text-sm" style="margin: 0;">No hay eventos para este día.</p>
        }
        @for (e of cell.events; track e.id) {
          <div class="detail-item">
            <div class="detail-icon">
              <app-icon [name]="kindIcon(e.kind)" [size]="18"></app-icon>
            </div>
            <div class="detail-body">
              <strong>{{ e.title }}</strong>
              <span class="badge badge-info">{{ kindLabel(e.kind) }}</span>
              @if (e.description) {
                <small class="text-muted">{{ e.description }}</small>
              }
            </div>
            <div class="detail-amount">
              @if (e.amount) {
                <strong class="font-mono">{{ fmt.formatMoney(e.amount.amount, e.amount.currency) }}</strong>
              }
              <span class="badge" [class]="statusBadge(e.status)">{{ statusLabel(e.status) }}</span>
            </div>
          </div>
        }
        <div class="flex justify-end mt-4">
          <button type="button" class="btn" (click)="selectedCell.set(null)">Cerrar</button>
        </div>
      </app-modal>
    }
  `,
  styles: [`
    .month-label { min-width: 140px; text-align: center; }
    .icon-btn { padding: 6px 8px; }
    .view-toggle { display: inline-flex; align-items: center; gap: 6px; }
    .view-toggle.active { background: var(--color-text); color: var(--color-bg); border-color: var(--color-text); }
    .view-toggle.active app-icon { color: var(--color-bg); }
    .hint { padding: 10px 16px; color: var(--color-text-muted); font-size: 12px; margin: 0; }

    /* ---------- Grid ---------- */
    .calendar { padding: 0; overflow: hidden; }
    .dow { display: grid; grid-template-columns: repeat(7, 1fr); background: var(--color-surface-2); }
    .dow-cell { padding: 8px 4px; font-size: 11px; text-transform: uppercase; color: var(--color-text-muted); text-align: center; letter-spacing: 0.04em; }
    .grid7 { display: grid; grid-template-columns: repeat(7, 1fr); }
    .cell-btn {
      min-height: 80px;
      border-right: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
      padding: 6px 4px;
      font-size: 12px;
      display: flex; flex-direction: column; gap: 4px;
      background: transparent;
      color: var(--color-text);
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      transition: background .12s ease;
      position: relative;
    }
    .cell-btn:hover { background: var(--color-surface-2); }
    .cell-btn.out { background: var(--color-bg); color: var(--color-text-dim); }
    .cell-btn.today {
      background: var(--color-surface-2);
      box-shadow: inset 0 0 0 2px var(--color-text);
    }
    .cell-btn.selected {
      background: var(--color-surface-3);
      box-shadow: inset 0 0 0 2px var(--color-text);
    }
    .day-num { font-weight: 600; font-size: 12px; }

    /* Pill de evento: muy visible incluso en móvil */
    .event-pill {
      display: flex; align-items: center; gap: 4px;
      padding: 2px 6px; border-radius: 4px;
      background: var(--color-surface-2);
      font-size: 10.5px; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-left: 3px solid var(--color-text);
    }
    .event-pill .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--color-text);
      flex-shrink: 0;
    }
    .event-pill .label { font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .event-pill.tone-loan { border-left-color: var(--color-text); }
    .event-pill.tone-card { border-left-color: var(--color-text-muted); }
    .event-pill.tone-sub { border-left-color: var(--color-text-dim); }
    .event-pill.tone-svc { border-left-color: var(--color-text-dim); }
    .more-events { font-size: 10px; color: var(--color-text-muted); padding-left: 4px; }

    /* ---------- Agenda ---------- */
    .agenda { padding: 0; }
    .agenda-day { padding: 16px; border-bottom: 1px solid var(--color-border); }
    .agenda-day:last-child { border-bottom: none; }
    .agenda-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .agenda-head small { display: block; text-transform: capitalize; }
    .agenda-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: var(--radius-md);
      background: var(--color-surface-2);
      margin-bottom: 4px;
    }
    .agenda-item.tone-loan_payment { border-left: 3px solid var(--color-text); }
    .agenda-item.tone-credit_card_payment { border-left: 3px solid var(--color-text-muted); }
    .agenda-item.tone-subscription_payment, .agenda-item.tone-service_payment { border-left: 3px solid var(--color-text-dim); }
    .agenda-item.status-paid { opacity: 0.5; }
    .agenda-body { flex: 1; display: flex; flex-direction: column; }
    .agenda-body small { display: block; }

    /* ---------- Modal de detalle ---------- */
    .detail-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 14px;
      background: var(--color-surface-2);
      border-radius: var(--radius-md);
      margin-bottom: 8px;
    }
    .detail-icon {
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--color-surface);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .detail-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .detail-amount { text-align: right; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }

    @media (max-width: 700px) {
      .dow-cell { font-size: 10px; padding: 6px 2px; }
      .cell-btn { min-height: 60px; padding: 4px 2px; }
      .day-num { font-size: 11px; }
      .event-pill { font-size: 9.5px; padding: 2px 4px; }
    }
    @media (max-width: 480px) {
      .cell-btn { min-height: 52px; }
      .event-pill .label { font-size: 9.5px; }
    }
  `]
})
export class CalendarComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);

  readonly current = signal(new Date());
  readonly view = signal<'grid' | 'agenda'>('grid');
  readonly selectedCell = signal<DayCell | null>(null);
  readonly dows = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  readonly monthLabel = computed(() => {
    const d = this.current();
    return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  });

  readonly cells = computed<DayCell[]>(() => {
    const cur = this.current();
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days: DayCell[] = [];
    const today = new Date();
    const selectedIso = this.selectedCell()?.iso;
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const events = this.eventsFor(iso);
      days.push({
        date: d,
        iso,
        inMonth: d.getMonth() === cur.getMonth(),
        isToday: d.toDateString() === today.toDateString(),
        isSelected: iso === selectedIso,
        events
      });
    }
    return days;
  });

  readonly agenda = computed<AgendaDay[]>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days: AgendaDay[] = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const events = this.eventsFor(iso).sort((a, b) => (b.amount?.amount ?? 0) - (a.amount?.amount ?? 0));
      if (events.length === 0) continue;
      days.push({
        date: d,
        iso,
        events,
        total: events.reduce((a, e) => a + (e.amount?.amount ?? 0), 0)
      });
    }
    return days;
  });

  @HostListener('window:resize')
  onResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 700 && this.view() === 'grid') {
      this.view.set('agenda');
    }
  }

  prevMonth(): void {
    const d = this.current();
    this.current.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  nextMonth(): void {
    const d = this.current();
    this.current.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  selectDay(cell: DayCell): void {
    this.selectedCell.set(cell);
  }

  selectedDayTitle(cell: DayCell): string {
    const formatted = cell.date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  hasKind(events: CalendarEvent[], kind: CalendarEvent['kind']): boolean {
    return events.some(e => e.kind === kind);
  }

  totalLabel(events: CalendarEvent[]): string {
    const total = events.reduce((acc, e) => acc + (e.amount?.amount ?? 0), 0);
    if (total === 0) return `${events.length} evento${events.length === 1 ? '' : 's'}`;
    return this.fmt.formatMoney(total).replace(/\.\d+/, '');
  }

  kindIcon(k: CalendarEvent['kind']): IconName {
    const map: Record<CalendarEvent['kind'], IconName> = {
      income: 'income',
      expense: 'expense',
      service_payment: 'lightbulb',
      subscription_payment: 'repeat',
      loan_payment: 'landmark',
      credit_card_payment: 'card',
      reminder: 'bell',
      goal: 'target',
      other: 'file-text'
    };
    return map[k];
  }

  kindLabel(k: CalendarEvent['kind']): string {
    const map: Record<CalendarEvent['kind'], string> = {
      income: 'Ingreso',
      expense: 'Gasto',
      service_payment: 'Servicio',
      subscription_payment: 'Suscripción',
      loan_payment: 'Préstamo',
      credit_card_payment: 'Tarjeta',
      reminder: 'Recordatorio',
      goal: 'Meta',
      other: 'Otro'
    };
    return map[k];
  }

  statusLabel(s: CalendarEvent['status']): string {
    const map: Record<CalendarEvent['status'], string> = {
      planned: 'Pendiente',
      confirmed: 'Confirmado',
      paid: 'Pagado',
      overdue: 'Vencido',
      cancelled: 'Cancelado'
    };
    return map[s];
  }

  statusBadge(s: CalendarEvent['status']): string {
    if (s === 'paid') return 'badge-success';
    if (s === 'overdue') return 'badge-danger';
    if (s === 'confirmed') return 'badge-primary';
    return 'badge-info';
  }

  private eventsFor(iso: string): CalendarEvent[] {
    const list: CalendarEvent[] = [];
    for (const loan of this.finance.loans().filter(l => l.active)) {
      const d = new Date(iso);
      if (d.getDate() === loan.paymentDay) {
        list.push({
          id: `loan-${loan.id}-${iso}`,
          title: loan.name,
          date: iso,
          kind: 'loan_payment',
          referenceId: loan.id,
          amount: loan.monthlyPayment,
          status: d < new Date() ? 'paid' : 'planned',
          createdAt: new Date().toISOString()
        });
      }
    }
    for (const card of this.finance.creditCards()) {
      const d = new Date(iso);
      if (d.getDate() === card.paymentDueDay) {
        list.push({
          id: `card-${card.id}-${iso}`,
          title: card.name,
          date: iso,
          kind: 'credit_card_payment',
          referenceId: card.id,
          amount: card.minimumPayment ?? { amount: card.currentBalance.amount * 0.1, currency: card.currentBalance.currency },
          status: d < new Date() ? 'paid' : 'planned',
          createdAt: new Date().toISOString()
        });
      }
    }
    for (const sub of this.finance.subscriptions().filter(s => s.active)) {
      if (sub.nextBillingDate === iso) {
        list.push({
          id: `sub-${sub.id}-${iso}`,
          title: sub.name,
          date: iso,
          kind: 'subscription_payment',
          referenceId: sub.id,
          amount: sub.amount,
          status: 'planned',
          createdAt: new Date().toISOString()
        });
      }
    }
    for (const svc of this.finance.services()) {
      if (svc.nextPaymentDate === iso) {
        list.push({
          id: `svc-${svc.id}-${iso}`,
          title: svc.name,
          date: iso,
          kind: 'service_payment',
          referenceId: svc.id,
          amount: svc.amount,
          status: 'planned',
          createdAt: new Date().toISOString()
        });
      }
    }
    return list.sort((a, b) => (b.amount?.amount ?? 0) - (a.amount?.amount ?? 0));
  }
}