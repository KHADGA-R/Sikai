import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Course } from './models';

export interface PendingCheckout { id: string; title: string; amount: number; currency: string; courseCount: number; }
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly courses = signal<Course[]>([]);
  readonly pendingOrders = signal<PendingCheckout[]>([]);
  readonly count = computed(() => this.courses().length);
  readonly total = computed(() => this.courses().reduce((sum, c) => sum + Math.round(c.price * 100), 0) / 100);
  readonly loading = signal(false);
  readonly pending = signal<number[]>([]);
  readonly error = signal('');
  private refreshGeneration = 0;
  constructor() {
    effect(() => {
      const user = this.auth.user();
      this.refreshGeneration++;
      this.courses.set([]); this.pendingOrders.set([]); this.pending.set([]); this.error.set('');
      if (user) untracked(() => { void this.refresh(); }); else this.loading.set(false);
    });
  }
  has(id: number): boolean { return this.courses().some(c => c.id === id); }
  async refresh(): Promise<void> {
    const owner = this.auth.user()?.id; if (!owner) return;
    const generation = ++this.refreshGeneration;
    this.loading.set(true);
    try {
      const [courses, orders] = await Promise.all([this.api.request<Course[]>('GET', '/me/cart'), this.api.request<PendingCheckout[]>('GET', '/checkout/pending')]);
      if (this.auth.user()?.id === owner && generation === this.refreshGeneration) { this.courses.set(courses); this.pendingOrders.set(orders); this.error.set(''); }
    } catch (e) { if (this.auth.user()?.id === owner && generation === this.refreshGeneration) this.error.set(e instanceof Error ? e.message : 'Unable to load your cart.'); }
    finally { if (this.auth.user()?.id === owner && generation === this.refreshGeneration) this.loading.set(false); }
  }
  async add(id: number): Promise<void> { await this.change(id, 'PUT'); }
  async remove(id: number): Promise<void> { await this.change(id, 'DELETE'); }
  private async change(id: number, method: string): Promise<void> {
    await this.auth.ready;
    if (!this.auth.user()) { await this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } }); return; }
    if (this.pending().includes(id)) return;
    const owner = this.auth.user()!.id;
    this.pending.update(ids => [...ids, id]); this.error.set('');
    try { await this.api.request(method, `/me/cart/${id}`); if (this.auth.user()?.id === owner) await this.refresh(); }
    catch (e) { if (this.auth.user()?.id === owner) this.error.set(e instanceof Error ? e.message : 'Unable to update your cart.'); }
    finally { if (this.auth.user()?.id === owner) this.pending.update(ids => ids.filter(value => value !== id)); }
  }
}
