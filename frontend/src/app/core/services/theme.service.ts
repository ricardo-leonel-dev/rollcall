import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _dark = signal(localStorage.getItem('darkMode') === 'true');
  readonly dark = this._dark.asReadonly();

  constructor() {
    this.apply(this._dark());
  }

  toggle(): void {
    const next = !this._dark();
    this._dark.set(next);
    localStorage.setItem('darkMode', String(next));
    this.apply(next);
  }

  private apply(dark: boolean): void {
    document.documentElement.classList.toggle('dark', dark);
  }

  // Overrides the brand accent colors for the active institution. Passing
  // null clears the override and falls back to the default indigo/purple
  // theme from styles.css.
  applyInstitutionColors(primary: string | null, secondary: string | null): void {
    const style = document.documentElement.style;
    if (primary) style.setProperty('--accent', primary); else style.removeProperty('--accent');
    if (secondary) style.setProperty('--accent-2', secondary); else style.removeProperty('--accent-2');
  }
}
