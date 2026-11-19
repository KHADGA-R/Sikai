import { CourseArtworkComponent } from './course-artwork.component';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LearnHubStore } from '../core/store.service';
import { API_BASE_URL, ApiService } from '../core/api.service';
import { CartService } from '../core/cart.service';
import { toSignal } from '@angular/core/rxjs-interop';
@Component({ standalone:true, imports:[RouterLink, CourseArtworkComponent], template:`
<div class="container detail-layout">@if(error()){<p class="error-note" role="alert">{{error()}}</p>}@if(loading()){<p role="status">Loading course...</p>}@if (course(); as c) {
  <div><a class="back" routerLink="/">← Back to courses</a><div class="detail-art" [class]="'detail-art '+c.accent">@if(c.coverAssetId){<img [src]="coverUrl(c.coverAssetId)" alt="" style="width:100%;height:100%;object-fit:cover" />}@else{<app-course-artwork [courseId]="c.id" />}</div><span class="eyebrow purple">{{c.category}} @if(c.subcategory){ / {{c.subcategory}} } · {{c.level.toLowerCase()}}</span><h1>{{c.title}}</h1>@if(c.summary){<p class="lead">{{c.summary}}</p>}<p style="white-space:pre-line">{{c.description}}</p><div class="detail-badges"><span>★ {{c.rating.toFixed(1)}} rating</span><span>◷ {{c.durationHours}} hours</span><span>▤ {{c.lessons}} lessons</span><span>By {{c.instructor}}</span>@if(c.language){<span>{{c.language}}</span>}</div>@if(c.outcomes){<h2>What you'll learn</h2><ul>@for(outcome of c.outcomes.split('\\n'); track $index){@if(outcome.trim()){<li>{{outcome}}</li>}}</ul>}
    @if(c.audience){<h2>Who this course is for</h2><p style="white-space:pre-line">{{c.audience}}</p>}
    @if(c.prerequisites){<h2>Prerequisites</h2><p style="white-space:pre-line">{{c.prerequisites}}</p>}
    <h2>Course curriculum</h2>
    @for(module of syllabus(); track module.id) {
      <h3>{{module.title}}</h3>@if(module.objective){<p>{{module.objective}}</p>}
      <div class="lesson-list">@for(lesson of module.lessons; track lesson.id) {
        <div class="lesson-row"><span>{{lesson.title}}</span><small>{{lesson.minutes}} min</small>
          @if(lesson.freePreview){<button class="button outline" (click)="togglePreview(lesson.id)">{{activePreview() === lesson.id ? 'Close preview' : 'Free preview'}}</button>}
        </div>
        @if(lesson.freePreview && activePreview() === lesson.id) {
          @if(lesson.kind === 'video'){<video controls preload="metadata" [src]="previewUrl(lesson.id)" style="width:100%"></video>}
          @else if(lesson.kind === 'audio'){<audio controls preload="metadata" [src]="previewUrl(lesson.id)"></audio>}
          @else {<a class="button outline" [href]="previewUrl(lesson.id)" target="_blank" rel="noopener">Open preview PDF</a>}
        }
      }</div>
    } @empty {<p>The instructor is preparing the curriculum.</p>}
  </div>
  <aside class="purchase-card"><div class="price-tag">{{c.isFree ? 'Free' : '$'+c.price.toFixed(2)}}</div><p>Lifetime access to course materials</p>@if (store.isEnrolled(c.id)) {<a class="button primary full-btn" [routerLink]="['/learn',c.id]">Continue learning ↗</a>} @else {<a class="button primary full-btn" [routerLink]="['/checkout',c.id]">{{c.isFree ? 'Enroll for free' : 'Go to checkout'}}</a>}@if(!store.isEnrolled(c.id)){ @if(cart.has(c.id)){<a class="button outline full-btn" routerLink="/cart">View cart</a>} @else {<button class="button outline full-btn" [disabled]="cart.pending().includes(c.id)" (click)="cart.add(c.id)">{{cart.pending().includes(c.id) ? 'Adding...' : 'Add to cart'}}</button>} }@if(cart.error()){<p class="error-note" role="alert">{{cart.error()}}</p>}<button class="button outline full-btn" (click)="store.toggleWishlist(c.id)">{{store.isWished(c.id)?'♥ Saved to wishlist':'♡ Add to wishlist'}}</button><hr><div class="purchase-feature">✓ Beginner-friendly explanations</div><div class="purchase-feature">✓ Self-paced lessons</div><div class="purchase-feature">✓ Saved learning progress</div>@if (!c.isFree) {<div class="demo-note">Pay with PayPal, eSewa or Khalti where available. Review your total at checkout.</div>}</aside>
} @else if (!loading()) {<div class="empty"><h2>Course not found</h2><a routerLink="/">Return to catalog</a></div>}</div>` })
export class CourseDetailComponent {
  readonly cart = inject(CartService);
  readonly store = inject(LearnHubStore);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly id = computed(() => Number(this.params().get('id')));
  readonly course = computed(() => this.store.getCourse(this.id()));
  private readonly api = inject(ApiService);
  private readonly apiBase = inject(API_BASE_URL).replace(/\/$/, '');
  readonly syllabus = signal<SyllabusModule[]>([]);
  readonly activePreview = signal<number | null>(null);

  togglePreview(id: number): void { this.activePreview.update(previous => previous === id ? null : id); }
  coverUrl(assetId: string): string { return `${this.apiBase}/courses/${this.id()}/cover/${assetId}`; }
  previewUrl(lessonId: number): string { return `${this.apiBase}/courses/${this.id()}/preview/${lessonId}`; }
  readonly error = signal(''); readonly loading = signal(false);
  /** Load route-specific metadata and fetch protected curriculum once enrollment is available; discard stale view feedback. */
  constructor() {
    effect(onCleanup => {
      const id = this.id(); let active = true; onCleanup(() => active = false);
      this.loading.set(true); this.error.set('');
      this.activePreview.set(null); this.syllabus.set([]);
      Promise.all([this.store.loadCourse(id), this.api.request<SyllabusModule[]>('GET', `/courses/${id}/syllabus`).then(modules => { if (active) this.syllabus.set(modules); })]).catch(e => { if (active) this.error.set(e.message); }).finally(() => { if (active) this.loading.set(false); });
    });
  }
}


interface SyllabusModule {
  id: string;
  title: string;
  objective: string;
  lessons: { id: number; title: string; minutes: number; kind: 'video' | 'audio' | 'pdf'; freePreview: boolean }[];
}
