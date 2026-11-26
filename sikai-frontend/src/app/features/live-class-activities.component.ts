import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { Activity, AssignmentActivityPlayerComponent, Placement } from './assignment-activity-player.component';

interface LiveActivity extends Activity { title: string; instructions: string; }
interface Progress {
  studentId: string; studentName: string; state: 'waiting' | 'working' | 'finished';
  correct?: number; total?: number; elapsedMillis?: number; rank?: number;
}
interface CardReview { cardId: number; cardLabel: string; placedTarget: string | null; expectedTarget: string; correct: boolean; }
interface ClassSummary { submitted: number; allCorrect: number; mostMissed: { label: string; count: number }[]; }
interface Run {
  active: true;
  runId: string;
  assignmentId: string;
  round: number;
  activity: LiveActivity;
  closed: boolean;
  published: boolean;
  expired?: boolean;
  remainingMillis?: number;
  solution?: Placement[];
  progress?: Progress[];
  summary?: ClassSummary;
  summaryShared?: boolean;
  grade?: { score: number; maxPoints: number; feedback: string };
}
interface LibraryItem { id: string; title: string; courseTitle: string; published: boolean; }

@Component({
  selector: 'app-live-class-activities',
  standalone: true,
  imports: [AssignmentActivityPlayerComponent, ThemeIconComponent],
  template: `
      <aside class="panel activity-panel" aria-label="Class activities" [hidden]="!open()">
        <div class="heading"><h2>Class activities</h2>
          <button type="button" (click)="setOpen(false)">Back to whiteboard</button>
        </div>
        @if (teacher()) {
          <label>Activity
            <select aria-label="Choose activity" [value]="choice()" (change)="select($any($event.target).value)">
              <option value="">Choose an activity</option>
              @for (item of library(); track item.id) {
                <option [value]="item.id">{{ item.title }} · {{ item.courseTitle }}{{ item.published ? '' : ' (Unpublished)' }}</option>
              }
            </select>
          </label>
          <button type="button" [disabled]="libraryLoading()" (click)="loadLibrary()">
            {{ libraryLoading() ? 'Refreshing activities…' : 'Refresh activities' }}
          </button>
          <label>Time limit (minutes)
            <input type="number" aria-label="Time limit (minutes)" min="1" max="120" step="1" placeholder="No time limit"
                   [value]="duration()" [disabled]="busy()" (input)="duration.set($any($event.target).value)" />
          </label>
          @if (!validDuration()) { <p class="error-note">Enter a whole number from 1 to 120 minutes.</p> }
          @if (libraryError()) { <p class="error-note" role="alert">{{ libraryError() }}</p> }
          @else if (libraryLoaded() && !library().length) {
            <p>No activities found. Use this teacher account to publish a drag-and-drop activity in a published course.</p>
          }
          <div class="heading">
            <button type="button" [disabled]="busy() || !choice()" (click)="loadPreview()">Preview activity</button>
            <div class="activity-actions">
              @if (selection(); as selected) {
                <button type="button" [disabled]="busy()" (click)="setPublication(selected)">
                  {{ selected.published ? 'Unpublish activity' : 'Republish activity' }}
                </button>
              }
              <button type="button" class="button primary" [disabled]="busy() || !selection()?.published || !validDuration()" (click)="launch(choice())">
                {{ choice() && choice() === run()?.assignmentId ? 'Run again' : 'Launch for class' }}
              </button>
            </div>
          </div>
          @if (preview(); as sample) {
            <div class="heading"><h4>Preview</h4><button type="button" (click)="preview.set(null)">Close preview</button></div>
            @if (sample.instructions) { <p class="instructions">{{ sample.instructions }}</p> }
            <app-assignment-activity-player [activity]="sample" />
          }
        }
        @if (run(); as current) {
          @if (!teacher()) {
            <h3>{{ current.activity.title }}</h3>
            @if (current.activity.instructions.trim() && current.activity.instructions.trim() !== current.activity.title.trim()) {
              <p class="instructions">{{ current.activity.instructions }}</p>
            }
          }
          @if (activityClosed()) {
            @if (timeExpired()) { <p role="status">Time’s up.</p> }
            @else if (!teacher()) { <p role="status">Activity closed</p> }
          } @else if (remainingSeconds() != null) {
            <p class="activity-timer" [class.timer-low]="remainingSeconds()! <= 30" role="timer" aria-label="Time remaining">
              <span>Time left</span> <strong>{{ countdown() }}</strong>
            </p>
          }
          @if (teacher()) {
            @if ((current.published && choice() !== current.assignmentId) || !activityClosed() || !current.solution) {
              <div class="heading">
                @if (current.published && choice() !== current.assignmentId) {
                  <button type="button" [disabled]="busy() || !validDuration()" (click)="launch(current.assignmentId)">Run again</button>
                }
                @if (!activityClosed()) {
                  <button type="button" [disabled]="busy()" (click)="close(false)">Close activity</button>
                }
                @if (!current.solution) {
                  <button type="button" [disabled]="busy()" (click)="close(true)">{{ activityClosed() ? 'Reveal answers' : 'Close and reveal answers' }}</button>
                }
              </div>
            }
            <div class="heading">
              <h4>Student progress @if (choice() !== current.assignmentId) { <span>· {{ current.activity.title }}</span> }</h4>
              <label class="ranking-toggle"><input type="checkbox" [checked]="showRanking()"
                (change)="showRanking.set($any($event.target).checked)" /> Show private ranking</label>
            </div>
            @if (showRanking()) { <p>Ranked by correct placements, then submission time.</p> }
            @for (student of orderedProgress(); track student.studentId) {
              <div class="progress-row">
                <span>@if (showRanking() && student.rank != null) { <strong>#{{ student.rank }}</strong> } {{ student.studentName }}</span>
                @if (student.state === 'finished') {
                  <strong>Finished</strong>
                  <span class="correctness" [class.needs-review]="student.correct !== student.total">
                    <app-theme-icon [name]="student.correct === student.total ? 'check' : 'close'" />
                    {{ student.correct === student.total ? 'Correct' : 'Needs review' }} · {{ student.correct }} of {{ student.total }} correct
                  </span>
                  @if (showRanking() && student.elapsedMillis != null) { <span>{{ elapsed(student.elapsedMillis) }}</span> }
                } @else {
                  <strong>{{ student.state === 'waiting' ? 'Not started' : 'Working' }}</strong>
                }
                <button type="button" [disabled]="student.state === 'waiting' || busy()" (click)="inspect(student)">View work</button>
              </div>
            } @empty { <p>No confirmed students.</p> }
            @if (inspection(); as work) {
              <div class="heading"><h4>{{ work.studentName }}’s work</h4><button type="button" (click)="inspection.set(null)">Close view</button></div>
              <app-assignment-activity-player [activity]="current.activity" [readonlyMode]="true" [display]="work.placements"
                [reviewIncorrect]="work.incorrect" />
              @if (work.review.length) {
                <ul class="missed">
                  @for (card of work.review; track card.cardId) {
                    <li><strong>{{ card.cardLabel }}</strong> · Placed in {{ card.placedTarget ?? 'no target' }} · Expected {{ card.expectedTarget }}</li>
                  }
                </ul>
              }
            }
          } @else {
            @if (current.grade; as grade) {
              <p><strong>Grade {{ grade.score }} / {{ grade.maxPoints }}</strong></p>
              @if (grade.feedback) { <p class="instructions">{{ grade.feedback }}</p> }
            }
            @for (id of [current.runId]; track id) {
              <app-assignment-activity-player [activity]="current.activity" [closed]="activityClosed()"
                [resource]="path() + '/' + id + '/attempt'" />
            }
          }
          @if (current.summary; as summary) {
            <section class="summary" aria-label="Class summary">
              <div class="heading"><h4>Class summary</h4>
                @if (teacher() && activityClosed()) {
                  <button type="button" [disabled]="busy() || (!current.summaryShared && !summary.submitted)"
                    (click)="shareSummary(!current.summaryShared)">
                    {{ current.summaryShared ? 'Hide class summary' : 'Share class summary' }}
                  </button>
                }
              </div>
              @if (summary.submitted) {
                <p>{{ summary.allCorrect }} of {{ summary.submitted }} submissions had every card correct.</p>
                @if (summary.mostMissed.length) {
                  <strong>Most-missed targets</strong>
                  <ul class="missed">
                    @for (target of summary.mostMissed; track target.label) {
                      <li>{{ target.label }} · {{ target.count }} {{ target.count === 1 ? 'missed placement' : 'missed placements' }}</li>
                    }
                  </ul>
                }
              } @else { <p>No submissions yet.</p> }
            </section>
          }
          @if (current.solution; as solution) {
            <h4>Correct placements</h4>
            <app-assignment-activity-player [activity]="current.activity" [readonlyMode]="true" [display]="solution" />
          }
        } @else if (!teacher()) { <p>When your teacher launches an activity, it will appear here.</p> }
        @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }
      </aside>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .activity-panel { padding: 12px; }
    .heading, .progress-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
    h2 { font-size: 1.1rem; } h2,h3,h4 { margin: 0; }
    h3,h4 { margin-top: 12px; }
    label { display: grid; gap: 4px; margin: 8px 0; }
    .progress-row { padding: 5px 0; border-bottom: 1px solid #e4ede9; }
    .ranking-toggle { display: flex; align-items: center; gap: 5px; }
    .ranking-toggle input { width: auto; margin: 0; }
    .correctness { display: inline-flex; align-items: center; gap: 4px; color: #18573c; font-size: .85rem; font-weight: 650; }
    .correctness.needs-review { color: #8a430e; }
    .correctness app-theme-icon { width: 16px; height: 16px; }
    .summary { margin-top: 12px; padding: 8px; border: 1px solid #dbe9e4; border-radius: 8px; }
    .missed { margin: 5px 0; padding-inline-start: 20px; }
    button { border: 1px solid #bbcfc8; border-radius: 6px; background: white; color: #1d3434; padding: 5px 7px; }
    .instructions { white-space: pre-wrap; overflow-wrap: anywhere; }
    .activity-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .activity-timer { display: inline-flex; gap: 8px; align-items: center; padding: 5px 9px; border-radius: 8px;
      color: #174b42; background: #e7f4ee; font-variant-numeric: tabular-nums; }
    .activity-timer.timer-low { color: #862830; background: #fdf0ef; }
  `],
})
export class LiveClassActivitiesComponent {
  private readonly api = inject(ApiService);
  private readonly destroy = inject(DestroyRef);
  readonly slotId = input.required<string>();
  readonly teacher = input.required<boolean>();
  readonly open = signal(false);
  readonly run = signal<Run | null>(null);
  readonly showRanking = signal(false);
  readonly orderedProgress = computed(() => {
    const students = this.run()?.progress ?? [];
    return this.showRanking() ? [...students].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)) : students;
  });
  readonly library = signal<LibraryItem[]>([]);
  readonly selection = computed(() => this.library().find(item => item.id === this.choice()));
  readonly libraryLoaded = signal(false);
  readonly libraryLoading = signal(false);
  readonly libraryError = signal('');
  readonly choice = signal('');
  readonly duration = signal('');
  readonly validDuration = computed(() => {
    const value = Number(this.duration());
    return this.duration() === '' || Number.isInteger(value) && value >= 1 && value <= 120;
  });
  private readonly timerEnds = signal<number | null>(null);
  private readonly timerNow = signal(performance.now());
  readonly remainingSeconds = computed(() => {
    const end = this.timerEnds();
    return end == null ? null : Math.max(0, Math.ceil((end - this.timerNow()) / 1000));
  });
  readonly timeExpired = computed(() => this.run()?.expired || (!this.run()?.closed && this.remainingSeconds() === 0));
  readonly activityClosed = computed(() => !!this.run()?.closed || this.remainingSeconds() === 0);
  readonly countdown = computed(() => {
    const seconds = this.remainingSeconds() ?? 0;
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly inspection = signal<{ studentName: string; placements: Placement[]; review: CardReview[]; incorrect: number[] } | null>(null);
  readonly preview = signal<LiveActivity | null>(null);
  private pending = false;
  private stopped = false;
  private lastRunId?: string;

  constructor() {
    effect(() => {
      this.slotId();
      void this.refresh();
    });
    const interval = window.setInterval(() => { if (!document.hidden && !this.busy()) void this.refresh(); }, 2200);
    const clock = window.setInterval(() => { if (this.timerEnds() != null) this.timerNow.set(performance.now()); }, 250);
    const refreshOnFocus = () => { if (this.open() && this.teacher()) void this.loadLibrary(); };
    window.addEventListener('focus', refreshOnFocus);
    this.destroy.onDestroy(() => {
      this.stopped = true;
      window.clearInterval(interval);
      window.clearInterval(clock);
      window.removeEventListener('focus', refreshOnFocus);
    });
  }

  path(): string { return '/live-classes/slots/' + encodeURIComponent(this.slotId()) + '/activities'; }

  setOpen(open: boolean): void {
    this.open.set(open);
    if (open && this.teacher()) void this.loadLibrary();
  }

  select(id: string): void { this.choice.set(id); this.preview.set(null); }

  async loadPreview(): Promise<void> {
    const id = this.choice();
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const sample = await this.api.request<LiveActivity>('GET', this.path() + '/library/' + encodeURIComponent(id));
      if (id === this.choice()) this.preview.set(sample);
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  async loadLibrary(): Promise<void> {
    if (!this.teacher() || this.libraryLoading() || this.stopped) return;
    this.libraryLoading.set(true);
    this.libraryError.set('');
    try {
      const items = await this.api.request<LibraryItem[]>('GET', this.path() + '/library');
      if (this.stopped) return;
      this.library.set(items);
      if (!items.some(item => item.id === this.choice())) this.select('');
      this.libraryLoaded.set(true);
    } catch (error) {
      if (!this.stopped) this.libraryError.set(error instanceof Error ? error.message : 'Unable to refresh the activity list.');
    } finally { this.libraryLoading.set(false); }
  }

  private async refresh(): Promise<void> {
    if (this.pending || this.stopped) return;
    this.pending = true;
    try {
      const state = await this.api.request<Run | { active: false }>('GET', this.path());
      if (this.stopped) return;
      if (!state.active) {
        if (!this.teacher() && this.run()) this.open.set(false);
        this.run.set(null);
        this.timerEnds.set(null);
        return;
      }
      const now = performance.now();
      this.timerNow.set(now);
      this.timerEnds.set(state.remainingMillis == null ? null : now + state.remainingMillis);
      const previous = this.run();
      if (!this.teacher() && previous?.published && !state.published) this.open.set(false);
      if (previous?.runId === state.runId) {
        this.run.set({ ...state, activity: previous.activity, solution: previous.solution ?? state.solution });
      } else {
        if (state.activity.mode === 'label') {
          const { image } = await this.api.request<{ image: string }>('GET', this.path() + '/' + state.runId + '/picture');
          if (this.stopped) return;
          state.activity = { ...state.activity, image };
        }
        this.run.set(state);
        this.inspection.set(null);
      }
      if (this.lastRunId !== state.runId) {
        this.lastRunId = state.runId;
        if (!this.teacher() && state.published) this.open.set(true);
      }
    } catch (error) { this.showError(error); }
    finally { this.pending = false; }
  }

  async launch(assignmentId: string): Promise<void> {
    if (!assignmentId || this.busy() || !this.validDuration()) return;
    if (this.run() && !this.activityClosed() && !window.confirm('End the current round and start a new one?')) return;
    await this.write('POST', this.path(), {
      assignmentId, durationMinutes: this.duration() === '' ? null : Number(this.duration()),
    });
  }

  async close(reveal: boolean): Promise<void> {
    const current = this.run();
    if (!current || this.busy()) return;
    await this.write('PATCH', this.path() + '/' + current.runId, { reveal });
  }

  async setPublication(selected: LibraryItem): Promise<void> {
    if (this.busy()) return;
    const published = !selected.published;
    if (!published && !window.confirm('Unpublish this activity and close any open rounds? Saved work and grades will be preserved.')) return;
    await this.write('PATCH', this.path() + '/library/' + encodeURIComponent(selected.id) + '/publication', { published });
    await this.loadLibrary();
  }

  async shareSummary(shared: boolean): Promise<void> {
    const current = this.run();
    if (!current || this.busy()) return;
    await this.write('PATCH', this.path() + '/' + current.runId + '/summary', { shared });
  }

  elapsed(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  async inspect(student: Progress): Promise<void> {
    const current = this.run();
    if (!current || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const work = await this.api.request<{ placements: Placement[]; review?: CardReview[] }>('GET',
        this.path() + '/' + current.runId + '/students/' + encodeURIComponent(student.studentId));
      if (this.run()?.runId === current.runId) {
        const review = (work.review ?? []).filter(card => !card.correct);
        this.inspection.set({ studentName: student.studentName, placements: work.placements, review,
          incorrect: review.map(card => card.cardId) });
      }
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  private async write(method: string, path: string, body: unknown): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try { await this.api.request(method, path, body); this.preview.set(null); await this.refresh(); }
    catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Unable to open class activities.');
  }
}
