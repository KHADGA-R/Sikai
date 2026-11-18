import { CourseArtworkComponent } from './course-artwork.component';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LearnHubStore } from '../core/store.service';
import { CartService } from '../core/cart.service';
import { toSignal } from '@angular/core/rxjs-interop';
@Component({ standalone:true, imports:[RouterLink, CourseArtworkComponent], template:`
<div class="container detail-layout">@if(error()){<p class="error-note" role="alert">{{error()}}</p>}@if(loading()){<p role="status">Loading course...</p>}@if (course(); as c) {
  <div><a class="back" routerLink="/">← Back to courses</a><div class="detail-art" [class]="'detail-art '+c.accent"><app-course-artwork [courseId]="c.id" /></div><span class="eyebrow purple">{{c.category}} @if(c.subcategory){ / {{c.subcategory}} } · {{c.level.toLowerCase()}}</span><h1>{{c.title}}</h1><p class="lead">{{c.description}}</p><div class="detail-badges"><span>★ {{c.rating.toFixed(1)}} rating</span><span>◷ {{c.durationHours}} hours</span><span>▤ {{c.lessons}} lessons</span><span>By {{c.instructor}}</span></div><h2>What you'll learn</h2><div class="learning-points"><div>✓ Practical concepts and hands-on examples</div><div>✓ Work through real-world projects</div><div>✓ Learn at your own pace</div><div>✓ Track your learning progress</div></div><h2>Course preview</h2><div class="lesson-list">@for (lesson of preview(); track lesson.id) { <div class="lesson-row"><span>▷ {{lesson.title}}</span><small>{{lesson.minutes}} min</small></div> } @empty {<p>{{store.isEnrolled(c.id) ? 'Your instructor is preparing the curriculum.' : 'Enroll to access the curriculum and lesson files.'}}</p>}</div></div>
  <aside class="purchase-card"><div class="price-tag">{{c.isFree ? 'Free' : '$'+c.price.toFixed(2)}}</div><p>Lifetime access to course materials</p>@if (store.isEnrolled(c.id)) {<a class="button primary full-btn" [routerLink]="['/learn',c.id]">Continue learning ↗</a>} @else {<a class="button primary full-btn" [routerLink]="['/checkout',c.id]">{{c.isFree ? 'Enroll for free' : 'Go to checkout'}}</a>}@if(!store.isEnrolled(c.id)){ @if(cart.has(c.id)){<a class="button outline full-btn" routerLink="/cart">View cart</a>} @else {<button class="button outline full-btn" [disabled]="cart.pending().includes(c.id)" (click)="cart.add(c.id)">{{cart.pending().includes(c.id) ? 'Adding...' : 'Add to cart'}}</button>} }@if(cart.error()){<p class="error-note" role="alert">{{cart.error()}}</p>}<button class="button outline full-btn" (click)="store.toggleWishlist(c.id)">{{store.isWished(c.id)?'♥ Saved to wishlist':'♡ Add to wishlist'}}</button><hr><div class="purchase-feature">✓ Beginner-friendly explanations</div><div class="purchase-feature">✓ Self-paced lessons</div><div class="purchase-feature">✓ Saved learning progress</div>@if (!c.isFree) {<div class="demo-note">Pay with PayPal, eSewa or Khalti where available. Review your total at checkout.</div>}</aside>
} @else if (!loading()) {<div class="empty"><h2>Course not found</h2><a routerLink="/">Return to catalog</a></div>}</div>` })
export class CourseDetailComponent {
  readonly cart = inject(CartService);
  readonly store = inject(LearnHubStore);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly id = computed(() => Number(this.params().get('id')));
  readonly course = computed(() => this.store.getCourse(this.id()));
  readonly preview = computed(() => this.store.lessons(this.id()));
  readonly error = signal(''); readonly loading = signal(false);
  /** Load route-specific metadata and fetch protected curriculum once enrollment is available; discard stale view feedback. */
  constructor() {
    effect(onCleanup => {
      const id = this.id(); let active = true; onCleanup(() => active = false);
      this.loading.set(true); this.error.set('');
      this.store.loadCourse(id).catch(e => { if (active) this.error.set(e.message); }).finally(() => { if (active) this.loading.set(false); });
    });
    effect(() => { const id = this.id(); if (this.store.isEnrolled(id)) void this.store.loadContent(id).catch(e => this.error.set(e.message)); });
  }
}
