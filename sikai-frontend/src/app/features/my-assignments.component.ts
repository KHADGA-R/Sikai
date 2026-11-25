import { DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { downloadAssignmentFile } from './assignment-files';

interface Assignment {
  id: string;
  kind: 'homework' | 'classwork';
  title: string;
  instructions: string;
  courseId: number;
  courseTitle: string;
  lessonId: number | null;
  lessonTitle: string | null;
  fileName: string;
  dueAt: number | null;
  publishedAt: number;
  maxPoints: number | null;
  hasDraft: boolean;
  submittedAt: number | null;
  submissionFileName: string | null;
  score: number | null;
  feedback: string | null;
}
type Status = 'pending' | 'review' | 'completed' | 'graded';
interface CourseContext {
  courseTitle: string;
  lessons: { id: number; title: string }[];
}

@Component({
  standalone: true,
  imports: [DatePipe, PercentPipe, RouterLink, ThemeIconComponent],
  template: `
    <section class="container section">
      @if (scope(); as courseId) {
        <a routerLink="/my-learning">Back to My Learning</a>
        @if (context(); as course) {
          <header><div><h1>{{ course.courseTitle }}</h1>
            @if (lesson()) { <p>{{ lessonTitle() || 'Lesson assignments' }}</p> }
          </div></header>
          <nav class="course-section-nav" aria-label="Course sections">
            <a [routerLink]="['/learn', courseId]" [queryParams]="{lesson: lesson()}">{{ lesson() ? 'Back to lesson' : 'Lessons' }}</a>
            <a [routerLink]="['/courses', courseId, 'assignments']" aria-current="page">Assignments</a>
            <a routerLink="/my-assignments">View all assignments</a>
          </nav>
        }
      } @else {
        <a routerLink="/my-learning">Back to My Learning</a>
        <header><app-theme-icon name="assignment" /><div><h1>My Assignments</h1><p>View, submit, and track your assignments.</p></div></header>
      }
      <div class="filters">
        <div class="tabs" role="group" aria-label="Filter by status">
          <button [attr.aria-pressed]="filter() === 'all'" (click)="setQuery({status: null})">All ({{ inCourse().length }})</button>
          @for (state of states; track state.id) {
            <button [attr.aria-pressed]="filter() === state.id" (click)="setQuery({status: state.id})">{{ state.label }} ({{ counts()[state.id] }})</button>
          }
        </div>
        @if (!scope()) {
        <select aria-label="Course" [value]="course()" (change)="setQuery({course: $any($event.target).value || null})">
          <option value="">All courses</option>
          @for (item of courses(); track item.id) { <option [value]="item.id">{{ item.name }}</option> }
        </select>
        } @else if (context()?.lessons?.length) {
          <select aria-label="Lesson" [value]="lesson() ?? ''" (change)="setQuery({lesson: $any($event.target).value || null})">
            <option value="">All lessons</option>
            @for (item of context()?.lessons; track item.id) { <option [value]="item.id">{{ item.title }}</option> }
          </select>
        }
        <select aria-label="Sort assignments" [value]="sort()" (change)="setQuery({sort: $any($event.target).value === 'recent' ? 'recent' : null})">
          <option value="due">Due date (closest)</option><option value="recent">Recently assigned</option>
        </select>
      </div>
      @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }
      @if (notice()) { <p class="success-note" role="status">{{ notice() }}</p> }
      @if (loading()) { <p role="status">Loading assignments…</p> }
      @else if (loaded()) {
        @for (item of visible(); track item.id) {
          @let state = stateFor(item);
          <article class="panel assignment">
            <div class="summary">
              <span class="tile"><app-theme-icon [name]="item.kind === 'classwork' ? 'assignment' : 'text'" /></span>
              <div>
                <p class="muted">{{ item.kind === 'classwork' ? 'Classwork' : 'Homework' }} · {{ item.courseTitle }}@if (item.lessonTitle) { · {{ item.lessonTitle }} }</p>
                <h2>{{ item.title }}</h2>
                @if (item.instructions) { <p class="instructions">{{ item.instructions }}</p> }
                <button class="text-button" [title]="item.fileName" [disabled]="busy()" (click)="download(item)">Download worksheet</button>
              </div>
            </div>
            <div class="fact"><span>Due date</span>
              <strong>{{ item.dueAt == null ? 'No deadline' : (item.dueAt | date:'medium') }}</strong>
              @if (item.dueAt != null && (item.submittedAt ?? now) > item.dueAt) {
                <small class="late">{{ item.submittedAt ? 'Submitted late' : 'Overdue' }}</small>
              }
            </div>
            <div class="fact"><span>Status</span>
              <strong class="badge" [class]="state.id"><app-theme-icon [name]="state.icon" />{{ state.label }}</strong>
              @if (item.submittedAt != null) { <small>Submitted {{ item.submittedAt | date:'medium' }}</small> }
            </div>
            <div class="fact"><span>Grading</span>
              <strong>{{ item.score != null ? item.score + ' / ' + item.maxPoints : item.maxPoints != null ? 'Graded · ' + item.maxPoints + ' points' : 'Ungraded' }}</strong>
              @if (item.score != null && item.maxPoints) { <small>{{ item.score / item.maxPoints | percent }}</small> }
            </div>
            <div class="actions">
              @if (state.id === 'pending') {
                <a class="button primary" [routerLink]="['/courses', item.courseId, 'assignments', item.id, 'whiteboard']" [queryParams]="returnQuery()">{{ item.hasDraft ? 'Resume whiteboard' : 'Open in whiteboard' }}</a>
                <button class="button outline" [disabled]="busy()" (click)="toggleUpload(item.id)">Upload &amp; submit</button>
              } @else {
                @if (item.submissionFileName) {
                  <button class="button outline" [disabled]="busy()" (click)="download(item, true)">Download submission</button>
                } @else {
                  <a class="button outline" [routerLink]="['/courses', item.courseId, 'assignments', item.id, 'submissions', 'me', 'whiteboard']" [queryParams]="returnQuery()">View submission</a>
                }
                @if (state.id === 'graded') {
                  <details class="feedback">
                    <summary>View grade and feedback</summary>
                    @if (item.feedback) { <p>{{ item.feedback }}</p> }
                    @else { <p>No written feedback.</p> }
                  </details>
                } @else if (item.feedback) {
                  <div class="feedback"><strong><app-theme-icon name="chat" /> Teacher feedback</strong><p>{{ item.feedback }}</p></div>
                }
              }
            </div>
            @if (uploadFor() === item.id && !item.submittedAt) {
              <form class="upload" (submit)="submit($event, item, file.files?.[0])">
                <label>Finished work
                  <input #file type="file" accept="application/pdf,image/png,image/jpeg" required [disabled]="busy()" />
                  <small>PDF up to 20 MB or PNG/JPG up to 5 MB.</small>
                </label>
                <button class="button primary" type="submit" [disabled]="busy()">Submit work</button>
                <button class="button outline" type="button" [disabled]="busy()" (click)="uploadFor.set('')">Cancel</button>
              </form>
            }
          </article>
        } @empty { <p>{{ filter() !== 'all' ? 'No assignments match this status.' : lesson() ? 'No assignments for this lesson yet.' : course() ? 'No assignments for this course yet.' : 'Your published course assignments will appear here.' }}</p> }
      }
    </section>
  `,
  styles: [`
    header { display: flex; gap: 12px; align-items: center; margin: 18px 0; }
    header app-theme-icon, .tile { color: #075bb1; }
    h1, h2, p { margin: 0; }
    h2 { font-size: 1.17rem; }
    .filters, .tabs { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .filters { margin-bottom: 18px; }
    .tabs { flex: 1 1 auto; }
    .filters select, .tabs button { width: auto; max-width: 100%; min-height: 38px; padding: 6px 10px; border: 1px solid #c1cce0; border-radius: 8px; background: white; color: #162341; }
    .tabs button { cursor: pointer; }
    .tabs button[aria-pressed=true] { background: #0754a8; border-color: #0754a8; color: white; }
    .assignment { display: grid; grid-template-columns: minmax(230px,2fr) minmax(120px,1fr) minmax(120px,1fr) minmax(95px,.7fr) minmax(160px,1.3fr); gap: 14px; padding: 16px; margin-bottom: 12px; align-items: start; }
    .summary { display: flex; gap: 10px; min-width: 0; }
    .tile { display: grid; place-items: center; flex: 0 0 36px; height: 36px; background: #e5f0ff; border-radius: 9px; }
    .fact { display: grid; gap: 6px; justify-items: start; border-left: 1px solid #e0e5ef; padding-left: 12px; }
    .fact span, .muted, small { color: #475776; font-size: .85rem; }
    .instructions, .feedback p { white-space: pre-wrap; overflow-wrap: anywhere; }
    .text-button { border: 0; background: none; text-align: left; color: #064f9f; cursor: pointer; padding: 4px 0; overflow-wrap: anywhere; max-width: 100%; }
    .actions { display: grid; gap: 8px; }
    .actions .button { text-align: center; justify-content: center; }
    .badge, .feedback strong { display: inline-flex; align-items: center; gap: 5px; }
    .badge { padding: 4px 8px; border-radius: 8px; font-size: .84rem; }
    .badge app-theme-icon, .feedback app-theme-icon { width: 16px; height: 16px; }
    .badge.pending, .late { color: #9c2032; }
    .badge.pending { background: #fce9eb; }
    .badge.review { background: #fff2d7; color: #794306; }
    .badge.completed { background: #e0f5e8; color: #185d38; }
    .badge.graded { background: #efe6fc; color: #552093; }
    .feedback { background: #edf4fd; border-radius: 8px; padding: 9px; }
    .feedback summary { color: #064f9f; cursor: pointer; font-weight: 650; }
    .upload { grid-column: 1 / -1; display: flex; align-items: end; flex-wrap: wrap; gap: 8px; border-top: 1px solid #e0e5ef; padding-top: 10px; }
    .upload label { display: grid; margin: 0; min-width: 0; }
    @media (max-width: 950px) { .assignment { grid-template-columns: repeat(3,minmax(0,1fr)); } .summary,.actions { grid-column: 1 / -1; } .actions { display: flex; flex-wrap: wrap; } }
    @media (max-width: 520px) { .assignment { grid-template-columns: 1fr; } .fact { border: 0; padding-left: 0; } }
  `],
})
export class MyAssignmentsComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly assignments = signal<Assignment[]>([]);
  readonly context = signal<CourseContext | null>(null);
  readonly scope = computed(() => this.params().get('id'));
  readonly lesson = computed(() => this.scope() ? this.query().get('lesson') : null);
  readonly lessonTitle = computed(() => this.context()?.lessons.find(lesson => String(lesson.id) === this.lesson())?.title);
  readonly filter = computed(() => this.states.find(state => state.id === this.query().get('status'))?.id ?? 'all');
  readonly course = computed(() => this.scope() ?? this.query().get('course') ?? '');
  readonly sort = computed(() => this.query().get('sort') === 'recent' ? 'recent' : 'due');
  readonly returnQuery = computed(() => ({
    from: this.scope() ? 'course' : 'dashboard',
    course: this.scope() ? null : this.course() || null,
    lesson: this.lesson(),
    status: this.filter() === 'all' ? null : this.filter(),
    sort: this.sort() === 'due' ? null : this.sort(),
  }));
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly uploadFor = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly now = Date.now();
  readonly states: { id: Status; label: string; icon: string }[] = [
    { id: 'pending', label: 'Not submitted', icon: 'circle' },
    { id: 'review', label: 'In review', icon: 'timer' },
    { id: 'completed', label: 'Completed', icon: 'check' },
    { id: 'graded', label: 'Graded', icon: 'graduation' },
  ];
  readonly courses = computed(() => Array.from(new Map(this.assignments().map(item => [item.courseId, item.courseTitle])),
    ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
  readonly inCourse = computed(() => this.assignments().filter(item =>
    (!this.course() || String(item.courseId) === this.course()) &&
    (!this.lesson() || String(item.lessonId) === this.lesson())));
  readonly counts = computed(() => {
    const counts = { pending: 0, review: 0, completed: 0, graded: 0 };
    for (const item of this.inCourse()) counts[this.stateFor(item).id]++;
    return counts;
  });
  readonly visible = computed(() => this.inCourse().filter(item => this.filter() === 'all' || this.stateFor(item).id === this.filter())
    .sort((a, b) => {
      if (this.sort() === 'recent') return b.publishedAt - a.publishedAt;
      const priority = (item: Assignment) => item.submittedAt != null ? 2 : item.dueAt != null && item.dueAt < this.now ? 0 : 1;
      return priority(a) - priority(b) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.publishedAt - a.publishedAt;
    }));

  constructor() {
    effect(onCleanup => {
      const scope = this.scope();
      let active = true;
      onCleanup(() => active = false);
      void this.load(scope, () => active);
    });
  }

  setQuery(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  stateFor(item: Assignment) {
    const index = item.submittedAt == null ? 0 : item.maxPoints == null ? 2 : item.score == null ? 1 : 3;
    return this.states[index];
  }

  toggleUpload(id: string): void { this.uploadFor.set(this.uploadFor() === id ? '' : id); }

  private path(item: Assignment): string { return '/courses/' + item.courseId + '/assignments/' + item.id; }

  private async load(scope: string | null, active: () => boolean): Promise<void> {
    this.loading.set(true);
    this.loaded.set(false);
    this.context.set(null);
    this.assignments.set([]);
    this.error.set('');
    this.notice.set('');
    this.uploadFor.set('');
    try {
      const [assignments, context] = await Promise.all([
        this.api.request<Assignment[]>('GET', '/my-assignments'),
        scope ? this.api.request<CourseContext>('GET', '/courses/' + encodeURIComponent(scope) + '/assignments') : null,
      ]);
      if (!active()) return;
      this.assignments.set(assignments);
      this.context.set(context);
      this.loaded.set(true);
    } catch (error) {
      if (active()) this.error.set(error instanceof Error ? error.message : 'Unable to load assignments.');
    } finally {
      if (active()) this.loading.set(false);
    }
  }

  async download(item: Assignment, submission = false): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await downloadAssignmentFile(this.api, this.path(item) + (submission ? '/submissions/me/file' : '/worksheet'),
        submission ? item.submissionFileName! : item.fileName);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to download the file.');
    } finally { this.busy.set(false); }
  }

  async submit(event: Event, item: Assignment, file?: File): Promise<void> {
    event.preventDefault();
    if (!file || this.busy() || !window.confirm('Submit this file to your teacher?')) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const body = new FormData();
      body.append('file', file);
      const { submittedAt } = await this.api.request<{ submittedAt: number }>('POST', this.path(item) + '/submissions', body);
      this.assignments.update(items => items.map(row => row.id === item.id ? { ...row, submittedAt, submissionFileName: file.name } : row));
      this.setQuery({status: null});
      this.uploadFor.set('');
      this.notice.set('Assignment submitted.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to submit your work.');
    } finally { this.busy.set(false); }
  }
}
