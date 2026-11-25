import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { downloadAssignmentFile } from './assignment-files';

interface Submission {
  studentId: string;
  studentName: string;
  submittedAt: number;
  score: number | null;
  feedback: string | null;
  fileName: string | null;
}
interface Roster {
  assignment: { title: string; maxPoints: number | null };
  submissions: Submission[];
}

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <section class="container section review-page">
      @if (!allGraded()) {
        <a [routerLink]="['/courses', courseId, 'assignments']" [queryParams]="returnFilters">Back to assignments</a>
      }
      @if (roster(); as data) {
        <h1>{{ data.assignment.title }}</h1>
        <h2>Submissions ({{ data.submissions.length }})</h2>
        <p>{{ data.assignment.maxPoints == null ? 'Ungraded assignment' : 'Maximum score · ' + data.assignment.maxPoints + ' points' }}</p>
        @if (allGraded()) {
          <div class="review-progress">
            <strong>All submissions graded</strong>
            <a class="button primary" [routerLink]="['/courses', courseId, 'assignments']" [queryParams]="returnFilters">Back to assignments</a>
          </div>
        } @else if (ungraded().length) {
          <div class="review-progress">
            <strong>{{ ungraded().length }} {{ ungraded().length === 1 ? 'submission to grade' : 'submissions to grade' }}</strong>
            <button type="button" class="button outline" (click)="focusNextUngraded()">Next ungraded</button>
          </div>
        }
        @for (item of data.submissions; track item.studentId) {
          <article class="panel submission">
            <div class="summary">
              <div><h3 [id]="'student-review-' + item.studentId" tabindex="-1">{{ item.studentName }}</h3><p>Submitted {{ item.submittedAt | date:'medium' }}</p></div>
              @if (item.fileName) {
                <button type="button" class="button outline" [disabled]="busy()" (click)="download(item)">Download submission</button>
              } @else {
                <a class="button outline" [routerLink]="['/courses', courseId, 'assignments', assignmentId, 'submissions', item.studentId, 'whiteboard']"
                   [queryParams]="returnFilters">View submitted whiteboard</a>
              }
            </div>
            @if ((item.score != null || item.feedback != null) && editing() !== item.studentId) {
              <div class="saved-review">
                <div class="review-result">
                  <span class="review-badge">{{ item.score != null ? 'Graded' : 'Feedback saved' }}</span>
                  @if (item.score != null) { <strong>{{ item.score }} / {{ data.assignment.maxPoints }}</strong> }
                </div>
                @if (item.feedback) { <p class="review-feedback">{{ item.feedback }}</p> }
                <button type="button" class="button outline" [disabled]="busy() || !!editing()" (click)="editing.set(item.studentId)">
                  {{ item.score != null ? 'Edit grade' : 'Edit feedback' }}
                </button>
              </div>
            } @else {
            <form #reviewForm="ngForm" (ngSubmit)="review(item, reviewForm.value.score ?? null, reviewForm.value.feedback)">
              @if (data.assignment.maxPoints !== null) {
                <label>Score out of {{ data.assignment.maxPoints }}
                  <input type="number" min="0" [max]="data.assignment.maxPoints" step="1" name="score" [ngModel]="item.score" required />
                </label>
              }
              <label>Teacher feedback <textarea name="feedback" [ngModel]="item.feedback ?? ''" rows="3" maxlength="4000"></textarea></label>
              <button type="submit" class="button primary" [disabled]="busy() || reviewForm.invalid">
                {{ data.assignment.maxPoints == null ? 'Save feedback' : item.score != null ? 'Save grade changes' : 'Return grade' }}
              </button>
              @if (editing() === item.studentId) {
                <button type="button" class="button outline" [disabled]="busy()" (click)="editing.set('')">Cancel</button>
              }
            </form>
            }
            @if (saved() === item.studentId) {
              <div class="review-result saved-status">
                <span role="status">Review saved.</span>
                @if (ungraded().length) {
                  <button type="button" class="button outline" (click)="focusNextUngraded()">Next ungraded</button>
                }
              </div>
            }
          </article>
        } @empty { <p>No work has been submitted yet.</p> }
      } @else if (!error()) { <p role="status">Loading submissions…</p> }
      @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: [`
    .review-page { max-width: 880px; }
    h1 { margin: 14px 0; }
    h2, h3, p { margin: 0 0 6px; }
    .submission { padding: 16px; margin: 12px 0; }
    .summary { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .review-progress, .review-result { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .review-progress { justify-content: space-between; margin: 12px 0; }
    .saved-review { display: grid; justify-items: start; gap: 8px; margin-top: 12px; }
    .review-badge { padding: 4px 9px; border-radius: 8px; background: #e0f5e8; color: #185d38; font-weight: 650; }
    .review-feedback { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; }
    .saved-status { margin-top: 9px; }
    h3[tabindex] { scroll-margin-top: 20px; }
    form { display: grid; gap: 8px; margin-top: 12px; }
    label { display: grid; gap: 3px; margin: 0; }
    input { max-width: 180px; }
    form button { justify-self: start; }
  `],
})
export class AssignmentReviewComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly courseId = this.route.snapshot.paramMap.get('id');
  readonly assignmentId = this.route.snapshot.paramMap.get('assignmentId');
  readonly returnFilters = {
    kind: this.route.snapshot.queryParamMap.get('kind'),
    lesson: this.route.snapshot.queryParamMap.get('lesson'),
  };
  private readonly path = '/courses/' + this.courseId + '/assignments/' + encodeURIComponent(this.assignmentId ?? '') + '/submissions';
  readonly roster = signal<Roster | null>(null);
  readonly error = signal('');
  readonly saved = signal('');
  readonly editing = signal('');
  readonly busy = signal(false);
  readonly ungraded = computed(() => {
    const roster = this.roster();
    return roster?.assignment.maxPoints != null ? roster.submissions.filter(item => item.score == null) : [];
  });
  readonly allGraded = computed(() => {
    const roster = this.roster();
    return roster?.assignment.maxPoints != null && roster.submissions.length > 0 && !this.ungraded().length;
  });

  constructor() { void this.load(); }

  focusNextUngraded(): void {
    const next = this.ungraded()[0];
    if (next) document.getElementById('student-review-' + next.studentId)?.focus();
  }

  private async load(): Promise<void> {
    try { this.roster.set(await this.api.request<Roster>('GET', this.path)); }
    catch (error) { this.showError(error); }
  }

  async download(item: Submission): Promise<void> {
    if (this.busy() || !item.fileName) return;
    this.busy.set(true);
    this.error.set('');
    try { await downloadAssignmentFile(this.api, this.studentPath(item) + '/file', item.fileName); }
    catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  async review(item: Submission, score: number | null, feedback: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.saved.set('');
    try {
      await this.api.request('PUT', this.studentPath(item) + '/review', { score, feedback });
      this.roster.update(data => data && { ...data, submissions: data.submissions.map(row =>
        row.studentId === item.studentId ? { ...row, score, feedback: feedback.trim() } : row) });
      if (this.editing() === item.studentId) this.editing.set('');
      this.saved.set(item.studentId);
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  private studentPath(item: Submission): string {
    return this.path + '/' + encodeURIComponent(item.studentId);
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Unable to complete this request.');
  }
}
