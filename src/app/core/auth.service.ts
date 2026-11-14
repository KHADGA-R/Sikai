import { Injectable, computed, signal } from '@angular/core';

export type AccountRole = 'student' | 'instructor';
interface Account { id: string; name: string; email: string; salt: string; passwordHash: string; role: AccountRole; }
export type User = Pick<Account, 'id' | 'name' | 'email' | 'role'>;
const ACCOUNTS = 'learnhub.accounts';
const SESSION = 'learnhub.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUser = signal<User | null>(this.restore());
  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isInstructor = computed(() => this.user()?.role === 'instructor');

  private accounts(): Account[] {
    const value: unknown = JSON.parse(localStorage.getItem(ACCOUNTS) ?? '[]');
    if (!Array.isArray(value) || !value.every(a => a && ['id', 'name', 'email', 'salt', 'passwordHash'].every(k => typeof a[k] === 'string'))) {
      throw new Error('Local account data could not be read.');
    }
    // Preserve existing teachers when upgrading accounts created before roles.
    let teachers: { ownerId: string }[] = [];
    try {
      const live = JSON.parse(localStorage.getItem('sikai.live-classes.v1') ?? '{}');
      if (Array.isArray(live.teachers)) teachers = live.teachers;
    } catch { /* An unreadable live-class record must not prevent login. */ }
    const accounts = value.map(a => {
      if (a.role !== undefined && a.role !== 'student' && a.role !== 'instructor') throw new Error('Local account role could not be read.');
      return { ...a, role: a.role ?? (teachers.some(t => t?.ownerId === a.id) ? 'instructor' : 'student') } as Account;
    });
    if (value.some(a => a.role === undefined)) localStorage.setItem(ACCOUNTS, JSON.stringify(accounts));
    return accounts;
  }

  private restore(): User | null {
    try {
      const id = sessionStorage.getItem(SESSION);
      const account = this.accounts().find(a => a.id === id);
      return account ? { id: account.id, name: account.name, email: account.email, role: account.role } : null;
    } catch { return null; }
  }

  private async hash(password: string, salt: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 600000, hash: 'SHA-256' }, key, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }

  private signIn(account: Account): void {
    sessionStorage.setItem(SESSION, account.id);
    this.currentUser.set({ id: account.id, name: account.name, email: account.email, role: account.role });
  }

  async register(name: string, email: string, password: string, role: AccountRole = 'student'): Promise<void> {
    if (role !== 'student' && role !== 'instructor') throw new Error('Choose Student or Instructor.');
    name = name.trim(); email = email.trim().toLowerCase();
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
      throw new Error('Enter a valid name, email, and a password between 8 and 128 characters.');
    }
    const salt = crypto.randomUUID();
    const passwordHash = await this.hash(password, salt);
    const accounts = this.accounts();
    if (accounts.some(a => a.email === email)) throw new Error('An account with this email already exists. Please log in.');
    const account: Account = { id: crypto.randomUUID(), name, email, salt, passwordHash, role };
    localStorage.setItem(ACCOUNTS, JSON.stringify([...accounts, account]));
    this.signIn(account);
  }

  async login(email: string, password: string): Promise<void> {
    const account = this.accounts().find(a => a.email === email.trim().toLowerCase());
    if (!account || await this.hash(password, account.salt) !== account.passwordHash) throw new Error('Email or password is incorrect.');
    this.signIn(account);
  }

  logout(): void { sessionStorage.removeItem(SESSION); this.currentUser.set(null); }
}
