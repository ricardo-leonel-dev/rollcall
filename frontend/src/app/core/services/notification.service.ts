import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { ToastComponent, ToastData, ToastType } from '../../shared/components/toast/toast.component';

export interface NotifyOptions {
  duration?: number;
  actionLabel?: string;
  actionIcon?: 'whatsapp';
  onAction?: () => void;
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2000,
  warning: 3000,
  error: 4000,
  info: 4000,
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string, opts?: NotifyOptions): MatSnackBarRef<ToastComponent> {
    return this.show('success', message, opts);
  }

  error(message: string, opts?: NotifyOptions): MatSnackBarRef<ToastComponent> {
    return this.show('error', message, opts);
  }

  warning(message: string, opts?: NotifyOptions): MatSnackBarRef<ToastComponent> {
    return this.show('warning', message, opts);
  }

  info(message: string, opts?: NotifyOptions): MatSnackBarRef<ToastComponent> {
    return this.show('info', message, opts);
  }

  private show(type: ToastType, message: string, opts?: NotifyOptions): MatSnackBarRef<ToastComponent> {
    const data: ToastData = {
      type,
      message,
      actionLabel: opts?.actionLabel,
      actionIcon: opts?.actionIcon,
      onAction: opts?.onAction,
    };
    return this.snackBar.openFromComponent(ToastComponent, {
      duration: opts?.duration ?? DEFAULT_DURATION[type],
      panelClass: 'app-toast-panel',
      politeness: type === 'error' || type === 'warning' ? 'assertive' : 'polite',
      data,
    });
  }
}
