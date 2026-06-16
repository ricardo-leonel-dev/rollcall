import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse } from '../models/index';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(localStorage.getItem('token'));
  private readonly _user = signal<AuthResponse['user'] | null>(
    (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })()
  );

  readonly token = this._token.asReadonly();
  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());
  readonly roleName = computed(() => this._user()?.roleName ?? null);

  async login(username: string, password: string): Promise<void> {
    const resp = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login', { username, password })
    );
    localStorage.setItem('token', resp.token);
    localStorage.setItem('user', JSON.stringify(resp.user));
    this._token.set(resp.token);
    this._user.set(resp.user);
    await this.router.navigate(['/dashboard']);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  hasPermission(role: string): boolean {
    const r = this.roleName();
    if (!r) return false;
    const hierarchy: Record<string, number> = { admin: 5, rector: 4, inspector: 3, teacher: 2, readonly: 1 };
    return (hierarchy[r] ?? 0) >= (hierarchy[role] ?? 0);
  }
}
