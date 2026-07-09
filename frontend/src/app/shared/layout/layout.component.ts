import { Component, ChangeDetectionStrategy, OnInit, signal, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { InstitutionContextService } from '../../core/services/institution-context.service';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { ThemeService } from '../../core/services/theme.service';
import { ProfileDialogComponent, resolveAvatarPreset } from '../components/profile-dialog/profile-dialog.component';
import { SECTIONS, SubNavItem } from '../../core/nav-items';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatSelectModule],
  styles: [`
    :host { display: flex; height: 100vh; overflow: hidden; }

    aside {
      width: 240px;
      background: #1c1410;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: width 0.2s ease;
      overflow: hidden;
      position: relative;
    }
    aside.collapsed { width: 64px; }
    aside.sidebar-hidden { width: 0; min-width: 0; }
    /* book spine — thin warm highlight down the inner edge */
    aside::after {
      content: '';
      position: absolute;
      top: 0; bottom: 0; right: 0;
      width: 3px;
      background: linear-gradient(180deg, var(--stripe), transparent 85%);
      opacity: .6;
    }

    .brand {
      padding: 20px 16px;
      border-bottom: 1px solid rgba(255,237,213,0.08);
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 72px;
    }
    .brand-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: white;
    }
    .brand-text { overflow: hidden; }
    .brand-name { font-family: 'Nunito', sans-serif; color: #f5f0e8; font-weight: 600; font-size: 16px; white-space: nowrap; }
    .brand-sub  { color: #a89a8c; font-size: 11px; white-space: nowrap; }

    nav { flex: 1; padding: 12px 8px; overflow-y: auto; }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      color: #a89a8c;
      text-decoration: none;
      margin-bottom: 2px;
      transition: all 0.15s ease;
      white-space: nowrap;
      overflow: hidden;
      cursor: pointer;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
    }
    .nav-item:hover { background: rgba(255,237,213,0.07); color: #f5f0e8; }
    .nav-item.active { background: color-mix(in srgb, var(--accent) 25%, transparent); color: color-mix(in srgb, var(--accent) 55%, white); }
    .nav-item.active .nav-icon { color: color-mix(in srgb, var(--accent) 70%, white); }
    .nav-icon { font-size: 20px !important; width: 20px !important; height: 20px !important; flex-shrink: 0; }
    .nav-label { font-size: 14px; font-weight: 500; }

    .nav-back {
      color: #6b5d4f;
      margin-bottom: 8px;
    }
    .nav-back:hover { color: #f5f0e8; }

    .nav-section {
      color: #6b5d4f;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 8px 12px 4px;
      margin-top: 8px;
      white-space: nowrap;
    }
    .nav-divider {
      height: 1px;
      background: rgba(255,237,213,0.08);
      margin: 8px 12px;
    }

    .user-area {
      padding: 12px 8px;
      border-top: 1px solid rgba(255,237,213,0.08);
    }
    .user-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
    }
    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .user-info { overflow: hidden; }
    .user-name { color: #f5f0e8; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { color: #8a7c6e; font-size: 11px; white-space: nowrap; }
    .logout-btn { color: #8a7c6e !important; margin-left: auto; flex-shrink: 0; }

    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--page-bg);
    }

    header {
      background: var(--paper);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.04);
    }

    .menu-toggle { color: var(--muted-strong) !important; }
    .institution-switcher { width: 240px; }
    .year-switcher { width: 160px; }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .content-loading {
      display: flex; align-items: center; justify-content: center;
      height: 100%; color: var(--muted-strong); font-size: 14px;
    }

    @media (max-width: 767px) {
      aside { position: fixed; left: 0; top: 0; bottom: 0; z-index: 100; width: 240px; transform: translateX(-100%); }
      aside.mobile-open { transform: translateX(0); }
      aside.sidebar-hidden { width: 240px; transform: translateX(-100%); }
      .overlay { display: block; }
    }
  `],
  template: `
    <aside
      [class.sidebar-hidden]="!showSidebar() && !isMobile()"
      [class.collapsed]="collapsed() && !isMobile()"
      [class.mobile-open]="mobileOpen() && showSidebar()">

      <div class="brand">
        <div class="brand-icon">
          <mat-icon class="nav-icon">school</mat-icon>
        </div>
        @if (!collapsed() || isMobile()) {
          <div class="brand-text">
            <div class="brand-name">Asistencia</div>
            @if (auth.activeInstitution()?.name) {
              <div class="brand-sub">{{auth.activeInstitution()!.name}}</div>
            }
          </div>
        }
      </div>

      <nav>
        <!-- Back to home -->
        <a class="nav-item nav-back" routerLink="/home" (click)="closeMobile()"
           [matTooltip]="collapsed() && !isMobile() ? 'Inicio' : ''" matTooltipPosition="right">
          <mat-icon class="nav-icon">arrow_back</mat-icon>
          @if (!collapsed() || isMobile()) { <span class="nav-label">Inicio</span> }
        </a>

        @if (activeSectionData()) {
          <div class="nav-divider"></div>
          @if (!collapsed() || isMobile()) {
            <div class="nav-section">{{activeSectionData()!.label}}</div>
          }
          @for (item of visibleSubnav(); track item.label) {
            <a class="nav-item"
               [class.active]="isSubnavActive(item)"
               [routerLink]="item.route"
               [queryParams]="item.queryParams ?? null"
               [matTooltip]="collapsed() && !isMobile() ? item.label : ''" matTooltipPosition="right"
               (click)="closeMobile()">
              <mat-icon class="nav-icon">{{item.icon}}</mat-icon>
              @if (!collapsed() || isMobile()) { <span class="nav-label">{{item.label}}</span> }
            </a>
          }
        }
      </nav>

      <div class="user-area">
        <div class="user-card">
          <div class="avatar" [style.background]="isUploadedAvatar() ? 'transparent' : (avatarPreset()?.color ?? null)">
            @if (isUploadedAvatar()) {
              <img [src]="auth.currentUser()?.avatarUrl" style="width:100%;height:100%;border-radius:8px;object-fit:cover">
            } @else if (avatarPreset()) {
              <mat-icon style="font-size:18px;width:18px;height:18px">{{avatarPreset()!.icon}}</mat-icon>
            } @else {
              {{initials()}}
            }
          </div>
          @if (!collapsed() || isMobile()) {
            <div class="user-info">
              <div class="user-name">{{auth.currentUser()?.fullName ?? auth.currentUser()?.username}}</div>
              <div class="user-role">{{auth.roleName()}}</div>
            </div>
            <button mat-icon-button class="logout-btn" (click)="openProfile()" matTooltip="Mi perfil">
              <mat-icon>settings</mat-icon>
            </button>
            <button mat-icon-button class="logout-btn" (click)="auth.logout()" matTooltip="Cerrar sesión">
              <mat-icon>logout</mat-icon>
            </button>
          }
        </div>
      </div>
    </aside>

    @if (isMobile() && mobileOpen() && showSidebar()) {
      <div class="fixed inset-0 bg-black/40 z-50" style="backdrop-filter:blur(2px)" (click)="closeMobile()"></div>
    }

    <main>
      <header>
        @if (showSidebar()) {
          <button mat-icon-button class="menu-toggle" (click)="toggleMenu()">
            <mat-icon>{{isMobile() ? 'menu' : (collapsed() ? 'menu_open' : 'menu')}}</mat-icon>
          </button>
        }
        <span style="flex:1"></span>
        <button mat-icon-button style="color:var(--muted-strong)" (click)="theme.toggle()" [matTooltip]="theme.dark() ? 'Modo claro' : 'Modo oscuro'">
          <mat-icon>{{theme.dark() ? 'light_mode' : 'dark_mode'}}</mat-icon>
        </button>
        @if (auth.isSuperAdmin()) {
          <mat-select class="institution-switcher" [ngModel]="institutionContext.selectedId()"
                      (ngModelChange)="onInstitutionChange($event)" placeholder="Institución">
            @for (inst of institutionContext.activeInstitutions(); track inst.id) {
              <mat-option [value]="inst.id">{{inst.name}}</mat-option>
            }
          </mat-select>
        }
        @if (academicYearContext.years().length) {
          <mat-select class="year-switcher" [ngModel]="academicYearContext.selectedId()"
                      (ngModelChange)="onYearChange($event)" placeholder="Año lectivo">
            @for (y of academicYearContext.years(); track y.id) {
              <mat-option [value]="y.id">{{y.name}}</mat-option>
            }
          </mat-select>
        }
        @if (isMobile()) {
          <button mat-icon-button style="color:var(--muted-strong)" (click)="auth.logout()">
            <mat-icon>logout</mat-icon>
          </button>
        }
      </header>
      <div class="content">
        @if (institutionReady()) {
          <router-outlet />
        } @else {
          <div class="content-loading">Cargando…</div>
        }
      </div>
    </main>
  `,
})
export class LayoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly institutionContext = inject(InstitutionContextService);
  readonly academicYearContext = inject(AcademicYearContextService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly bp = inject(BreakpointObserver);
  private readonly dialog = inject(MatDialog);

  // Superadmin requests need the X-Institution-Id header, which the auth
  // interceptor only attaches once institutionContext has picked one — gate
  // the routed page behind that so no child component's ngOnInit fires an
  // institution-scoped request before the header exists (was a real 400 race).
  readonly institutionReady = signal(false);

  async ngOnInit(): Promise<void> {
    if (this.auth.isSuperAdmin()) {
      await this.institutionContext.loadInstitutions();
    }
    await this.academicYearContext.load();
    this.institutionReady.set(true);
  }

  onInstitutionChange(id: number): void {
    this.institutionContext.select(id);
    location.reload();
  }

  onYearChange(id: number): void {
    this.academicYearContext.select(id);
    location.reload();
  }

  openProfile(): void {
    this.dialog.open(ProfileDialogComponent, { width: '520px' });
  }

  readonly avatarPreset = () => resolveAvatarPreset(this.auth.currentUser()?.avatarUrl);
  readonly isUploadedAvatar = () => !!this.auth.currentUser()?.avatarUrl?.startsWith('/api/uploads/');

  readonly isMobile = toSignal(
    this.bp.observe('(max-width: 767px)').pipe(map(r => r.matches)),
    { initialValue: false }
  );

  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  readonly initials = () => {
    const name = this.auth.currentUser()?.fullName ?? this.auth.currentUser()?.username ?? '?';
    return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  };

  toggleMenu(): void {
    if (this.isMobile()) {
      this.mobileOpen.update(v => !v);
    } else {
      this.collapsed.update(v => !v);
    }
  }

  closeMobile(): void { this.mobileOpen.set(false); }

  // Track current URL to derive the active section
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  // The first URL path segment, null when on /home or root
  readonly activeSection = computed(() => {
    const segment = this.currentUrl().split('?')[0].split('/')[1] ?? '';
    return (segment && segment !== 'home') ? segment : null;
  });

  readonly showSidebar = computed(() => !!this.activeSection());

  readonly activeSectionData = computed(() =>
    SECTIONS.find(s => s.key === this.activeSection()) ?? null
  );

  readonly visibleSubnav = computed(() => {
    const section = this.activeSectionData();
    if (!section) return [];
    return section.subnav.filter(item => {
      if (item.superAdminOnly && !this.auth.isSuperAdmin()) return false;
      if (item.moduleKey) return this.auth.canAccessModule(item.moduleKey);
      return true; // placeholders always visible
    });
  });

  isSubnavActive(item: SubNavItem): boolean {
    const url = this.currentUrl();
    const qIdx = url.indexOf('?');
    const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url;
    const search = qIdx >= 0 ? url.slice(qIdx + 1) : '';
    if (pathname !== item.route) return false;
    if (!item.queryParams || Object.keys(item.queryParams).length === 0) return true;
    const params = new URLSearchParams(search);
    return Object.entries(item.queryParams).every(([k, v]) => params.get(k) === v);
  }
}
