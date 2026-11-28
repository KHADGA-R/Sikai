import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { formatTime } from '../core/instructor-content';
import { ThemeIconComponent } from '../shared/theme-icon.component';

export type LessonTool = 'Q&A' | 'Notes' | 'Announcements';
interface Reply { id: string; author: string; body: string; createdAt: number; teacher: boolean; canEdit: boolean; }
interface Item {
  id: string; body: string; createdAt: number; seconds: number | null;
  author?: string; lessonId?: number; lessonTitle?: string;
  replies?: Reply[]; voteCount?: number; voted?: boolean; canVote?: boolean;
  title?: string; unread?: boolean;
}

@Component({
  selector: 'app-lesson-tools',
  imports: [DatePipe, FormsModule, ThemeIconComponent],
  template: `
    <h2>{{ tool() }}</h2>
    @if (tool() === 'Q&A') {
      <div class="actions">
      <label class="scope">Show questions
        <select [ngModel]="allLessons()" (ngModelChange)="allLessons.set($event)">
          <option [ngValue]="false">This lesson</option>
          <option [ngValue]="true">All lessons</option>
        </select>
      </label>
      <label class="scope">Sort by
        <select [ngModel]="sort()" (ngModelChange)="sort.set($event)">
          <option value="newest">Newest</option>
          <option value="votes">Most upvoted</option>
        </select>
      </label>
      </div>
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
    @for (item of sortedItems(); track item.id) {
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
        @if (tool() === 'Q&A') {
          <div class="actions">
            <button type="button" class="button outline vote" [attr.aria-pressed]="!!item.voted"
              [title]="item.voted ? 'Your vote is saved' : item.canVote ? 'Upvote this question' : 'Only students can upvote someone else’s question'"
              [disabled]="busy() || !item.canVote || !!item.voted" (click)="upvote(item)">
              <app-theme-icon [name]="item.voted ? 'check' : 'arrow-up'" />
              {{ item.voted ? 'Voted' : 'Upvote' }} · {{ item.voteCount }}
            </button>
            @if (item.replies?.length) {
              <button type="button" class="button outline" [attr.aria-expanded]="expanded().has(item.id)" (click)="toggleThread(item.id)">
                {{ item.replies?.length }} {{ item.replies?.length === 1 ? 'reply' : 'replies' }}
              </button>
            }
            <button type="button" class="button outline" (click)="startReply(item.id)">Reply</button>
          </div>
          @if (expanded().has(item.id)) {
            <ol class="thread" aria-label="Question replies">
              @for (reply of item.replies; track reply.id) {
                <li>
                  <header><strong>{{ reply.author }}</strong><small>{{ reply.createdAt | date:'mediumDate' }}</small>
                    @if (reply.teacher) { <span class="unread">Teacher</span> }
                  </header>
                  <p class="entry">{{ reply.body }}</p>
                  @if (reply.canEdit && replyTarget()?.replyId !== reply.id) {
                    <button type="button" class="button outline" (click)="startReply(item.id, reply)">Edit reply</button>
                  }
                </li>
              }
            </ol>
            @if (replyTarget()?.questionId === item.id) {
              <form (ngSubmit)="saveReply()">
                <label>{{ replyTarget()?.replyId ? 'Edit your reply' : 'Your reply' }}
                  <textarea name="replyBody" [(ngModel)]="replyBody" required maxlength="3000" rows="2"></textarea>
                </label>
                <div class="actions">
                  <button type="submit" class="button primary" [disabled]="busy() || !replyBody.trim()">{{ replyTarget()?.replyId ? 'Save reply' : 'Post reply' }}</button>
                  <button type="button" class="button outline" (click)="replyTarget.set(null)">Cancel</button>
                </div>
              </form>
            }
          }
        } @else if (editing() === item.id) {
          <form (ngSubmit)="saveEdit(item)">
            <label>Edit note
              <textarea name="editBody" [(ngModel)]="editBody" required maxlength="3000" rows="3"></textarea>
            </label>
            <div class="actions">
              <button type="submit" class="button primary" [disabled]="busy() || !editBody.trim()">Save</button>
              <button type="button" class="button outline" (click)="editing.set(null)">Cancel</button>
            </div>
          </form>
        } @else {
          <div class="actions">
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
    .thread { list-style: none; padding: 0 0 0 12px; margin: 12px 0; border-inline-start: 3px solid #c8d4ce; }
    .thread li { padding: 8px; }
    .thread li + li { border-top: 1px solid #e8e2ef; }
    button[aria-pressed=true] { background: #e8f2ed; border-color: var(--sikai-teal); }
    .vote { gap: 6px; }
    .vote app-theme-icon { width: 16px; height: 16px; }
    .vote[aria-pressed=true]:disabled { opacity: 1; }
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
  readonly sort = signal<'newest' | 'votes'>('newest');
  readonly sortedItems = computed(() => this.sort() === 'votes'
    ? [...this.items()].sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0) || b.createdAt - a.createdAt)
    : this.items());
  readonly expanded = signal<Set<string>>(new Set());
  readonly replyTarget = signal<{ questionId: string; replyId?: string } | null>(null);
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
  replyBody = '';
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
    const path = this.lessonPath() + '/notes/' + item.id;
    if (this.editBody.trim() && await this.write('PUT', path, { body: this.editBody.trim() })) this.editing.set(null);
  }

  toggleThread(id: string): void {
    this.expanded.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  startReply(questionId: string, reply?: Reply): void {
    if (!this.expanded().has(questionId)) this.toggleThread(questionId);
    this.replyBody = reply?.body ?? '';
    this.replyTarget.set({ questionId, replyId: reply?.id });
  }

  async saveReply(): Promise<void> {
    const target = this.replyTarget();
    const body = this.replyBody.trim();
    if (!target || !body) return;
    const path = this.base() + '/questions/' + target.questionId + '/replies';
    if (await this.write(target.replyId ? 'PUT' : 'POST', target.replyId ? path + '/' + target.replyId : path, { body })
      && this.replyTarget() === target) this.replyTarget.set(null);
  }

  async upvote(item: Item): Promise<void> {
    if (!item.canVote || item.voted) return;
    if (await this.write('PUT', this.base() + '/questions/' + item.id + '/vote')) {
      this.items.update(items => items.map(question => question.id === item.id && !question.voted
        ? { ...question, voted: true, voteCount: (question.voteCount ?? 0) + 1 }
        : question));
    }
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
