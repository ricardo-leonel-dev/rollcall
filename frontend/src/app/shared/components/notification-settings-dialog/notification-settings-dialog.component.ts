import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

export const DEFAULT_NOTIFICATION_TEMPLATE =
  'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
  styles: [`
    .placeholders { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 16px; }
    .ph-chip {
      font-family: monospace; font-size: 11px; padding: 3px 8px; border-radius: 6px;
      background: var(--accent-soft); color: #4f46e5; cursor: pointer; border: none;
    }
    .ph-chip:hover { background: #c7d2fe; }
    textarea { width: 100%; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Fraunces',serif">Mensaje de notificación</h2>
    <mat-dialog-content>
      <p style="font-size:13px;color:var(--muted-strong);margin-top:0">
        Este mensaje se usa al notificar por WhatsApp a un representante sobre una falta o atraso. Es personal — solo aplica a tu cuenta.
      </p>
      <div class="placeholders">
        @for (ph of placeholders; track ph) {
          <button type="button" class="ph-chip" (click)="insert(ph)">{{ph}}</button>
        }
      </div>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Plantilla</mat-label>
        <textarea matInput rows="5" [(ngModel)]="template" #ta></textarea>
      </mat-form-field>
      @if (template().trim()) {
        <div style="margin-top:12px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Vista previa</div>
          <div style="background:var(--paper-deep);border:1px solid var(--border-soft);border-radius:10px;padding:12px;font-size:13px;color:var(--ink-soft)">
            {{preview()}}
          </div>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">Guardar</button>
    </mat-dialog-actions>
  `,
})
export class NotificationSettingsDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<NotificationSettingsDialogComponent>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly template = signal('');
  readonly saving = signal(false);

  readonly placeholders = ['{{nombre}}', '{{fecha}}', '{{tipo}}', '{{curso}}'];

  readonly preview = () => this.template()
    .replace(/\{\{nombre\}\}/g, 'JUAN PÉREZ')
    .replace(/\{\{fecha\}\}/g, '2026-06-17')
    .replace(/\{\{tipo\}\}/g, 'una falta')
    .replace(/\{\{curso\}\}/g, 'OCTAVO "A"');

  async ngOnInit(): Promise<void> {
    const me = await firstValueFrom(this.http.get<{ notificationTemplate: string | null }>('/api/auth/me'));
    this.template.set(me.notificationTemplate || DEFAULT_NOTIFICATION_TEMPLATE);
  }

  insert(placeholder: string): void {
    this.template.update(t => t + (t.endsWith(' ') || !t ? '' : ' ') + placeholder);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.http.put('/api/auth/me', { notificationTemplate: this.template() }));
      this.snack.open('Mensaje guardado', '', { duration: 2000 });
      this.dialogRef.close(this.template());
    } finally { this.saving.set(false); }
  }
}
