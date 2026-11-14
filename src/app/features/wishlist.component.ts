import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourseCardComponent } from './course-card.component';
import { LearnHubStore } from '../core/store.service';
@Component({standalone:true,imports:[RouterLink,CourseCardComponent],template:`<section class="container section page-min"><div class="section-heading"><div><span class="eyebrow purple">YOUR COLLECTION</span><h1>My wishlist</h1><p>Courses you're excited to explore next.</p></div></div>@if(store.wishlistCourses().length){<div class="course-grid">@for(course of store.wishlistCourses();track course.id){<app-course-card [course]="course" [wished]="true" (wishlistClick)="store.toggleWishlist($event)" />}</div>}@else{<div class="empty"><div class="empty-icon">♡</div><h2>Nothing saved yet</h2><p>Tap the heart on a course to keep it here.</p><a class="button primary" routerLink="/">Browse courses ↗</a></div>}</section>`})
export class WishlistComponent { readonly store=inject(LearnHubStore); }
