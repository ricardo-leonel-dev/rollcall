import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  styles: [`
    .wrap { padding: 4px 4px 0; display: flex; flex-direction: column; gap: 16px; max-width: 360px; }
    .head { display: flex; align-items: flex-start; gap: 12px; }
    .icon-circle {
      width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
      background: #fef3c7; color: #b45309;
      display: flex; align-items: center; justify-content: center;
    }
    .icon-circle mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .title { font-family: 'Nunito', sans-serif; font-size: 18px; font-weight: 700; color: var(--ink); margin: 0; }
    .message { font-size: 14px; line-height: 1.5; color: var(--muted-strong); margin: 0; }
    .actions { display: flex; flex-direction: column; gap: 8px; }
    .actions button { width: 100%; }
  `],
  template: `
    <div class="wrap">
      <div class="head">
        <div class="icon-circle">
          <mat-icon>warning_amber</mat-icon>
        </div>
        <div>
          <h2 class="title">Tienes cambios sin guardar</h2>
          <p class="message">Tienes cambios sin guardar en tu perfil. ¿Quieres guardarlos antes de salir?</p>
        </div>
      </div>
      <div class="actions">
        <button mat-flat-button color="primary" (click)="dialogRef.close('save')">Guardar y salir</button>
        <button mat-stroked-button color="warn" (click)="dialogRef.close('discard')">Descartar cambios</button>
        <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      </div>
    </div>
  `,
})
export class UnsavedChangesDialogComponent {
  readonly dialogRef = inject(MatDialogRef<UnsavedChangesDialogComponent>);
}