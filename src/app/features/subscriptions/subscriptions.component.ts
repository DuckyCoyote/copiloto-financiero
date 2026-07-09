import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, uuid } from '../../core/models';
import { FinanceDataService, FormatService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

type SubscriptionForm = {
  name: string;
  provider: string;
  categoryId: string;
  amount: number;
  frequency: Subscription['frequency'];
  nextBillingDate: string;
  active: boolean;
  usageLevel: Subscription['usageLevel'];
  currency: string;
  notes?: string;
};

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Suscripciones</h1>
        <p class="text-muted">Streaming, software, gimnasio, membresías y otros cargos periódicos.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nueva suscripción
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="subscription" title="Sin suscripciones" message="Agrega tus suscripciones para controlar el gasto recurrente."></app-empty-state>
    } @else {
      <div class="grid grid-cols-3">
        @for (s of list(); track s.id) {
          <div class="card" [class.inactive]="!s.active">
            <div class="flex justify-between items-start">
              <div>
                <small class="text-muted">{{ s.provider || 'Servicio' }}</small>
                <h3 style="margin: 4px 0;">{{ s.name }}</h3>
                <span class="badge" [class]="s.active ? 'badge-success' : 'badge-warning'">{{ s.active ? 'Activa' : 'Cancelada' }}</span>
                @if (s.usageLevel) {
                  <span class="badge badge-info" style="margin-left: 4px;">{{ usageLabel(s.usageLevel) }}</span>
                }
              </div>
              <strong class="font-mono">{{ fmt.formatMoney(s.amount.amount) }}</strong>
            </div>
            <div class="text-sm text-muted mt-2">Frecuencia: {{ s.frequency === 'monthly' ? 'Mensual' : 'Anual' }}</div>
            <div class="text-sm text-muted">Próximo cobro: {{ fmt.formatDate(s.nextBillingDate) }}</div>
            <div class="flex justify-between mt-3">
              <button type="button" class="btn btn-ghost btn-sm" (click)="edit(s)" aria-label="Editar">
                <app-icon name="pencil" [size]="12"></app-icon>
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="toRemove.set(s)" aria-label="Eliminar">
                <app-icon name="trash" [size]="12"></app-icon>
              </button>
            </div>
          </div>
        }
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar suscripción' : 'Nueva suscripción'" (close)="close()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" required [(ngModel)]="form.name" name="name" /></div>
          <div class="field"><label>Proveedor</label><input type="text" [(ngModel)]="form.provider" name="provider" /></div>
          <div class="field"><label>Categoría</label>
            <select required [(ngModel)]="form.categoryId" name="categoryId">
              @for (c of finance.categories(); track c.id) {
                <option [value]="c.id">{{ c.icon }} {{ c.name }}</option>
              }
            </select>
          </div>
          <div class="field"><label>Monto</label><input type="number" min="0" step="0.01" [(ngModel)]="form.amount" name="amount" /></div>
          <div class="field"><label>Frecuencia</label>
            <select [(ngModel)]="form.frequency" name="frequency">
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div class="field"><label>Próximo cobro</label><input type="date" required [(ngModel)]="form.nextBillingDate" name="nextBillingDate" /></div>
          <div class="field"><label>Estado</label>
            <select [(ngModel)]="form.active" name="active">
              <option [ngValue]="true">Activa</option>
              <option [ngValue]="false">Cancelada</option>
            </select>
          </div>
          <div class="field"><label>Uso</label>
            <select [(ngModel)]="form.usageLevel" name="usageLevel">
              <option [ngValue]="undefined">—</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="rarely">Rara vez</option>
              <option value="never">Nunca</option>
            </select>
          </div>
          <div class="field"><label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency"><option value="MXN">MXN</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
          </div>
          <div class="field full"><label>Notas</label><textarea rows="2" [(ngModel)]="form.notes" name="notes"></textarea></div>
          <div class="full flex justify-between mt-2">
            <button type="button" class="btn" (click)="close()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar' : 'Crear' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog title="Eliminar suscripción" [message]="'Vas a eliminar «' + toRemove()!.name + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
    }
  `,
  styles: [`
    .card.inactive { opacity: 0.6; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
  `]
})
export class SubscriptionsComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);

  readonly showForm = signal(false);
  readonly editing = signal<Subscription | null>(null);
  readonly toRemove = signal<Subscription | null>(null);

  form: SubscriptionForm = this.emptyForm();
  readonly list = computed(() => this.finance.subscriptions());

  usageLabel(u: NonNullable<Subscription['usageLevel']>): string {
    const map = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual', rarely: 'Rara vez', never: 'Nunca' };
    return map[u];
  }

  open(): void { this.editing.set(null); this.form = this.emptyForm(); this.showForm.set(true); }
  edit(s: Subscription): void {
    this.editing.set(s);
    this.form = {
      name: s.name, provider: s.provider ?? '', categoryId: s.categoryId, amount: s.amount.amount,
      frequency: s.frequency, nextBillingDate: s.nextBillingDate, active: s.active, usageLevel: s.usageLevel,
      currency: s.amount.currency, notes: s.notes
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const sub: Subscription = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      provider: this.form.provider,
      categoryId: this.form.categoryId,
      amount: { amount: Number(this.form.amount), currency: this.form.currency as 'MXN' },
      frequency: this.form.frequency,
      nextBillingDate: this.form.nextBillingDate,
      active: this.form.active,
      usageLevel: this.form.usageLevel,
      notes: this.form.notes,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertSubscription(sub);
    this.close();
  }

  confirmRemove(): void {
    const s = this.toRemove();
    if (s) this.finance.removeSubscription(s.id);
    this.toRemove.set(null);
  }

  private emptyForm(): SubscriptionForm {
    return {
      name: '',
      provider: '',
      categoryId: this.finance.categories().find(c => c.id === 'cat-suscripciones')?.id ?? this.finance.categories()[0]?.id ?? '',
      amount: 0,
      frequency: 'monthly' as Subscription['frequency'],
      nextBillingDate: new Date().toISOString().slice(0, 10),
      active: true,
      usageLevel: undefined as Subscription['usageLevel'],
      currency: 'MXN',
      notes: undefined
    };
  }
}