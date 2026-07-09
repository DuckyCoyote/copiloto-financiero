import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrowserNotificationService, DemoDataService, NotificationService } from './core/services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `<router-outlet></router-outlet>`
})
export class AppComponent implements OnInit {
  private readonly demo = inject(DemoDataService);
  // Inyectamos los servicios de notificaciones para que arranquen
  // sus efectos al cargar la app.
  private readonly notifications = inject(NotificationService);
  private readonly browserNotifications = inject(BrowserNotificationService);

  ngOnInit(): void {
    // Sembramos datos de demostración solo si el usuario parte de cero.
    this.demo.seedIfEmpty();
  }
}