import { Injectable } from '@angular/core';

/**
 * Servicio de formato. Centraliza la presentación de montos y fechas.
 */
@Injectable({ providedIn: 'root' })
export class FormatService {
  formatMoney(amount: number, currency = 'MXN'): string {
    try {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateShort(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  }

  formatRelative(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const days = Math.round(diffMs / 86400000);
    const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    if (Math.abs(days) >= 30) return this.formatDate(iso);
    if (Math.abs(days) >= 7) return rtf.format(Math.round(days / 7), 'week');
    return rtf.format(days, 'day');
  }
}