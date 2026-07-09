import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Expense, PurchaseEvaluation, uuid } from '../../core/models';
import { ClassifierService, FinanceDataService, FormatService, PurchaseAdvisorService, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/modal/modal.component';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, IconComponent],
  template: `
    <div class="page-header">
      <div class="title-block">
        <h1>Gastos</h1>
        <p class="text-muted">Registra y consulta tus gastos. La IA los puede clasificar automáticamente.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" (click)="openAdvisor()">
          <app-icon name="shield-alert" [size]="14"></app-icon> ¿Debería comprar?
        </button>
        <button type="button" class="btn" (click)="openSmart()">
          <app-icon name="sparkles" [size]="14"></app-icon> Registro inteligente
        </button>
        <button type="button" class="btn btn-primary" (click)="openManual()">
          <app-icon name="plus" [size]="14"></app-icon> Nuevo gasto
        </button>
      </div>
    </div>

    <div class="card-flat mb-4 filters">
      <div class="flex gap-3 items-center flex-wrap">
        <input type="search" placeholder="Buscar por descripción..." [(ngModel)]="query" />
        <select [(ngModel)]="categoryFilter">
          <option value="">Todas las categorías</option>
          @for (c of finance.categories(); track c.id) {
            <option [value]="c.id">{{ c.icon }} {{ c.name }}</option>
          }
        </select>
        <select [(ngModel)]="methodFilter">
          <option value="">Todos los métodos</option>
          @for (m of finance.paymentMethods(); track m.id) {
            <option [value]="m.id">{{ m.name }}</option>
          }
        </select>
        <span class="badge badge-primary">{{ filtered().length }} resultados</span>
      </div>
    </div>

    @if (filtered().length === 0) {
      <app-empty-state iconName="expense" title="Sin gastos" message="Registra tu primer gasto para empezar.">
        <button type="button" class="btn btn-primary mt-2" (click)="openSmart()">
          <app-icon name="sparkles" [size]="14"></app-icon> Registrar con texto
        </button>
      </app-empty-state>
    } @else {
      <div class="card-flat table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Método</th>
              <th class="num">Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (e of filtered(); track e.id) {
              <tr>
                <td>{{ fmt.formatDate(e.date) }}</td>
                <td>
                  {{ e.description }}
                  @if (e.autoRegistered) {
                    <span class="badge badge-info" style="margin-left:6px;">IA</span>
                  }
                </td>
                <td>{{ finance.findCategory(e.categoryId)?.icon }} {{ finance.findCategory(e.categoryId)?.name }}</td>
                <td>{{ finance.findPaymentMethod(e.paymentMethodId)?.name }}</td>
                <td class="num font-mono text-danger">-{{ fmt.formatMoney(e.amount.amount, e.amount.currency) }}</td>
                <td class="num">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="edit(e)" aria-label="Editar">
                    <app-icon name="pencil" [size]="12"></app-icon>
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="askRemove(e)" aria-label="Eliminar">
                    <app-icon name="trash" [size]="12"></app-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Editar gasto' : 'Nuevo gasto'" (close)="closeForm()">
        <form (submit)="save($event)" class="form-grid">
          <div class="field">
            <label>Descripción</label>
            <input type="text" required [(ngModel)]="form.description" name="description" placeholder="Ej. Pizza con amigos" />
          </div>
          <div class="field">
            <label>Monto</label>
            <input type="number" required min="0" step="0.01" [(ngModel)]="form.amount" name="amount" />
          </div>
          <div class="field">
            <label>Moneda</label>
            <select [(ngModel)]="form.currency" name="currency">
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div class="field">
            <label>Categoría</label>
            <select required [(ngModel)]="form.categoryId" name="categoryId">
              @for (c of finance.categories(); track c.id) {
                <option [value]="c.id">{{ c.icon }} {{ c.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label>Método de pago</label>
            <select required [(ngModel)]="form.paymentMethodId" name="paymentMethodId">
              @for (m of finance.paymentMethods(); track m.id) {
                <option [value]="m.id">{{ m.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label>Fecha</label>
            <input type="date" required [(ngModel)]="form.date" name="date" />
          </div>
          <div class="field full">
            <label>Notas</label>
            <textarea rows="2" [(ngModel)]="form.notes" name="notes"></textarea>
          </div>
          <div class="full flex justify-between items-center mt-2">
            <button type="button" class="btn" (click)="closeForm()">Cancelar</button>
            <button type="submit" class="btn btn-primary">{{ editing() ? 'Guardar cambios' : 'Crear gasto' }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (showSmart()) {
      <app-modal title="Registro inteligente" (close)="closeSmart()">
        <p class="text-muted text-sm">Escribe una frase en lenguaje natural. La IA (o el clasificador local) extraerá monto, categoría, método y fecha.</p>
        <textarea rows="3" [(ngModel)]="smartText" placeholder='Ej. "Compré una pizza por $280 con la tarjeta BBVA"'></textarea>
        <div class="flex justify-between mt-2">
          <button type="button" class="btn" (click)="closeSmart()">Cancelar</button>
          <button type="button" class="btn btn-primary" (click)="runSmart()" [disabled]="busy()">
            <app-icon name="sparkles" [size]="14"></app-icon>
            {{ busy() ? 'Clasificando…' : 'Clasificar' }}
          </button>
        </div>
        @if (smartDraft()) {
          <div class="card mt-4" style="background: var(--color-surface-2);">
            <h3 style="margin:0 0 8px 0;">Borrador detectado</h3>
            <div class="smart-preview">
              <div><strong>Descripción:</strong> {{ smartDraft()?.description }}</div>
              <div><strong>Monto:</strong> {{ smartDraft()?.amount }} {{ smartDraft()?.currency }}</div>
              <div><strong>Fecha:</strong> {{ smartDraft()?.date }}</div>
              <div><strong>Categoría:</strong> {{ smartDraft()?.categoryId ? finance.findCategory(smartDraft()!.categoryId!)?.name : '?' }}</div>
              <div><strong>Método:</strong> {{ smartDraft()?.paymentMethodId ? finance.findPaymentMethod(smartDraft()!.paymentMethodId!)?.name : '?' }}</div>
              <div><strong>Tipo:</strong> {{ smartDraft()?.kind }}</div>
              @if (smartDraft()?.ambiguous) {
                <div class="text-warning text-sm">⚠ Faltan datos. Revisa antes de guardar.</div>
              }
            </div>
            <div class="flex justify-end mt-2 gap-2">
              <button type="button" class="btn" (click)="smartDraft.set(null)">Reintentar</button>
              <button type="button" class="btn btn-primary" (click)="acceptSmart()">
                <app-icon name="check" [size]="14"></app-icon> Guardar gasto
              </button>
            </div>
          </div>
        }
      </app-modal>
    }

    @if (toRemove()) {
      <app-confirm-dialog
        title="Eliminar gasto"
        [message]="'Vas a eliminar «' + toRemove()!.description + '». Esta acción no se puede deshacer.'"
        (confirm)="confirmRemove()"
        (cancel)="toRemove.set(null)">
      </app-confirm-dialog>
    }

    @if (showAdvisor()) {
      <app-modal title="¿Debería hacer esta compra?" (close)="closeAdvisor()">
        <p class="text-muted text-sm">Cuéntame qué quieres comprar. Voy a evaluarlo contra tu situación financiera actual.</p>
        <form (submit)="runAdvisor($event)" class="form-grid">
          <div class="field full">
            <label>Descripción (opcional)</label>
            <input type="text" [(ngModel)]="advisor.description" name="adv-desc" placeholder="Ej. Computadora nueva" />
          </div>
          <div class="field">
            <label>Monto</label>
            <input type="number" min="0" step="0.01" required [(ngModel)]="advisor.amount" name="adv-amount" placeholder="0" />
          </div>
          <div class="field">
            <label>Categoría</label>
            <select [(ngModel)]="advisor.categoryId" name="adv-cat">
              <option [value]="undefined">— Sin categoría —</option>
              @for (c of finance.categories(); track c.id) {
                @if (c.kind === 'expense') {
                  <option [value]="c.id">{{ c.icon }} {{ c.name }}</option>
                }
              }
            </select>
          </div>
          <div class="full flex justify-end mt-2">
            <button type="button" class="btn" (click)="closeAdvisor()">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <app-icon name="shield-alert" [size]="14"></app-icon> Evaluar
            </button>
          </div>
        </form>
        @if (advisorResult(); as r) {
          <div class="advisor-result tone-{{ r.verdict }}">
            <div class="verdict-head">
              <span class="verdict-icon">{{ verdictIcon(r.verdict) }}</span>
              <div>
                <strong>{{ r.summary }}</strong>
                <div class="score-bar">
                  <div class="score-fill" [style.width.%]="r.score" [class]="'tone-' + r.verdict"></div>
                </div>
                <small>Puntaje: {{ r.score }} / 100</small>
              </div>
            </div>
            @if (r.factors.length > 0) {
              <div class="factors">
                <strong class="text-sm">Factores</strong>
                @for (f of r.factors; track f.label) {
                  <div class="factor tone-{{ f.impact }}">
                    <span class="factor-icon">{{ factorIcon(f.impact) }}</span>
                    <div>
                      <strong>{{ f.label }}</strong>
                      <small class="text-muted">{{ f.detail }}</small>
                    </div>
                  </div>
                }
              </div>
            }
            @if (r.suggestions.length > 0) {
              <div class="suggestions">
                <strong class="text-sm">Sugerencias</strong>
                <ul>
                  @for (s of r.suggestions; track s) {
                    <li>{{ s }}</li>
                  }
                </ul>
              </div>
            }
            <div class="flex justify-end gap-2 mt-4 flex-wrap">
              <button type="button" class="btn" (click)="closeAdvisor()">Cerrar</button>
              <button type="button" class="btn btn-primary" (click)="registerFromAdvisor()">
                <app-icon name="plus" [size]="14"></app-icon> Registrar gasto
              </button>
            </div>
          </div>
        }
      </app-modal>
    }
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field.full { grid-column: span 2; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
    .smart-preview { display: grid; gap: 6px; font-size: 13px; }

    /* Asesor de compra */
    .advisor-result {
      margin-top: 16px;
      padding: 16px;
      border-radius: var(--radius-md);
      background: var(--color-surface-2);
      border-left: 4px solid var(--color-text);
    }
    .advisor-result.tone-recommended { border-left-color: var(--color-text); }
    .advisor-result.tone-caution { border-left-color: var(--color-text-muted); border-left-width: 6px; }
    .advisor-result.tone-not_recommended { border-left-color: var(--color-text); border-left-width: 8px; }
    .verdict-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .verdict-icon { font-size: 28px; line-height: 1; }
    .score-bar {
      height: 6px; background: var(--color-surface-3);
      border-radius: 3px; overflow: hidden;
      margin: 6px 0 4px 0; max-width: 280px;
    }
    .score-fill { height: 100%; background: var(--color-text); transition: width .3s ease; }
    .score-fill.tone-caution { background: var(--color-text-muted); }
    .score-fill.tone-not_recommended { background: var(--color-text); }
    .score-fill.tone-recommended { background: var(--color-text); }
    .factors { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
    .factor {
      display: flex; gap: 8px; align-items: flex-start;
      padding: 8px 10px; border-radius: 6px;
      background: var(--color-surface);
    }
    .factor.tone-positive { border-left: 3px solid var(--color-text); }
    .factor.tone-negative { border-left: 3px solid var(--color-text); border-left-width: 5px; }
    .factor.tone-neutral { border-left: 3px solid var(--color-text-dim); }
    .factor-icon { font-size: 16px; line-height: 1.2; }
    .factor strong { display: block; font-size: 13px; }
    .factor small { display: block; }
    .suggestions { margin-top: 12px; }
    .suggestions ul { margin: 6px 0 0 18px; padding: 0; }
    .suggestions li { margin-bottom: 4px; }
  `]
})
export class ExpensesComponent {
  readonly fmt = inject(FormatService);
  readonly finance = inject(FinanceDataService);
  private readonly classifier = inject(ClassifierService);
  private readonly toast = inject(ToastService);
  private readonly advisorSvc = inject(PurchaseAdvisorService);

