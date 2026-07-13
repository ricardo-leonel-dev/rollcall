import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom, retry } from 'rxjs';
import { Absence } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';

export interface JustifyGroup { weekKey: string; absences: Absence[]; }

interface WizardStep {
  weekKey: string;
  absences: Absence[];
  reason: string;
  notifiedBy: string;
  pendingFiles: File[];
}

export interface JustificationCreateDialogData {
  groups: JustifyGroup[];
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_MB = 8;
const MAX_FILES_PER_GROUP = 5;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatStepperModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  styles: [`
    mat-form-field { width: 100%; }
    .step-hint { font-size: 12px; color: var(--muted-strong); margin-bottom: 12px; }
    .step-actions { display: flex; gap: 8px; margin-top: 16px; align-items: center; }

    /* Evidence zone — same dashed drop-zone recipe as .upload-zone (Inasistencias,
       Admin), at a more compact scale to fit inside a single wizard step. */
    .evidence-zone {
      border: 1.5px dashed var(--border);
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      cursor: pointer;
      color: var(--muted-strong);
      transition: border-color .15s ease, background-color .15s ease;
    }
    .evidence-zone:hover { border-color: var(--accent); background: var(--accent-soft); }
    .evidence-zone mat-icon { font-size: 26px; width: 26px; height: 26px; color: var(--border); margin-bottom: 2px; }
    .evidence-zone-label { font-weight: 700; font-size: 13px; color: var(--ink-soft); }
    .evidence-zone-hint { font-size: 11px; margin-top: 2px; }

    /* Evidence tiles — a photo pinned at a slight angle, a document as a
       dashed index card. Same rotated, slightly-imperfect language as the
       .stamp badges elsewhere in the app, applied to the evidence itself. */
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

    .summary-row { padding: 12px 0; border-bottom: 1px dashed var(--border); }
    .summary-row:last-of-type { border-bottom: none; }
    .summary-week { font-weight: 700; color: var(--ink); font-size: 13px; }
    .summary-reason { font-size: 13px; color: var(--muted-strong); margin: 2px 0 6px; }

    /* The signature moment: a justification, once filed, gets "sellada" — a
       literal rubber-stamp impression instead of a quiet success toast. */
    .approval-stamp {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      width: 92px; height: 92px; border-radius: 50%; flex-shrink: 0;
      border: 3px dashed #15803d; color: #15803d;
      font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 11px; letter-spacing: .04em;
      transform: rotate(-9deg);
      animation: stamp-press .45s cubic-bezier(.22, 1.6, .4, 1);
    }
    .approval-stamp mat-icon { font-size: 22px; width: 22px; height: 22px; margin-top: 2px; }
    @keyframes stamp-press {
      0%   { transform: scale(2.4) rotate(-22deg); opacity: 0; }
      55%  { transform: scale(.9) rotate(-5deg); opacity: 1; }
      100% { transform: scale(1) rotate(-9deg); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .approval-stamp { animation: none; }
    }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">Nueva justificación</h2>
    <mat-dialog-content style="min-height:280px">
      <mat-stepper linear #stepper orientation="vertical">
        @for (s of steps(); track s.weekKey) {
          <mat-step [label]="'Semana del ' + s.weekKey">
            <div class="step-hint">{{s.absences.length}} falta(s): {{s.absences.map(a => a.date).join(', ')}}</div>
            <mat-form-field appearance="outline">
              <mat-label>Motivo *</mat-label>
              <textarea matInput rows="3" [(ngModel)]="s.reason"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Quién notificó</mat-label>
              <input matInput [(ngModel)]="s.notifiedBy">
            </mat-form-field>

            <input type="file" #fileInput hidden multiple
                   accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx"
                   (change)="onFilesSelected(s, $event)">
            <div class="evidence-zone" (click)="fileInput.click()">
              <mat-icon>cloud_upload</mat-icon>
              <div class="evidence-zone-label">Adjuntar evidencia</div>
              <div class="evidence-zone-hint">Foto, PDF o Word — hasta {{MAX_FILES_PER_GROUP}} archivos</div>
            </div>
            @if (s.pendingFiles.length) {
              <div class="evidence-row">
                @for (f of s.pendingFiles; track f.name) {
                  @if (f.type.startsWith('image/')) {
                    <div class="evidence-tile" [style.--r.deg]="rotationFor(f.name)">
                      <img [src]="previewUrl(f)">
                      <button class="evidence-remove" (click)="removeFile(s, f)"><mat-icon>close</mat-icon></button>
                    </div>
                  } @else {
                    <div class="evidence-tile evidence-tile-doc" [style.--r.deg]="rotationFor(f.name)">
                      <mat-icon>description</mat-icon>
                      <span>{{f.name}}</span>
                      <button class="evidence-remove" (click)="removeFile(s, f)"><mat-icon>close</mat-icon></button>
                    </div>
                  }
                }
              </div>
            }

            <div class="step-actions">
              @if (!$first) { <button mat-button matStepperPrevious>Atrás</button> }
              <button mat-flat-button color="primary" matStepperNext [disabled]="!s.reason">Continuar</button>
            </div>
          </mat-step>
        }
        <mat-step label="Resumen">
          <div class="step-hint">Revisa antes de guardar:</div>
          @for (s of steps(); track s.weekKey) {
            <div class="summary-row">
              <div class="summary-week">Semana del {{s.weekKey}}</div>
              <div class="summary-reason">{{s.reason || '(sin motivo)'}}</div>
              @if (s.pendingFiles.length) {
                <span class="stamp stamp-j">
                  <mat-icon style="font-size:12px;width:12px;height:12px">attach_file</mat-icon>
                  {{s.pendingFiles.length}} archivo(s)
                </span>
              }
            </div>
          }
          <div class="step-actions">
            @if (justSaved()) {
              <div class="approval-stamp">JUSTIFICADO <mat-icon>check</mat-icon></div>
            } @else {
              <button mat-button matStepperPrevious [disabled]="saving()">Atrás</button>
              <button mat-flat-button color="primary" [disabled]="saving()" (click)="saveAll()">
                <mat-icon>task_alt</mat-icon> Guardar todo
              </button>
            }
          </div>
        </mat-step>
      </mat-stepper>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [disabled]="saving()" (click)="dialogRef.close(false)">Cancelar</button>
    </mat-dialog-actions>
  `,
})
export class JustificationCreateDialogComponent {
  readonly dialogRef = inject(MatDialogRef<JustificationCreateDialogComponent, boolean>);
  readonly data: JustificationCreateDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  readonly MAX_FILES_PER_GROUP = MAX_FILES_PER_GROUP;
  readonly steps = signal<WizardStep[]>(
    this.data.groups.map(g => ({ weekKey: g.weekKey, absences: g.absences, reason: '', notifiedBy: '', pendingFiles: [] }))
  );
  readonly saving = signal(false);
  readonly justSaved = signal(false);

