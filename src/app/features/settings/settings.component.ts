import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AIProviderId, AI_PROVIDERS, Currency } from '../../core/models';
import { AIService, AppSnapshot, CurrencyService, DemoDataService, FinanceDataService, SUPPORTED_CURRENCIES, ToastService } from '../../core/services';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent, IconComponent],
  template: `
    <div class="mb-6">
      <h1>Configuración</h1>
      <p class="text-muted">Define cómo se conecta la IA, gestiona tus datos y tu privacidad.</p>
    </div>

    <section class="card mb-6">
      <h2>Moneda</h2>
      <p class="text-muted text-sm">Elige tu moneda principal y las tasas de conversión. Los gastos en otras monedas se convierten automáticamente.</p>

      <div class="form-grid mt-4">
        <div class="field">
          <label>Moneda principal</label>
          <select [ngModel]="currency.mainCurrency()" (ngModelChange)="setMainCurrency($event)" name="main-currency">
            @for (c of currencies; track c.code) {
              <option [value]="c.code">{{ c.symbol }} {{ c.name }} ({{ c.code }})</option>
            }
          </select>
        </div>
        <div class="field">
          <label>—</label>
          <button type="button" class="btn" (click)="resetCurrencyRates()">
            <app-icon name="undo" [size]="14"></app-icon> Restablecer tasas
          </button>
        </div>
      </div>

      <details class="mt-4">
        <summary class="text-sm text-muted" style="cursor: pointer;">Tasas de conversión (1 unidad = X de la principal)</summary>
        <div class="rates-grid mt-2">
          @for (c of currencies; track c.code) {
            @if (c.code !== currency.mainCurrency()) {
              <div class="field">
                <label>{{ c.code }} → {{ currency.mainCurrency() }}</label>
                <input type="number" min="0" step="0.0001"
                  [ngModel]="rateFor(c.code)"
                  (ngModelChange)="setRate(c.code, $event)" [name]="'rate-' + c.code" />
              </div>
            }
          }
        </div>
        <small class="text-muted">Editables. Por defecto son tasas aproximadas; ajústalas a la cotización actual.</small>
      </details>
    </section>

    <section class="card mb-6">
      <h2>Asistente de IA</h2>
      <p class="text-muted text-sm">
        Elige un proveedor externo (con tu API Key) o un modelo local compatible con la API de OpenAI.
        Si no activas la IA, la app funciona en modo local con clasificador heurístico y reglas.
      </p>

      <div class="grid grid-cols-2 mt-4 gap-4">
        <div>
          <label>Proveedor</label>
          <select [(ngModel)]="providerId" (change)="onProviderChange()">
            @for (p of providers; track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
        <div>
          <label>Modelo</label>
          @if (provider().suggestedModels?.length) {
            <select [(ngModel)]="model">
              @for (m of provider().suggestedModels; track m) {
                <option [value]="m">{{ m }}</option>
              }
            </select>
          } @else {
            <input type="text" [(ngModel)]="model" placeholder="Nombre del modelo" />
          }
        </div>
        <div>
          <label>Endpoint base (opcional)</label>
          <input type="text" [(ngModel)]="baseUrl" [placeholder]="provider().baseUrl" />
        </div>
        <div>
          <label>API Key</label>
          <input type="password" [(ngModel)]="apiKey" [placeholder]="provider().requiresApiKey ? 'sk-... (requerido)' : 'Opcional'" />
        </div>
        <div>
          <label>Temperatura</label>
          <input type="number" min="0" max="2" step="0.1" [(ngModel)]="temperature" />
        </div>
        <div>
          <label>Máx tokens</label>
          <input type="number" min="64" max="8000" step="64" [(ngModel)]="maxTokens" />
        </div>
      </div>

      <div class="mt-4 consent">
        <label class="checkbox">
          <input type="checkbox" [(ngModel)]="dataSharingConsent" />
          <span>Consiento que mis datos (gastos, ingresos, deudas, etc.) se envíen al proveedor seleccionado para generar respuestas.</span>
        </label>
        <small class="text-muted">Si usas un modelo local (Ollama, LM Studio, vLLM), ningún dato sale de tu dispositivo.</small>
      </div>

      <div class="flex justify-between mt-4 flex-wrap gap-2">
        <button type="button" class="btn" (click)="reset()">
          <app-icon name="undo" [size]="14"></app-icon> Restablecer
        </button>
        <button type="button" class="btn btn-primary" (click)="save()">
          <app-icon name="check" [size]="14"></app-icon> Guardar
        </button>
      </div>

      <div class="mt-4 status" [class.ok]="isReady()">
        <strong>Estado:</strong>
        <span *ngIf="isReady()">✅ Configuración lista para usarse.</span>
        <span *ngIf="!isReady()">⚠ {{ statusReason() }}</span>
      </div>
    </section>

    <section class="card mb-6">
      <h2>Proveedores compatibles</h2>
      <p class="text-muted text-sm">Cualquier endpoint compatible con la API de OpenAI funciona, incluidos los gateways.</p>
      <div class="providers">
        @for (p of providers; track p.id) {
          <div class="prov">
            <strong>{{ p.name }}</strong>
            <p class="text-muted text-sm" style="margin: 4px 0 0 0;">{{ p.description }}</p>
          </div>
        }
      </div>
    </section>

    <section class="card mb-6">
      <h2>Privacidad</h2>
      <ul class="text-sm text-muted">
        <li>Toda tu información financiera permanece local por defecto.</li>
        <li>Si activas la IA con un proveedor externo, se le envía un snapshot con tus datos para responder.</li>
        <li>Los modelos locales (Ollama, LM Studio, vLLM) ejecutan la IA en tu propio equipo y nunca comparten datos.</li>
        <li>Puedes limpiar toda la información en cualquier momento desde "Borrar todos los datos".</li>
      </ul>
    </section>

    <section class="card mb-6">
      <h2>Datos</h2>
      <div class="data-actions">
        <button type="button" class="btn" (click)="exportData()">
          <app-icon name="download" [size]="14"></app-icon> Exportar JSON
        </button>
        <button type="button" class="btn" (click)="triggerImport()">
          <app-icon name="folder" [size]="14"></app-icon> Importar JSON
        </button>
        <input #importFile type="file" accept="application/json,.json" hidden (change)="onImportFile($event)" />
        <button type="button" class="btn" (click)="loadDemo()">
          <app-icon name="sparkles" [size]="14"></app-icon> Cargar datos de ejemplo
        </button>
        <button type="button" class="btn btn-danger" (click)="askReset.set(true)">
          <app-icon name="trash" [size]="14"></app-icon> Borrar todo
        </button>
      </div>
      <p class="text-muted text-sm mt-2">
        Tienes {{ finance.expenses().length }} gastos, {{ finance.income().length }} ingresos,
        {{ finance.creditCards().length }} tarjetas y {{ finance.loans().length }} préstamos registrados.
      </p>
    </section>

    @if (askReset()) {
      <app-confirm-dialog
        title="Borrar todos los datos"
        message="Esto eliminará por completo toda tu información financiera local. Esta acción no se puede deshacer."
        confirmLabel="Sí, borrar todo"
        (confirm)="confirmReset()"
        (cancel)="askReset.set(false)">
      </app-confirm-dialog>
    }
  `,
  styles: [`
    .consent { background: var(--color-surface-2); padding: 12px; border-radius: var(--radius-md); }
    .checkbox { display: flex; align-items: flex-start; gap: 8px; color: var(--color-text); font-weight: 500; margin: 0; }
    .checkbox input { width: auto; margin-top: 4px; }
    .providers { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .prov { padding: 12px; background: var(--color-surface-2); border-radius: var(--radius-md); }
    .status { padding: 10px 12px; border-radius: var(--radius-md); background: var(--color-surface-2); }
    .status.ok { background: var(--color-success-soft); color: var(--color-success); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .rates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    details summary { list-style: none; user-select: none; }
    details summary::-webkit-details-marker { display: none; }
    details[open] summary { margin-bottom: 8px; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }

    /* Móvil y tablet: los botones de la sección Datos se apilan
       verticalmente para que cada uno ocupe todo el ancho y sean
       más fáciles de pulsar. */
    .data-actions {
      display: flex; gap: 8px; flex-wrap: wrap;
    }
    @media (max-width: 1024px) {
      .data-actions { flex-direction: column; align-items: stretch; }
      .data-actions .btn { width: 100%; justify-content: center; }
    }
  `]
})
export class SettingsComponent {
  readonly providers = AI_PROVIDERS;
  readonly ai = inject(AIService);
  readonly finance = inject(FinanceDataService);
  readonly currency = inject(CurrencyService);
  readonly currencies = SUPPORTED_CURRENCIES;
  private readonly toast = inject(ToastService);
  private readonly demo = inject(DemoDataService);

