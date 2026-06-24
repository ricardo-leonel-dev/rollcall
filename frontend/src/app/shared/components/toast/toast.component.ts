import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarRef, MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { WhatsappIconComponent } from '../whatsapp-icon/whatsapp-icon.component';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  type: ToastType;
  message: string;
  actionLabel?: string;
  actionIcon?: 'whatsapp';
  onAction?: () => void;
}

const ICON: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, WhatsappIconComponent],
  host: {
    '[class]': '"toast-" + data.type',
  },
  styles: [`
    :host {
      display: flex; align-items: center; gap: 12px; min-width: 320px; max-width: 480px;
      background: var(--paper); border: 1px solid var(--border); border-radius: 12px;
      border-left: 4px solid var(--toast-color); padding: 12px 14px;
      box-shadow: 0 8px 24px -4px rgba(0,0,0,.18);
    }
    :host.toast-success { --toast-color: #15803d; }
    :host.toast-error   { --toast-color: #b91c1c; }
    :host.toast-warning  { --toast-color: #92400e; }
    :host.toast-info     { --toast-color: var(--accent); }
    .chip {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 28px; height: 28px; border-radius: 999px;
      background: var(--toast-color); color: #fff;
    }
    .chip mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .message { flex: 1; font-size: 14px; font-weight: 600; color: var(--ink); }
    .action-btn {
      display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
      background: var(--toast-color); color: #fff; border: none; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .close-btn { color: var(--muted-strong); flex-shrink: 0; }
  `],
  template: `
    <div class="chip"><mat-icon>{{ icon }}</mat-icon></div>
    <span class="message">{{ data.message }}</span>
    @if (data.onAction && data.actionLabel) {
      <button class="action-btn" (click)="action()">
        @if (data.actionIcon === 'whatsapp') { <app-whatsapp-icon [size]="16" /> }
        {{ data.actionLabel }}
      </button>
    }
    <button mat-icon-button class="close-btn" (click)="ref.dismiss()" aria-label="Cerrar">
      <mat-icon>close</mat-icon>
    </button>
  `,
})
export class ToastComponent {
  ref = inject(MatSnackBarRef<ToastComponent>);
  data: ToastData = inject(MAT_SNACK_BAR_DATA);

  get icon(): string {
    return ICON[this.data.type];
  }

  action(): void {
    this.data.onAction?.();
    this.ref.dismiss();
  }
}
