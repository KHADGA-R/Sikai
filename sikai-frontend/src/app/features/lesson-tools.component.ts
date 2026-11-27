import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { formatTime } from '../core/instructor-content';

export type LessonTool = 'Q&A' | 'Notes' | 'Announcements';
interface Item {
  id: string; body: string; createdAt: number; seconds: number | null;
  author?: string; answer?: string; lessonId?: number; lessonTitle?: string;
  title?: string; unread?: boolean;
}

@Component({
  selector: 'app-lesson-tools',
  imports: [DatePipe, FormsModule],
  template: `
    <h2>{{ tool() }}</h2>
    @if (tool() === 'Q&A') {
      <label class="scope">Show questions
        <select [ngModel]="allLessons()" (ngModelChange)="allLessons.set($event)">
          <option [ngValue]="false">This lesson</option>
          <option [ngValue]="true">All lessons</option>
        </select>
      </label>
    }
    @if (tool() === 'Notes') {
      <p>Private to you.</p>
      @if (!composing()) {
        <button type="button" class="button outline" (click)="startNote()">Add note</button>
      }
    }
    @if (tool() === 'Q&A' || (tool() === 'Notes' && composing()) || (tool() === 'Announcements' && teacher())) {
      <form (ngSubmit)="create()">
        @if (tool() === 'Announcements') {
          <label>Title <input name="title" [(ngModel)]="title" required maxlength="160"></label>
        }
        <label>{{ tool() === 'Q&A' ? 'Ask about this lesson' : tool() === 'Notes' ? 'Your note' : 'Announcement' }}
          <textarea name="body" [(ngModel)]="body" required maxlength="3000" rows="3"></textarea>
        </label>
        @if (tool() === 'Q&A' && canTimestamp()) {
          <label class="inline"><input name="attachTime" type="checkbox" [(ngModel)]="attachTime"> Include current playback time</label>
        }
        @if (tool() === 'Notes' && noteTime != null) { <small>At {{ formatTime(noteTime) }}</small> }
        <div class="actions">
          <button type="submit" class="button primary" [disabled]="busy() || !body.trim() || (tool() === 'Announcements' && !title.trim())">
            {{ tool() === 'Notes' ? 'Save note' : tool() === 'Q&A' ? 'Post question' : 'Post announcement' }}
          </button>
          @if (tool() === 'Notes') {
            <button type="button" class="button outline" (click)="composing.set(false)">Cancel</button>
          }
        </div>
      </form>
    }
    @if (error()) {
      <p class="error-note" role="alert">{{ error() }}</p>
      <button type="button" class="button outline" (click)="refresh()">Refresh</button>
    }
    @if (loading()) { <p role="status">Loading {{ tool() }}…</p> }
    @else if (!error() && !items().length) {
      <p>{{ tool() === 'Notes' ? 'No notes for this lesson yet.' : tool() === 'Q&A' ? 'No questions yet.' : 'No announcements yet.' }}</p>
    }
    @for (item of items(); track item.id) {
      <article>
        <header>
          @if (item.title || item.author) { <strong>{{ item.title || item.author }}</strong> }
          <small>{{ item.createdAt | date:'mediumDate' }}</small>
          @if (item.unread && !teacher()) { <span class="unread">New</span> }
        </header>
        @if (tool() === 'Q&A' && allLessons()) { <small>{{ item.lessonTitle }}</small> }
        @if (item.seconds != null) {
          <button type="button" class="timestamp" [attr.aria-label]="'Jump to ' + formatTime(item.seconds) + (item.lessonTitle ? ' in ' + item.lessonTitle : '')"
            (click)="seek.emit({ lessonId: item.lessonId ?? lessonId(), seconds: item.seconds })">{{ formatTime(item.seconds) }}</button>
        }
        <p class="entry">{{ item.body }}</p>
        @if (item.answer) {
          <div class="answer"><strong>Instructor answer</strong><p class="entry">{{ item.answer }}</p></div>
        }
        @if (editing() === item.id) {
          <form (ngSubmit)="saveEdit(item)">
            <label>{{ tool() === 'Notes' ? 'Edit note' : 'Instructor answer' }}
              <textarea name="editBody" [(ngModel)]="editBody" required maxlength="3000" rows="3"></textarea>
            </label>
            <div class="actions">
              <button type="submit" class="button primary" [disabled]="busy() || !editBody.trim()">Save</button>
              <button type="button" class="button outline" (click)="editing.set(null)">Cancel</button>
            </div>
          </form>
        } @else {
          <div class="actions">
            @if (tool() === 'Q&A' && teacher()) {
              <button type="button" class="button outline" (click)="edit(item.id, item.answer ?? '')">{{ item.answer ? 'Edit answer' : 'Answer' }}</button>
            }
            @if (tool() === 'Notes') {
              <button type="button" class="button outline" (click)="edit(item.id, item.body)">Edit note</button>
              <button type="button" class="button outline" [disabled]="busy()" (click)="removeNote(item.id)">Delete note</button>
            }
            @if (tool() === 'Announcements' && item.unread && !teacher()) {
              <button type="button" class="button outline" [disabled]="busy()" (click)="markRead(item.id)">Mark as read</button>
            }
          </div>
        }
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    h2 { font-size: 1.15rem; }
    form { display: grid; gap: 10px; margin-block: 12px; max-width: 720px; }
    label { display: grid; gap: 6px; font-weight: 650; }
    label.inline, label.scope { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    input:not([type=checkbox]), select, textarea { border: 1px solid #c8d4ce; border-radius: 8px; padding: 8px; color: inherit; background: white; }
    textarea { resize: vertical; }
    .actions, header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    article { border-top: 1px solid #e8e2ef; padding: 14px 0; margin-top: 8px; overflow-wrap: anywhere; }
    .entry { white-space: pre-wrap; margin-block: 8px; }
    .answer { padding: 10px 12px; margin: 8px 0; border-inline-start: 3px solid var(--sikai-teal); background: #f1f6f2; }
    .timestamp, .unread { color: var(--sikai-teal); background: #e8f2ed; border: 1px solid #c8d4ce; border-radius: 6px; padding: 3px 7px; }
    .timestamp { margin-inline-start: 6px; }
    .button { padding: 7px 11px; }
    .button:disabled { opacity: .55; cursor: default; }
  `,
})
export class LessonToolsComponent {
  private readonly api = inject(ApiService);
  readonly courseId = input.required<number>();
  readonly lessonId = input.required<number>();
  readonly tool = input.required<LessonTool>();
  readonly teacher = input(false);
  readonly canTimestamp = input(false);
  readonly playbackTime = input<() => number | null>(() => null);
  readonly seek = output<{ lessonId: number; seconds: number }>();
  readonly items = signal<Item[]>([]);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly allLessons = signal(false);
  readonly composing = signal(false);
  readonly editing = signal<string | null>(null);
  readonly formatTime = formatTime;
  private readonly version = signal(0);
  private readonly base = computed(() => '/courses/' + this.courseId() + '/learning');
  private readonly lessonPath = computed(() => this.base() + '/lessons/' + this.lessonId());
  private readonly listPath = computed(() => {
    switch (this.tool()) {
      case 'Q&A': return this.base() + '/questions' + (this.allLessons() ? '' : '?lessonId=' + this.lessonId());
      case 'Notes': return this.lessonPath() + '/notes';
      case 'Announcements': return this.base() + '/announcements';
    }
  });
  body = '';
  title = '';
  editBody = '';
  attachTime = false;
  noteTime: number | null = null;

