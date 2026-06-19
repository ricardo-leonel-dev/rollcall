import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { NAV_ITEMS } from '../../core/nav-items';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  styles: [`
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
    .module-card {
      background: var(--paper);
      border: 1px solid var(--border);
      box-shadow: 0 1px 3px rgba(15, 23, 42, .05);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .module-icon {
      width: 44px; height: 44px; border-radius: 12px;
      background: var(--accent-soft); color: var(--accent);
      display: flex; align-items: center; justify-content: center;
    }
    .module-label {
      font-family: 'Nunito', sans-serif;
      color: var(--ink);
      font-size: 18px; font-weight: 600;
    }
    .module-desc {
      color: var(--muted-strong);
      font-size: 13px; line-height: 1.5;
      flex: 1;
    }
    .empty { color: var(--muted-strong); text-align: center; padding: 48px 0; }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Inicio</h1>
    </div>

    <mat-form-field appearance="outline" style="max-width:380px;width:100%;margin-bottom:20px">
      <mat-label>Buscar módulo</mat-label>
      <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
      <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Ej: inasistencias">
    </mat-form-field>

    @if (items().length) {
      <div class="grid">
        @for (item of items(); track item.key) {
          <div class="module-card">
            <div class="module-icon"><mat-icon>{{item.icon}}</mat-icon></div>
            <div class="module-label">{{item.label}}</div>
            <div class="module-desc">{{item.description}}</div>
            <button mat-flat-button color="primary" (click)="open(item.route)">
              Abrir <mat-icon iconPositionEnd>arrow_forward</mat-icon>
            </button>
          </div>
        }
      </div>
    } @else {
      <div class="empty">No hay módulos que coincidan con tu búsqueda.</div>
    }
  `,
})
export class HomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly search = signal('');

  readonly items = computed(() => {
    const q = this.search().trim().toLowerCase();
    return NAV_ITEMS
      .filter(i => this.auth.canAccessModule(i.key))
      .filter(i => !q || i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  });

  open(route: string): void {
    this.router.navigate([route]);
  }
}
