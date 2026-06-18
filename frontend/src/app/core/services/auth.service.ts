import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse } from '../models/index';
import { InstitutionContextService } from './institution-context.service';

function readStored(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly institutionContext = inject(InstitutionContextService);

  private readonly _token = signal<string | null>(readStored('token'));
  private readonly _user = signal<AuthResponse['user'] | null>(
    (() => { try { return JSON.parse(readStored('user') || 'null'); } catch { return null; } })()
  );

  readonly token = this._token.asReadonly();
  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());
  readonly roleName = computed(() => this._user()?.roleName ?? null);
  readonly isSuperAdmin = computed(() => this._user()?.roleName === 'superadmin');

  // rememberMe=true persists across browser restarts (localStorage);
  // false only lasts for the current browser session (sessionStorage).
  // The JWT itself always expires after JWT_EXPIRES_IN regardless.
  async login(username: string, password: string, rememberMe = true): Promise<void> {
    const resp = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login', { username, password })
    );
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('token', resp.token);
    storage.setItem('user', JSON.stringify(resp.user));
    this._token.set(resp.token);
    this._user.set(resp.user);
    await this.router.navigate(['/dashboard']);
  }

  logout(): void {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem('token');
      storage.removeItem('user');
    }
    this._token.set(null);
    this._user.set(null);
    this.institutionContext.clear();
    this.router.navigate(['/login']);
  }

  // Refreshes the cached user (e.g. after the profile dialog changes the
  // avatar) without a full re-login.
  updateLocalUser(partial: Partial<AuthResponse['user']>): void {
    const updated = { ...this._user(), ...partial } as AuthResponse['user'];
    this._user.set(updated);
    const storage = sessionStorage.getItem('user') ? sessionStorage : localStorage;
    storage.setItem('user', JSON.stringify(updated));
  }

  hasPermission(role: string): boolean {
    const r = this.roleName();
    if (!r) return false;
    const hierarchy: Record<string, number> = { admin: 5, rector: 4, inspector: 3, teacher: 2, readonly: 1 };
    return (hierarchy[r] ?? 0) >= (hierarchy[role] ?? 0);
  }
}
