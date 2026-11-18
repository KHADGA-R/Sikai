import { SCHOOL_GRADES } from '../core/grades';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { subcategoriesFor } from '../core/categories';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Course } from '../core/models';
import { AuthService } from '../core/auth.service';
import { AdminCourseService, accents, categories, levels } from './admin-course.service';

/** Build a fresh editor draft with valid defaults; the backend assigns the final course ID. */
function emptyCourse(): Course {
  return { id: 1, title: '', description: '', instructor: '', category: 'Culture & Heritage', subcategory: 'Festivals & Traditions', level: 'BEGINNER', price: 0, isFree: true, rating: 0, durationHours: 0, lessons: 0, emoji: '📘', accent: 'violet', published: false };
}

@Component({ standalone: true, imports: [FormsModule, RouterLink, BrandLogoComponent], styleUrl: './admin.component.css', template: `
<div class="admin-shell">
  <aside class="admin-sidebar"><a class="admin-brand" routerLink="/admin"><app-brand-logo /><small>ADMIN PORTAL</small></a><div class="sidebar-label">WORKSPACE</div><a class="sidebar-active" routerLink="/admin">▤ &nbsp; Course management</a><a class="coupon-admin-link" routerLink="/admin/coupons">Discount coupons</a><div class="sidebar-bottom">Server administration<br><a routerLink="/">Open user portal ↗</a></div></aside>
  <main class="admin-main">
    <header class="admin-topbar"><span>Workspace / <strong>Courses</strong></span><span class="demo-badge">Administrator</span></header>
    <section class="admin-content">
      <div class="admin-heading"><div><span class="eyebrow purple">CONTENT MANAGEMENT</span><h1>Courses</h1><p>Create, organize, and maintain your course library.</p></div><button class="button primary" (click)="startCreate()" [disabled]="store.loading() || store.busy()">+ Add course</button></div>
      <div class="admin-notice">Published changes appear in the shared course catalog. Instructor names, lesson counts and ratings are managed by the server.</div>
      <div class="admin-stats"><div><span>Total courses</span><strong>{{store.courses().length}}</strong></div><div><span>Published</span><strong>{{published()}}</strong></div><div><span>Drafts</span><strong>{{store.courses().length - published()}}</strong></div></div>
      @if(store.loading()){<p role="status">Loading courses...</p>}
      @if (message()) {<div class="success-note" role="status">{{message()}}</div>}
      @if (error() || store.error()) {<div class="error-note" role="alert">{{error() || store.error()}} <button class="text-button" (click)="store.refresh()">Retry</button></div>}
      @if (editorOpen()) {
        <section class="admin-card editor" aria-labelledby="editor-title"><h2 id="editor-title">{{editingId ? 'Edit course' : 'Add a course'}}</h2>
          <form #form="ngForm" (ngSubmit)="save(form)" novalidate>
            <div class="form-grid">
              <label>Course title<input id="admin-title" name="title" [(ngModel)]="draft.title" required minlength="4" maxlength="160" /></label>
              <label>Instructor<input name="instructor" [(ngModel)]="draft.instructor" readonly /></label>
              <label class="span-two">Description<textarea name="description" [(ngModel)]="draft.description" required rows="3"></textarea></label>
              <label>Category<select name="category" [(ngModel)]="draft.category" (ngModelChange)="draft.subcategory = subcategoriesFor($event)[0]">@for(c of categories; track c){<option [value]="c">{{c}}</option>}</select></label>
              <label>Subcategory<select name="subcategory" [(ngModel)]="draft.subcategory" required><option value="">Choose a subcategory</option>@for(s of subcategoriesFor(draft.category); track s){<option [value]="s">{{s}}</option>}</select></label>
              <label>School grade<select name="grade" [(ngModel)]="draft.grade"><option [ngValue]="undefined">Not grade-specific</option>@for(year of schoolGrades; track year){<option [ngValue]="year">Grade {{year}}</option>}</select><small>Used for academic course browsing.</small></label>
              <label>Level<select name="level" [(ngModel)]="draft.level">@for(l of levels; track l){<option [value]="l">{{l}}</option>}</select></label>
              <label>Price (USD)<input name="price" type="number" [(ngModel)]="draft.price" required min="0" step="0.01" /></label>
              <label>Duration (hours)<input name="duration" type="number" [(ngModel)]="draft.durationHours" required min="0" step="0.5" /></label>
              <label>Number of lessons<input name="lessons" type="number" [(ngModel)]="draft.lessons" readonly /></label>
              <label>Rating (0–5)<input name="rating" type="number" [(ngModel)]="draft.rating" readonly /></label>
              <label>Course icon<input name="emoji" [(ngModel)]="draft.emoji" required maxlength="16" /></label>
              <label>Cover color<select name="accent" [(ngModel)]="draft.accent">@for(a of accents; track a){<option [value]="a">{{a}}</option>}</select></label>
              <label>Status<select name="published" [(ngModel)]="draft.published"><option [ngValue]="false">Draft</option><option [ngValue]="true">Published</option></select></label>
            </div>
            @if(form.submitted && form.invalid){<p class="field-error" role="alert">Complete required fields. Title needs at least 4 characters; numbers must be within the shown ranges.</p>}
            <div class="form-actions"><button class="button primary" type="submit" [disabled]="store.busy()">{{editingId ? 'Save changes' : 'Create course'}}</button><button class="button outline" type="button" (click)="cancel()">Cancel</button></div>
          </form>
        </section>
      }
      <section class="admin-card"><div class="library-header"><h2>Course library</h2><span>{{filtered().length}} results</span></div><div class="admin-filters"><input aria-label="Search courses" placeholder="Search title or instructor…" [ngModel]="search()" (ngModelChange)="search.set($event)" /><select aria-label="Filter by status" [ngModel]="status()" (ngModelChange)="status.set($event)"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select></div>
        <div class="table-wrap"><table><thead><tr><th>Course</th><th>Category / Level</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          @for(c of filtered(); track c.id){<tr><td><div class="course-cell"><span [class]="'admin-icon '+c.accent">{{c.emoji}}</span><div><strong>{{c.title}}</strong><small>{{c.instructor}} · {{c.lessons}} lessons</small></div></div></td><td>{{c.category}}<small>{{c.subcategory}}</small><small>{{c.level.toLowerCase()}}@if(c.grade){ &middot; Grade {{c.grade}}}</small></td><td>{{c.isFree ? 'Free' : '$' + c.price.toFixed(2)}}</td><td><span class="status-pill" [class.published]="c.published">{{c.published ? 'Published' : 'Draft'}}</span></td><td><div class="row-actions"><button class="text-button" (click)="edit(c)" [attr.aria-label]="'Edit '+c.title">Edit</button><button class="text-button danger" (click)="askDelete(c)" [attr.aria-label]="'Delete '+c.title">Delete</button></div></td></tr>}
          @empty{<tr><td colspan="5" class="admin-empty">{{store.courses().length ? 'No courses match your search.' : 'No courses yet. Add your first course to get started.'}}</td></tr>}
        </tbody></table></div>
      </section>
    </section>
  </main>
  @if(deleting(); as course){<div class="dialog-backdrop"><section class="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" (keydown.escape)="deleting.set(null)"><h2 id="delete-title">Delete course?</h2><p>“{{course.title}}” will be removed from the shared catalog. This cannot be undone.</p><div class="form-actions"><button class="button outline" autofocus (click)="deleting.set(null)">Cancel</button><button class="button delete-button" (click)="confirmDelete()" [disabled]="store.busy()">Delete course</button></div></section></div>}
</div>` })
export class AdminComponent {
  readonly store = inject(AdminCourseService);
  readonly auth = inject(AuthService);
  readonly schoolGrades = SCHOOL_GRADES;
  readonly subcategoriesFor = subcategoriesFor; readonly categories = categories; readonly levels = levels; readonly accents = accents;
  readonly search = signal(''); readonly status = signal('all');
  readonly message = signal(''); readonly error = signal(''); readonly editorOpen = signal(false);
  readonly deleting = signal<Course | null>(null);
  readonly published = computed(() => this.store.courses().filter(c => c.published).length);
  readonly filtered = computed(() => this.store.courses().filter(c =>
    (c.title + ' ' + c.instructor).toLowerCase().includes(this.search().trim().toLowerCase())
    && (this.status() === 'all' || c.published === (this.status() === 'published'))));
  editingId: number | null = null;
  draft = emptyCourse();
  /** Open a clean course editor and display the current administrator as the server-derived instructor. */
  startCreate(): void { this.cancel(); this.draft = { ...emptyCourse(), instructor: this.auth.user()?.name ?? '' }; this.editorOpen.set(true); this.focusEditor(); }
  /** Copy a selected course into the editor so unsaved input does not alter the table. */
  edit(course: Course): void { this.cancel(); this.editingId = course.id; this.draft = { ...course, subcategory: course.subcategory || subcategoriesFor(course.category)[0] }; this.editorOpen.set(true); this.focusEditor(); }
  /** Focus the course title after Angular has rendered the newly opened editor. */
  private focusEditor(): void { setTimeout(() => document.getElementById('admin-title')?.focus()); }
  /** Close the editor and clear its selection and feedback without saving changes. */
  cancel(): void { this.editorOpen.set(false); this.editingId = null; this.error.set(''); this.message.set(''); }
  /** Validate the form, await the server mutation and close the editor only after it succeeds. */
  async save(form: NgForm): Promise<void> {
    this.error.set(''); if(form.invalid || this.store.busy()) return;
    try {
      const editing = this.editingId !== null;
      await this.store.save({ ...this.draft, id: this.editingId ?? Math.max(0, ...this.store.courses().map(c => c.id)) + 1,
        title: this.draft.title.trim(), description: this.draft.description.trim(), instructor: this.draft.instructor.trim(),
        emoji: this.draft.emoji.trim(), isFree: this.draft.price === 0 }, editing);
      this.cancel(); this.search.set(''); this.status.set('all'); this.message.set(editing ? 'Course updated.' : 'Course created.');
    } catch(e) { this.error.set(e instanceof Error ? e.message : 'Unable to save course.'); }
  }
  /** Select a course for the confirmation dialog without deleting it yet. */
  askDelete(course: Course): void { this.error.set(''); this.message.set(''); this.deleting.set(course); }
  /** Delete the confirmed course, close an editor for that course and show the result. */
  async confirmDelete(): Promise<void> {
    const course = this.deleting(); if(!course) return;
    try { await this.store.delete(course.id); if(this.editingId === course.id) this.cancel(); this.message.set('Course deleted.'); }
    catch(e) { this.error.set(e instanceof Error ? e.message : 'Unable to delete course.'); }
    this.deleting.set(null);
  }
}
