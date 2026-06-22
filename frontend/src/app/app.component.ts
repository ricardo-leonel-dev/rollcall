import { Component, ChangeDetectionStrategy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, interval } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

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
  private readonly snackBar = inject(MatSnackBar);

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
    const ref = this.snackBar.open('Hay una nueva versión disponible', 'Actualizar', { duration: 0 });
    ref.onAction().subscribe(() => {
      this.swUpdate.activateUpdate().then(() => document.location.reload());
    });
  }
}
