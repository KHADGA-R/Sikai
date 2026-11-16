import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApiError, ApiService } from './api.service';

export type AccountRole = 'student' | 'instructor';
export interface User { id: string; name: string; email: string; role: AccountRole | 'admin'; }
interface Session { token: string; expiresAt: number; user: User; }

/** Server-backed identity. Browser accounts are intentionally never treated as API accounts. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly currentUser = signal<User | null>(null);
  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly isInstructor = computed(() => this.user()?.role === 'instructor' || this.isAdmin());
  readonly sessionError = signal('');
  readonly ready = this.restore();

  /** Clear the displayed identity whenever the API service removes a revoked or logged-out token. */
  constructor() {
    effect(() => { if (!this.api.token()) this.currentUser.set(null); });
  }

  /** Resolve the stored token through /auth/me and ignore a response if another login replaced its token. */
  private async restore(): Promise<void> {
    const token = this.api.token();
    if (!token) return;
    try {
      const user = await this.api.request<User>('GET', '/auth/me');
      if (token === this.api.token()) this.currentUser.set(user);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) this.sessionError.set(error instanceof Error ? error.message : 'Unable to restore your session.');
    }
  }

  /** Clear the previous restoration error and retry identity lookup without creating a new account. */
  async retrySession(): Promise<void> { this.sessionError.set(''); await this.restore(); }

  /** Install the server-issued token and public user projection after successful registration or login. */
  private signIn(session: Session): void {
    this.api.setToken(session.token);
    this.currentUser.set(session.user);
    this.sessionError.set('');
  }

  /** Create a student or instructor account with the backend, checking the BCrypt UTF-8 password limit first. */
  async register(name: string, email: string, password: string, role: AccountRole = 'student'): Promise<void> {
    await this.ready;
    if (new TextEncoder().encode(password).length > 72) throw new Error('Password must be at most 72 UTF-8 bytes.');
    this.signIn(await this.api.request<Session>('POST', '/auth/register', { name: name.trim(), email: email.trim(), password, role }, false));
  }

  /** Exchange credentials for a server session; passwords are not saved in browser storage. */
  async login(email: string, password: string): Promise<void> {
    await this.ready;
    this.signIn(await this.api.request<Session>('POST', '/auth/login', { email: email.trim(), password }, false));
  }

  /** Attempt server-side token revocation and always remove the local token and user in the finally block. */
  async logout(): Promise<void> {
    try { if (this.api.token()) await this.api.request('POST', '/auth/logout'); }
    finally { this.api.setToken(null); this.currentUser.set(null); }
  }
}
