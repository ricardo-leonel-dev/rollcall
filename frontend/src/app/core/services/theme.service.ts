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
}