  readonly askReset = signal(false);

  providerId: AIProviderId = this.ai.settings().providerId;
  apiKey = this.ai.settings().apiKey ?? '';
  baseUrl = this.ai.settings().baseUrl ?? '';
  model = this.ai.settings().model ?? '';
  temperature = this.ai.settings().temperature;
  maxTokens = this.ai.settings().maxTokens;
  dataSharingConsent = this.ai.settings().dataSharingConsent;

  readonly provider = computed(() =>
    AI_PROVIDERS.find(p => p.id === this.providerId) ?? AI_PROVIDERS[0]
  );

  readonly isReady = computed(() => {
    if (!this.ai.settings().enabled) return false;
    if (this.provider().requiresApiKey && !this.apiKey) return false;
    if (!this.model) return false;
    if (!this.isLocalProvider(this.provider().id) && !this.dataSharingConsent) return false;
    return true;
  });

  statusReason(): string {
    if (!this.ai.settings().enabled) return 'La IA está deshabilitada.';
    if (this.provider().requiresApiKey && !this.apiKey) return 'Falta la API Key.';
    if (!this.model) return 'Selecciona o escribe un modelo.';
    if (!this.isLocalProvider(this.provider().id) && !this.dataSharingConsent) return 'Sin consentimiento de envío de datos.';
    return 'Configura todos los campos.';
  }

