import { COURSE_CATEGORIES, subcategoriesFor } from '../core/categories';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CourseCardComponent } from './course-card.component';
import { LearnHubStore } from '../core/store.service';
@Component({ standalone: true, imports: [FormsModule, RouterLink, CourseCardComponent], template: `
<section class="sikai-hero"><div class="container"><div class="sikai-hero-copy"><span class="hero-kicker">सिकाइ &nbsp; &middot; &nbsp; LEARN. CREATE. PRESERVE.</span><h1>Rooted in Nepal.<br><em>Open to the World.</em></h1><p>A world of culture, creativity, and possibility.<br>Explore new skills, learn from passionate teachers,<br class="desktop-break"> and carry your learning wherever life takes you.</p><div class="hero-buttons"><a class="button primary" href="#courses">Explore Courses <span>&rarr;</span></a><a class="button hero-outline" routerLink="/instructor">Become an Instructor</a></div><div class="hero-footnote"><span>&#10022;</span> Your culture. Your curiosity. Your next chapter.</div></div></div></section>
<div class="benefits-strip"><div class="container benefits-grid"><div><span>&#9752;</span><p><strong>Learn from Experts</strong><small>Passionate teachers and mentors</small></p></div><div><span>&#9649;</span><p><strong>Learn Anywhere</strong><small>At your pace, in your own space</small></p></div><div><span>&#10023;</span><p><strong>Build Your Skills</strong><small>Turn curiosity into confidence</small></p></div><div><span>&#9678;</span><p><strong>Global Perspective</strong><small>Rooted in Nepal, connected worldwide</small></p></div></div></div>
<section class="container cultural-section"><div class="cultural-heading"><div><span class="eyebrow purple">A LITTLE CURIOSITY GOES A LONG WAY</span><h2>Explore Learning Categories</h2></div><a href="#courses" (click)="reset()">View All Courses &rarr;</a></div><div class="culture-grid">@for(item of interests; track item.name){<a href="#courses" class="culture-tile" [style.background-image]="'url(assets/images/' + item.image + '.png)'" (click)="openDiscovery($event, item.name)"><span>{{item.name}}</span></a>}</div></section>
<section id="courses" class="container section"><div class="section-heading"><div><span class="eyebrow purple">KEEP YOUR CURIOSITY ALIVE</span><h2>Discover Courses</h2><p>Discover your next skill. Make it part of your story.</p></div><span class="result-count">{{ filtered().length }} courses</span></div>
<div class="filters"><label class="search"><span>⌕</span><input id="discovery-search" [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Search courses, instructors, topics..." aria-label="Search courses" /></label><select [ngModel]="category()" (ngModelChange)="chooseInterest($event)" aria-label="Filter category"><option value="All">All categories</option>@for(c of interests; track c.name){<option [value]="c.name">{{c.name}}</option>}</select><select [ngModel]="subcategory()" (ngModelChange)="subcategory.set($event)" [disabled]="category() === 'All'" aria-label="Filter subcategory"><option value="All">All subcategories</option>@for(s of availableSubcategories(); track s){<option [value]="s">{{s}}</option>}</select><select [ngModel]="level()" (ngModelChange)="level.set($event)" aria-label="Filter level"><option value="All">All levels</option><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select><select [ngModel]="price()" (ngModelChange)="price.set($event)" aria-label="Filter price"><option value="All">All prices</option><option value="Free">Free</option><option value="Paid">Paid</option></select></div>
<div class="course-grid">@for (course of filtered(); track course.id) { <app-course-card [course]="course" [wished]="store.isWished(course.id)" (wishlistClick)="store.toggleWishlist($event)" /> } @empty { <div class="empty full"><div class="empty-icon">🔎</div><h3>No matching courses</h3><p>Courses for this topic may not be available yet. Try another category or explore all courses.</p><button class="button outline" (click)="reset()">Clear filters</button></div> }</div>
</section><section class="container cta-banner"><div><span class="eyebrow">FOR TEACHERS, CREATORS & CULTURAL KEEPERS</span><h2>Share what you know. Inspire what comes next.</h2><p>Bring your knowledge to Sikai. Create courses, share stories, and help others grow.</p></div><a routerLink="/instructor" class="button light">Become an Instructor &rarr;</a></section>` })
export class CatalogComponent {
  readonly store = inject(LearnHubStore);
  readonly interests = COURSE_CATEGORIES;
  readonly subcategory = signal('All');
  readonly availableSubcategories = computed(() => subcategoriesFor(this.category()));
  openDiscovery(event: Event, category: string): void {
    event.preventDefault();
    this.reset();
    this.chooseInterest(category);
    document.getElementById('courses')?.scrollIntoView({ block: 'start' });
    document.getElementById('discovery-search')?.focus({ preventScroll: true });
  }
  chooseInterest(category: string): void { this.category.set(category); this.subcategory.set('All'); }

  search = signal(''); category = signal('All'); level = signal('All'); price = signal('All');
  readonly filtered = computed(() => this.store.courses().filter(c => c.published &&
    (!this.search() || [c.title,c.description,c.instructor,c.category,c.subcategory ?? ''].join(' ').toLowerCase().includes(this.search().toLowerCase().trim())) &&
    (this.category() === 'All' || c.category === this.category()) && (this.subcategory() === 'All' || c.subcategory === this.subcategory()) && (this.level() === 'All' || c.level === this.level()) &&
    (this.price() === 'All' || (this.price() === 'Free' ? c.isFree : !c.isFree))));
  reset(): void { this.subcategory.set('All'); this.search.set(''); this.category.set('All'); this.level.set('All'); this.price.set('All'); }
}
