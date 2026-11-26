import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Activity, ActivityTarget, ActivityTile, AssignmentActivityPlayerComponent, Placement } from './assignment-activity-player.component';

interface AnswerCard extends ActivityTile { targetId: number | null; }
interface PublishedActivity extends Activity { title: string; instructions: string; placements?: Placement[]; }

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, AssignmentActivityPlayerComponent],
  template: `
    <section class="container section activity-page">
      <a [routerLink]="backLink" [queryParams]="backFilters">Back to assignments</a>
      @if (building) {
        <h1>New drag-and-drop activity</h1>
        <form class="panel builder" (ngSubmit)="publish()">
          <fieldset [disabled]="saving()">
            <label>Title <input [(ngModel)]="title" name="title" maxlength="160" required /></label>
            <label>Instructions <textarea [(ngModel)]="instructions" name="instructions" maxlength="4000" rows="2"></textarea></label>
            <div class="fields">
              <label>Activity format <select [(ngModel)]="mode" name="mode">
                <option value="match">Match</option><option value="sort">Sort</option><option value="label">Label a picture</option>
              </select></label>
              <label>Assignment type <select [(ngModel)]="kind" name="kind">
                <option value="classwork">Classwork</option><option value="homework">Homework</option>
              </select></label>
              <label>Lesson <select [(ngModel)]="lessonId" name="lesson">
                <option [ngValue]="null">Course-wide</option>
                @for (lesson of lessons(); track lesson.id) { <option [ngValue]="lesson.id">{{ lesson.label }}</option> }
              </select></label>
              <label>Due date <input type="datetime-local" [(ngModel)]="due" name="due" /></label>
              <label>Maximum points <input type="number" name="points" min="1" max="10000" step="1" [(ngModel)]="maxPoints" />
                <small>Leave blank for practice with answer checking.</small>
              </label>
            </div>
            @if (mode === 'label') {
              <label>Picture <input type="file" accept="image/png,image/jpeg" (change)="loadPicture($any($event.target).files?.[0])" />
                <small>PNG or JPG, up to 1 MB and 4096 pixels per side.</small>
              </label>
              @if (imageLoading()) { <p role="status">Loading picture…</p> }
              @if (pictureError()) { <p class="error-note" role="alert">{{ pictureError() }}</p> }
              <label>Picture description <input [(ngModel)]="imageAlt" name="imageAlt" maxlength="240"
                placeholder="Describe the picture without giving away the answers" /></label>
            }
            <h2>{{ mode === 'label' ? 'Picture targets' : mode === 'match' ? 'Matching prompts' : 'Sorting groups' }}</h2>
            @if (mode === 'label' && !picture() && !imageLoading()) {
              <p>Upload a picture to place your selected target.</p>
            }
            @if (mode === 'label' && picture()) {
              <p>Select a target below, then click its location on the picture. You can also focus the picture and use the arrow keys.</p>
              <div class="pin-editor" tabindex="0" role="group" aria-label="Position target on picture"
                   (click)="positionTarget($event)" (keydown)="keyboardPosition($event)">
                <img [src]="picture()" [alt]="imageAlt || 'Activity picture'" />
                @for (target of targets; track target.id; let i = $index) {
                  @if (target.x != null && target.y != null) {
                    <span class="pin-marker" [class.selected-pin]="target.id === selectedTarget()"
                          [style.left.%]="target.x * 100" [style.top.%]="target.y * 100">{{ i + 1 }}</span>
                  }
                }
              </div>
            }
            @for (target of targets; track target.id; let i = $index) {
              <div class="builder-row" [class.position-row]="mode === 'label'">
                <label>{{ mode === 'label' ? 'Target' : mode === 'match' ? 'Prompt' : 'Group' }} {{ i + 1 }}
                  <input [name]="'target' + target.id" [(ngModel)]="target.label" maxlength="100" required /></label>
                @if (mode === 'label') {
                  <button type="button" class="button outline"
                    [attr.aria-pressed]="selectedTarget() === target.id"
                    [attr.aria-label]="'Position target ' + (i + 1)" (click)="selectedTarget.set(target.id)">
                    {{ target.x == null ? 'Set position' : 'Move target' }}
                  </button>
                }
                <button type="button" class="button outline" [disabled]="targets.length <= 2"
                        [attr.aria-label]="'Remove target ' + (i + 1)" (click)="removeTarget(target.id)">Remove</button>
              </div>
            }
            <button type="button" class="button outline" [disabled]="targets.length >= 12" (click)="addTarget()">Add target</button>
            <h2>Answer cards</h2>
            @for (card of cards; track card.id; let i = $index) {
              <div class="builder-row card-row">
                <label>Card {{ i + 1 }} <input [name]="'card' + card.id" [(ngModel)]="card.label" maxlength="80" required /></label>
                <label>Correct target for card {{ i + 1 }}
                  <select [name]="'key' + card.id" [(ngModel)]="card.targetId" required>
                    <option [ngValue]="null">Choose target</option>
                    @for (target of targets; track target.id; let j = $index) {
                      <option [ngValue]="target.id">{{ target.label.trim() || 'Target ' + (j + 1) }}</option>
                    }
                  </select>
                </label>
                <button type="button" class="button outline" [disabled]="cards.length <= 2"
                        [attr.aria-label]="'Remove card ' + (i + 1)" (click)="removeCard(card.id)">Remove</button>
              </div>
            }
            <button type="button" class="button outline" [disabled]="cards.length >= 30" (click)="addCard()">Add card</button>
            <div class="actions">
              <button type="button" class="button outline" [disabled]="imageLoading()" (click)="previewActivity()">Preview as student</button>
              <button type="submit" class="button primary" [disabled]="imageLoading()">{{ saving() ? 'Publishing…' : 'Publish activity' }}</button>
            </div>
          </fieldset>
        </form>
        @if (preview(); as activity) {
          <section class="preview">
            <div class="actions"><h2>Student preview</h2><button type="button" class="button outline" (click)="preview.set(null)">Close preview</button></div>
            @if (instructions.trim()) { <p class="instructions">{{ instructions }}</p> }
            <app-assignment-activity-player [activity]="activity" />
          </section>
        }
      } @else if (published(); as activity) {
        <h1>{{ activity.title }}</h1>
        @if (activity.instructions) { <p class="instructions">{{ activity.instructions }}</p> }
        <app-assignment-activity-player [activity]="activity" [resource]="attemptResource()"
          [closed]="!!activity.unpublished" [readonlyMode]="!!submissionId" [display]="activity.placements ?? null" />
      } @else if (!error()) {
        <p role="status">Loading activity…</p>
      }
      @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: [`
    .activity-page { max-width: 900px; }
    .builder { padding: 14px; }
    fieldset { padding: 0; margin: 0; border: 0; min-width: 0; display: grid; gap: 9px; }
    label { display: grid; gap: 3px; margin: 0; min-width: 0; }
    .fields, .builder-row { display: grid; gap: 8px; align-items: end; }
    .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .builder-row { grid-template-columns: minmax(0, 1fr) auto; }
    .position-row { grid-template-columns: minmax(0, 1fr) auto auto; }
    .card-row { grid-template-columns: repeat(2, minmax(0, 1fr)) auto; }
    .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .preview { margin-top: 16px; }
    .instructions { white-space: pre-wrap; overflow-wrap: anywhere; }
    .pin-editor { position: relative; max-width: 640px; cursor: crosshair; }
    .pin-editor img { display: block; width: 100%; height: auto; }
    .pin-marker { display: grid; place-items: center; position: absolute; transform: translate(-50%, -50%);
      width: 34px; height: 34px; border-radius: 50%; border: 2px solid white; background: #18599b; color: white; pointer-events: none; }
    .pin-marker.selected-pin { outline: 3px solid #d18a19; }
    .position-row button[aria-pressed=true] { background: #e4effa; border-color: #18599b; }
    fieldset > button { justify-self: start; }
    h2 { font-size: 1.1rem; margin: 8px 0 0; }
    @media (max-width: 540px) { .fields, .builder-row, .card-row { grid-template-columns: 1fr; } }
  `],
})
export class AssignmentActivityComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseId = this.route.snapshot.paramMap.get('id');
  private readonly assignmentId = this.route.snapshot.paramMap.get('assignmentId');
  readonly submissionId = this.route.snapshot.paramMap.get('studentId');
  private readonly path = '/courses/' + this.courseId + '/assignments';
  readonly attemptResource = () => this.auth.user()?.role === 'student' && !this.submissionId
    ? this.path + '/' + this.assignmentId + '/activity/attempt' : '';
  private readonly query = this.route.snapshot.queryParamMap;
  readonly building = this.assignmentId === null;
  readonly backLink = this.submissionId && this.submissionId !== 'me'
    ? ['/courses', this.courseId, 'assignments', this.assignmentId, 'submissions']
    : this.query.get('from') === 'dashboard' ? ['/my-assignments'] : ['/courses', this.courseId, 'assignments'];
  readonly backFilters = {
    course: this.query.get('course'), lesson: this.query.get('lesson'), kind: this.query.get('kind'),
    status: this.query.get('status'), sort: this.query.get('sort'),
  };
  readonly published = signal<PublishedActivity | null>(null);
  readonly preview = signal<Activity | null>(null);
  readonly lessons = signal<ActivityTile[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly picture = signal('');
  readonly pictureError = signal('');
  readonly imageLoading = signal(false);
  readonly selectedTarget = signal<number | null>(null);
  imageAlt = '';
  private pictureRequest = 0;
  title = '';
  instructions = '';
  mode: Activity['mode'] = 'match';
  kind = 'classwork';
  lessonId: number | null = null;
  due = '';
  maxPoints: number | null = null;
  targets: ActivityTarget[] = [{ id: 1, label: '' }, { id: 2, label: '' }];
  cards: AnswerCard[] = [{ id: 1, label: '', targetId: null }, { id: 2, label: '', targetId: null }];
  private nextTarget = 3;
  private nextCard = 3;

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    try {
      if (this.building) {
        const result = await this.api.request<{ lessons: { id: number; title: string }[] }>('GET', this.path);
        this.lessons.set(result.lessons.map(lesson => ({ id: lesson.id, label: lesson.title })));
        const lesson = Number(this.query.get('lesson'));
        if (this.lessons().some(item => item.id === lesson)) this.lessonId = lesson;
      } else {
        const submission = this.submissionId ? '/submissions/' + encodeURIComponent(this.submissionId) : '';
        this.published.set(await this.api.request<PublishedActivity>('GET', this.path + '/' + this.assignmentId + submission + '/activity'));
      }
    } catch (error) { this.showError(error); }
  }

  addTarget(): void { this.targets.push({ id: this.nextTarget++, label: '' }); }
  removeTarget(id: number): void {
    this.targets = this.targets.filter(target => target.id !== id);
    if (this.selectedTarget() === id) this.selectedTarget.set(null);
    for (const card of this.cards) if (card.targetId === id) card.targetId = null;
  }
  addCard(): void { this.cards.push({ id: this.nextCard++, label: '', targetId: null }); }
  removeCard(id: number): void { this.cards = this.cards.filter(card => card.id !== id); }

  async loadPicture(file?: File): Promise<void> {
    if (!file) return;
    const request = ++this.pictureRequest;
    this.pictureError.set('');
    this.imageLoading.set(true);
    try {
      if (file.size > 1024 * 1024) {
        throw new Error('Choose a PNG or JPG up to 1 MB.');
      }
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
      const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
      if (!png && !jpeg) throw new Error('This file is not a PNG or JPG. Export it in one of those formats and upload it again.');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Unable to read the picture.'));
        reader.readAsDataURL(new Blob([file], { type: png ? 'image/png' : 'image/jpeg' }));
      });
      const image = new Image();
      image.src = data;
      await image.decode().catch(() => { throw new Error('This picture could not be opened. Upload a new PNG or JPG copy.'); });
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('Use a picture up to 4096 pixels per side.');
      if (request !== this.pictureRequest) return;
      this.picture.set(data);
      for (const target of this.targets) { delete target.x; delete target.y; }
      this.selectedTarget.update(target => target ?? this.targets[0].id);
      this.preview.set(null);
    } catch (error) {
      if (request === this.pictureRequest) this.pictureError.set(error instanceof Error ? error.message : 'Unable to open the picture.');
    } finally {
      if (request === this.pictureRequest) this.imageLoading.set(false);
    }
  }

  positionTarget(event: MouseEvent): void {
    const rectangle = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.setPosition((event.clientX - rectangle.left) / rectangle.width, (event.clientY - rectangle.top) / rectangle.height);
  }

  keyboardPosition(event: KeyboardEvent): void {
    const target = this.targets.find(item => item.id === this.selectedTarget());
    if (!target) return;
    const x = event.key === 'ArrowLeft' ? -.02 : event.key === 'ArrowRight' ? .02 : 0;
    const y = event.key === 'ArrowUp' ? -.02 : event.key === 'ArrowDown' ? .02 : 0;
    if (!x && !y && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.setPosition((target.x ?? .5) + x, (target.y ?? .5) + y);
  }

  private setPosition(x: number, y: number): void {
    const target = this.targets.find(item => item.id === this.selectedTarget());
    if (!target) return;
    const bounded = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
    target.x = bounded(x);
    target.y = bounded(y);
  }

  previewActivity(): void {
    this.error.set('');
    if (!this.ready()) return;
    this.preview.set({
      mode: this.mode, targets: this.targets.map(target => ({ ...target, label: target.label.trim() })),
      cards: this.cards.map(card => ({ id: card.id, label: card.label.trim() })),
      image: this.mode === 'label' ? this.picture() : undefined, imageAlt: this.imageAlt.trim(),
    });
  }

  async publish(): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    if (!this.ready()) return;
    const assigned = new Set(this.cards.map(card => card.targetId));
    if (assigned.has(null) || (this.mode !== 'sort' && (assigned.size !== this.cards.length || assigned.size !== this.targets.length))) {
      this.error.set(this.mode === 'sort' ? 'Choose a correct group for each card.' : 'Give each target exactly one correct card.');
      return;
    }
    const dueAt = this.due ? new Date(this.due).getTime() : null;
    if (dueAt !== null && !Number.isFinite(dueAt)) {
      this.error.set('Enter a valid due date.');
      return;
    }
    this.saving.set(true);
    try {
      await this.api.request('POST', this.path + '/activities', {
        assignment: { title: this.title, instructions: this.instructions, kind: this.kind, lessonId: this.lessonId, dueAt, maxPoints: this.maxPoints },
        activity: { mode: this.mode, targets: this.targets, cards: this.cards,
          imageAlt: this.mode === 'label' ? this.imageAlt.trim() : null },
        image: this.mode === 'label' ? this.picture() : null,
      });
      await this.router.navigate(this.backLink);
    } catch (error) { this.showError(error); }
    finally { this.saving.set(false); }
  }

  private ready(): boolean {
    const ready = [...this.targets, ...this.cards].every(tile => tile.label.trim());
    if (!ready) this.error.set('Add a label to every target and card.');
    if (!ready || this.mode !== 'label') return ready;
    const placed = this.picture() && this.imageAlt.trim() && this.targets.every(target => target.x != null && target.y != null);
    if (!placed) this.error.set('Add a picture, describe it, and position every target.');
    return !!placed;
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Unable to load or publish the activity.');
  }
}
