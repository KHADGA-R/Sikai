import { CATEGORY_NAMES, migrateCategory, validClassification } from '../core/categories';
import { validGrade } from '../core/grades';
import { Injectable, inject, signal } from '@angular/core';
import { Course } from '../core/models';
import { ApiService } from '../core/api.service';
import { courseInput, normalizeCourse } from '../core/api-models';
import { LearnHubStore } from '../core/store.service';


export const categories = CATEGORY_NAMES;
export const levels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const accents = ['violet', 'teal', 'pink', 'blue', 'green', 'orange'];
/** Check the editable course against the shared category, grade and numeric limits before submitting it. */
export function validCourse(c: Course): boolean {
  return !!c && Number.isSafeInteger(c.id) && c.id > 0
    && typeof c.title === 'string' && c.title.trim().length >= 4 && c.title.length <= 160
    && typeof c.description === 'string' && !!c.description.trim()
    && typeof c.instructor === 'string' && !!c.instructor.trim()
    && categories.includes(c.category) && (c.subcategory === undefined || typeof c.subcategory === 'string') && validClassification(c.category, c.subcategory) && levels.includes(c.level)
    && Number.isFinite(c.price) && c.price >= 0 && c.isFree === (c.price === 0)
    && Number.isFinite(c.durationHours) && c.durationHours >= 0
    && Number.isSafeInteger(c.lessons) && c.lessons >= 0
    && Number.isFinite(c.rating) && c.rating >= 0 && c.rating <= 5
    && typeof c.emoji === 'string' && !!c.emoji.trim()
    && accents.includes(c.accent) && typeof c.published === 'boolean' && validGrade(c.grade);
}

@Injectable({ providedIn: 'root' })
export class AdminCourseService {
  private readonly api = inject(ApiService);
  private readonly catalog = inject(LearnHubStore);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  private readonly records = signal<Course[]>([]);
  readonly courses = this.records.asReadonly();
  /** Load the administrator catalog when this service is first requested by the admin screen. */
  constructor() { void this.refresh(); }
  /** Reload all courses, including drafts, and expose loading or server errors to the admin screen. */
  async refresh(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.records.set((await this.api.request<Course[]>('GET', '/admin/courses')).map(normalizeCourse)); }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to load courses.'); }
    finally { this.loading.set(false); }
  }
  /** Create or update a server course, then refresh both the admin library and public catalog. */
  async save(course: Course, editing: boolean): Promise<void> {
    if (!validCourse(course)) throw new Error('Check the course fields and try again.');
    this.busy.set(true);
    try {
      await this.api.request(editing ? 'PUT' : 'POST', '/instructor/courses' + (editing ? `/${course.id}` : ''), courseInput(course));
      await Promise.all([this.refresh(), this.catalog.refreshCatalog()]);
    } finally { this.busy.set(false); }
  }
  /** Delete a server course and refresh both views; always release the busy state after the request. */
  async delete(id: number): Promise<void> {
    this.busy.set(true);
    try { await this.api.request('DELETE', `/instructor/courses/${id}`); await Promise.all([this.refresh(), this.catalog.refreshCatalog()]); }
    finally { this.busy.set(false); }
  }
}
