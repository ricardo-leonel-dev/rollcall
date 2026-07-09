import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:360px;gap:16px;text-align:center;padding:48px 24px">
      <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border)">construction</mat-icon>
      <div style="font-size:20px;font-weight:700;color:var(--ink-soft)">{{title()}}</div>
      <div style="font-size:14px;color:var(--muted-strong);max-width:340px;line-height:1.6">
        Esta sección está en construcción y estará disponible próximamente.
      </div>
    </div>
  `,
})
export class PlaceholderComponent {
  private readonly route = inject(ActivatedRoute);
  readonly title = toSignal(
    this.route.data.pipe(map(d => d['title'] ?? 'Próximamente')),
    { initialValue: 'Próximamente' }
  );
}
