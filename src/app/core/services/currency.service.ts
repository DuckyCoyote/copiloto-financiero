import { Injectable, computed, inject, signal } from '@angular/core';
import { Currency } from '../models';
import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * Tasas de conversión por defecto (1 unidad de la moneda origen =
 * `rate` unidades de MXN). El usuario puede editarlas desde
 * Configuración.
 *
 * No usamos un proveedor externo para evitar claves de API
 * adicionales; las tasas son aproximadas y deben ajustarse
 * manualmente.
 */
const DEFAULT_RATES: Record<Currency, number> = {
  MXN: 1,
  USD: 17.5,
  EUR: 19.0,
  ARS: 0.02,
  COP: 0.0042,
  CLP: 0.018,
  PEN: 4.6,
  BRL: 3.4,
  GBP: 22.0
};

export const SUPPORTED_CURRENCIES: { code: Currency; name: string; symbol: string }[] = [
  { code: 'MXN', name: 'Peso mexicano', symbol: '$' },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'ARS', name: 'Peso argentino', symbol: 'AR$' },
  { code: 'COP', name: 'Peso colombiano', symbol: 'COL$' },
  { code: 'CLP', name: 'Peso chileno', symbol: 'CLP$' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/' },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$' },
  { code: 'GBP', name: 'Libra esterlina', symbol: '£' }
];

const STORAGE_KEY = 'cf:currency-prefs';

interface PersistedPrefs {
  mainCurrency: Currency;
  rates: Record<string, number>;
}

const DEFAULT_PREFS: PersistedPrefs = {
  mainCurrency: 'MXN',
  rates: { ...DEFAULT_RATES }
};

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly storage = inject(StorageService);

  private readonly _prefs = signal<PersistedPrefs>(
    this.storage.read<PersistedPrefs>(STORAGE_KEY, DEFAULT_PREFS)
  );
  readonly prefs = this._prefs.asReadonly();

  readonly mainCurrency = computed(() => this._prefs().mainCurrency);
  readonly rates = computed(() => this._prefs().rates);

  /** Convierte un monto a la moneda principal. */
  toMain(amount: number, from: Currency): number {
    if (from === this._prefs().mainCurrency) return amount;
    const rateFrom = this._prefs().rates[from] ?? 1;
    const rateMain = this._prefs().rates[this._prefs().mainCurrency] ?? 1;
    // Tasa: 1 unidad de `from` = X unidades de MXN.
    // Para convertir a main: (amount * rateFrom) / rateMain
    return (amount * rateFrom) / rateMain;
  }

  /** Convierte un monto entre dos monedas. */
  convert(amount: number, from: Currency, to: Currency): number {
    if (from === to) return amount;
    return this.toMain(amount, from) * (this._prefs().rates[to] / this._prefs().rates[this._prefs().mainCurrency] || 1);
  }

  setMainCurrency(currency: Currency): void {
    this._prefs.update(p => ({ ...p, mainCurrency: currency }));
    this.storage.write(STORAGE_KEY, this._prefs());
  }

  setRate(currency: Currency, rate: number): void {
    this._prefs.update(p => ({ ...p, rates: { ...p.rates, [currency]: rate } }));
    this.storage.write(STORAGE_KEY, this._prefs());
  }

  resetRates(): void {
    this._prefs.update(p => ({ ...p, rates: { ...DEFAULT_RATES } }));
    this.storage.write(STORAGE_KEY, this._prefs());
  }

  symbol(currency: Currency): string {
    return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
  }

  name(currency: Currency): string {
    return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.name ?? currency;
  }
}