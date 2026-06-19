import { Component, ChangeDetectionStrategy, Inject } from '@angular/core';
import { MatSnackBarRef, MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WhatsappIconComponent } from '../whatsapp-icon/whatsapp-icon.component';

export interface AbsenceSavedSnackbarData {
  message: string;
  onNotify?: () => void;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, WhatsappIconComponent],
  styles: [`
    :host {
      display: flex; align-items: center; gap: 12px; min-width: 320px;
      background: var(--paper); border: 1px solid var(--border); border-radius: 12px;
      padding: 12px 16px; box-shadow: 0 8px 24px -4px rgba(0,0,0,.18);
    }
    .icon { color: #16a34a; flex-shrink: 0; }
    .message { flex: 1; font-size: 14px; font-weight: 500; }
    .notify-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: #16a34a; color: white; border: none; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; flex-shrink: 0;
      white-space: nowrap;
    }
    .close-btn { color: var(--muted-strong); flex-shrink: 0; }
  `],
  template: `
    <mat-icon class="icon">check_circle</mat-icon>
    <span class="message">{{data.message}}</span>
    @if (data.onNotify) {
      <button class="notify-btn" (click)="notify()">
        <app-whatsapp-icon [size]="16" />
        Enviar WhatsApp
      </button>
    }
    <button mat-icon-button class="close-btn" (click)="ref.dismiss()">
      <mat-icon>close</mat-icon>
    </button>
  `,
})
export class AbsenceSavedSnackbarComponent {
  constructor(
    public ref: MatSnackBarRef<AbsenceSavedSnackbarComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: AbsenceSavedSnackbarData,
  ) {}

  notify(): void {
    this.data.onNotify?.();
    this.ref.dismiss();
  }
}
