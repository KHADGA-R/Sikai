import { GRADE_GROUPS, matchesSchoolGrade } from '../core/grades';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { COURSE_CATEGORIES, subcategoriesFor } from '../core/categories';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CourseCardComponent } from './course-card.component';
import { LearnHubStore } from '../core/store.service';
@Component({ standalone: true, imports: [FormsModule, RouterLink, CourseCardComponent, ThemeIconComponent], template: `
<section class="sikai-hero">
  <div class="hero-blob hero-blob-left" aria-hidden="true"></div>
  <div class="container landing-hero-grid">
    <div class="sikai-hero-copy">
      <span class="hero-kicker">Learn &middot; Create &middot; Preserve</span>
      <h1>Rooted in Nepal.<br><em>Open to the <span class="hero-underline">World.</span></em></h1>
      <p>A world of culture, creativity, and possibility. Explore new skills, learn from passionate teachers, and carry your learning wherever life takes you.</p>
      <div class="hero-buttons"><a class="button primary" href="#courses" (click)="openDiscovery($event)">Explore Courses <span aria-hidden="true">&rarr;</span></a><a class="button hero-outline" routerLink="/instructor">Become an Instructor</a></div>
      <div class="hero-highlights"><span><app-theme-icon name="play" />Live &amp; On-demand</span><span><app-theme-icon name="people" />Expert Instructors</span><span><app-theme-icon name="star" />Learner Community</span></div>
    </div>
    <div class="landing-hero-art">
      <div class="art-blob" aria-hidden="true"></div>
      <div class="hero-photo"><img src="assets/images/online-learning.png" alt="A learner enjoying an online class from her home in Nepal" width="1672" height="941" fetchpriority="high" /></div>
      <div class="heritage-peek"><img src="assets/images/nepal-heritage.png" alt="Nepal's mountain and cultural heritage" width="180" height="180" /><span>From Nepal, with possibility.</span></div>
      <div class="hero-topic-list"><a href="#courses" (click)="openDiscovery($event, 'Arts & Crafts')"><app-theme-icon name="palette" />Creative Skills</a><a href="#courses" (click)="openDiscovery($event, 'Skills & Training')"><app-theme-icon name="laptop" />Tech &amp; Career</a><a href="#courses" (click)="openDiscovery($event, 'Culture & Heritage')"><app-theme-icon name="temple" />Nepali Culture</a><a href="#courses" (click)="openDiscovery($event, 'Languages')"><app-theme-icon name="chat" />Languages</a></div>
      <svg class="hero-orbit" viewBox="0 0 600 350" fill="none" aria-hidden="true"><path d="M34 285C101 202 465 71 555 143C628 202 380 329 247 341" stroke="currentColor" stroke-width="10" stroke-linecap="round" /></svg>
      <span class="art-spark" aria-hidden="true">&#10035;</span>
    </div>
  </div>
</section>
<div class="container benefits-strip"><div class="benefits-grid"><div><app-theme-icon name="people" /><p><strong>Learn from Experts</strong><small>Passionate teachers &amp; mentors</small></p></div><div><app-theme-icon name="laptop" /><p><strong>Learn Anywhere</strong><small>At your pace, on any device</small></p></div><div><app-theme-icon name="growth" /><p><strong>Build Your Skills</strong><small>Turn curiosity into confidence</small></p></div><div><app-theme-icon name="globe" /><p><strong>Global Perspective</strong><small>Rooted in Nepal, connected worldwide</small></p></div></div></div>
<section class="container cultural-section"><div class="cultural-heading"><div><span class="eyebrow purple">A LITTLE CURIOSITY GOES A LONG WAY</span><h2>Explore Learning Categories<span class="heading-spark" aria-hidden="true">&#10035;</span></h2></div></div><div class="culture-grid">@for(item of learningCategories; track item.name){<a href="#courses" class="culture-tile" [style.--category-background]="item.background" [style.--category-color]="item.color" (click)="openLearningCategory($event, item)"><app-theme-icon [name]="item.icon" /><span>{{item.name}}</span><p class="category-description">{{item.description}}</p><small>Explore courses <span aria-hidden="true">&rarr;</span></small></a>}</div><a class="all-courses-link" href="#courses" (click)="openDiscovery($event)">Find your next interest. Explore all courses <span aria-hidden="true">&rarr;</span></a></section>
<section class="container grade-section" aria-labelledby="grade-heading">
  <div class="section-heading"><div><span class="eyebrow purple">A LITTLE SUPPORT FOR EVERY SCHOOL YEAR</span><h2 id="grade-heading">Explore by Grade</h2><p>Find academic courses for your child's school year, from maths foundations to exam preparation.</p></div><button type="button" class="button outline" (click)="browseGrade('All')">All academic courses <span aria-hidden="true">&rarr;</span></button></div>
  <div class="grade-groups">@for(group of gradeGroups; track group.name){<div class="grade-group"><h3>{{group.name}}</h3><p>{{group.description}}</p><div class="grade-options">@for(year of group.grades; track year){<button type="button" [attr.aria-pressed]="academicOnly() && grade() === year" (click)="browseGrade(year)"><small>Grade</small><strong>{{year}}</strong></button>}</div></div>}</div>
  <p class="grade-help">Choose a grade to see available academic courses. Courses without a grade appear under All academic courses.</p>
</section>
<section id="courses" class="container section"><div class="section-heading"><div><span class="eyebrow purple">KEEP YOUR CURIOSITY ALIVE</span><h2 id="discovery-heading" tabindex="-1">Discover Courses</h2><p>Discover your next skill. Make it part of your story.</p></div><span class="result-count">{{ filtered().length }} courses</span></div>
<div class="filters"><select [ngModel]="category()" (ngModelChange)="chooseInterest($event)" aria-label="Filter category"><option value="All">All categories</option>@for(c of interests; track c.name){<option [value]="c.name">{{c.name}}</option>}</select><select [ngModel]="subcategory()" (ngModelChange)="subcategory.set($event)" [disabled]="category() === 'All'" aria-label="Filter subcategory"><option value="All">All subcategories</option>@for(s of availableSubcategories(); track s){<option [value]="s">{{s}}</option>}</select><select [ngModel]="level()" (ngModelChange)="level.set($event)" aria-label="Filter level"><option value="All">All levels</option><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select><select [ngModel]="price()" (ngModelChange)="price.set($event)" aria-label="Filter price"><option value="All">All prices</option><option value="Free">Free</option><option value="Paid">Paid</option></select></div>
@if(academicOnly()) {<div class="grade-filter-summary" role="status"><span>Showing <strong>{{grade() === 'All' ? 'all academic courses' : 'Grade ' + grade() + ' academic courses'}}</strong> &middot; {{filtered().length}} available</span><button type="button" (click)="reset()">Clear grade filter <span aria-hidden="true">&times;</span></button></div>}
<div class="course-grid">@for (course of filtered(); track course.id) { <app-course-card [course]="course" [wished]="store.isWished(course.id)" (wishlistClick)="store.toggleWishlist($event)" /> } @empty { <div class="empty full"><div class="empty-icon">🔎</div><h3>{{academicOnly() ? 'No academic courses available' + (grade() === 'All' ? ' yet' : ' for Grade ' + grade() + ' yet') : 'No matching courses'}}</h3><p>{{academicOnly() ? 'Try all academic courses or clear the filters to explore other learning opportunities.' : 'Courses for this topic may not be available yet. Try another category or explore all courses.'}}</p>@if(academicOnly() && grade() !== 'All'){<button type="button" class="button primary" (click)="browseGrade('All')">All academic courses</button> }<button class="button outline" (click)="reset()">Clear filters</button></div> }</div>
</section><section class="container cta-banner"><div><span class="eyebrow">FOR TEACHERS, CREATORS & CULTURAL KEEPERS</span><h2>Share what you know. Inspire what comes next.</h2><p>Bring your knowledge to Sikai. Create courses, share stories, and help others grow.</p></div><a routerLink="/instructor" class="button light">Become an Instructor &rarr;</a></section>` })
export class CatalogComponent {
  readonly store = inject(LearnHubStore);
  readonly gradeGroups = GRADE_GROUPS;
  readonly grade = signal<number | 'All'>('All');
  readonly academicOnly = signal(false);
  /** Reset other filters, enable academic discovery for the chosen grade and move focus to the catalog heading. */
  browseGrade(grade: number | 'All'): void {
    this.reset();
    this.grade.set(grade);
    this.academicOnly.set(true);
    document.getElementById('courses')?.scrollIntoView({ block: 'start' });
    document.getElementById('discovery-heading')?.focus({ preventScroll: true });
  }
  readonly interests = COURSE_CATEGORIES;
  readonly learningCategories = [
    { name: 'K–12 Maths', category: 'K–12 Maths', subcategory: 'All', icon: 'calculator', description: 'Maths lessons & extra practice', background: '#e3f0ff', color: '#1670ed' },
    { name: 'Learn Nepali', category: 'Languages', subcategory: 'Nepali', icon: 'translate', description: 'Reading, writing & speaking', background: '#fbe6ee', color: '#e50046' },
    { name: 'Music', category: 'Music', subcategory: 'All', icon: 'music', description: 'Instruments, vocals & rhythm', background: '#fff0df', color: '#c56800' },
    { name: 'Dance & Performing Arts', category: 'Dance & Performing Arts', subcategory: 'All', icon: 'star', description: 'Dance, movement & expression', background: '#eee7fc', color: '#8050db' },
    { name: 'SEE Preparation', category: 'SEE Preparation', subcategory: 'All', icon: 'graduation', description: 'Revision, practice & exam prep', background: '#fff3d7', color: '#b87900' },
    { name: 'Arts & Crafts', category: 'Arts & Crafts', subcategory: 'All', icon: 'palette', description: 'Drawing, painting & creativity', background: '#e8f4e3', color: '#398a2e' },
    { name: 'Skills & Training', category: 'Skills & Training', subcategory: 'All', icon: 'laptop', description: 'Practical skills for everyday life', background: '#e2f3f0', color: '#007e79' },
    { name: 'Artificial Intelligence', category: 'Skills & Training', subcategory: 'Artificial Intelligence', icon: 'growth', description: 'AI fundamentals, tools & applications', background: '#ece9ff', color: '#5943b7' }
  ];
  /** Open a category card and apply its optional subcategory filter. */
  openLearningCategory(event: Event, item: { category: string; subcategory: string }): void {
    this.openDiscovery(event, item.category);
    this.subcategory.set(item.subcategory);
  }
  readonly subcategory = signal('All');
  readonly availableSubcategories = computed(() => subcategoriesFor(this.category()));
  /** Replace anchor navigation with category filtering, result scrolling and keyboard focus placement. */
  openDiscovery(event: Event, category = 'All'): void {
    event.preventDefault();
    this.reset();
    this.category.set(category);
    document.getElementById('courses')?.scrollIntoView({ block: 'start' });
    document.getElementById('discovery-heading')?.focus({ preventScroll: true });
  }
  /** Select a category and clear grade/subcategory restrictions that no longer apply. */
  chooseInterest(category: string): void { this.grade.set('All'); this.academicOnly.set(false); this.category.set(category); this.subcategory.set('All'); }

  search = signal(''); category = signal('All'); level = signal('All'); price = signal('All');
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(params => params.get('q') ?? '')), { initialValue: '' });

  constructor() {
    effect(() => {
      const query = this.query();
      this.reset();
      this.search.set(query);
    });
  }
  readonly filtered = computed(() => this.store.courses().filter(c => c.published &&
    (!this.academicOnly() || matchesSchoolGrade(c, this.grade())) &&
    (!this.search() || [c.title,c.description,c.instructor,c.category,c.subcategory ?? ''].join(' ').toLowerCase().includes(this.search().toLowerCase().trim())) &&
    (this.category() === 'All' || c.category === this.category()) && (this.subcategory() === 'All' || c.subcategory === this.subcategory()) && (this.level() === 'All' || c.level === this.level()) &&
    (this.price() === 'All' || (this.price() === 'Free' ? c.isFree : !c.isFree))));
  /** Restore every catalog filter to its initial unrestricted state. */
  reset(): void { this.grade.set('All'); this.academicOnly.set(false); this.subcategory.set('All'); this.search.set(''); this.category.set('All'); this.level.set('All'); this.price.set('All'); }
}
