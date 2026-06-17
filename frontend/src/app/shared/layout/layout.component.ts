import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationSettingsDialogComponent } from '../components/notification-settings-dialog/notification-settings-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatTooltipModule],
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
    /* book spine — a thin warm highlight down the inner edge, like the gilt
       edge of a ledger cover */
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
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: white;
    }
    .brand-text { overflow: hidden; }
    .brand-name { font-family: 'Fraunces', serif; color: #f5f0e8; font-weight: 600; font-size: 16px; white-space: nowrap; }
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
    }
    .nav-item:hover { background: rgba(255,237,213,0.07); color: #f5f0e8; }
    .nav-item.active { background: rgba(99,102,241,0.22); color: #c7d2fe; }
    .nav-item.active .nav-icon { color: #a5b4fc; }
    .nav-icon { font-size: 20px !important; width: 20px !important; height: 20px !important; flex-shrink: 0; }
    .nav-label { font-size: 14px; font-weight: 500; }

    .nav-section { color: #6b5d4f; font-size: 10px; font-weight: 700; text-transform: uppercase;
                   letter-spacing: 0.08em; padding: 8px 12px 4px; margin-top: 8px; }

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

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    @media (max-width: 767px) {
      aside { position: fixed; left: 0; top: 0; bottom: 0; z-index: 100; width: 240px; transform: translateX(-100%); }
      aside.mobile-open { transform: translateX(0); }
      .overlay { display: block; }
    }
  `],
  template: `
    <aside [class.collapsed]="collapsed() && !isMobile()" [class.mobile-open]="mobileOpen()">
      <div class="brand">
        <div class="brand-icon">
          <mat-icon class="nav-icon">school</mat-icon>
        </div>
        @if (!collapsed() || isMobile()) {
          <div class="brand-text">
            <div class="brand-name">Asistencia</div>
            <div class="brand-sub">Tia Blanquita</div>
          </div>
        }
      </div>

      <nav>
        <div class="nav-section" *ngIf="!collapsed() || isMobile()">Principal</div>
        @for (item of mainNav; track item.route) {
          <a class="nav-item" [routerLink]="item.route" routerLinkActive="active"
             [matTooltip]="collapsed() && !isMobile() ? item.label : ''" matTooltipPosition="right"
             (click)="isMobile() && closeMobile()">
            <mat-icon class="nav-icon">{{item.icon}}</mat-icon>
            @if (!collapsed() || isMobile()) { <span class="nav-label">{{item.label}}</span> }
          </a>
        }
        <div class="nav-section" *ngIf="!collapsed() || isMobile()">Gestión</div>
        @for (item of mgmtNav; track item.route) {
          <a class="nav-item" [routerLink]="item.route" routerLinkActive="active"
             [matTooltip]="collapsed() && !isMobile() ? item.label : ''" matTooltipPosition="right"
             (click)="isMobile() && closeMobile()">
            <mat-icon class="nav-icon">{{item.icon}}</mat-icon>
            @if (!collapsed() || isMobile()) { <span class="nav-label">{{item.label}}</span> }
          </a>
        }
      </nav>

      <div class="user-area">
        <div class="user-card">
          <div class="avatar">{{initials()}}</div>
          @if (!collapsed() || isMobile()) {
            <div class="user-info">
              <div class="user-name">{{auth.currentUser()?.fullName ?? auth.currentUser()?.username}}</div>
              <div class="user-role">{{auth.roleName()}}</div>
            </div>
            <button mat-icon-button class="logout-btn" (click)="openNotificationSettings()" matTooltip="Mensaje de notificación">
              <mat-icon>settings</mat-icon>
            </button>
            <button mat-icon-button class="logout-btn" (click)="auth.logout()" matTooltip="Cerrar sesión">
              <mat-icon>logout</mat-icon>
            </button>
          }
        </div>
      </div>
    </aside>

    @if (isMobile() && mobileOpen()) {
      <div class="fixed inset-0 bg-black/40 z-50" style="backdrop-filter:blur(2px)" (click)="closeMobile()"></div>
    }

    <main>
      <header>
        <button mat-icon-button class="menu-toggle" (click)="toggleMenu()">
          <mat-icon>{{isMobile() ? 'menu' : (collapsed() ? 'menu_open' : 'menu')}}</mat-icon>
        </button>
        <span style="flex:1"></span>
        @if (isMobile()) {
          <button mat-icon-button style="color:var(--muted-strong)" (click)="auth.logout()">
            <mat-icon>logout</mat-icon>
          </button>
        }
      </header>
      <div class="content">
        <router-outlet />
      </div>
    </main>
  `,
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  private readonly bp = inject(BreakpointObserver);
  private readonly dialog = inject(MatDialog);

  openNotificationSettings(): void {
    this.dialog.open(NotificationSettingsDialogComponent, { width: '480px' });
  }

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

  readonly mainNav = [
    { route: '/dashboard',      icon: 'dashboard',     label: 'Dashboard' },
    { route: '/absences',       icon: 'event_busy',    label: 'Inasistencias' },
    { route: '/calendar',       icon: 'calendar_month', label: 'Calendario' },
    { route: '/justifications', icon: 'task_alt',      label: 'Justificaciones' },
  ];

  readonly mgmtNav = [
    { route: '/students',    icon: 'groups',              label: 'Estudiantes' },
    { route: '/enrollments', icon: 'assignment_ind',      label: 'Matrículas' },
    { route: '/admin',       icon: 'admin_panel_settings', label: 'Administración' },
  ];
}
