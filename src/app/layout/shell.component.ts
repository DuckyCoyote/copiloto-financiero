import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ChatService, FinanceDataService } from '../core/services';
import { IconComponent, IconName } from '../shared/icon/icon.component';
import { NotificationCenterComponent } from './notification-center.component';
import { ThemeToggleComponent } from './theme-toggle.component';
import { ToasterComponent } from '../shared/toaster/toaster.component';
import { BrowserNotificationToggleComponent } from './browser-notification-toggle.component';

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
}

type SidebarMode = 'full' | 'compact' | 'drawer';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, IconComponent, ThemeToggleComponent, NotificationCenterComponent, BrowserNotificationToggleComponent, ToasterComponent],
  template: `
    <div class="layout" [class.drawer-open]="drawerOpen()">
      @if (drawerOpen()) {
        <div class="scrim" (click)="drawerOpen.set(false)" aria-hidden="true"></div>
      }
      <aside class="sidebar" [class.compact]="mode() === 'compact'" [class.drawer]="drawerOpen() && mode() === 'drawer'">
        <div class="brand">
          <span class="logo">
            <app-icon name="wallet" [size]="20" color="var(--color-bg)"></app-icon>
          </span>
          <div class="brand-text">
            <strong>Copilot</strong>
            <small>Financiero</small>
          </div>
          <button type="button" class="btn btn-ghost btn-sm close-drawer" (click)="drawerOpen.set(false)" aria-label="Cerrar menú">
            <app-icon name="x" [size]="16"></app-icon>
          </button>
        </div>
        <nav>
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" class="nav-item" (click)="onNavClick()">
              <app-icon [name]="item.icon" [size]="18"></app-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="sidebar-footer">
          <p class="text-sm text-muted" style="margin:0 0 6px 0;">Liquidez este mes</p>
          <strong class="font-mono">{{ liquidity() | currency:'MXN':'symbol-narrow':'1.0-0' }}</strong>
        </div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div class="left">
            <button type="button" class="hamburger btn btn-ghost btn-sm" (click)="toggleDrawer()" aria-label="Menú">
              <app-icon name="menu" [size]="18"></app-icon>
            </button>
            <div class="crumbs">{{ pageTitle() }}</div>
          </div>
          <div class="user-area">
            <span class="badge" [class.badge-success]="aiReady()" [class.badge-warning]="!aiReady()">
              IA {{ aiReady() ? 'lista' : 'inactiva' }}
            </span>
            <app-notification-center></app-notification-center>
            <app-browser-notification-toggle></app-browser-notification-toggle>
            <app-theme-toggle></app-theme-toggle>
          </div>
        </header>
        <section class="page fade-in">
          <router-outlet></router-outlet>
        </section>
      </main>
    </div>
    <app-toaster></app-toaster>
  `,
  styles: [`
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: var(--sidebar-width);
      background: var(--color-surface);
      border-right: 1px solid var(--color-border);
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: sticky;
      top: 0;
      height: 100vh;
      flex-shrink: 0;
      transition: width .2s ease;
    }
    .brand {
      display: flex; align-items: center; gap: 10px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--color-border);
      position: relative;
    }
    .brand .logo {
      width: 36px; height: 36px; border-radius: 8px;
      background: var(--color-text);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .brand strong { display: block; font-size: 15px; }
    .brand small { color: var(--color-text-muted); font-size: 11px; }
    .close-drawer { display: none; margin-left: auto; padding: 6px 8px; }
    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px;
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: 13.5px;
      font-weight: 500;
      text-decoration: none;
      border: none;
      transition: background .12s ease, color .12s ease;
    }
    .nav-item:hover { background: var(--color-surface-2); color: var(--color-text); }
    .nav-item.active {
      background: var(--color-surface-3);
      color: var(--color-text);
    }
    .sidebar-footer {
      padding: 12px;
      background: var(--color-surface-2);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .content { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .topbar {
      min-height: var(--header-height);
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 24px;
      gap: 12px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: sticky; top: 0; z-index: 10;
    }
    .left { display: flex; align-items: center; gap: 10px; }
    .hamburger { display: none; padding: 5px; }
    .crumbs { font-weight: 600; font-size: 15px; }
    .user-area { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .page { padding: 24px; flex: 1; min-width: 0; }
    .scrim { display: none; }

    /* ---------- Modo compacto: solo iconos (desktop pequeño) ---------- */
    @media (max-width: 1024px) {
      .sidebar.compact {
        width: 64px; padding: 16px 6px;
      }
      .sidebar.compact .brand-text,
      .sidebar.compact .nav-item span:last-child,
      .sidebar.compact .sidebar-footer {
        display: none;
      }
      .sidebar.compact .nav-item { justify-content: center; padding: 10px 6px; }
      .sidebar.compact .close-drawer { display: none; }
    }

    /* ---------- Móvil: drawer oculto por defecto, hamburguesa visible ---------- */
    @media (max-width: 768px) {
      .topbar { padding: 10px 16px; }
      .hamburger { display: inline-flex; }
      .user-area .badge { display: none; }
      .sidebar {
        position: fixed;
        left: 0; top: 0; bottom: 0;
        height: 100vh;
        z-index: 100;
        transform: translateX(-100%);
        transition: transform .2s ease;
        box-shadow: var(--shadow-lg);
      }
      .sidebar.drawer { transform: translateX(0); }
      .sidebar.drawer .close-drawer { display: inline-flex; }
      .layout.drawer-open .scrim {
        display: block;
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 90;
        animation: fadeIn .15s ease;
      }
      .page { padding: 16px; }
    }
    @media (max-width: 480px) {
      .user-area { gap: 4px; }
      .crumbs { font-size: 14px; max-width: 73px; }
    }
  `]
})
export class ShellComponent {
  private readonly finance = inject(FinanceDataService);
  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);

  /** Ancho de la ventana, se actualiza con el listener de resize. */
  private readonly viewportWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);

  /**
   * Modo del sidebar:
   *  - `full`: ancho completo, con etiquetas (>=1025px)
   *  - `compact`: solo iconos (769px – 1024px)
   *  - `drawer`: oculto, se abre con hamburguesa (<=768px)
   */
  readonly mode = computed<SidebarMode>(() => {
    const w = this.viewportWidth();
    if (w <= 768) return 'drawer';
    if (w <= 1024) return 'compact';
    return 'full';
  });

  readonly drawerOpen = signal(false);

  readonly nav: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'home' },
    { label: 'Chat IA', path: '/chat', icon: 'message' },
    { label: 'Gastos', path: '/expenses', icon: 'expense' },
    { label: 'Ingresos', path: '/income', icon: 'income' },
    { label: 'Tarjetas', path: '/cards', icon: 'card' },
    { label: 'Préstamos', path: '/loans', icon: 'loan' },
    { label: 'Servicios', path: '/services', icon: 'service' },
    { label: 'Suscripciones', path: '/subscriptions', icon: 'subscription' },
    { label: 'Presupuestos', path: '/budgets', icon: 'budget' },
    { label: 'Metas', path: '/goals', icon: 'goal' },
    { label: 'Calendario', path: '/calendar', icon: 'calendar' },
    { label: 'Plan de pagos', path: '/planner', icon: 'planner' },
    { label: 'Configuración', path: '/settings', icon: 'settings' }
  ];

  /** URL actual reactiva: cambia con cada NavigationEnd. */
  private readonly currentUrl = signal(this.router.url);

  readonly pageTitle = computed(() => {
    const url = this.currentUrl();
    const match = this.nav.find(n => url.startsWith(n.path));
    return match?.label ?? 'Copilot Financiero';
  });

  readonly liquidity = computed(() => {
    const t = this.finance.totals();
    return t.income - t.expenses;
  });

  readonly aiReady = computed(() => this.chat.hasMessages() || this.finance.totals().income > 0);

  constructor() {
    // Cierra el drawer al cambiar de ruta y actualiza la URL reactiva.
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.drawerOpen.set(false);
        this.currentUrl.set((e as NavigationEnd).urlAfterRedirects);
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    const w = window.innerWidth;
    const previous = this.viewportWidth();
    this.viewportWidth.set(w);
    // Si salimos del modo drawer, cerramos el drawer.
    if (previous <= 768 && w > 768) this.drawerOpen.set(false);
  }

  toggleDrawer(): void {
    this.drawerOpen.update(v => !v);
  }

  onNavClick(): void {
    // En móvil, cerrar el drawer al hacer clic en un enlace.
    if (this.mode() === 'drawer') this.drawerOpen.set(false);
  }
}
