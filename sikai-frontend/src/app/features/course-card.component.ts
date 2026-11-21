import { CourseArtworkComponent } from './course-artwork.component';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CartService } from '../core/cart.service';
import { LearnHubStore } from '../core/store.service';
import { RouterLink } from '@angular/router';
import { Course } from '../core/models';
@Component({ selector: 'app-course-card', standalone: true, imports: [RouterLink, CourseArtworkComponent], template: `
  <article class="course-card">
    <a [routerLink]="['/courses', course.id]" [attr.aria-label]="course.title" class="course-art" [class]="'course-art '+course.accent"><app-course-artwork [courseId]="course.id" [title]="course.title" [coverAssetId]="course.coverAssetId" /><span class="art-label">{{ course.subcategory || course.category }}</span></a>
    <div class="card-body"><div class="card-meta"><span>{{ course.level.toLowerCase() }}@if(course.grade){ &middot; Grade {{course.grade}}}</span><span class="rating">★ {{ course.rating.toFixed(1) }}</span></div>
    <a class="card-title" [routerLink]="['/courses', course.id]">{{ course.title }}</a><p class="instructor">by {{ course.instructor }}</p>
    <div class="card-bottom"><strong>{{ course.isFree ? 'Free' : '$' + course.price.toFixed(2) }}</strong><button class="heart" type="button" [class.selected]="wished" (click)="wishlistClick.emit(course.id)" [attr.aria-label]="wished ? 'Remove from wishlist' : 'Add to wishlist'">{{ wished ? '♥' : '♡' }}</button></div>
    @if (!store.isEnrolled(course.id)) { @if(cart.has(course.id)) {<a class="button outline full-btn" routerLink="/cart">View cart</a>} @else {<button class="button outline full-btn" [disabled]="cart.pending().includes(course.id)" (click)="cart.add(course.id)">{{cart.pending().includes(course.id) ? 'Adding...' : 'Add to cart'}}</button>} }
    </div>
  </article>` })
export class CourseCardComponent { readonly cart = inject(CartService); readonly store = inject(LearnHubStore); @Input({required:true}) course!: Course; @Input() wished = false; @Output() wishlistClick = new EventEmitter<number>(); }
