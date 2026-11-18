import { redirectToPayment } from '../core/payment-redirect';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { LearnHubStore } from '../core/store.service';
import { CourseArtworkComponent } from './course-artwork.component';

interface CheckoutQuote {
  amount: number; currency: string; originalAmount: number; originalCurrency: string; exchangeRate: number;
  paymentAvailable: boolean; activeAttempt: string | null; activeProvider?: string | null; configurationMessage: string;
  providers: { id: string; label: string; available: boolean; amount: number; currency: string }[];
}
interface Payment {
  id: string; courseId: number; provider: string; status: string;
  redirect?: { method: string; url: string; fields: Record<string, string> };
}

@Component({
  standalone: true,
  imports: [RouterLink, CurrencyPipe, CourseArtworkComponent],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(LearnHubStore);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly id = computed(() => Number(this.params().get('id')));
  readonly course = computed(() => this.store.getCourse(this.id()));
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly confirmed = signal(false);
  readonly accepted = signal(false);
  readonly quote = signal<CheckoutQuote | null>(null);
  readonly provider = signal('');
  readonly attempt = signal<string | null>(null);
  readonly paymentMessage = signal('');
  readonly selectedPayment = computed(() => this.quote()?.providers.find(p => p.id === this.provider()));
  readonly totalAmount = computed(() => this.attempt() ? this.quote()?.amount : this.selectedPayment()?.amount ?? this.quote()?.amount);
  readonly currency = computed(() => this.attempt() ? this.quote()?.currency : this.selectedPayment()?.currency ?? this.quote()?.currency);
  readonly providerLabel = computed(() => this.selectedPayment()?.label ?? 'your payment provider');

  constructor() {
    effect(onCleanup => {
      const id = this.id(); let active = true;
      onCleanup(() => active = false);
      this.loading.set(true); this.error.set(''); this.confirmed.set(false); this.accepted.set(false);
      this.quote.set(null); this.attempt.set(null); this.paymentMessage.set(''); this.provider.set('');
      Promise.all([this.store.loadCourse(id), this.store.refreshPersonal(), this.api.request<CheckoutQuote>('GET', `/checkout/courses/${id}`)])
        .then(async ([, , quote]) => {
          if (!active) return;
          this.quote.set(quote);
          this.provider.set(quote.activeProvider ?? quote.providers.find(p => p.available)?.id ?? '');
          const callback = this.route.snapshot.queryParamMap;
          const attempt = this.route.snapshot.paramMap.get('attempt') || quote.activeAttempt;
          if (attempt) {
            this.attempt.set(attempt);
            await this.verifyPayment(callback.get('data'));
          }
        })
        .catch(e => { if (active) this.error.set(e instanceof Error ? e.message : 'Unable to load checkout.'); })
        .finally(() => { if (active) this.loading.set(false); });
    });
  }

  async confirm(): Promise<void> {
    const course = this.course();
    if (!course || !this.quote() || !this.accepted() || this.busy() || this.store.isEnrolled(course.id)) return;
    if (!course.isFree && (!this.selectedPayment()?.available || !this.quote()?.paymentAvailable || this.attempt())) return;
    const id = course.id;
    this.busy.set(true); this.error.set('');
    try {
      const order = await this.api.request<{ id: string }>('POST', '/checkout/orders', { courseId: id });
      if (!course.isFree) {
        const payment = await this.api.request<Payment>('POST', `/checkout/orders/${order.id}/payments`, {
          provider: this.provider(), expectedAmount: this.totalAmount(), expectedCurrency: this.currency()
        });
        this.attempt.set(payment.id);
        this.redirect(payment);
        return;
      }
      await this.api.request('POST', `/checkout/orders/${order.id}/complete`);
      await this.store.refreshPersonal();
      if (this.id() === id) this.confirmed.set(true);
    } catch (e) {
      if (this.id() === id) this.error.set(e instanceof Error ? e.message : 'Unable to complete enrollment. Please try again.');
      if (!course.isFree && this.id() === id) {
        try {
          const quote = await this.api.request<CheckoutQuote>('GET', `/checkout/courses/${id}`);
          if (this.id() === id) { this.quote.set(quote); this.attempt.set(quote.activeAttempt); }
        } catch { /* Preserve the original payment error until the user can reconnect. */ }
      }
    } finally { this.busy.set(false); }
  }

  async verifyPayment(data: string | null = null): Promise<void> {
    const attempt = this.attempt();
    if (!attempt || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const payment = await this.api.request<Payment>('POST', `/checkout/payments/${encodeURIComponent(attempt)}/verify`, { data });
      if (payment.courseId !== this.id()) throw new Error('This payment belongs to another course. Open that course to view its checkout.');
      this.provider.set(payment.provider);
      if (payment.status === 'completed') {
        await this.store.refreshPersonal();
        this.confirmed.set(true); this.paymentMessage.set('Payment verified. Your course is ready.');
      } else if (payment.status === 'failed') {
        this.attempt.set(null);
        this.quote.set(await this.api.request<CheckoutQuote>('GET', `/checkout/courses/${this.id()}`));
        this.paymentMessage.set('The provider confirmed this payment was cancelled or expired. You can try again.');
      } else this.paymentMessage.set('Your payment is not confirmed yet. Check its status before starting another payment.');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to verify payment. Please check again.'); }
    finally { this.busy.set(false); }
  }

  async resumePayment(): Promise<void> {
    const attempt = this.attempt(); if (!attempt || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const payment = await this.api.request<Payment>('POST', `/checkout/payments/${encodeURIComponent(attempt)}/resume`);
      if (payment.courseId !== this.id()) throw new Error('This payment belongs to another course.');
      if (payment.status === 'completed') {
        await this.store.refreshPersonal(); this.confirmed.set(true);
      } else if (payment.status === 'failed') {
        this.attempt.set(null); this.accepted.set(false);
        this.quote.set(await this.api.request<CheckoutQuote>('GET', `/checkout/courses/${this.id()}`));
        this.paymentMessage.set('The previous payment session expired or was cancelled. Review your total to start a fresh payment.');
      } else this.redirect(payment);
    }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to resume payment.'); }
    finally { this.busy.set(false); }
  }

  private redirect(payment: Payment): void { redirectToPayment(payment); }
}
