import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatCheckboxModule],
  styles: [`
    :host {
      display: flex;
      min-height: 100vh;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%);
    }
    .left-panel {
      display: none;
      flex: 1;
      flex-direction: column;
      justify-content: center;
      padding: 60px;
      color: white;
    }
    @media (min-width: 900px) { .left-panel { display: flex; } }
    .feature-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .feature-icon {
      width: 40px; height: 40px; border-radius: 10px;
      background: rgba(99,102,241,0.3);
      display: flex; align-items: center; justify-content: center;
      color: #a5b4fc; flex-shrink: 0;
    }
    .right-panel {
      display: flex; align-items: center; justify-content: center;
      padding: 24px; min-width: 380px;
    }
    @media (max-width: 900px) { .right-panel { width: 100%; min-width: 0; } }
    .login-card {
      position: relative;
      background: var(--paper);
      border: 1px solid var(--border);
      border-left: 9px solid var(--stripe);
      border-radius: 20px;
      padding: 40px;
      width: 100%; max-width: 400px;
      box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.45);
      overflow: hidden;
    }
    .login-card::before {
      content: '';
      position: absolute; inset: 0;
      background-image: repeating-linear-gradient(to bottom, transparent 0 35px, rgba(99,102,241,.05) 35px 36px);
      pointer-events: none;
    }
    .login-card > * { position: relative; }
    .logo-circle {
      width: 56px; height: 56px; border-radius: 14px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 20px; color: white;
    }
    h2 { font-family: 'Nunito', sans-serif; color: var(--ink); font-size: 26px; font-weight: 600; margin: 0 0 6px; }
    .subtitle { color: var(--muted-strong); font-size: 14px; margin: 0 0 28px; }
    .field-wrap { margin-bottom: 16px; }
    .field-wrap mat-form-field { width: 100%; }
    .error-box {
      background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
      padding: 10px 14px; color: #b91c1c; font-size: 13px; margin-bottom: 16px;
    }
    .submit-btn {
      width: 100%; height: 48px;
      font-size: 15px !important; font-weight: 600 !important; letter-spacing: 0 !important;
      border-radius: 12px !important;
      background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
    }

    /* Overlay pizarrón — posición absoluta (alta especificidad para ganar a .login-card > *) */
    .login-card .chalk-overlay {
      position: absolute;
      inset: 0;
      z-index: 50;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0;
    }

    /* Éxito: abrir cuaderno — pivota desde el lomo (borde rojo = borde izquierdo) */
    .login-card.anim-open {
      transform-origin: left center;
      animation: notebook-open 650ms cubic-bezier(0.4, 0, 0.6, 1) forwards;
      pointer-events: none;
    }
    @keyframes notebook-open {
      0%   { transform: perspective(1200px) rotateY(0deg); opacity: 1;
             box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.45); }
      20%  { transform: perspective(1200px) rotateY(-12deg) translateZ(10px);
             box-shadow: 0 35px 60px -8px rgb(0 0 0 / 0.55); }
      70%  { transform: perspective(1200px) rotateY(-80deg); opacity: 0.7;
             box-shadow: 0 8px 16px -8px rgb(0 0 0 / 0.2); }
      100% { transform: perspective(1200px) rotateY(-90deg); opacity: 0;
             box-shadow: none; }
    }

    /* Error: sacudida + barrido de borrador */
    .login-card.anim-erase {
      animation: card-shake 600ms ease-in-out;
    }
    @keyframes card-shake {
      0%, 100% { transform: translateX(0) rotate(0deg); }
      12%  { transform: translateX(-7px) rotate(-0.5deg); }
      28%  { transform: translateX(5px) rotate(0.4deg); }
      45%  { transform: translateX(-4px) rotate(-0.3deg); }
      62%  { transform: translateX(3px) rotate(0.2deg); }
      78%  { transform: translateX(-1px); }
    }
    .login-card.anim-erase .chalk-overlay {
      background: linear-gradient(
        104deg,
        rgba(33, 52, 40, 0)    0%,
        rgba(33, 52, 40, 0.92) 10%,
        rgba(42, 65, 50, 0.96) 40%,
        rgba(42, 65, 50, 0.96) 60%,
        rgba(33, 52, 40, 0.92) 90%,
        rgba(33, 52, 40, 0)    100%
      );
      animation: chalk-sweep 750ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
    }
    @keyframes chalk-sweep {
      0%   { opacity: 0.95; transform: translateX(-105%); }
      40%  { transform: translateX(0%); opacity: 0.95; }
      60%  { transform: translateX(0%); opacity: 0.90; }
      100% { transform: translateX(105%); opacity: 0; }
    }

    /* Accesibilidad: sin movimiento */
    @media (prefers-reduced-motion: reduce) {
      .login-card.anim-open { animation: none; opacity: 0; transition: opacity 150ms ease; }
      .login-card.anim-erase, .login-card.anim-erase .chalk-overlay { animation: none !important; }
    }
  `],
  template: `
    <div class="left-panel">
      <div style="margin-bottom:48px">
        <div style="font-size:28px;font-weight:700;margin-bottom:8px">Sistema de Asistencia</div>
        <div style="color:#94a3b8;font-size:16px">Sistema de gestión de asistencia escolar</div>
      </div>
      @for (f of features; track f.label) {
        <div class="feature-item">
          <div class="feature-icon"><mat-icon>{{f.icon}}</mat-icon></div>
          <div>
            <div style="font-weight:600;font-size:15px">{{f.label}}</div>
            <div style="color:#94a3b8;font-size:13px">{{f.desc}}</div>
          </div>
        </div>
      }
    </div>

    <div class="right-panel">
      <div class="login-card"
           [class.anim-open]="loginSuccess()"
           [class.anim-erase]="showEraseAnim()">
        <div class="chalk-overlay" aria-hidden="true"></div>
        <div class="logo-circle"><mat-icon style="font-size:28px;width:28px;height:28px">school</mat-icon></div>
        <h2>Bienvenido</h2>
        <p class="subtitle">Ingresa tus credenciales para continuar</p>
        <form (ngSubmit)="onLogin()">
          <div class="field-wrap">
            <mat-form-field appearance="outline">
              <mat-label>Usuario</mat-label>
              <mat-icon matPrefix style="color:#94a3b8;margin-right:4px">person_outline</mat-icon>
              <input matInput [(ngModel)]="username" name="username" required autocomplete="username">
            </mat-form-field>
          </div>
          <div class="field-wrap">
            <mat-form-field appearance="outline">
              <mat-label>Contraseña</mat-label>
              <mat-icon matPrefix style="color:#94a3b8;margin-right:4px">lock_outline</mat-icon>
              <input matInput [(ngModel)]="password" name="password"
                     [type]="showPass() ? 'text' : 'password'"
                     required autocomplete="current-password">
              <button mat-icon-button matSuffix type="button" (click)="showPass.set(!showPass())" style="color:#94a3b8">
                <mat-icon>{{showPass() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
            </mat-form-field>
          </div>
          <div class="field-wrap" style="margin-bottom:8px">
            <mat-checkbox [(ngModel)]="rememberMe" name="rememberMe">Recuérdame</mat-checkbox>
          </div>
          @if (error()) {
            <div class="error-box">{{error()}}</div>
          }
          <button mat-flat-button color="primary" type="submit" class="submit-btn" [disabled]="loading()">
            @if (loading()) {
              <mat-spinner diameter="20" style="display:inline-block;margin-right:8px;vertical-align:middle"></mat-spinner>
            }
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  username = '';
  password = '';
  rememberMe = true;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPass = signal(false);
  readonly loginSuccess = signal(false);
  readonly showEraseAnim = signal(false);

  readonly features = [
    { icon: 'photo_camera', label: 'Registro por foto', desc: 'IA detecta inasistencias desde fotos de lista' },
    { icon: 'bar_chart',    label: 'Dashboard en tiempo real', desc: 'Estadísticas y reportes por curso y período' },
    { icon: 'task_alt',     label: 'Justificaciones', desc: 'Gestión de justificaciones con trazabilidad' },
    { icon: 'download',     label: 'Exportación Excel', desc: 'Reportes listos para entregar a DECE' },
  ];

  async onLogin(): Promise<void> {
    if (!this.username || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    let success = false;
    try {
      await this.auth.loginSetup(this.username, this.password, this.rememberMe);
      success = true;
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Usuario o contraseña incorrectos');
      this.showEraseAnim.set(true);
      setTimeout(() => this.showEraseAnim.set(false), 950);
    } finally {
      this.loading.set(false);
    }
    if (success) {
      this.loginSuccess.set(true);
      await new Promise<void>(r => setTimeout(r, 650));
      this.router.navigate(['/home']);
    }
  }
}
