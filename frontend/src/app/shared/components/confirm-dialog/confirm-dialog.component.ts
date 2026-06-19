import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  icon?: string;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  styles: [`
    :host { display: block; position: relative; padding: 24px; min-width: 360px; }
    .header { display: flex; align-items: flex-start; gap: 16px; }
    .icon-box {
      width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
      background: #fef2f2; color: #b91c1c;
      display: flex; align-items: center; justify-content: center;
    }
    .title { font-family: 'Nunito', sans-serif; font-size: 19px; font-weight: 700; color: var(--ink); margin: 0 0 6px; }
    .message { color: var(--ink-soft); font-size: 14px; line-height: 1.5; }
    .close-btn { position: absolute; top: 12px; right: 12px; color: var(--muted-strong); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
  `],
  template: `
    <button mat-icon-button class="close-btn" [mat-dialog-close]="false"><mat-icon>close</mat-icon></button>
    <div class="header">
      <div class="icon-box"><mat-icon>{{data.icon ?? 'delete_outline'}}</mat-icon></div>
      <div>
        <p class="title">{{data.title}}</p>
        <p class="message">{{data.message}}</p>
      </div>
    </div>
    <div class="actions">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">{{data.confirmLabel ?? 'Eliminar'}}</button>
    </div>
  `,
})
export class ConfirmDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  readonly data: ConfirmDialogData = inject(MAT_DIALOG_DATA);
}
