import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Course } from './models';
import { SAMPLE_COURSES } from './sample-data';

function readIds(key: string): number[] {
  try { const raw = localStorage.getItem(key); const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : []; }
  catch { return []; }
}
function readProgress(key: string): Record<string, number[]> {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, number[]> : {}; }
  catch { return {}; }
}
@Injectable({ providedIn: 'root' })
export class LearnHubStore {
  readonly courses = signal<Course[]>(SAMPLE_COURSES);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly revision = signal(0);
  private key(name: string): string { return `learnhub.${this.auth.user()?.id ?? 'guest'}.${name}`; }
  readonly wishlist = computed(() => { this.revision(); return readIds(this.key('wishlist')); });
  readonly enrolled = computed(() => { this.revision(); return readIds(this.key('enrolled')); });
  readonly progress = computed(() => { this.revision(); return readProgress(this.key('progress')); });
  private requireLogin(): boolean {
    if (this.auth.isLoggedIn()) return true;
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
    return false;
  }
  private save(name: string, value: unknown): void {
    localStorage.setItem(this.key(name), JSON.stringify(value));
    this.revision.update(value => value + 1);
  }
  readonly wishlistCourses = computed(() => this.courses().filter(course => this.wishlist().includes(course.id)));
  readonly myCourses = computed(() => this.courses().filter(course => this.enrolled().includes(course.id)));
  getCourse(id: number): Course | undefined { return this.courses().find(course => course.id === id); }
  isWished(id: number): boolean { return this.wishlist().includes(id); }
  isEnrolled(id: number): boolean { return this.enrolled().includes(id); }
  toggleWishlist(id: number): void {
    if (!this.requireLogin()) return;
    const ids = this.wishlist();
    this.save('wishlist', ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }
  enroll(id: number): void {
    if (this.requireLogin() && !this.isEnrolled(id)) this.save('enrolled', [...this.enrolled(), id]);
  }
  completed(courseId: number): number[] { const value = this.progress()[String(courseId)]; return Array.isArray(value) ? value.filter(id => Number.isSafeInteger(id)) : []; }
  toggleLesson(courseId: number, lessonId: number): void {
    if (!this.requireLogin()) return;
    const key = String(courseId);
    const previous = this.completed(courseId);
    this.save('progress', { ...this.progress(), [key]: previous.includes(lessonId) ? previous.filter(x => x !== lessonId) : [...previous, lessonId] });
  }
  addCourse(course: Course): void { this.courses.update(items => [...items, course]); }
}
