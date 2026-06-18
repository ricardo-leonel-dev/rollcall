import { Component, ChangeDetectionStrategy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

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

  constructor() {
    effect(() => {
      const inst = this.auth.activeInstitution();

      document.title = inst ? `Sistema de Asistencia — ${inst.name}` : 'Sistema de Asistencia';

      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon) favicon.href = inst?.logoUrl || 'favicon.svg';

      this.theme.applyInstitutionColors(inst?.primaryColor ?? null, inst?.secondaryColor ?? null);
    });
  }
}
