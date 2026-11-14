import { subcategoriesFor } from '../core/categories';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Course } from '../core/models';
import { AdminCourseService, accents, categories, levels } from './admin-course.service';

function emptyCourse(): Course {
  return { id: 1, title: '', description: '', instructor: '', category: 'Culture & Heritage', subcategory: 'Festivals & Traditions', level: 'BEGINNER', price: 0, isFree: true, rating: 0, durationHours: 0, lessons: 0, emoji: '📘', accent: 'violet', published: false };
}

@Component({ standalone: true, imports: [FormsModule, RouterLink], styleUrl: './admin.component.css', template: `
<div class="admin-shell">
  <aside class="admin-sidebar"><a class="admin-brand" routerLink="/admin"><img src="assets/sikai-mark.svg" alt="" width="42" height="42" /> <span>Sikai <small>ADMIN PORTAL</small></span></a><div class="sidebar-label">WORKSPACE</div><a class="sidebar-active" routerLink="/admin">▤ &nbsp; Course management</a><div class="sidebar-bottom">Local administration demo<br><a routerLink="/">Open user portal ↗</a></div></aside>
  <main class="admin-main">
    <header class="admin-topbar"><span>Workspace / <strong>Courses</strong></span><span class="demo-badge">Local demo</span></header>
    <section class="admin-content">
      <div class="admin-heading"><div><span class="eyebrow purple">CONTENT MANAGEMENT</span><h1>Courses</h1><p>Create, organize, and maintain your course library.</p></div><button class="button primary" (click)="startCreate()" [disabled]="!!store.error()">+ Add course</button></div>
      <div class="admin-notice">This admin library is separate from the user portal. Changes are saved in this browser and do not change the user catalog. Admin access is a local demo without server authorization.</div>
      <div class="admin-stats"><div><span>Total courses</span><strong>{{store.courses().length}}</strong></div><div><span>Published</span><strong>{{published()}}</strong></div><div><span>Drafts</span><strong>{{store.courses().length - published()}}</strong></div></div>
      @if (message()) {<div class="success-note" role="status">{{message()}}</div>}
      @if (error() || store.error()) {<div class="error-note" role="alert">{{error() || store.error()}}</div>}
      @if (editorOpen()) {
        <section class="admin-card editor" aria-labelledby="editor-title"><h2 id="editor-title">{{editingId ? 'Edit course' : 'Add a course'}}</h2>
          <form #form="ngForm" (ngSubmit)="save(form)" novalidate>
            <div class="form-grid">
              <label>Course title<input id="admin-title" name="title" [(ngModel)]="draft.title" required minlength="4" maxlength="160" /></label>
              <label>Instructor<input name="instructor" [(ngModel)]="draft.instructor" required maxlength="100" /></label>
              <label class="span-two">Description<textarea name="description" [(ngModel)]="draft.description" required rows="3"></textarea></label>
              <label>Category<select name="category" [(ngModel)]="draft.category" (ngModelChange)="draft.subcategory = subcategoriesFor($event)[0]">@for(c of categories; track c){<option [value]="c">{{c}}</option>}</select></label>
              <label>Subcategory<select name="subcategory" [(ngModel)]="draft.subcategory" required><option value="">Choose a subcategory</option>@for(s of subcategoriesFor(draft.category); track s){<option [value]="s">{{s}}</option>}</select></label>
              <label>Level<select name="level" [(ngModel)]="draft.level">@for(l of levels; track l){<option [value]="l">{{l}}</option>}</select></label>
              <label>Price (USD)<input name="price" type="number" [(ngModel)]="draft.price" required min="0" step="0.01" /></label>
              <label>Duration (hours)<input name="duration" type="number" [(ngModel)]="draft.durationHours" required min="0" step="0.5" /></label>
              <label>Number of lessons<input name="lessons" type="number" [(ngModel)]="draft.lessons" required min="0" step="1" /></label>
              <label>Rating (0–5)<input name="rating" type="number" [(ngModel)]="draft.rating" required min="0" max="5" step="0.1" /></label>
              <label>Course icon<input name="emoji" [(ngModel)]="draft.emoji" required maxlength="16" /></label>
              <label>Cover color<select name="accent" [(ngModel)]="draft.accent">@for(a of accents; track a){<option [value]="a">{{a}}</option>}</select></label>
              <label>Status<select name="published" [(ngModel)]="draft.published"><option [ngValue]="false">Draft</option><option [ngValue]="true">Published</option></select></label>
            </div>
            @if(form.submitted && form.invalid){<p class="field-error" role="alert">Complete required fields. Title needs at least 4 characters; numbers must be within the shown ranges.</p>}
            <div class="form-actions"><button class="button primary" type="submit">{{editingId ? 'Save changes' : 'Create course'}}</button><button class="button outline" type="button" (click)="cancel()">Cancel</button></div>
          </form>
        </section>
      }
      <section class="admin-card"><div class="library-header"><h2>Course library</h2><span>{{filtered().length}} results</span></div><div class="admin-filters"><input aria-label="Search courses" placeholder="Search title or instructor…" [ngModel]="search()" (ngModelChange)="search.set($event)" /><select aria-label="Filter by status" [ngModel]="status()" (ngModelChange)="status.set($event)"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select></div>
        <div class="table-wrap"><table><thead><tr><th>Course</th><th>Category / Level</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          @for(c of filtered(); track c.id){<tr><td><div class="course-cell"><span [class]="'admin-icon '+c.accent">{{c.emoji}}</span><div><strong>{{c.title}}</strong><small>{{c.instructor}} · {{c.lessons}} lessons</small></div></div></td><td>{{c.category}}<small>{{c.subcategory}}</small><small>{{c.level.toLowerCase()}}</small></td><td>{{c.isFree ? 'Free' : '$' + c.price.toFixed(2)}}</td><td><span class="status-pill" [class.published]="c.published">{{c.published ? 'Published' : 'Draft'}}</span></td><td><div class="row-actions"><button class="text-button" (click)="edit(c)" [attr.aria-label]="'Edit '+c.title">Edit</button><button class="text-button danger" (click)="askDelete(c)" [attr.aria-label]="'Delete '+c.title">Delete</button></div></td></tr>}
          @empty{<tr><td colspan="5" class="admin-empty">{{store.courses().length ? 'No courses match your search.' : 'No courses yet. Add your first course to get started.'}}</td></tr>}
        </tbody></table></div>
      </section>
    </section>
  </main>
  @if(deleting(); as course){<div class="dialog-backdrop"><section class="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" (keydown.escape)="deleting.set(null)"><h2 id="delete-title">Delete course?</h2><p>“{{course.title}}” will be removed from the admin library. This cannot be undone.</p><div class="form-actions"><button class="button outline" autofocus (click)="deleting.set(null)">Cancel</button><button class="button delete-button" (click)="confirmDelete()">Delete course</button></div></section></div>}
</div>` })
export class AdminComponent {
  readonly store = inject(AdminCourseService);
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
  startCreate(): void { this.cancel(); this.draft = emptyCourse(); this.editorOpen.set(true); this.focusEditor(); }
  edit(course: Course): void { this.cancel(); this.editingId = course.id; this.draft = { ...course, subcategory: course.subcategory || subcategoriesFor(course.category)[0] }; this.editorOpen.set(true); this.focusEditor(); }
  private focusEditor(): void { setTimeout(() => document.getElementById('admin-title')?.focus()); }
  cancel(): void { this.editorOpen.set(false); this.editingId = null; this.error.set(''); this.message.set(''); }
  save(form: NgForm): void {
    this.error.set(''); if(form.invalid) return;
    try {
      const editing = this.editingId !== null;
      this.store.save({ ...this.draft, id: this.editingId ?? Math.max(0, ...this.store.courses().map(c => c.id)) + 1,
        title: this.draft.title.trim(), description: this.draft.description.trim(), instructor: this.draft.instructor.trim(),
        emoji: this.draft.emoji.trim(), isFree: this.draft.price === 0 }, editing);
      this.cancel(); this.search.set(''); this.status.set('all'); this.message.set(editing ? 'Course updated.' : 'Course created.');
    } catch(e) { this.error.set(e instanceof Error ? e.message : 'Unable to save course.'); }
  }
  askDelete(course: Course): void { this.error.set(''); this.message.set(''); this.deleting.set(course); }
  confirmDelete(): void {
    const course = this.deleting(); if(!course) return;
    try { this.store.delete(course.id); if(this.editingId === course.id) this.cancel(); this.message.set('Course deleted.'); }
    catch(e) { this.error.set(e instanceof Error ? e.message : 'Unable to delete course.'); }
    this.deleting.set(null);
  }
}
