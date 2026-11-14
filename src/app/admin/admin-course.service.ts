import { CATEGORY_NAMES, migrateCategory, validClassification } from '../core/categories';
import { Injectable, signal } from '@angular/core';
import { Course } from '../core/models';
import { SAMPLE_COURSES } from '../core/sample-data';

const KEY = 'learnhub.admin.courses.v1';
export const categories = CATEGORY_NAMES;
export const levels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const accents = ['violet', 'teal', 'pink', 'blue', 'green', 'orange'];
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
    && accents.includes(c.accent) && typeof c.published === 'boolean';
}

@Injectable({ providedIn: 'root' })
export class AdminCourseService {
  readonly error = signal('');
  private readonly records = signal<Course[]>(this.load());
  readonly courses = this.records.asReadonly();

  private load(): Course[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) return SAMPLE_COURSES.map(c => ({ ...c }));
      const parsed: unknown = JSON.parse(raw);
      const value = Array.isArray(parsed) ? parsed.map(migrateCategory) : parsed;
      if (!Array.isArray(value) || !value.every(validCourse) || new Set(value.map(c => c.id)).size !== value.length) throw new Error();
      return value;
    } catch {
      this.error.set('Saved admin courses could not be read. No data was overwritten. Check browser storage before continuing.');
      return [];
    }
  }

  save(course: Course, editing: boolean): void {
    if (this.error()) throw new Error(this.error());
    if (!validCourse(course)) throw new Error('Check the course fields and try again.');
    const exists = this.courses().some(c => c.id === course.id);
    if (exists !== editing) throw new Error('This course has changed. Reload the page and try again.');
    this.persist(editing ? this.courses().map(c => c.id === course.id ? { ...course } : c) : [...this.courses(), { ...course }]);
  }

  delete(id: number): void {
    if (this.error()) throw new Error(this.error());
    if (!this.courses().some(c => c.id === id)) throw new Error('Course no longer exists.');
    this.persist(this.courses().filter(c => c.id !== id));
  }

  private persist(courses: Course[]): void {
    try { localStorage.setItem(KEY, JSON.stringify(courses)); }
    catch { throw new Error('Unable to save. Allow browser storage or free up space, then try again.'); }
    this.records.set(courses);
  }
}
