import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { LearnHubStore } from '../core/store.service';
import { RedirectPayment, redirectToPayment } from '../core/payment-redirect';
import { CourseArtworkComponent } from './course-artwork.component';
import { CouponEntryComponent } from '../shared/coupon-entry.component';

interface OrderQuote {
  orderId: string; status: string; amount: number; currency: string; originalAmount: number;
  subtotal?: number; discountAmount?: number; couponCode?: string | null;
  items: {courseId: number; title: string; amount: number}[];
  activeAttempt: string | null; activeProvider: string | null; paymentAvailable: boolean; configurationMessage: string;
  providers: {id: string; label: string; amount: number; currency: string; available: boolean}[];
}
interface OrderPayment extends RedirectPayment { id: string; orderId: string; provider: string; amount: number; currency: string; }

@Component({ standalone: true, imports: [RouterLink, CurrencyPipe, CourseArtworkComponent, CouponEntryComponent], templateUrl: './order-checkout.component.html', styleUrls: ['./checkout.component.css', './order-checkout.component.css'] })
export class OrderCheckoutComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly store = inject(LearnHubStore);
  private readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {initialValue: this.route.snapshot.paramMap});
  readonly id = computed(() => this.params().get('orderId') ?? '');
  readonly quote = signal<OrderQuote | null>(null);
  readonly loading = signal(true); readonly busy = signal(false); readonly error = signal('');
  readonly accepted = signal(false); readonly provider = signal(''); readonly message = signal('');
  readonly couponBusy = signal(false);
  readonly attempt = computed(() => this.quote()?.activeAttempt);
  readonly selected = computed(() => this.quote()?.providers.find(p => p.id === this.provider()));
  readonly total = computed(() => this.attempt() ? this.quote()?.amount : this.selected()?.amount ?? this.quote()?.amount);
  readonly currency = computed(() => this.attempt() ? this.quote()?.currency : this.selected()?.currency ?? this.quote()?.currency);
  readonly free = computed(() => this.quote()?.originalAmount === 0);
  readonly complete = computed(() => this.quote()?.status === 'completed');
  constructor() {
    effect(onCleanup => {
      const id = this.id(); let active = true; onCleanup(() => active = false);
      this.quote.set(null); this.loading.set(true); this.error.set(''); this.accepted.set(false); this.message.set('');
      this.api.request<OrderQuote>('GET', `/checkout/orders/${encodeURIComponent(id)}/quote`).then(async quote => {
        if (!active) return;
        const callbackAttempt = this.route.snapshot.paramMap.get('attempt');
        this.quote.set(quote); this.provider.set(quote.activeProvider ?? quote.providers.find(p => p.available)?.id ?? '');
        if (quote.status === 'completed') await this.refreshLearning();
        else if (quote.activeAttempt || callbackAttempt) {
          if (callbackAttempt) this.quote.set({...quote, activeAttempt: callbackAttempt});
          await this.verify(this.route.snapshot.queryParamMap.get('data'));
        }
      }).catch(e => { if (active) this.error.set(e instanceof Error ? e.message : 'Unable to load checkout.'); })
        .finally(() => { if (active) this.loading.set(false); });
    });
  }
  async confirm(): Promise<void> {
    if (!this.quote() || !this.accepted() || this.busy() || this.couponBusy() || this.complete() || this.attempt() || (!this.free() && !this.selected()?.available)) return;
    this.busy.set(true); this.error.set('');
    try {
      if (this.free()) {
        await this.api.request('POST', `/checkout/orders/${this.id()}/complete`);
        this.quote.update(q => q && {...q, status: 'completed'}); await this.refreshLearning();
      } else {
        const payment = await this.api.request<OrderPayment>('POST', `/checkout/orders/${this.id()}/payments`, {provider: this.provider(), expectedAmount: this.total(), expectedCurrency: this.currency()});
        this.quote.update(q => q && {...q, activeAttempt: payment.id, activeProvider: payment.provider, amount: payment.amount, currency: payment.currency});
        redirectToPayment(payment);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Unable to complete checkout.');
      try { this.quote.set(await this.api.request<OrderQuote>('GET', `/checkout/orders/${this.id()}/quote`)); } catch { /* Retain the original checkout error. */ }
    } finally { this.busy.set(false); }
  }
  async verify(data: string | null = null): Promise<void> {
    const attempt = this.attempt(); if (!attempt || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const payment = await this.api.request<OrderPayment>('POST', `/checkout/payments/${encodeURIComponent(attempt)}/verify`, {data});
      if (payment.orderId !== this.id()) throw new Error('This payment belongs to a different checkout.');
      this.provider.set(payment.provider);
      if (payment.status === 'completed') {
        this.quote.update(q => q && {...q, status: 'completed'}); await this.refreshLearning();
      } else if (payment.status === 'failed') {
        this.quote.set(await this.api.request<OrderQuote>('GET', `/checkout/orders/${this.id()}/quote`)); this.accepted.set(false);
        this.message.set('Payment was cancelled or expired. Review your total before trying again.');
      } else this.message.set('Payment is not confirmed yet. Check its status before starting another payment.');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to check payment.'); }
    finally { this.busy.set(false); }
  }
  async resume(): Promise<void> {
    if (!this.attempt() || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const payment = await this.api.request<OrderPayment>('POST', `/checkout/payments/${encodeURIComponent(this.attempt()!)}/resume`);
      if (payment.orderId !== this.id()) throw new Error('This payment belongs to a different checkout.');
      if (payment.status === 'completed') {
        this.quote.update(q => q && {...q, status: 'completed'}); await this.refreshLearning();
      } else if (payment.status === 'failed') {
        this.quote.set(await this.api.request<OrderQuote>('GET', `/checkout/orders/${this.id()}/quote`)); this.accepted.set(false);
        this.message.set('The previous payment session expired or was cancelled. Review your total to start a fresh payment.');
      } else redirectToPayment(payment);
    }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to resume payment.'); }
    finally { this.busy.set(false); }
  }
  private async refreshLearning(): Promise<void> { await Promise.all([this.store.refreshPersonal(), this.cart.refresh()]); }
  async reloadQuote(): Promise<void> {
    this.busy.set(true); this.accepted.set(false); this.error.set('');
    try {
      const quote = await this.api.request<OrderQuote>('GET', `/checkout/orders/${encodeURIComponent(this.id())}/quote`);
      this.quote.set(quote);
      if (!quote.providers.some(p => p.id === this.provider() && p.available)) this.provider.set(quote.providers.find(p => p.available)?.id ?? '');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to refresh the discounted total.'); }
    finally { this.busy.set(false); }
  }
}
