import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Chapter header pattern for the 'Cuaderno institucional' redesign.
 *
 * Anatomy:
 *   eyebrow  — optional icon · eyebrowPrefix · eyebrowSeparator · eyebrowSuffix
 *   h1       — optional main title (Nunito, ink)
 *   filete   — two horizontal rules below the title:
 *              • top: ink at .55 opacity (warm thin line)
 *              • bottom: --border (slightly cooler thin line, same color as cards)
 *
 * Acceptance (feature 29):
 *  - Reusable without duplicating markup in every screen.
 *  - No new fonts (Nunito only); no changes to .badge-F/.badge-AT/.badge-J.
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  selector: 'app-chapter-header',
  styles: [`
    :host { display: block; }

    .chapter-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 24px;
    }

    .chapter-eyebrow {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Nunito', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted-strong);
    }
    .chapter-eyebrow mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--accent);
      flex-shrink: 0;
    }
    .chapter-roman {
      color: var(--ink);
      font-weight: 800;
    }
    .chapter-sep {
      color: var(--border);
      font-weight: 700;
    }
    .chapter-sub {
      color: var(--muted-strong);
      font-weight: 700;
    }

    .chapter-title {
      font-family: 'Nunito', sans-serif;
      color: var(--ink);
      font-size: 30px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.15;
      margin: 0;
    }

    .chapter-filete {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-top: 4px;
    }
    /* Top rule: warm ink at .55 opacity — sits above the cards' border line
       so it reads as a subtle accent rather than a separator. */
    .chapter-filete .filete-ink {
      height: 1px;
      background: var(--ink);
      opacity: .55;
    }
    /* Bottom rule: same hue as --border so it visually continues the card
       envelopes below the title. */
    .chapter-filete .filete-border {
      height: 1px;
      background: var(--border);
    }
  `],
  template: `
    <header class="chapter-header">
      <div class="chapter-eyebrow">
        @if (icon) { <mat-icon>{{ icon }}</mat-icon> }
        <span class="chapter-roman">{{ eyebrowPrefix }}</span>
        <span class="chapter-sep">{{ eyebrowSeparator }}</span>
        <span class="chapter-sub">{{ eyebrowSuffix }}</span>
      </div>
      @if (title) { <h1 class="chapter-title">{{ title }}</h1> }
      <div class="chapter-filete" aria-hidden="true">
        <div class="filete-ink"></div>
        <div class="filete-border"></div>
      </div>
    </header>
  `,
})
export class ChapterHeaderComponent {
  /** Material icon name shown at the start of the eyebrow row. Omit for no icon. */
  @Input() icon: string | null = null;
  /** Leading eyebrow text — a Roman numeral ("Capítulo I") or a plain category word
   *  ("Inspectoría"); the component has no opinion on which. */
  @Input({ required: true }) eyebrowPrefix!: string;
  /** Text rendered after `eyebrowPrefix` + `eyebrowSeparator`. */
  @Input({ required: true }) eyebrowSuffix!: string;
  /** Character(s) between `eyebrowPrefix` and `eyebrowSuffix`. */
  @Input() eyebrowSeparator = '·';
  /** Optional page/tab h1. Omit when the host page already has its own `.page-title`. */
  @Input() title: string | null = null;
}
