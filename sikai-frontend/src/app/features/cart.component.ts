import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../core/cart.service';
import { ApiService } from '../core/api.service';
import { CourseArtworkComponent } from './course-artwork.component';

@Component({ standalone: true, imports: [RouterLink, CurrencyPipe, CourseArtworkComponent], styleUrl: './cart.component.css', template: `
<section class="container cart-page page-min">
  <header class="cart-heading"><span class="eyebrow purple">YOUR NEXT CHAPTER</span><h1>Your cart</h1><p>Bring your next courses together. One checkout, more to discover.</p></header>
  @if (error()) {<p class="error-note" role="alert">{{error()}} <button class="text-button" (click)="cart.refresh()">Refresh cart</button></p>}
  @for (order of cart.pendingOrders(); track order.id) {<div class="pending-checkout"><div><strong>Payment in progress</strong><p>{{order.title}}. Finish or check this payment before starting another checkout with the same courses.</p></div><a class="button outline" [routerLink]="['/checkout/orders',order.id]">Resume checkout</a></div>}
  @if (cart.loading()) {<p role="status">Updating your cart...</p>}
  @if (cart.count()) {
    <div class="cart-grid"><div class="cart-list"><h2>{{cart.count()}} {{cart.count() === 1 ? 'course' : 'courses'}}</h2>
      @for (c of cart.courses(); track c.id) {
        <article class="cart-course"><a [routerLink]="['/courses',c.id]" [attr.aria-label]="c.title" [class]="'cart-art '+c.accent"><app-course-artwork [courseId]="c.id" /></a><div class="cart-course-info"><span class="eyebrow purple">{{c.category}}</span><h3><a [routerLink]="['/courses',c.id]">{{c.title}}</a></h3><p>By {{c.instructor}}</p><small>{{c.lessons}} lessons · {{c.durationHours}} hours</small></div><div class="cart-course-actions"><strong>{{c.isFree ? 'Free' : (c.price | currency:'USD')}}</strong><button class="text-button" [disabled]="busy() || cart.pending().includes(c.id)" (click)="cart.remove(c.id)" [attr.aria-label]="'Remove '+c.title">Remove</button></div></article>
      }
      <a class="browse-link" routerLink="/">Keep exploring courses</a>
    </div><aside class="cart-summary"><h2>Order summary</h2><div><span>{{cart.count()}} courses</span><strong>{{cart.total() | currency:'USD'}}</strong></div><div class="cart-total"><span>Total</span><strong>{{cart.total() | currency:'USD'}}</strong></div><p>Review your payment method and final currency at checkout. Free courses are included at no charge.</p><button class="button primary full-btn" [disabled]="busy() || cart.loading() || cart.pending().length > 0" (click)="checkout()">{{busy() ? 'Preparing checkout...' : 'Checkout all courses'}}</button></aside></div>
  } @else if (!cart.loading()) {
    <div class="empty"><div class="empty-icon">📚</div><h2>Your cart is waiting for a little curiosity</h2><p>Add courses to your cart and enroll in them together.</p><a class="button primary" routerLink="/">Explore courses</a></div>
  }
</section>` })
export class CartComponent {
  readonly cart = inject(CartService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly busy = signal(false); readonly error = signal('');
  constructor() { void this.cart.refresh(); }
  async checkout(): Promise<void> {
    if (this.busy() || !this.cart.count()) return;
    this.busy.set(true); this.error.set('');
    try {
      const order = await this.api.request<{id: string}>('POST', '/checkout/orders', {courseIds: this.cart.courses().map(c => c.id)});
      await this.router.navigate(['/checkout/orders', order.id]);
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to prepare checkout.'); await this.cart.refresh(); }
    finally { this.busy.set(false); }
  }
}
