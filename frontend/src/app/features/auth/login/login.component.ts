import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatProgressSpinnerModule, MatIconModule,
  ],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <mat-card class="w-full max-w-sm">
        <mat-card-header class="justify-center pb-4">
          <div class="text-center">
            <mat-icon class="text-blue-600 text-5xl" style="font-size:48px;width:48px;height:48px">school</mat-icon>
            <mat-card-title class="mt-2">Sistema de Asistencia</mat-card-title>
            <mat-card-subtitle>Unidad Educativa Tia Blanquita</mat-card-subtitle>
          </div>
        </mat-card-header>

        <mat-card-content>
          <form (ngSubmit)="onLogin()" class="flex flex-col gap-3">
            <mat-form-field appearance="outline">
              <mat-label>Usuario</mat-label>
              <mat-icon matPrefix>person</mat-icon>
              <input matInput [(ngModel)]="username" name="username" required autocomplete="username">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Contraseña</mat-label>
              <mat-icon matPrefix>lock</mat-icon>
              <input matInput [(ngModel)]="password" name="password" [type]="showPass() ? 'text' : 'password'"
                     required autocomplete="current-password">
              <button mat-icon-button matSuffix type="button" (click)="showPass.set(!showPass())">
                <mat-icon>{{showPass() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
            </mat-form-field>

            @if (error()) {
              <div class="text-red-600 text-sm text-center bg-red-50 p-2 rounded">{{error()}}</div>
            }

            <button mat-flat-button color="primary" type="submit" [disabled]="loading()" class="mt-2">
              @if (loading()) { <mat-spinner diameter="20" class="inline-block mr-2"></mat-spinner> }
              Iniciar Sesión
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);

  username = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPass = signal(false);

  async onLogin(): Promise<void> {
    if (!this.username || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username, this.password);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Error al iniciar sesión');
    } finally {
      this.loading.set(false);
    }
  }
}
