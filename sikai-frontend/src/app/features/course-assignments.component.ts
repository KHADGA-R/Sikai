import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';

type AssignmentKind = 'homework' | 'classwork';
interface Assignment {
  id: string;
  kind: AssignmentKind;
  title: string;
  instructions: string;
  lessonId: number | null;
  lessonTitle: string | null;
  dueAt: number | null;
  fileName: string;
}
interface AssignmentsPage {
  courseTitle: string;
  canPublish: boolean;
  lessons: { id: number; title: string }[];
  assignments: Assignment[];
}

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <section class="container section assignments-page">
      @if (page(); as course) {
        <a class="back" [routerLink]="course.canPublish ? ['/instructor/courses'] : ['/learn', courseId()]">← {{ course.canPublish ? 'My courses' : 'Course lessons' }}</a>
        <header><h1>Assignments</h1><p>{{ course.courseTitle }}</p></header>
        @if (course.canPublish) {
          <details class="panel assignment-form">
            <summary>New assignment</summary>
            <form #publishForm="ngForm" (ngSubmit)="publish(worksheet, publishForm)">
              <fieldset [disabled]="publishing()">
                <label>Title <input name="title" [(ngModel)]="title" maxlength="160" required /></label>
                <div class="form-row">
                  <label>Assignment type
                    <select name="kind" [(ngModel)]="kind"><option value="homework">Homework</option><option value="classwork">Classwork</option></select>
                  </label>
                  <label>Lesson
                    <select name="lesson" aria-label="Assignment lesson" [(ngModel)]="lesson">
                      <option [ngValue]="null">Course-wide</option>
                      @for (item of course.lessons; track item.id) { <option [ngValue]="item.id">{{ item.title }}</option> }
                    </select>
                  </label>
                </div>
                <label>Instructions <textarea name="instructions" [(ngModel)]="instructions" rows="3" maxlength="4000"></textarea></label>
                <label>Due date <input name="due" type="datetime-local" [(ngModel)]="due" /></label>
                <label>Worksheet <input #worksheet type="file" accept="application/pdf,image/png,image/jpeg" required />
                  <small>PDF up to 20 MB or PNG/JPG up to 5 MB</small>
                </label>
                <button type="submit" class="button primary" [disabled]="!title.trim() || publishing()">
                  {{ publishing() ? 'Publishing…' : 'Publish assignment' }}
                </button>
              </fieldset>
            </form>
          </details>
        }
        <div class="filters">
          <label>Type <select aria-label="Filter by assignment type" [value]="kindFilter()" (change)="kindFilter.set($any($event.target).value)">
            <option value="">All assignments</option><option value="homework">Homework</option><option value="classwork">Classwork</option>
          </select></label>
          <label>Lesson <select aria-label="Filter by lesson" [value]="lessonFilter()" (change)="lessonFilter.set($any($event.target).value)">
            <option value="">All lessons</option><option value="course">Course-wide</option>
            @for (item of course.lessons; track item.id) { <option [value]="item.id">{{ item.title }}</option> }
          </select></label>
        </div>
        @for (assignment of visible(); track assignment.id) {
          <article class="panel assignment-card">
            <p class="assignment-meta">{{ assignment.kind === 'homework' ? 'Homework' : 'Classwork' }} · {{ assignment.lessonTitle ?? 'Course-wide' }}</p>
            <h2>{{ assignment.title }}</h2>
            @if (assignment.dueAt != null) { <p>Due {{ assignment.dueAt | date:'medium' }}</p> }
            @if (assignment.instructions) { <p class="instructions">{{ assignment.instructions }}</p> }
            <button type="button" class="button outline" [disabled]="!!downloading()" (click)="download(assignment)">
              {{ downloading() === assignment.id ? 'Downloading…' : 'Download worksheet' }}
            </button>
            <small class="file-name">{{ assignment.fileName }}</small>
          </article>
        } @empty { <p>No assignments for this selection.</p> }
      } @else if (loading()) { <p role="status">Loading assignments…</p> }
      @else { <a class="back" [routerLink]="['/courses', courseId()]">← Course details</a> }
      @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }
      @if (message()) { <p class="success-note" role="status">{{ message() }}</p> }
    </section>
  `,
  styles: [`
    .assignments-page { max-width: 900px; }
    header { margin: 12px 0 18px; } h1, h2, p { margin: 0 0 7px; } h2 { font-size: 1.15rem; }
    .assignment-form, .assignment-card { margin-bottom: 12px; padding: 14px; }
    summary { font-weight: 650; cursor: pointer; }
    form { margin-top: 12px; } fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
    .form-row, .filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .filters { margin: 14px 0; }
    label { display: grid; gap: 3px; margin: 0; } input, select, textarea { min-width: 0; width: 100%; }
    fieldset > button { justify-self: start; }
    .assignment-meta, .file-name { color: #425b57; font-size: .83rem; }
    .instructions { white-space: pre-wrap; overflow-wrap: anywhere; }
    .file-name { display: block; margin-top: 5px; overflow-wrap: anywhere; }
    @media (max-width: 480px) { .form-row, .filters { grid-template-columns: 1fr; } }
  `],
})
export class CourseAssignmentsComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly courseId = computed(() => Number(this.params().get('id')));
  readonly page = signal<AssignmentsPage | null>(null);
  readonly loading = signal(false);
  readonly publishing = signal(false);
  readonly downloading = signal('');
  readonly error = signal('');
  readonly message = signal('');
  readonly lessonFilter = signal('');
  readonly kindFilter = signal('');
  readonly visible = computed(() => (this.page()?.assignments ?? []).filter(assignment =>
    (!this.kindFilter() || this.kindFilter() === assignment.kind) &&
    (!this.lessonFilter() || this.lessonFilter() === (assignment.lessonId == null ? 'course' : String(assignment.lessonId)))));
  title = '';
  kind: AssignmentKind = 'homework';
  lesson: number | null = null;
  instructions = '';
  due = '';
  private loadId = 0;

  constructor() {
    effect(() => {
      const courseId = this.courseId();
      this.page.set(null);
      this.message.set('');
      this.title = '';
      this.kind = 'homework';
      this.lesson = null;
      this.instructions = '';
      this.due = '';
      this.kindFilter.set('');
      void this.load(courseId);
    });
    effect(() => {
      this.lessonFilter.set(this.query().get('lesson') ?? '');
    });
  }

  private path(courseId: number): string {
    return '/courses/' + courseId + '/assignments';
  }

  private async load(courseId: number): Promise<void> {
    const request = ++this.loadId;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.api.request<AssignmentsPage>('GET', this.path(courseId));
      if (request === this.loadId) this.page.set(page);
    } catch (error) {
      if (request === this.loadId) this.error.set(this.errorMessage(error));
    } finally {
      if (request === this.loadId) this.loading.set(false);
    }
  }

  async publish(worksheet: HTMLInputElement, form: NgForm): Promise<void> {
    if (this.publishing()) return;
    const file = worksheet.files?.[0];
    if (!file || !this.title.trim()) {
      this.error.set('Enter a title and choose a worksheet.');
      return;
    }
    const dueAt = this.due ? new Date(this.due).getTime() : null;
    if (dueAt !== null && !Number.isFinite(dueAt)) {
      this.error.set('Enter a valid due date.');
      return;
    }
    const courseId = this.courseId();
    const body = new FormData();
    body.append('assignment', new Blob([JSON.stringify({
      kind: this.kind, title: this.title, instructions: this.instructions, lessonId: this.lesson, dueAt,
    })], { type: 'application/json' }));
    body.append('file', file);
    this.publishing.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.api.request('POST', this.path(courseId), body);
      if (this.courseId() !== courseId) return;
      form.resetForm({ title: '', kind: 'homework', lesson: null, instructions: '', due: '' });
      worksheet.value = '';
      this.kindFilter.set('');
      this.lessonFilter.set('');
      this.message.set('Assignment published.');
      await this.load(courseId);
    } catch (error) {
      if (this.courseId() === courseId) this.error.set(this.errorMessage(error));
    } finally {
      this.publishing.set(false);
    }
  }

  async download(assignment: Assignment): Promise<void> {
    if (this.downloading()) return;
    const courseId = this.courseId();
    this.downloading.set(assignment.id);
    this.error.set('');
    try {
      const file = await this.api.blob(this.path(courseId) + '/' + encodeURIComponent(assignment.id) + '/worksheet');
      if (this.courseId() !== courseId) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = assignment.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (this.courseId() === courseId) this.error.set(this.errorMessage(error));
    } finally {
      this.downloading.set('');
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to load assignments.';
  }
}
