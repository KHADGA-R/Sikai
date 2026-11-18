import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface AppNotification { id: string; type: string; title: string; body: string; target: string; createdAt: number; readAt: number | null; }
interface NotificationPage { items: AppNotification[]; unreadCount: number; total: number; hasMore: boolean; }

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly items = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(false);
  readonly pending = signal<string[]>([]);
  readonly markingAll = signal(false);
  readonly hasMore = signal(false);
  readonly error = signal('');
  private page = 0;
  private generation = 0;

  constructor() {
    effect(onCleanup => {
      const owner = this.auth.user()?.id;
      this.generation++; this.page = 0;
      this.items.set([]); this.unreadCount.set(0); this.error.set(''); this.loading.set(false);
      this.pending.set([]); this.markingAll.set(false); this.hasMore.set(false);
      if (!owner) return;
      const refresh = () => { if (document.visibilityState === 'visible') void this.refresh(); };
      untracked(() => { void this.refresh(true); });
      const interval = window.setInterval(refresh, 30000);
      window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
      onCleanup(() => { window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); });
    });
  }
  async refresh(reset = false): Promise<void> {
    if ((this.loading() && !reset) || this.markingAll() || this.pending().length) return;
    await this.fetch(0, false, reset || this.page === 0);
  }
  async loadMore(): Promise<void> {
    if (!this.hasMore() || this.loading() || this.markingAll() || this.pending().length) return;
    await this.fetch(this.page + 1, true, true);
  }
  private async fetch(page: number, append: boolean, updateItems: boolean): Promise<void> {
    const owner = this.auth.user()?.id; if (!owner) return;
    const generation = ++this.generation;
    this.loading.set(true); this.error.set('');
    try {
      const response = await this.api.request<NotificationPage>('GET', `/me/notifications?page=${page}&size=20`);
      if (this.auth.user()?.id !== owner || generation !== this.generation) return;
      this.unreadCount.set(response.unreadCount);
      if (updateItems) {
        this.items.set(append ? [...new Map([...this.items(), ...response.items].map(item => [item.id, item])).values()] : response.items);
        this.page = page; this.hasMore.set(response.hasMore);
      }
    } catch (e) { if (this.auth.user()?.id === owner && generation === this.generation) this.error.set(e instanceof Error ? e.message : 'Unable to load notifications.'); }
    finally { if (this.auth.user()?.id === owner) this.loading.set(false); }
  }
  async markRead(id: string): Promise<void> {
    const owner = this.auth.user()?.id;
    if (!owner || this.pending().includes(id) || this.items().find(item => item.id === id)?.readAt) return;
    this.generation++; this.pending.update(ids => [...ids, id]); this.error.set('');
    try {
      const result = await this.api.request<{unreadCount: number}>('PUT', `/me/notifications/${encodeURIComponent(id)}/read`);
      if (this.auth.user()?.id === owner) {
        this.generation++; this.items.update(items => items.map(item => item.id === id ? {...item, readAt: Date.now()} : item)); this.unreadCount.set(result.unreadCount);
      }
    } catch (e) { if (this.auth.user()?.id === owner) this.error.set(e instanceof Error ? e.message : 'Unable to mark notification as read.'); }
    finally { if (this.auth.user()?.id === owner) { this.pending.update(ids => ids.filter(value => value !== id)); this.loading.set(false); } }
  }
  async markAllRead(): Promise<void> {
    const owner = this.auth.user()?.id; if (!owner || this.markingAll() || this.pending().length) return;
    this.generation++; this.markingAll.set(true); this.error.set('');
    try {
      const result = await this.api.request<{unreadCount: number}>('POST', '/me/notifications/read-all');
      if (this.auth.user()?.id === owner) {
        this.generation++; this.items.update(items => items.map(item => ({...item, readAt: item.readAt ?? Date.now()}))); this.unreadCount.set(result.unreadCount);
      }
    } catch (e) { if (this.auth.user()?.id === owner) this.error.set(e instanceof Error ? e.message : 'Unable to mark notifications as read.'); }
    finally { if (this.auth.user()?.id === owner) { this.markingAll.set(false); this.loading.set(false); } }
  }
}
