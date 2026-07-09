import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Service, uuid } from '../../core/models';
import { FinanceDataService, FormatService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

type ServiceForm = {
  name: string;
  provider: string;
  categoryId: string;
  amount: number;
  frequency: Service['frequency'];
  nextPaymentDate: string;
  essential: boolean;
  currency: string;
  notes?: string;
};

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Servicios</h1>
        <p class="text-muted">Luz, agua, internet, gas, teléfono y otros cargos fijos.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="open()">
          <app-icon name="plus" [size]="14"></app-icon> Nuevo servicio
        </button>
      </div>
    </div>

    @if (list().length === 0) {
      <app-empty-state iconName="service" title="Sin servicios" message="Registra tus servicios esenciales."></app-empty-state>
    } @else {
      <div class="grid grid-cols-3">
        @for (s of list(); track s.id) {
          <div class="card">
            <div class="flex justify-between items-start">
              <div>
                <small class="text-muted">{{ s.provider || 'Servicio' }}</small>
                <h3 style="margin: 4px 0;">{{ s.name }}</h3>
                <span class="badge" [class]="s.essential ? 'badge-danger' : 'badge-info'">{{ s.essential ? 'Esencial' : 'Opcional' }}</span>
              </div>
              <strong class="font-mono">{{ fmt.formatMoney(s.amount.amount) }}</strong>
            </div>
            <div class="text-sm text-muted mt-2">Frecuencia: {{ freqLabel(s.frequency) }}</div>
            <div class="text-sm text-muted">Próximo pago: {{ fmt.formatDate(s.nextPaymentDate) }}</div>
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
      <app-modal [title]="editing() ? 'Editar servicio' : 'Nuevo servicio'" (close)="close()">
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
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="monthly">Mensual</option>
              <option value="bimonthly">Bimestral</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div class="field"><label>Próximo pago</label><input type="date" required [(ngModel)]="form.nextPaymentDate" name="nextPaymentDate" /></div>
          <div class="field"><label>Esencial</label>
            <select [(ngModel)]="form.essential" name="essential">
              <option [ngValue]="true">Sí</option>
              <option [ngValue]="false">No</option>
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
      <app-confirm-dialog title="Eliminar servicio" [message]="'Vas a eliminar «' + toRemove()!.name + '».'" (confirm)="confirmRemove()" (cancel)="toRemove.set(null)"></app-confirm-dialog>
    }
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
  `]
})
export class ServicesComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);

  readonly showForm = signal(false);
  readonly editing = signal<Service | null>(null);
  readonly toRemove = signal<Service | null>(null);

  form: ServiceForm = this.emptyForm();
  readonly list = computed(() => this.finance.services());

  freqLabel(f: Service['frequency']): string {
    const map = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', bimonthly: 'Bimestral', yearly: 'Anual' };
    return map[f];
  }

  open(): void { this.editing.set(null); this.form = this.emptyForm(); this.showForm.set(true); }
  edit(s: Service): void {
    this.editing.set(s);
    this.form = {
      name: s.name, provider: s.provider ?? '', categoryId: s.categoryId, amount: s.amount.amount,
      frequency: s.frequency, nextPaymentDate: s.nextPaymentDate, essential: s.essential, currency: s.amount.currency, notes: s.notes
    };
    this.showForm.set(true);
  }
  close(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const service: Service = {
      id: editing?.id ?? uuid(),
      name: this.form.name,
      provider: this.form.provider,
      categoryId: this.form.categoryId,
      amount: { amount: Number(this.form.amount), currency: this.form.currency as 'MXN' },
      frequency: this.form.frequency,
      nextPaymentDate: this.form.nextPaymentDate,
      essential: this.form.essential,
      notes: this.form.notes,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertService(service);
    this.close();
  }

  confirmRemove(): void {
    const s = this.toRemove();
    if (s) this.finance.removeService(s.id);
    this.toRemove.set(null);
  }

  private emptyForm(): ServiceForm {
    return {
      name: '',
      provider: '',
      categoryId: this.finance.categories()[0]?.id ?? '',
      amount: 0,
      frequency: 'monthly' as Service['frequency'],
      nextPaymentDate: new Date().toISOString().slice(0, 10),
      essential: true,
      currency: 'MXN',
      notes: undefined
    };
  }
}