  constructor() {
    effect(onCleanup => {
      const path = this.listPath();
      this.version();
      let current = true;
      onCleanup(() => current = false);
      this.loading.set(true);
      this.error.set('');
      this.api.request<Item[]>('GET', path).then(items => {
        if (current) this.items.set(items);
      }).catch(error => {
        if (current) this.error.set(error.message);
      }).finally(() => {
        if (current) this.loading.set(false);
      });
    });
  }

  refresh(): void { this.version.update(n => n + 1); }

  startNote(): void {
    this.noteTime = this.playbackTime()();
    this.composing.set(true);
  }

  async create(): Promise<void> {
    const body = this.body.trim();
    if (!body) return;
    const tool = this.tool();
    const path = tool === 'Q&A' ? this.lessonPath() + '/questions' : this.listPath();
    const payload = tool === 'Announcements'
      ? { body, title: this.title.trim() }
      : { body, seconds: tool === 'Notes' ? this.noteTime : this.attachTime ? this.playbackTime()() : null };
    if (await this.write('POST', path, payload)) {
      this.body = '';
      this.title = '';
      this.attachTime = false;
      this.composing.set(false);
    }
  }

  edit(id: string, body: string): void {
    this.editBody = body;
    this.editing.set(id);
  }

  async saveEdit(item: Item): Promise<void> {
    const path = this.tool() === 'Notes'
      ? this.lessonPath() + '/notes/' + item.id
      : this.base() + '/questions/' + item.id + '/answer';
    if (this.editBody.trim() && await this.write('PUT', path, { body: this.editBody.trim() })) this.editing.set(null);
  }

  async removeNote(id: string): Promise<void> {
    if (window.confirm('Delete this note?')) await this.write('DELETE', this.lessonPath() + '/notes/' + id);
  }

  async markRead(id: string): Promise<void> {
    await this.write('PUT', this.base() + '/announcements/' + id + '/read');
  }

  private async write(method: string, path: string, body?: unknown): Promise<boolean> {
    if (this.busy()) return false;
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.request(method, path, body);
      this.refresh();
      return true;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save.');
      return false;
    } finally { this.busy.set(false); }
  }
}
