import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { downloadAssignmentFile } from './assignment-files';

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
  maxPoints: number | null;
  submissionCount: number;
  activity: boolean;
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
        <a class="back" routerLink="/instructor/courses">← My courses</a>
        <header><h1>{{ course.courseTitle }}</h1></header>
        <nav class="course-section-nav" aria-label="Course sections">
          <a routerLink="/instructor/courses" [queryParams]="{course: courseId()}">Lessons</a>
          <a [routerLink]="['/courses', courseId(), 'assignments']" aria-current="page">Assignments</a>
        </nav>
        @if (course.canPublish) {
          <a class="button outline new-activity" [routerLink]="['/courses', courseId(), 'assignments', 'new-activity']"
             [queryParams]="{lesson: lessonFilter() || null, kind: kindFilter() || null}">New drag-and-drop activity</a>
          <details class="panel assignment-form">
            <summary class="button primary">New assignment</summary>
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
                <label>Maximum points <input name="maxPoints" type="number" min="1" max="10000" step="1" [(ngModel)]="maxPoints" />
                  <small>Leave blank for an ungraded assignment.</small>
                </label>
                <label>Worksheet <input #worksheet type="file" accept="application/pdf,image/png,image/jpeg" required />
                  <small>PDF up to 20 MB or PNG/JPG up to 5 MB</small>
                </label>
                <button type="submit" class="button primary" [disabled]="publishForm.invalid || !title.trim() || publishing()">
                  {{ publishing() ? 'Publishing…' : 'Publish assignment' }}
                </button>
              </fieldset>
            </form>
          </details>
        }
        <div class="filters">
          <label>Type <select aria-label="Filter by assignment type" [value]="kindFilter()" (change)="setFilter('kind', $any($event.target).value)">
            <option value="">All assignments</option><option value="homework">Homework</option><option value="classwork">Classwork</option>
          </select></label>
          <label>Lesson <select aria-label="Filter by lesson" [value]="lessonFilter()" (change)="setFilter('lesson', $any($event.target).value)">
            <option value="">All lessons</option><option value="course">Course-wide</option>
            @for (item of course.lessons; track item.id) { <option [value]="item.id">{{ item.title }}</option> }
          </select></label>
        </div>
        @for (assignment of visible(); track assignment.id) {
          <article class="panel assignment-card">
            <div>
              <p class="assignment-meta">{{ assignment.kind === 'homework' ? 'Homework' : 'Classwork' }} · {{ assignment.lessonTitle ?? 'Course-wide' }}</p>
              <h2>{{ assignment.title }}</h2>
              @if (assignment.instructions) { <p class="instructions">{{ assignment.instructions }}</p> }
            </div>
            <div class="assignment-facts">
              <p>{{ assignment.dueAt == null ? 'No deadline' : 'Due ' + (assignment.dueAt | date:'medium') }}</p>
              <p>{{ assignment.maxPoints == null ? 'Ungraded' : assignment.maxPoints + ' points' }}</p>
              @if (assignment.activity && assignment.maxPoints == null) { <p>Drag-and-drop practice</p> }
              @else if (course.canPublish) { <p>{{ assignment.submissionCount }} {{ assignment.submissionCount === 1 ? 'submission' : 'submissions' }}</p> }
            </div>
            <div class="assignment-actions">
            @if (assignment.activity) {
              <a class="button outline" [routerLink]="['/courses', courseId(), 'assignments', assignment.id, 'activity']"
                 [queryParams]="{kind: kindFilter() || null, lesson: lessonFilter() || null}">Open activity</a>
              @if (course.canPublish && assignment.maxPoints != null) {
                <a class="button primary" [routerLink]="['/courses', courseId(), 'assignments', assignment.id, 'submissions']"
                   [queryParams]="{kind: kindFilter() || null, lesson: lessonFilter() || null}">View submissions</a>
              }
            } @else {
            @if (course.canPublish) {
              <a class="button primary" [routerLink]="['/courses', courseId(), 'assignments', assignment.id, 'submissions']"
                 [queryParams]="{kind: kindFilter() || null, lesson: lessonFilter() || null}">View submissions</a>
            }
            <button type="button" class="button outline" [title]="assignment.fileName" [disabled]="!!downloading()" (click)="download(assignment)">
              {{ downloading() === assignment.id ? 'Downloading…' : 'Download worksheet' }}
            </button>
            }
            </div>
          </article>
        } @empty { <p>{{ course.assignments.length ? 'No assignments match these filters.' : 'No assignments yet. Use New assignment to publish homework or classwork.' }}</p> }
      } @else if (loading()) { <p role="status">Loading assignments…</p> }
      @else { <a class="back" [routerLink]="['/courses', courseId()]">← Course details</a> }
      @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }
      @if (message()) { <p class="success-note" role="status">{{ message() }}</p> }
    </section>
  `,
  styles: [`
    .assignments-page { max-width: 1050px; }
    .new-activity { margin-bottom: 10px; }
    header { margin: 12px 0 18px; } h1, h2, p { margin: 0 0 7px; } h2 { font-size: 1.15rem; }
    .assignment-form, .assignment-card { margin-bottom: 12px; padding: 14px; }
    .assignment-card { display: grid; grid-template-columns: minmax(0, 2fr) minmax(130px, 1fr) auto; gap: 14px; align-items: start; }
    summary { cursor: pointer; }
    form { margin-top: 12px; } fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
    .form-row, .filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .filters { margin: 14px 0; }
    label { display: grid; gap: 3px; margin: 0; } input, select, textarea { min-width: 0; width: 100%; }
    fieldset > button { justify-self: start; }
    .assignment-meta, .assignment-facts { color: #425b57; font-size: .83rem; }
    .instructions { white-space: pre-wrap; overflow-wrap: anywhere; }
    .assignment-actions { display: grid; gap: 8px; }
    @media (max-width: 720px) { .assignment-card { grid-template-columns: 1fr; } .assignment-actions { display: flex; flex-wrap: wrap; } }
    @media (max-width: 480px) { .form-row, .filters { grid-template-columns: 1fr; } }
  `],
})
export class CourseAssignmentsComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly courseId = computed(() => Number(this.params().get('id')));
  readonly page = signal<AssignmentsPage | null>(null);
  readonly loading = signal(false);
  readonly publishing = signal(false);
  readonly downloading = signal('');
  readonly error = signal('');
  readonly message = signal('');
  readonly lessonFilter = computed(() => this.query().get('lesson') ?? '');
  readonly kindFilter = computed(() => this.query().get('kind') ?? '');
  readonly visible = computed(() => (this.page()?.assignments ?? []).filter(assignment =>
    (!this.kindFilter() || this.kindFilter() === assignment.kind) &&
    (!this.lessonFilter() || this.lessonFilter() === (assignment.lessonId == null ? 'course' : String(assignment.lessonId)))));
  title = '';
  kind: AssignmentKind = 'homework';
  lesson: number | null = null;
  instructions = '';
  due = '';
  maxPoints: number | null = null;
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
      this.maxPoints = null;
      void this.load(courseId);
    });
  }

  setFilter(key: 'lesson' | 'kind', value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
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
      kind: this.kind, title: this.title, instructions: this.instructions, lessonId: this.lesson, dueAt, maxPoints: this.maxPoints,
    })], { type: 'application/json' }));
    body.append('file', file);
    this.publishing.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.api.request('POST', this.path(courseId), body);
      if (this.courseId() !== courseId) return;
      form.resetForm({ title: '', kind: 'homework', lesson: null, instructions: '', due: '', maxPoints: null });
      worksheet.value = '';
      void this.router.navigate([], { relativeTo: this.route, queryParams: { kind: null, lesson: null }, queryParamsHandling: 'merge', replaceUrl: true });
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
      await downloadAssignmentFile(this.api, this.path(courseId) + '/' + encodeURIComponent(assignment.id) + '/worksheet', assignment.fileName);
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
