import { CourseArtworkComponent } from './course-artwork.component';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LearnHubStore } from '../core/store.service';
import { AuthService } from '../core/auth.service';

import { Course } from '../core/models';
@Component({standalone:true,imports:[RouterLink, CourseArtworkComponent],template:`<section class="container section page-min"><div class="section-heading"><div><span class="eyebrow purple">KEEP GROWING</span><h1>My learning</h1><p>Pick up where you left off. Every lesson is progress.</p></div><div class="learning-actions"><span class="result-count">{{store.myCourses().length}} enrolled</span>@if(auth.user()?.role === "student"){<a class="button primary" routerLink="/my-assignments">My Assignments</a>}</div></div>@if(store.myCourses().length){<div class="learning-grid">@for(c of store.myCourses();track c.id){<article class="learning-card"><div class="mini-art" [class]="'mini-art '+c.accent"><app-course-artwork [courseId]="c.id" [title]="c.title" [coverAssetId]="c.coverAssetId" /></div><div class="learning-info"><span class="eyebrow purple">{{c.category}}</span><h3>{{c.title}}</h3><p>by {{c.instructor}}</p><div class="progress-line"><span [style.width.%]="percent(c)"></span></div><div class="progress-label">{{percent(c)}}% complete · {{store.completed(c.id).length}} of {{lessonCount(c)}} lessons</div><a class="button primary" [routerLink]="['/learn',c.id]">Continue learning ↗</a></div></article>}</div>}@else{<div class="empty"><div class="empty-icon">📚</div><h2>Your learning journey starts here</h2><p>Enroll in a course to see it on this page.</p><a class="button primary" routerLink="/">Explore courses ↗</a></div>}</section>`,styles:[`.learning-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}`]})
export class MyLearningComponent { readonly store=inject(LearnHubStore); readonly auth=inject(AuthService);
  /** Use the server-calculated lesson count rather than legacy demo placeholders. */
  lessonCount(c:Course):number{return c.lessons;}
  /** Calculate bounded course completion and avoid division by zero for an empty curriculum. */
  percent(c:Course):number{return this.lessonCount(c) ? Math.min(100, Math.round(this.store.completed(c.id).length/this.lessonCount(c)*100)) : 0;} }