  // Asesor de compra
  readonly showAdvisor = signal(false);
  readonly advisorResult = signal<PurchaseEvaluation | null>(null);
  advisor: { description: string; amount: number; categoryId?: string } = { description: '', amount: 0 };

  readonly query = signal('');
  readonly categoryFilter = signal('');
  readonly methodFilter = signal('');
  readonly showForm = signal(false);
  readonly editing = signal<Expense | null>(null);
  readonly toRemove = signal<Expense | null>(null);

  readonly form: { description: string; amount: number; currency: string; categoryId: string; paymentMethodId: string; date: string; notes?: string } = this.emptyForm();

  readonly showSmart = signal(false);
  readonly smartText = signal('');
  readonly smartDraft = signal<ReturnType<ClassifierService['classifyHeuristic']> | null>(null);
  readonly busy = signal(false);

  readonly list = computed(() =>
    [...this.finance.expenses()].sort((a, b) => b.date.localeCompare(a.date))
  );

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const cat = this.categoryFilter();
    const met = this.methodFilter();
    return this.list().filter(e => {
      if (q && !e.description.toLowerCase().includes(q)) return false;
      if (cat && e.categoryId !== cat) return false;
      if (met && e.paymentMethodId !== met) return false;
      return true;
    });
  });

  openManual(): void {
    this.editing.set(null);
    Object.assign(this.form, this.emptyForm());
    this.showForm.set(true);
  }

  edit(e: Expense): void {
    this.editing.set(e);
    this.form.description = e.description;
    this.form.amount = e.amount.amount;
    this.form.currency = e.amount.currency;
    this.form.categoryId = e.categoryId;
    this.form.paymentMethodId = e.paymentMethodId;
    this.form.date = e.date;
    this.form.notes = e.notes;
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); }

  save(ev: Event): void {
    ev.preventDefault();
    const editing = this.editing();
    const expense: Expense = {
      id: editing?.id ?? uuid(),
      description: this.form.description,
      amount: { amount: Number(this.form.amount), currency: (this.form.currency as 'MXN') },
      categoryId: this.form.categoryId,
      paymentMethodId: this.form.paymentMethodId,
      date: this.form.date,
      notes: this.form.notes,
      autoRegistered: editing?.autoRegistered ?? false,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.finance.upsertExpense(expense);
    this.showForm.set(false);
    this.toast.success('Gasto guardado', `${expense.description} • ${this.fmt.formatMoney(expense.amount.amount)}`);
  }

  askRemove(e: Expense): void { this.toRemove.set(e); }
  confirmRemove(): void {
    const e = this.toRemove();
    if (e) this.finance.removeExpense(e.id);
    this.toRemove.set(null);
  }

  // ------- Asesor de compra -------
  openAdvisor(): void {
    this.advisor = { description: '', amount: 0 };
    this.advisorResult.set(null);
    this.showAdvisor.set(true);
  }
  closeAdvisor(): void { this.showAdvisor.set(false); }

  runAdvisor(ev: Event): void {
    ev.preventDefault();
    const result = this.advisorSvc.evaluate({
      amount: Number(this.advisor.amount),
      categoryId: this.advisor.categoryId,
      description: this.advisor.description
    });
    this.advisorResult.set(result);
  }

  registerFromAdvisor(): void {
    const r = this.advisorResult();
    if (!r) return;
    const draft: Expense = {
      id: uuid(),
      description: this.advisor.description || 'Compra evaluada',
      amount: { amount: Number(this.advisor.amount), currency: 'MXN' },
      categoryId: this.advisor.categoryId ?? this.finance.categories().find(c => c.id === 'cat-otros')?.id ?? 'cat-otros',
      paymentMethodId: this.finance.paymentMethods()[0]?.id ?? 'pm-efectivo',
      date: new Date().toISOString().slice(0, 10),
      notes: `Evaluación: ${r.verdict} (${r.score}/100). ${r.summary}`,
      autoRegistered: false,
      createdAt: new Date().toISOString()
    };
    this.finance.upsertExpense(draft);
    this.toast.success('Gasto registrado', `${draft.description} • ${this.fmt.formatMoney(draft.amount.amount)}`);
    this.closeAdvisor();
  }

  verdictIcon(v: 'recommended' | 'caution' | 'not_recommended' | 'unavailable'): string {
    return v === 'recommended' ? '✅' :
           v === 'caution' ? '⚠️' :
           v === 'not_recommended' ? '🛑' : 'ℹ️';
  }

  factorIcon(i: 'positive' | 'negative' | 'neutral'): string {
    return i === 'positive' ? '✓' : i === 'negative' ? '✕' : '·';
  }

  // ------- Smart registration -------
  openSmart(): void {
    this.smartText.set('');
    this.smartDraft.set(null);
    this.showSmart.set(true);
  }
  closeSmart(): void { this.showSmart.set(false); }

  async runSmart(): Promise<void> {
    if (!this.smartText().trim()) return;
    this.busy.set(true);
    try {
      const draft = await this.classifier.classify(this.smartText());
      this.smartDraft.set(draft);
      this.form.description = draft.description;
      this.form.amount = draft.amount;
      this.form.currency = draft.currency;
      this.form.date = draft.date;
      if (draft.categoryId) this.form.categoryId = draft.categoryId;
      if (draft.paymentMethodId) this.form.paymentMethodId = draft.paymentMethodId;
    } finally {
      this.busy.set(false);
    }
  }

  acceptSmart(): void {
    const draft = this.smartDraft();
    if (!draft) return;
    if (!draft.amount || !draft.categoryId) {
      // fallback: pedir completar antes de aceptar
      this.editing.set(null);
      Object.assign(this.form, this.emptyForm(), {
        description: draft.description,
        amount: draft.amount,
        currency: draft.currency,
        date: draft.date,
        categoryId: draft.categoryId ?? this.finance.categories()[0]?.id,
        paymentMethodId: draft.paymentMethodId ?? this.finance.paymentMethods()[0]?.id
      });
      this.closeSmart();
      this.showForm.set(true);
      return;
    }
    const expense: Expense = {
      id: uuid(),
      description: draft.description,
      amount: { amount: draft.amount, currency: (draft.currency as 'MXN') },
      categoryId: draft.categoryId,
      paymentMethodId: draft.paymentMethodId ?? this.finance.paymentMethods()[0].id,
      date: draft.date,
      autoRegistered: true,
      createdAt: new Date().toISOString()
    };
    this.finance.upsertExpense(expense);
    this.closeSmart();
    this.toast.success('Gasto registrado', `${expense.description} • ${this.fmt.formatMoney(expense.amount.amount)}`);
  }

  private emptyForm() {
    return {
      description: '',
      amount: 0,
      currency: 'MXN',
      categoryId: this.finance.categories()[0]?.id ?? '',
      paymentMethodId: this.finance.paymentMethods()[0]?.id ?? '',
      date: new Date().toISOString().slice(0, 10),
      notes: ''
    };
  }
}