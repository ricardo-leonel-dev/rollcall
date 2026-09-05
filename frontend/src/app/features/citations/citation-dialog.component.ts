import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { firstValueFrom, retry } from 'rxjs';
import { Citation, CitationReason } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';
import { citationReasonSeverityBadgeClass } from '../../shared/utils/citation-reason.util';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

export interface CitationDialogData {
  enrollmentId: number;
  studentName: string;
  whatsappLink: string | null;
  pendingCitations: Citation[];
  citation?: Citation;
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_MB = 8;
const MAX_FILES = 5;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
            MatButtonModule, MatIconModule, MatDatepickerModule],
  styles: [`
    mat-form-field { width: 100%; }
    .date-row { display: flex; gap: 12px; }
    .date-row mat-form-field { flex: 1; }
    .time-row { display: flex; gap: 12px; align-items: flex-start; }
    .time-row mat-form-field.time-field { width: 50%; flex: none; }
    .reason-option-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .reason-option-row span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; font-weight: 600; }

    .pending-banner {
      background: #fef9c3; color: #92400e;
      border: 1px solid #fde68a; border-radius: 10px;
      padding: 10px 14px; margin-bottom: 14px; font-size: 13px;
    }
    .pending-banner-title { font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
    .pending-banner-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding-left: 18px; }
    .pending-banner-list li { font-size: 12px; color: #78350f; }

    /* Evidence zone/row/tile/remove — same recipe as
       justification-create-dialog.component.ts, applied to a flat pendingFiles
       array rather than per-step. */
    .evidence-zone {
      border: 1.5px dashed var(--border);
      border-radius: 14px;
      padding: 14px;
      text-align: center;
      cursor: pointer;
      color: var(--muted-strong);
      transition: border-color .15s ease, background-color .15s ease;
    }
    .evidence-zone:hover { border-color: var(--accent); background: var(--accent-soft); }
    .evidence-zone mat-icon { font-size: 24px; width: 24px; height: 24px; color: var(--border); margin-bottom: 2px; }
    .evidence-zone-label { font-weight: 700; font-size: 13px; color: var(--ink-soft); }
    .evidence-zone-hint { font-size: 11px; margin-top: 2px; }

    .evidence-row { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 14px; padding: 4px; }
    .evidence-tile {
      position: relative;
      width: 64px; height: 64px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px;
      box-shadow: 0 2px 6px rgba(15, 23, 42, .14);
      transform: rotate(var(--r, 0deg));
      transition: transform .15s ease;
    }
    .evidence-tile:hover { transform: rotate(0deg) scale(1.08); z-index: 2; }
    .evidence-tile img { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; display: block; }
    .evidence-tile-doc {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; background: var(--paper-deep); border-style: dashed; border-color: var(--muted);
    }
    .evidence-tile-doc mat-icon { font-size: 20px; width: 20px; height: 20px; color: var(--muted-strong); }
    .evidence-tile-doc span {
      display: block; max-width: 54px; font-size: 9px; color: var(--muted-strong);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px;
    }
    .evidence-remove {
      position: absolute; top: -8px; right: -8px;
      width: 20px; height: 20px; border-radius: 50%;
      background: #fff; border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; padding: 0;
    }
    .evidence-remove mat-icon { font-size: 12px; width: 12px; height: 12px; color: #b91c1c; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{isEdit ? 'Editar citación' : 'Agendar citación'}}</h2>
    <mat-dialog-content>
      <div style="font-size:13px;color:var(--muted-strong);margin-bottom:12px">{{data.studentName}}</div>

      @if (!isEdit && data.pendingCitations.length) {
        <div class="pending-banner">
          <div class="pending-banner-title">
            <mat-icon style="font-size:16px;width:16px;height:16px">warning</mat-icon>
            Este estudiante ya tiene citaciones pendientes
          </div>
          <ul class="pending-banner-list">
            @for (c of data.pendingCitations; track c.id) {
              <li>
                {{c.dateFrom === c.dateTo ? c.dateFrom : c.dateFrom + ' – ' + c.dateTo}}
                @if (c.time) { · {{c.time}} }
              </li>
            }
          </ul>
        </div>
      }

      <div class="date-row">
        <mat-form-field appearance="outline">
          <mat-label>Desde</mat-label>
          <input matInput [matDatepicker]="pickerFrom" [(ngModel)]="dateFrom">
          <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
          <mat-datepicker #pickerFrom></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hasta</mat-label>
          <input matInput [matDatepicker]="pickerTo" [(ngModel)]="dateTo">
          <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
          <mat-datepicker #pickerTo></mat-datepicker>
        </mat-form-field>
      </div>

      <div class="time-row">
        <mat-form-field appearance="outline" class="time-field">
          <mat-label>Hora (opcional)</mat-label>
          <input matInput type="time" [(ngModel)]="time">
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline">
        <mat-label>Motivos</mat-label>
        <mat-select multiple [(ngModel)]="reasonIds">
          @for (r of reasons(); track r.id) {
            <mat-option [value]="r.id">
              <div class="reason-option-row">
                <span [class]="citationReasonSeverityBadgeClass(r.severity)" class="badge">{{r.severity === 'low' ? 'Bajo' : r.severity === 'medium' ? 'Medio' : 'Alto'}}</span>
                <span>{{r.name}}</span>
              </div>
            </mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Observaciones</mat-label>
        <textarea matInput rows="3" [(ngModel)]="observations" placeholder="Opcional"></textarea>
      </mat-form-field>

      <input type="file" #fileInput hidden multiple
             accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx"
             (change)="onFilesSelected($event)">
      <div class="evidence-zone" (click)="fileInput.click()">
        <mat-icon>cloud_upload</mat-icon>
        <div class="evidence-zone-label">Adjuntar evidencia</div>
        <div class="evidence-zone-hint">Foto, PDF o Word — hasta {{MAX_FILES}} archivos</div>
      </div>
      @if (pendingFiles.length) {
        <div class="evidence-row">
          @for (f of pendingFiles; track f.name) {
            @if (f.type.startsWith('image/')) {
              <div class="evidence-tile" [style.--r.deg]="rotationFor(f.name)">
                <img [src]="previewUrl(f)">
                <button class="evidence-remove" (click)="removeFile(f)"><mat-icon>close</mat-icon></button>
              </div>
            } @else {
              <div class="evidence-tile evidence-tile-doc" [style.--r.deg]="rotationFor(f.name)">
                <mat-icon>description</mat-icon>
                <span>{{f.name}}</span>
                <button class="evidence-remove" (click)="removeFile(f)"><mat-icon>close</mat-icon></button>
              </div>
            }
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [disabled]="saving()" (click)="dialogRef.close(false)">Cancelar</button>
      @if (isEdit && data.citation!.status === 'pending') {
        <button mat-stroked-button color="warn" [disabled]="saving()" (click)="closeCitation()">Cerrar citación</button>
      }
      <button mat-flat-button color="primary" [disabled]="!canSave || saving()" (click)="save()">
        {{isEdit ? 'Guardar' : 'Guardar'}}
      </button>
    </mat-dialog-actions>
  `,
})
export class CitationDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<CitationDialogComponent, boolean>);
  readonly data: CitationDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly isEdit = !!this.data.citation;
  readonly reasons = signal<CitationReason[]>([]);
  readonly saving = signal(false);

  readonly MAX_FILES = MAX_FILES;
  readonly citationReasonSeverityBadgeClass = citationReasonSeverityBadgeClass;

  dateFrom: Date | null = this.data.citation ? dateStringToDate(this.data.citation.dateFrom) : new Date();
  dateTo: Date | null = this.data.citation ? dateStringToDate(this.data.citation.dateTo) : new Date();
  time = this.data.citation?.time ?? '';
  observations = this.data.citation?.observations ?? '';
  reasonIds: number[] = this.data.citation?.reasonIds ?? [];
  pendingFiles: File[] = [];

  private readonly previewUrls = new WeakMap<File, string>();

  async ngOnInit(): Promise<void> {
    try {
      const reasons = await firstValueFrom(this.http.get<CitationReason[]>('/api/citation-reasons'));
      this.reasons.set(reasons);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudieron cargar los motivos');
    }
  }

  get canSave(): boolean {
    return this.reasonIds.length > 0
      && !!this.dateFrom && !!this.dateTo
      && dateToDateString(this.dateFrom) <= dateToDateString(this.dateTo);
  }

  previewUrl(file: File): string {
    let url = this.previewUrls.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      this.previewUrls.set(file, url);
    }
    return url;
  }

  rotationFor(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return (Math.abs(hash) % 9) - 4;
  }

  onFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const valid: File[] = [];
    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        this.notify.warning(`${f.name}: tipo no permitido`);
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        this.notify.warning(`${f.name}: supera ${MAX_FILE_MB}MB`);
        continue;
      }
      valid.push(f);
    }
    this.pendingFiles = [...this.pendingFiles, ...valid].slice(0, MAX_FILES);
  }

  removeFile(file: File): void {
    this.pendingFiles = this.pendingFiles.filter(f => f !== file);
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;
    this.saving.set(true);
    const payload = {
      enrollmentId: this.data.enrollmentId,
      dateFrom: dateToDateString(this.dateFrom),
      dateTo: dateToDateString(this.dateTo),
      time: this.time || null,
      observations: this.observations.trim() || null,
      reasonIds: this.reasonIds,
    };
    try {
      const saved = this.isEdit
        ? await firstValueFrom(this.http.put<Citation>(`/api/citations/${this.data.citation!.id}`, payload))
        : await firstValueFrom(this.http.post<Citation>('/api/citations', payload));
      if (this.pendingFiles.length) {
        try {
          const fd = new FormData();
          for (const f of this.pendingFiles) fd.append('files', f);
          await firstValueFrom(
            this.http.post(`/api/citations/${saved.id}/attachments`, fd).pipe(retry({ count: 2, delay: 2000 })),
          );
        } catch {
          this.notify.warning('La citación se guardó, pero la evidencia no se pudo subir');
        }
      }
      this.notify.success(this.isEdit ? 'Citación actualizada' : 'Citación creada');
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar la citación');
    } finally {
      this.saving.set(false);
    }
  }

  closeCitation(): void {
    if (this.saving()) return;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Cerrar citación',
        message: '¿Cerrar esta citación? Ya no podrá reabrirse desde aquí.',
        confirmLabel: 'Cerrar citación',
        icon: 'event_busy',
      },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      this.saving.set(true);
      try {
        await firstValueFrom(this.http.put(`/api/citations/${this.data.citation!.id}/close`, {}));
        this.notify.success('Citación cerrada');
        this.dialogRef.close(true);
      } catch (err: any) {
        this.notify.error(err?.error?.error ?? 'No se pudo cerrar la citación');
      } finally {
        this.saving.set(false);
      }
    });
  }
}
