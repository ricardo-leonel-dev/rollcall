import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * 'Seal' avatar for the Cuaderno redesign (feature 29).
 *
 * Visual: a circular avatar with a double ring (inner border 2px on `--paper`,
 * outer outline 1.5px on `--border-soft` offset 2px) wrapping the existing
 * accent → accent-2 gradient. Falls back to initials or a Material icon when
 * no image is provided.
 *
 * Replaces the rectangular avatars previously scattered across screens
 * (layout user area, admin user/institution rows, students, profile).
 *
 * Acceptance (feature 29):
 *  - Same accent → accent-2 gradient as before.
 *  - Double ring: 2px paper border + 1.5px border-soft outline (offset 2px).
 *  - Fallback to initials when no `src` / `icon` is provided.
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  selector: 'app-seal-avatar',
  styles: [`
    :host { display: inline-flex; }

    .seal {
      width: var(--seal-size, 36px);
      height: var(--seal-size, 36px);
      border-radius: 50%;
      /* Inner ring: 2px on the paper color so it blends with the surface the
         avatar sits on, giving a "punched out" feel. */
      border: 2px solid var(--paper);
      /* Outer ring: 1.5px on border-soft with a 2px gap — this is what makes
         the seal read as a double ring instead of a single thick border. */
      outline: 1.5px solid var(--border-soft);
      outline-offset: 2px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Nunito', sans-serif;
      font-size: calc(var(--seal-size, 36px) * 0.4);
      font-weight: 700;
      flex-shrink: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    .seal img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .seal mat-icon {
      font-size: calc(var(--seal-size, 36px) * 0.5);
      width: calc(var(--seal-size, 36px) * 0.5);
      height: calc(var(--seal-size, 36px) * 0.5);
    }

    /* When the avatar is rendered on a dark surface (e.g. the sidebar), the
       inner ring still needs to be the surface color, not the page paper.
       The component sets surface=dark via the [surface] input. */
    .seal.surface-dark {
      border-color: var(--paper-deep);
    }
  `],
  template: `
    <div class="seal"
         [class.surface-dark]="surface === 'dark'"
         [style.--seal-size]="size + 'px'"
         [style.background]="bgColor || null">
      @if (src) {
        <img [src]="src" [alt]="alt">
      } @else if (icon) {
        <mat-icon>{{ icon }}</mat-icon>
      } @else if (initials) {
        <span>{{ initials }}</span>
      }
    </div>
  `,
})
export class SealAvatarComponent {
  /** Diameter in pixels (the double ring adds ~7px to the visible footprint). */
  @Input() size = 36;
  /** Optional image URL. When set, takes precedence over `icon` and `initials`. */
  @Input() src: string | null = null;
  /** Optional Material icon name (rendered on the gradient when no image). */
  @Input() icon: string | null = null;
  /** Fallback initials (1–2 chars). Used when no `src` / `icon` provided. */
  @Input() initials: string | null = null;
  /**
   * Override for the gradient background. Defaults to the accent → accent-2
   * gradient. Pass `transparent` (or omit) when the image fills the seal.
   */
  @Input() bgColor: string | null = null;
  /** Surface tone — `'dark'` adjusts the inner ring color for dark surfaces. */
  @Input() surface: 'light' | 'dark' = 'light';
  /** Accessible alt for the image (no effect on initials/icon modes). */
  @Input() alt = '';
}
