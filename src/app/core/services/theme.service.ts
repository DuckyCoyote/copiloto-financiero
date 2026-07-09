import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { STORAGE_KEYS, StorageService } from './storage.service';

export type ThemeMode = 'dark' | 'light';

const DEFAULT_THEME: ThemeMode = 'dark';

/**
 * Servicio de tema.
 *
 * Aplica `data-theme="dark"|"light"` al elemento raíz del documento
 * y persiste la elección del usuario. Por defecto usa el tema oscuro.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(StorageService);
  private readonly doc = inject(DOCUMENT);

  private readonly _mode = signal<ThemeMode>(
    this.storage.read<ThemeMode>(STORAGE_KEYS.theme, DEFAULT_THEME)
  );
  readonly mode = this._mode.asReadonly();

  readonly isDark = computed(() => this._mode() === 'dark');
  readonly isLight = computed(() => this._mode() === 'light');

  constructor() {
    this.apply(this._mode());
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
    this.storage.write(STORAGE_KEYS.theme, mode);
    this.apply(mode);
  }

  toggle(): void {
    this.set(this._mode() === 'dark' ? 'light' : 'dark');
  }

  private apply(mode: ThemeMode): void {
    const root = this.doc.documentElement;
    if (root) root.setAttribute('data-theme', mode);
  }
}