  private readonly previewUrls = new WeakMap<File, string>();

  previewUrl(file: File): string {
    let url = this.previewUrls.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      this.previewUrls.set(file, url);
    }
    return url;
  }

  // Deterministic pseudo-random tilt per filename — evidence reads as
  // loosely pinned rather than perfectly aligned, without jittering on
  // every re-render.
  rotationFor(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return (Math.abs(hash) % 9) - 4;
  }

  onFilesSelected(step: WizardStep, ev: Event): void {
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
    step.pendingFiles = [...step.pendingFiles, ...valid].slice(0, MAX_FILES_PER_GROUP);
    this.steps.update(s => [...s]);
  }

  removeFile(step: WizardStep, file: File): void {
    step.pendingFiles = step.pendingFiles.filter(f => f !== file);
    this.steps.update(s => [...s]);
  }

  async saveAll(): Promise<void> {
    this.saving.set(true);
    let okCount = 0;
    const errors: string[] = [];
    for (const s of this.steps()) {
      try {
        const created = await firstValueFrom(this.http.post<{ id: number }>('/api/justifications', {
          enrollmentId: s.absences[0].enrollmentId,
          reason: s.reason,
          notifiedBy: s.notifiedBy || null,
          absenceIds: s.absences.map(a => a.id),
        }));
        okCount++;
        if (s.pendingFiles.length) {
          const fd = new FormData();
          for (const f of s.pendingFiles) fd.append('files', f);
          await firstValueFrom(
            this.http.post(`/api/justifications/${created.id}/attachments`, fd).pipe(
              retry({ count: 2, delay: 2000 }),
            ),
          );
        }
      } catch (err: any) {
        errors.push(`Semana del ${s.weekKey}: ${err?.error?.error ?? 'error'}`);
      }
    }

    if (errors.length === 0 && okCount > 0) {
      this.justSaved.set(true);
      await new Promise(r => setTimeout(r, 650));
      this.notify.success(`${okCount} justificación(es) creada(s)`, { duration: 4000 });
    } else {
      this.notify.warning(`${okCount} creada(s), ${errors.length} con error`, { duration: 4000 });
    }
    this.saving.set(false);
    this.dialogRef.close(okCount > 0);
  }
}
