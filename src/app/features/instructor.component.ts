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
  preview: InstructorLesson | null = null; previewUrl = ''; dirty = false;
  readonly formatTime = formatTime;
  readonly categories = COURSE_CATEGORIES; readonly subcategoriesFor = subcategoriesFor;
  async ngOnInit(): Promise<void> { this.busy.set(true); try { this.courses.set(await this.content.list()); const course = this.courses().find(c => c.id === this.route.snapshot.queryParamMap.get('course')); if(course) this.edit(course); } catch(e) { this.fail(e); } finally { this.busy.set(false); } }
  ngOnDestroy(): void { this.closePreview(); }
  private fail(e: unknown): void { this.error.set(e instanceof Error ? e.message : 'Unable to complete this action.'); }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void { if(this.dirty || this.busy()) event.preventDefault(); }
  canLeave(): boolean { return !this.busy() && this.canSwitch(); }
  private canSwitch(): boolean { return !this.dirty || window.confirm('Discard unsaved changes?'); }
  create(): void {
    if (!this.canSwitch()) return;
    const user = this.auth.user(); if (!user) return;
    this.closePreview(); this.chapterDrafts = {}; this.error.set(''); this.message.set(''); this.dirty = true;
    this.draft = { id: crypto.randomUUID(), ownerId: user.id, category: 'Culture & Heritage', subcategory: 'Festivals & Traditions', title: '', description: '', topics: [], updatedAt: Date.now() };
  }
  edit(course: InstructorCourse): void {
    if (!this.canSwitch()) return;
    this.closePreview(); this.chapterDrafts = {}; this.draft = structuredClone(course); this.draft.category ??= 'Skills & Training'; this.draft.subcategory ||= subcategoriesFor(this.draft.category)[0]; this.dirty = false; this.error.set(''); this.message.set('');
  }
  change(): void { this.dirty = true; this.message.set(''); }
  addTopic(): void { this.draft?.topics.push({ id: crypto.randomUUID(), title: 'New topic', lessons: [] }); this.change(); }
  removeTopic(topic: InstructorTopic): void {
    if (!this.draft || !window.confirm(`Remove topic ?${topic.title}? and its lessons? Save the course to apply.`)) return;
    this.closePreview(); this.draft.topics = this.draft.topics.filter(t => t.id !== topic.id); this.change();
  }
  removeLesson(topic: InstructorTopic, lesson: InstructorLesson): void {
    if (!window.confirm(`Remove ?${lesson.title}?? Save the course to apply.`)) return;
    if (this.preview?.id === lesson.id) this.closePreview();
    topic.lessons = topic.lessons.filter(l => l.id !== lesson.id); this.change();
  }
  move<T>(items: T[], index: number, delta: number): void {
    const next = index + delta; if(next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]]; this.change();
  }
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
  private duration(file: File, kind: 'video' | 'audio'): Promise<number> {
    return new Promise((resolve, reject) => {
      const media = document.createElement(kind); const url = URL.createObjectURL(file);
      const finish = (value?: number) => { clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null; media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); value ? resolve(value) : reject(new Error('This media format cannot be played. Try MP4 video or MP3 audio.')); };
      const timer = setTimeout(() => finish(), 15000);
      media.preload = 'metadata'; media.onloadedmetadata = () => finish(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : undefined);
      media.onerror = () => finish(); media.src = url;
    });
  }
  chapterText(lesson: InstructorLesson): string { return lesson.chapters.map(c => `${formatTime(c.seconds)} ${c.title}`).join('\n'); }
  chapterDrafts: Record<string, string | undefined> = {};
  updateChapters(lesson: InstructorLesson, value: string): void { this.chapterDrafts[lesson.id] = value; this.change(); }
  showPreview(lesson: InstructorLesson): void {
    try { this.applyChapters(lesson); this.closePreview(); this.preview = lesson; this.previewUrl = URL.createObjectURL(lesson.file); }
    catch(e) { this.fail(e); }
  }
  private applyChapters(lesson: InstructorLesson): void {
    const text = this.chapterDrafts[lesson.id];
    if (lesson.kind !== 'pdf' && text !== undefined) lesson.chapters = parseChapters(text, lesson.duration);
  }
  closePreview(): void { if(this.previewUrl) URL.revokeObjectURL(this.previewUrl); this.previewUrl = ''; this.preview = null; }
  seek(media: HTMLMediaElement, seconds: number): void { media.currentTime = seconds; }
  async save(): Promise<void> {
    if (!this.draft || this.busy()) return;
    this.error.set(''); this.busy.set(true);
    try {
      for (const topic of this.draft.topics) for(const lesson of topic.lessons) this.applyChapters(lesson);
      await this.content.save(this.draft); this.courses.set(await this.content.list()); this.dirty = false;
      this.message.set('Course content saved in this browser.');
    } catch(e) { this.fail(e); } finally { this.busy.set(false); }
  }
}