  isLocalProvider(id: AIProviderId): boolean {
    return id === 'ollama' || id === 'lmstudio' || id === 'vllm';
  }

  onProviderChange(): void {
    const p = this.provider();
    if (!this.baseUrl) this.baseUrl = p.baseUrl;
    if (!this.model) this.model = p.model;
  }

  save(): void {
    this.ai.updateSettings({
      providerId: this.providerId,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model,
      temperature: Number(this.temperature),
      maxTokens: Number(this.maxTokens),
      dataSharingConsent: this.dataSharingConsent,
      enabled: true
    });
    if (this.isReady()) {
      this.toast.success('Configuración guardada', 'La IA está lista para usarse.');
    } else {
      this.toast.warning('Configuración incompleta', this.statusReason());
    }
  }

  reset(): void {
    this.ai.resetSettings();
    const s = this.ai.settings();
    this.providerId = s.providerId;
    this.apiKey = s.apiKey ?? '';
    this.baseUrl = s.baseUrl ?? '';
    this.model = s.model ?? '';
    this.temperature = s.temperature;
    this.maxTokens = s.maxTokens;
    this.dataSharingConsent = s.dataSharingConsent;
  }

  exportData(): void {
    const data = JSON.stringify(this.finance.snapshot(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copilot-financiero-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Exportado', 'Tu respaldo se descargó correctamente.');
  }

  /**
   * Carga datos de ejemplo ADITIVAMENTE (sin borrar lo que ya tienes).
   * Si ya tienes ingresos o gastos registrados, solo agrega los que faltan.
   */
  loadDemo(): void {
    const before = this.finance.expenses().length + this.finance.income().length;
    this.demo.seed();
    const after = this.finance.expenses().length + this.finance.income().length;
    const added = after - before;
    if (added > 0) {
      this.toast.success('Datos cargados', `Se agregaron ${added} registros de ejemplo.`);
    } else {
      this.toast.info('Ya tenías datos de ejemplo', 'No se agregaron duplicados.');
    }
  }

  /** Abre el selector de archivo para importar un JSON. */
  triggerImport(): void {
    const el = document.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]');
    el?.click();
  }

  onImportFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Partial<AppSnapshot>;
        this.finance.hydrate(data);
        this.toast.success('Importado', `Se restauraron los datos de "${file.name}".`);
      } catch (e) {
        this.toast.danger('Archivo inválido', 'El JSON no tiene el formato esperado.');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  confirmReset(): void {
    this.finance.reset();
    this.askReset.set(false);
    this.toast.info('Datos borrados', 'Toda tu información financiera local fue eliminada.');
  }

  // ------- Moneda -------
  setMainCurrency(c: Currency): void {
    this.currency.setMainCurrency(c);
    this.toast.success('Moneda principal', `Mostrando todo en ${c}.`);
  }

  rateFor(code: Currency): number {
    return this.currency.rates()[code] ?? 1;
  }

  setRate(code: Currency, rate: number): void {
    this.currency.setRate(code, Number(rate) || 1);
  }

  resetCurrencyRates(): void {
    this.currency.resetRates();
    this.toast.info('Tasas restablecidas', 'Se usaron las tasas por defecto.');
  }
}