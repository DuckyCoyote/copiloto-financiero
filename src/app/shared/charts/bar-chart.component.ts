import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';

export interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

/** Mini gráfico de barras SVG sin dependencias externas. */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wrap">
      @for (d of data; track d.label; let i = $index) {
        <div class="row" [title]="d.label + ': ' + d.value">
          <span class="label">{{ d.label }}</span>
          <div class="bar-track">
            <div class="bar" [style.width.%]="percent(d.value)" [style.background]="d.color || 'var(--color-primary)'"></div>
          </div>
          <span class="value">{{ d.value | number:'1.0-0' }}</span>
        </div>
      }
      @if (data.length === 0) {
        <p class="text-muted text-sm" style="margin: 0;">Sin datos para mostrar.</p>
      }
    </div>
  `,
  styles: [`
    .wrap { display: flex; flex-direction: column; gap: 8px; }
    .row { display: grid; grid-template-columns: 110px 1fr 80px; gap: 12px; align-items: center; }
    .label { color: var(--color-text-muted); font-size: 12px; }
    .bar-track {
      height: 8px; background: var(--color-surface-2); border-radius: 4px; overflow: hidden;
    }
    .bar { height: 100%; border-radius: 4px; transition: width .3s ease; }
    .value { text-align: right; font-family: var(--font-mono); font-size: 12px; }
  `]
})
export class BarChartComponent {
  @Input() data: BarChartDatum[] = [];
  private readonly max = computed(() => Math.max(1, ...this.data.map(d => d.value)));
  percent(value: number): number {
    return Math.min(100, (value / this.max()) * 100);
  }
}