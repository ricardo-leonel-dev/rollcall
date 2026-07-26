import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="coming-soon" [class.compact]="compact">
      <mat-icon>construction</mat-icon>
      <div class="title">{{ title }}</div>
      @if (!compact) {
        <div class="desc">Esta sección está en construcción y estará disponible próximamente.</div>
      }
    </div>
  `,
  styles: [`
    .coming-soon { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; text-align:center; padding:48px 24px; min-height:280px; }
    .coming-soon.compact { padding:24px 16px; gap:10px; min-height:auto; }
    .coming-soon mat-icon { font-size:40px; width:40px; height:40px; color:var(--border); }
    .coming-soon.compact mat-icon { font-size:28px; width:28px; height:28px; }
    .coming-soon .title { font-size:16px; font-weight:700; color:var(--ink-soft); }
    .coming-soon.compact .title { font-size:13px; }
    .coming-soon .desc { font-size:13px; color:var(--muted-strong); max-width:320px; line-height:1.6; }
  `],
})
export class ComingSoonComponent {
  @Input() title = 'Próximamente';
  @Input() compact = false;
}
