import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { NotificationService } from './notification.service';
import { ApiCourse, ApiTopic, normalizeCourse } from './api-models';
import { Course } from './models';
import { curriculumLessons } from './server-store';

/** Shared server state. Private caches are cleared whenever the signed-in account changes. */
@Injectable({ providedIn: 'root' })
export class LearnHubStore {
  private readonly notifications = inject(NotificationService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly catalog = signal<Course[]>([]);
  private readonly wishedCourses = signal<Course[]>([]);
  private readonly enrolledCourses = signal<Course[]>([]);
  private readonly details = signal<Course[]>([]);
  private readonly curricula = signal<Record<string, ApiTopic[]>>({});
  readonly courses = computed(() => [...new Map([...this.catalog(), ...this.details(), ...this.wishedCourses(), ...this.enrolledCourses()].map(c => [c.id, c])).values()]);
  readonly wishlist = computed(() => this.wishedCourses().map(c => c.id));
  readonly enrolled = computed(() => this.enrolledCourses().map(c => c.id));
  readonly progress = signal<Record<string, number[]>>({});
  readonly wishlistCourses = this.wishedCourses.asReadonly();
  readonly myCourses = this.enrolledCourses.asReadonly();
  readonly error = signal('');
  readonly loading = signal(true);
  readonly personalLoading = signal(false);
  readonly pending = signal<readonly string[]>([]);
  private generation = 0;
  private catalogGeneration = 0;

  /** Start catalog loading and reset every private cache when the authenticated identity changes. */
  constructor() {
    void this.refreshCatalog();
    effect(() => {
      const user = this.auth.user();
      const generation = ++this.generation;
      this.wishedCourses.set([]); this.enrolledCourses.set([]); this.progress.set({}); this.curricula.set({}); this.details.set([]); this.pending.set([]);
      if (user) untracked(() => { void this.refreshPersonal(generation); });
      else this.personalLoading.set(false);
    });
  }

  /** Fetch all bounded catalog pages, update cached public metadata and ignore superseded refresh results. */
  async refreshCatalog(): Promise<void> {
    const generation = ++this.catalogGeneration;
    this.loading.set(true); this.error.set('');
    try {
      const records: Course[] = [];
      for (let page = 0; ; page++) {
        const batch = await this.api.request<Course[]>('GET', `/courses?page=${page}&size=100`, undefined, false);
        records.push(...batch.map(normalizeCourse)); if (batch.length < 100) break;
      }
      if (generation === this.catalogGeneration) {
        this.catalog.set(records);
        const byId = new Map(records.map(c => [c.id, c]));
        this.details.update(items => items.map(c => byId.get(c.id) ?? c));
        this.wishedCourses.update(items => items.filter(c => byId.has(c.id)).map(c => byId.get(c.id)!));
        this.enrolledCourses.update(items => items.map(c => byId.get(c.id) ?? c));
      }
    } catch (e) { if (generation === this.catalogGeneration) this.fail(e); }
    finally { if (generation === this.catalogGeneration) this.loading.set(false); }
  }

  /** Load wishlist, enrollments, completion IDs and enrolled curricula for one account generation only. */
  async refreshPersonal(generation = this.generation): Promise<void> {
    if (!this.auth.user()) return;
    this.personalLoading.set(true);
    try {
      const [wishlist, enrolled, progress] = await Promise.all([
        this.api.request<Course[]>('GET', '/me/wishlist'), this.api.request<Course[]>('GET', '/me/enrollments'),
        this.api.request<Record<string, number[]>>('GET', '/me/progress')
      ]);
      if (generation !== this.generation) return;
      this.wishedCourses.set(wishlist.map(normalizeCourse)); this.enrolledCourses.set(enrolled.map(normalizeCourse)); this.progress.set(progress);
      void this.notifications.refresh(true);
      // Real lesson IDs are needed to compute progress after lesson removal or curriculum edits.
      await Promise.all(enrolled.map(c => this.loadContent(c.id, generation).catch(e => { if (generation === this.generation) this.fail(e); return []; })));
    } catch (e) { if (generation === this.generation) this.fail(e); }
    finally { if (generation === this.generation) this.personalLoading.set(false); }
  }

  /** Fetch a course directly for deep links and cache it only if the account generation is still current. */
  async loadCourse(id: number): Promise<Course> {
    const generation = this.generation;
    const course = normalizeCourse(await this.api.request<ApiCourse>('GET', `/courses/${id}`));
    if (generation === this.generation) this.details.update(items => [...items.filter(c => c.id !== id), course]);
    return course;
  }

  /** Fetch protected topics and lessons and retain them only for the requesting account generation. */
  async loadContent(id: number, generation = this.generation): Promise<ApiTopic[]> {
    const topics = await this.api.request<ApiTopic[]>('GET', `/courses/${id}/content`);
    if (generation === this.generation) this.curricula.update(all => ({ ...all, [id]: topics }));
    return topics;
  }

  /** Return cached real lessons in curriculum order; an unloaded curriculum yields an empty list. */
  lessons(id: number) { return curriculumLessons(this.curricula()[id] ?? []); }
  /** Distinguish a loaded empty curriculum from one that has not been requested yet. */
  hasContent(id: number): boolean { return this.curricula()[id] !== undefined; }
  /** Find a course in the combined public, detail, wishlist and enrollment caches. */
  getCourse(id: number): Course | undefined { return this.courses().find(course => course.id === id); }
  /** Report whether the authenticated user has saved this course to the wishlist. */
  isWished(id: number): boolean { return this.wishlist().includes(id); }
  /** Report whether server-loaded enrollments include this course. */
  isEnrolled(id: number): boolean { return this.enrolled().includes(id); }
  /** Return saved completion IDs for one course, defaulting to an empty list. */
  completed(id: number): number[] { return this.progress()[String(id)] ?? []; }

  /** Redirect signed-out mutations to login while preserving the current application route. */
  private requireLogin(): boolean {
    if (this.auth.isLoggedIn()) return true;
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } }); return false;
  }
  /** Expose a readable request failure through the shared application banner. */
  private fail(e: unknown): void { this.error.set(e instanceof Error ? e.message : 'Unable to load your data.'); }
  /** Serialize duplicate actions by key, expose pending state and ignore errors or cleanup from an old account generation. */
  private async mutate(key: string, work: () => Promise<void>): Promise<void> {
    if (!this.requireLogin() || this.pending().includes(key)) return;
    this.pending.update(keys => [...keys, key]); this.error.set('');
    const generation = this.generation;
    try { await work(); }
    catch (e) { if (generation === this.generation) this.fail(e); }
    finally { if (generation === this.generation) this.pending.update(keys => keys.filter(k => k !== key)); }
  }
  /** Translate the current wishlist state into an explicit PUT or DELETE and update the cache after success. */
  toggleWishlist(id: number): Promise<void> {
    const generation = this.generation;
    return this.mutate(`wishlist:${id}`, async () => {
      const remove = this.isWished(id);
      await this.api.request(remove ? 'DELETE' : 'PUT', `/me/wishlist/${id}`);
      if (generation !== this.generation) return;
      if (remove) this.wishedCourses.update(items => items.filter(c => c.id !== id));
      else { const course = this.getCourse(id); if (course) this.wishedCourses.update(items => [...items, course]); }
    });
  }
  /** Request free-course enrollment and reload personal learning state after the server accepts it. */
  enroll(id: number): Promise<void> {
    const generation = this.generation;
    return this.mutate(`enroll:${id}`, async () => {
      await this.api.request('PUT', `/me/enrollments/${id}`);
      if (generation === this.generation) await this.refreshPersonal(generation);
    });
  }
  /** Persist an explicit completion or reversal using the real course and lesson IDs before updating progress. */
  toggleLesson(courseId: number, lessonId: number): Promise<void> {
    const generation = this.generation;
    return this.mutate(`lesson:${lessonId}`, async () => {
      const remove = this.completed(courseId).includes(lessonId);
      await this.api.request(remove ? 'DELETE' : 'PUT', `/me/progress/${courseId}/lessons/${lessonId}`);
      if (generation !== this.generation) return;
      this.progress.update(all => ({ ...all, [courseId]: remove ? (all[courseId] ?? []).filter(id => id !== lessonId) : [...(all[courseId] ?? []), lessonId] }));
      void this.notifications.refresh(true);
    });
  }
}
