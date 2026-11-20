import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LearnHubStore } from '../core/store.service';

import { lessonProgress } from '../core/learning-progress';
import { CourseArtworkComponent } from './course-artwork.component';
import { ApiService } from '../core/api.service';
import { OwnedCertificate } from '../core/certificate';
import { AchievementShareComponent } from '../shared/achievement-share.component';

@Component({ standalone: true, imports: [RouterLink, CourseArtworkComponent, AchievementShareComponent], template: `
<section class="container section page-min">
  <div class="section-heading"><div><span class="eyebrow purple">YOUR LEARNING JOURNEY</span><h1>{{title}}</h1><p>{{description}}</p></div><a class="button outline" routerLink="/my-learning">My Learning</a></div>
  <div class="dashboard-stats"><div><span>Enrolled courses</span><strong>{{rows().length}}</strong></div><div><span>Lessons completed</span><strong>{{completedLessons()}}</strong></div><div><span>Courses completed</span><strong>{{finished().length}}</strong></div></div>
  @if(view === 'my-achievements') {
    <div class="achievement-grid">@for(badge of badges(); track badge.title){<article class="panel achievement" [class.earned]="badge.earned"><div class="badge-symbol" aria-hidden="true">{{badge.earned ? '★' : '◇'}}</div><span class="badge-state">{{badge.earned ? 'Earned' : 'Not earned yet'}}</span><h2>{{badge.title}}</h2><p>{{badge.description}}</p><small>{{badge.current}} / {{badge.target}}</small>@if(badge.earned){<app-achievement-share [text]="'I earned the ' + badge.title + ' achievement on Sikai!'" />}</article>}</div>
    <section class="panel certificate-list">
      <h2>Course certificates</h2>
      @if(certificateError()) {
        <p role="alert">{{certificateError()}} <button class="text-button" type="button" (click)="loadCertificates()">Retry</button></p>
      }
      @if(certificatesLoading()) { <p role="status">Loading certificates…</p> }
      @for(cert of certificates(); track cert.id) {
        <p><a [routerLink]="['/certificates/earn', cert.courseId]">{{cert.courseTitle}} certificate</a></p>
      }
      @for(row of eligible(); track row.course.id) {
        <p><a [routerLink]="['/certificates/earn', row.course.id]">Get certificate for {{row.course.title}}</a></p>
      }
      @if(!certificatesLoading() && !certificateError() && !certificates().length && !eligible().length) {
        <p>Complete every lesson in a course to earn a certificate.</p>
      }
    </section>
  } @else {
    @if(view === 'my-progress' && rows().length){<div class="panel overall-progress"><h2>Overall progress</h2><div class="progress-line" role="progressbar" aria-label="Overall lesson progress" [attr.aria-valuenow]="overallPercent()" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="overallPercent()"></span></div><p>{{overallPercent()}}% complete across your enrolled courses</p></div>}
    <div class="learning-grid">@for(row of visibleRows(); track row.course.id){<article class="learning-card"><div class="mini-art"><app-course-artwork [courseId]="row.course.id" /></div><div class="learning-info"><span class="eyebrow purple">{{row.finished ? 'COMPLETED' : row.completed ? 'IN PROGRESS' : 'NOT STARTED'}}</span><h3>{{row.course.title}}</h3><p>by {{row.course.instructor}}</p><div class="progress-line" role="progressbar" [attr.aria-label]="row.course.title + ' progress'" [attr.aria-valuenow]="row.percent" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="row.percent"></span></div><div class="progress-label">{{row.percent}}% complete · {{row.completed}} of {{row.total}} lessons</div><a class="button primary" [routerLink]="['/learn',row.course.id]">{{row.finished ? 'Review course' : 'Continue learning'}}</a>@if(row.finished){<a class="button outline certificate-link" [routerLink]="['/certificates/earn', row.course.id]">Course certificate</a>}</div></article>} @empty {<div class="empty full"><h2>{{view === 'completed-courses' ? 'No completed courses yet' : 'Your next chapter starts here'}}</h2><p>{{view === 'completed-courses' ? 'Complete every lesson in a course to see it here.' : 'Enroll in a course to start tracking your progress.'}}</p><a class="button primary" [routerLink]="rows().length ? '/my-learning' : '/'">{{rows().length ? 'Continue learning' : 'Explore courses'}}</a></div>}</div>
  }
</section>`, styles: [`
  .overall-progress{margin-bottom:24px}.overall-progress p{font-size:13px;color:#64736a}.achievement-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.achievement{text-align:center;background:#faf8f3}.achievement.earned{background:#fffdf7;border-color:#d5b568}.badge-symbol{font-size:44px;color:#99a69d}.earned .badge-symbol{color:#bf8d26}.badge-state{display:block;font-size:11px;color:#64756d;margin:10px 0 18px}.earned .badge-state{color:#0f4c46;font-weight:700}.achievement h2{font-size:18px}.achievement p{min-height:42px}.achievement small{color:#788578}.certificate-list{margin-top:24px}.certificate-list a{text-decoration:underline}.certificate-link{margin:8px 0 0}@media(max-width:900px){.achievement-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.achievement-grid{grid-template-columns:1fr}}
`] })
export class LearningDashboardComponent {
  private readonly store = inject(LearnHubStore);
  private readonly api = inject(ApiService);
  readonly view = inject(ActivatedRoute).snapshot.routeConfig?.path;
  readonly title = this.view === 'my-progress' ? 'My Progress' : this.view === 'completed-courses' ? 'Completed Courses' : 'My Achievements';
  readonly description = this.view === 'my-progress' ? 'See how far you have come and choose your next step.' : this.view === 'completed-courses' ? 'Celebrate the courses you have finished.' : 'Small steps become meaningful milestones.';
  readonly rows = computed(() => this.store.myCourses().map(course => ({ course, ...lessonProgress(this.store.lessons(course.id), this.store.completed(course.id)) })));
  readonly finished = computed(() => this.rows().filter(row => row.finished));
  readonly certificates = signal<OwnedCertificate[]>([]);
  readonly certificatesLoading = signal(false);
  readonly certificateError = signal('');
  readonly eligible = computed(() => {
    const issued = new Set(this.certificates().map(cert => cert.courseId));
    return this.finished().filter(row => !issued.has(row.course.id));
  });
  readonly visibleRows = computed(() => this.view === 'completed-courses' ? this.finished() : this.rows());
  readonly completedLessons = computed(() => this.rows().reduce((sum, row) => sum + row.completed, 0));
  readonly overallPercent = computed(() => { const total = this.rows().reduce((sum, row) => sum + row.total, 0); return total ? Math.round(this.completedLessons() / total * 100) : 0; });
  readonly badges = computed(() => [
    { title: 'First Step', description: 'Enroll in your first course.', current: Math.min(this.rows().length, 1), target: 1, earned: this.rows().length > 0 },
    { title: 'First Lesson', description: 'Complete your first lesson.', current: Math.min(this.completedLessons(), 1), target: 1, earned: this.completedLessons() > 0 },
    { title: 'Course Finisher', description: 'Complete every lesson in one course.', current: Math.min(this.finished().length, 1), target: 1, earned: this.finished().length > 0 },
    { title: 'Curious Mind', description: 'Complete 10 lessons across your courses.', current: Math.min(this.completedLessons(), 10), target: 10, earned: this.completedLessons() >= 10 },
    { title: 'Dedicated Learner', description: 'Complete three courses.', current: Math.min(this.finished().length, 3), target: 3, earned: this.finished().length >= 3 },
    { title: 'Lifelong Learner', description: 'Complete five courses.', current: Math.min(this.finished().length, 5), target: 5, earned: this.finished().length >= 5 }
  ]);

  constructor() {
    if (this.view === 'my-achievements') void this.loadCertificates();
  }

  async loadCertificates(): Promise<void> {
    this.certificatesLoading.set(true);
    this.certificateError.set('');
    try {
      this.certificates.set(await this.api.request<OwnedCertificate[]>('GET', '/me/certificates'));
    } catch (error) {
      this.certificateError.set((error as Error).message);
    } finally {
      this.certificatesLoading.set(false);
    }
  }
}
