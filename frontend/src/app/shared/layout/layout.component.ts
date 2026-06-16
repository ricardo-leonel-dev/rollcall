import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule,
  ],
  template: `
    <mat-sidenav-container class="h-full">
      <mat-sidenav
        #sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        class="w-64">
        <div class="p-4 bg-blue-700 text-white">
          <div class="font-bold text-lg">Asistencia</div>
          <div class="text-xs opacity-75">Tia Blanquita</div>
        </div>
        <mat-nav-list>
          @for (item of navItems; track item.route) {
            <a mat-list-item [routerLink]="item.route" routerLinkActive="bg-blue-50 text-blue-700">
              <mat-icon matListItemIcon>{{item.icon}}</mat-icon>
              <span matListItemTitle>{{item.label}}</span>
            </a>
          }
        </mat-nav-list>
        <div class="absolute bottom-0 w-full p-4 border-t">
          <div class="text-sm text-gray-600 mb-2">{{auth.currentUser()?.fullName ?? auth.currentUser()?.username}}</div>
          <div class="text-xs text-gray-400">{{auth.roleName()}}</div>
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar color="primary" class="sticky top-0 z-10">
          @if (isMobile()) {
            <button mat-icon-button (click)="sidenav.toggle()">
              <mat-icon>menu</mat-icon>
            </button>
          }
          <span class="flex-1"></span>
          <button mat-icon-button (click)="auth.logout()" title="Cerrar sesión">
            <mat-icon>logout</mat-icon>
          </button>
        </mat-toolbar>
        <div class="p-4 md:p-6">
          <router-outlet />
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  private readonly bp = inject(BreakpointObserver);

  readonly isMobile = toSignal(
    this.bp.observe('(max-width: 767px)').pipe(map(r => r.matches)),
    { initialValue: false }
  );

  readonly navItems = [
    { route: '/dashboard',      icon: 'dashboard',    label: 'Dashboard' },
    { route: '/absences',       icon: 'event_busy',   label: 'Inasistencias' },
    { route: '/justifications', icon: 'verified',     label: 'Justificaciones' },
    { route: '/students',       icon: 'school',       label: 'Estudiantes' },
    { route: '/enrollments',    icon: 'assignment',   label: 'Matrículas' },
    { route: '/admin',          icon: 'admin_panel_settings', label: 'Administración' },
  ];
}
