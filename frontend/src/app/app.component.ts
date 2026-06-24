import { Component, ChangeDetectionStrategy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { NotificationService } from './core/services/notification.service';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly swUpdate = inject(SwUpdate);
  private readonly notify = inject(NotificationService);

  constructor() {
    effect(() => {
      const inst = this.auth.activeInstitution();

      document.title = inst ? `Sistema de Asistencia — ${inst.name}` : 'Sistema de Asistencia';

      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon) favicon.href = inst?.logoUrl || 'favicon.svg';

      this.theme.applyInstitutionColors(inst?.primaryColor ?? null, inst?.secondaryColor ?? null);
    });

    if (this.swUpdate.isEnabled) {
      // El chequeo automático del SW no alcanza para una PWA en iPhone: la app queda
      // suspendida en background sin recargar, así que sin este intervalo nunca se
      // dispara una nueva verificación contra el servidor mientras el usuario no la cierre.
      interval(UPDATE_CHECK_INTERVAL_MS).subscribe(() => this.swUpdate.checkForUpdate());

      this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.promptUpdate());
    }
  }

  private promptUpdate(): void {
    this.notify.info('Hay una nueva versión disponible', {
      actionLabel: 'Actualizar',
      duration: 0,
      onAction: () => this.swUpdate.activateUpdate().then(() => document.location.reload()),
    });
  }
}
