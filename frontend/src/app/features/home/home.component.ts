import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { SECTIONS, SectionItem } from '../../core/nav-items';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  styles: [`
    .launcher-wrap { max-width: 880px; }

    .greeting-text {
      font-family: 'Nunito', sans-serif;
      font-size: 26px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .greeting-sub {
      font-size: 14px;
      color: var(--muted-strong);
      margin-bottom: 32px;
    }

    .app-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 20px;
    }

    .app-card {
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 28px;
      cursor: pointer;
      transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 14px;
      text-align: left;
      position: relative;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(15, 23, 42, .05);
    }
    .app-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .app-card:hover {
      box-shadow: 0 8px 24px rgba(15, 23, 42, .1);
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    }
    .app-card:hover::before { opacity: 1; }

    .app-icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--accent-soft);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .app-icon mat-icon {
      font-size: 28px !important;
      width: 28px !important;
      height: 28px !important;
    }

    .app-label {
      font-family: 'Nunito', sans-serif;
      font-size: 19px;
      font-weight: 700;
      color: var(--ink);
    }

    .app-desc {
      font-size: 13px;
      line-height: 1.6;
      color: var(--muted-strong);
      flex: 1;
    }

    .app-arrow {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
    }
    .app-arrow mat-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
      transition: transform 0.15s ease;
    }
    .app-card:hover .app-arrow mat-icon { transform: translateX(3px); }
  `],
  template: `
    <div class="launcher-wrap">
      <div class="greeting-text">
        Bienvenido{{firstName() ? ', ' + firstName() : ''}}
      </div>
      <div class="greeting-sub">Selecciona un módulo para comenzar</div>

      <div class="app-grid">
        @for (section of visibleSections(); track section.key) {
          <button class="app-card" (click)="openSection(section)">
            <div class="app-icon">
              <mat-icon>{{section.icon}}</mat-icon>
            </div>
            <div class="app-label">{{section.label}}</div>
            <div class="app-desc">{{section.description}}</div>
            <div class="app-arrow">
              Abrir <mat-icon>arrow_forward</mat-icon>
            </div>
          </button>
        }
      </div>
    </div>
  `,
})
export class HomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly firstName = computed(() => {
    const name = this.auth.currentUser()?.fullName ?? this.auth.currentUser()?.username ?? '';
    return name.split(' ')[0];
  });

  readonly visibleSections = computed(() =>
    SECTIONS.filter(s => {
      const keyed = s.subnav.filter(i => i.moduleKey);
      // Sections with no module keys (all-placeholder) are visible to everyone
      if (keyed.length === 0) return true;
      // Show section if user can access at least one sub-item
      return keyed.some(i => this.auth.canAccessModule(i.moduleKey!));
    })
  );

  openSection(section: SectionItem): void {
    const first = section.subnav.find(
      i => !(i.superAdminOnly && !this.auth.isSuperAdmin())
    );
    if (!first) return;
    this.router.navigate([first.route], {
      queryParams: first.queryParams ?? null,
    });
  }
}
