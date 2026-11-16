import { ActivatedRoute, RouterLink } from '@angular/router';
import { COURSE_CATEGORIES, subcategoriesFor } from '../core/categories';
import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { InstructorContentService } from '../core/instructor-content.service';
import { InstructorCourse, InstructorLesson, InstructorTopic, formatTime, parseChapters } from '../core/instructor-content';

@Component({ standalone: true, imports: [FormsModule, RouterLink], templateUrl: './instructor.component.html', styleUrl: './instructor.component.css' })
export class InstructorComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(InstructorContentService);
  private readonly auth = inject(AuthService);
  readonly courses = signal<InstructorCourse[]>([]);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  draft: InstructorCourse | null = null;
  preview: InstructorLesson | null = null; previewUrl = ''; dirty = false; private previewRevision = 0;
  readonly formatTime = formatTime;
  readonly categories = COURSE_CATEGORIES; readonly subcategoriesFor = subcategoriesFor;
  /** Load owned course hierarchies and open the course requested by the dashboard query parameter. */
  async ngOnInit(): Promise<void> { this.busy.set(true); try { this.courses.set(await this.content.list()); const course = this.courses().find(c => c.id === this.route.snapshot.queryParamMap.get('course')); if(course) this.edit(course); } catch(e) { this.fail(e); } finally { this.busy.set(false); } }
  /** Release any preview object URL when the editor is destroyed. */
  ngOnDestroy(): void { this.closePreview(); }
  /** Display a readable editor or upload error while retaining the current draft. */
  private fail(e: unknown): void { this.error.set(e instanceof Error ? e.message : 'Unable to complete this action.'); }
  /** Ask the browser to protect unsaved edits or an in-flight save when the tab is closed or refreshed. */
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void { if(this.dirty || this.busy()) event.preventDefault(); }
  /** Allow route navigation only when no operation is running and unsaved changes have been handled. */
  canLeave(): boolean { return !this.busy() && this.canSwitch(); }
  /** Confirm intentional draft loss before changing courses or leaving the workspace. */
  private canSwitch(): boolean { return !this.dirty || window.confirm('Discard unsaved changes?'); }
  /** Start a new local draft with temporary IDs; permanent IDs are assigned by the backend during save. */
  create(): void {
    if (!this.canSwitch()) return;
    const user = this.auth.user(); if (!user) return;
    this.closePreview(); this.chapterDrafts = {}; this.error.set(''); this.message.set(''); this.dirty = true;
    this.draft = { id: crypto.randomUUID(), ownerId: user.id, category: 'Culture & Heritage', subcategory: 'Festivals & Traditions', title: '', description: '', topics: [], updatedAt: Date.now(), price: 0, level: 'BEGINNER', published: false };
  }
  /** Deep-copy an owned course into the editor and normalize its category controls without changing the saved list. */
  edit(course: InstructorCourse): void {
    if (!this.canSwitch()) return;
    this.closePreview(); this.chapterDrafts = {}; this.draft = structuredClone(course); this.draft.category ??= 'Skills & Training'; this.draft.subcategory ||= subcategoriesFor(this.draft.category)[0]; this.dirty = false; this.error.set(''); this.message.set('');
  }
  /** Mark the draft dirty and remove a success message that no longer describes the current edits. */
  change(): void { this.dirty = true; this.message.set(''); }
  /** Append a temporary topic to the draft; no server mutation occurs until Save. */
  addTopic(): void { this.draft?.topics.push({ id: crypto.randomUUID(), title: 'New topic', lessons: [] }); this.change(); }
  /** Confirm and stage removal of a topic and its lessons for the next save. */
  removeTopic(topic: InstructorTopic): void {
    if (!this.draft || !window.confirm(`Remove topic ?${topic.title}? and its lessons? Save the course to apply.`)) return;
    this.closePreview(); this.draft.topics = this.draft.topics.filter(t => t.id !== topic.id); this.change();
  }
  /** Confirm and stage lesson removal, closing its preview if necessary. */
  removeLesson(topic: InstructorTopic, lesson: InstructorLesson): void {
    if (!window.confirm(`Remove ?${lesson.title}?? Save the course to apply.`)) return;
    if (this.preview?.id === lesson.id) this.closePreview();
    topic.lessons = topic.lessons.filter(l => l.id !== lesson.id); this.change();
  }
  /** Move one topic or lesson within its current list while keeping the draft marked as unsaved. */
  move<T>(items: T[], index: number, delta: number): void {
    const next = index + delta; if(next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]]; this.change();
  }
  /** Validate a selected local file, read media duration where applicable and stage a lesson for upload on Save. */
  async upload(event: Event, topic: InstructorTopic): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; if(!file || this.busy()) return;
    this.error.set(''); this.busy.set(true);
    try {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type === 'application/pdf' ? 'pdf' : null;
      if (!kind) throw new Error('Choose a video, audio file, or PDF.');
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error('Choose a nonempty file up to 100 MB.');
      const duration = kind === 'pdf' ? 0 : await this.duration(file, kind);
      topic.lessons.push({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), file, fileName: file.name, kind, duration, chapters: [] });
      this.change();
    } catch(e) { this.fail(e); } finally { input.value = ''; this.busy.set(false); }
  }
  /** Read browser media metadata through a temporary object URL, with a timeout and cleanup on every outcome. */
  private duration(file: File, kind: 'video' | 'audio'): Promise<number> {
    return new Promise((resolve, reject) => {
      const media = document.createElement(kind); const url = URL.createObjectURL(file);
      /** Clear media listeners and the timeout, release the temporary URL and resolve a valid duration or reject unreadable media. */
      const finish = (value?: number) => { clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null; media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); value ? resolve(value) : reject(new Error('This media format cannot be played. Try MP4 video or MP3 audio.')); };
      const timer = setTimeout(() => finish(), 15000);
      media.preload = 'metadata'; media.onloadedmetadata = () => finish(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : undefined);
      media.onerror = () => finish(); media.src = url;
    });
  }
  /** Render persisted chapter metadata into editable timestamp lines. */
  chapterText(lesson: InstructorLesson): string { return lesson.chapters.map(c => `${formatTime(c.seconds)} ${c.title}`).join('\n'); }
  chapterDrafts: Record<string, string | undefined> = {};
  /** Retain raw chapter input until preview or save can validate it. */
  updateChapters(lesson: InstructorLesson, value: string): void { this.chapterDrafts[lesson.id] = value; this.change(); }
  /** Validate chapter edits and open a local or authenticated server file; ignore downloads superseded by another preview. */
  async showPreview(lesson: InstructorLesson): Promise<void> {
    try { this.applyChapters(lesson); this.closePreview(); const revision = this.previewRevision; const file = await this.content.preview(lesson); if (revision !== this.previewRevision) return; this.preview = lesson; this.previewUrl = URL.createObjectURL(file); }
    catch(e) { this.fail(e); }
  }
  /** Parse changed chapter text for media lessons without assigning chapter markers to PDFs. */
  private applyChapters(lesson: InstructorLesson): void {
    const text = this.chapterDrafts[lesson.id];
    if (lesson.kind !== 'pdf' && text !== undefined) lesson.chapters = parseChapters(text, lesson.duration);
  }
  /** Invalidate pending previews and revoke the displayed file URL. */
  closePreview(): void { this.previewRevision++; if(this.previewUrl) URL.revokeObjectURL(this.previewUrl); this.previewUrl = ''; this.preview = null; }
  /** Jump a playing audio or video element to a chapter offset in seconds. */
  seek(media: HTMLMediaElement, seconds: number): void { media.currentTime = seconds; }
  /** Validate chapter drafts and synchronize the hierarchy with the backend; retain draft IDs and edits if a partial save fails. */
  async save(): Promise<void> {
    if (!this.draft || this.busy()) return;
    this.error.set(''); this.busy.set(true);
    try {
      for (const topic of this.draft.topics) for(const lesson of topic.lessons) this.applyChapters(lesson);
      await this.content.save(this.draft); this.courses.set(await this.content.list()); this.dirty = false;
      this.chapterDrafts = {}; this.message.set(this.draft.published ? 'Course saved and published.' : 'Draft saved on the server. Enable Published to make it available to learners.');
    } catch(e) { this.fail(e); } finally { this.busy.set(false); }
  }
}

