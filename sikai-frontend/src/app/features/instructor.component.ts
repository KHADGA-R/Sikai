import { ActivatedRoute, RouterLink } from '@angular/router';
import { COURSE_CATEGORIES, subcategoriesFor } from '../core/categories';
import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { InstructorContentService } from '../core/instructor-content.service';
import { InstructorCourse, InstructorLesson, InstructorTopic, formatTime, parseChapters, validateQuiz } from '../core/instructor-content';

@Component({ standalone: true, imports: [FormsModule, RouterLink], templateUrl: './instructor.component.html', styleUrl: './instructor.component.css' })
export class InstructorComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(InstructorContentService);
  private readonly auth = inject(AuthService);
  readonly courses = signal<InstructorCourse[]>([]);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  readonly status = signal('');
  coursePreview = false;
  coverUrl = '';
  reviewOpen = false;
  previewSlidesUrl = '';
  private coverRevision = 0;
  private autosaveTimer?: ReturnType<typeof setTimeout>;
  draft: InstructorCourse | null = null;
  preview: InstructorLesson | null = null; previewUrl = ''; dirty = false; private previewRevision = 0;
  readonly formatTime = formatTime;
  addQuizQuestion(lesson: InstructorLesson): void {
    const quiz = lesson.quiz ??= [];
    if (quiz.length >= 5) return;
    quiz.push({ prompt: '', options: ['', '', ''], correct: null, feedback: '' });
    this.change();
  }
  readonly categories = COURSE_CATEGORIES; readonly subcategoriesFor = subcategoriesFor;
  /** Load owned course hierarchies and open the course requested by the dashboard query parameter. */
  async ngOnInit(): Promise<void> { this.busy.set(true); try { this.courses.set(await this.content.list()); const course = this.courses().find(c => c.id === this.route.snapshot.queryParamMap.get('course')); if(course) this.edit(course); } catch(e) { this.fail(e); } finally { this.busy.set(false); } }
  /** Release any preview object URL when the editor is destroyed. */
  ngOnDestroy(): void { clearTimeout(this.autosaveTimer); this.closePreview(); this.clearCover(); }
  /** Display a readable editor or upload error while retaining the current draft. */
  private fail(e: unknown): void { this.error.set(e instanceof Error ? e.message : 'Unable to complete this action.'); }
  /** Ask the browser to protect unsaved edits or an in-flight save when the tab is closed or refreshed. */
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void { if(this.dirty || this.busy()) event.preventDefault(); }
  /** Allow route navigation only when no operation is running and unsaved changes have been handled. */
  canLeave(): boolean { return !this.busy() && this.canSwitch(); }
  /** Confirm intentional draft loss before changing courses or leaving the workspace. */
  private canSwitch(): boolean {
    if (this.dirty && !window.confirm('Discard unsaved changes?')) return false;
    clearTimeout(this.autosaveTimer);
    return true;
  }
  /** Start a working draft; catalog IDs are assigned when the course is published. */
  create(): void {
    if (!this.canSwitch()) return;
    const user = this.auth.user(); if (!user) return;
    this.closePreview(); this.clearCover(); this.coursePreview = false; this.reviewOpen = false; this.error.set(''); this.message.set(''); this.dirty = true;
    this.draft = { id: crypto.randomUUID(), ownerId: user.id, category: 'Culture & Heritage', subcategory: 'Festivals & Traditions', title: '', description: '', topics: [], updatedAt: Date.now(), price: 0, level: 'BEGINNER', published: false };
    this.change();
  }
  /** Deep-copy an owned course into the editor and normalize its category controls without changing the saved list. */
  edit(course: InstructorCourse): void {
    if (!this.canSwitch()) return;
    this.closePreview(); this.clearCover(); this.coursePreview = false; this.reviewOpen = false; this.draft = structuredClone(course); this.draft.category ??= 'Skills & Training'; this.draft.subcategory ||= subcategoriesFor(this.draft.category)[0]; this.dirty = false; this.error.set(''); this.message.set(''); void this.refreshCover();
  }
  /** Mark the draft dirty and remove a success message that no longer describes the current edits. */
  change(): void {
    this.dirty = true;
    this.message.set('');
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.save(), 1800);
  }
  /** Append a temporary topic to the draft; no server mutation occurs until Save. */
  addTopic(): void { this.draft?.topics.push({ id: crypto.randomUUID(), title: 'New module', lessons: [] }); this.change(); }
  /** Confirm and stage removal of a topic and its lessons for the next save. */
  removeTopic(topic: InstructorTopic): void {
    if (!this.draft || !window.confirm(`Remove the module “${topic.title}” and its lessons from the draft?`)) return;
    this.closePreview(); this.draft.topics = this.draft.topics.filter(t => t.id !== topic.id); this.change();
  }
  /** Confirm and stage lesson removal, closing its preview if necessary. */
  removeLesson(topic: InstructorTopic, lesson: InstructorLesson): void {
    if (!window.confirm(`Remove “${lesson.title}” from the draft?`)) return;
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
    const input = event.target as HTMLInputElement; const files = Array.from(input.files ?? []); if (!files.length || this.busy()) return;
    this.error.set(''); this.busy.set(true);
    const failures: string[] = [];
    for (const file of files) {
      this.status.set(`Reading ${file.name}`);
      try {
        topic.lessons.push(await this.readLesson(file));
        this.change();
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Could not open file.'}`);
      }
    }
    input.value = '';
    this.status.set('');
    this.busy.set(false);
    this.error.set(failures.join(' '));
  }

  private async readLesson(file: File): Promise<InstructorLesson> {
      const kind = ['video/mp4', 'video/webm'].includes(file.type) ? 'video'
        : ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'].includes(file.type) ? 'audio'
        : file.type === 'application/pdf' ? 'pdf' : null;
      if (!kind) throw new Error('Choose a video, audio file, or PDF.');
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error('Choose a nonempty file up to 100 MB.');
      const duration = kind === 'pdf' ? 0 : await this.duration(file, kind);
      return { id: crypto.randomUUID(), title: (file.name.replace(/\.[^.]+$/, '').trim() || 'Untitled lesson').slice(0, 160), file, fileName: file.name, kind, duration, chapters: [] };
  }
  async replaceMedia(event: Event, lesson: InstructorLesson): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const replacement = await this.readLesson(file);
      if (replacement.kind !== lesson.kind) throw new Error(`Choose a ${lesson.kind} file for this lesson.`);
      lesson.file = replacement.file;
      lesson.fileName = replacement.fileName;
      lesson.duration = replacement.duration;
      this.change();
    } catch (error) { this.fail(error); }
    finally { input.value = ''; this.busy.set(false); }
  }

  async refreshCover(): Promise<void> {
    this.clearCover();
    const revision = this.coverRevision;
    const course = this.draft;
    if (!course || (!course.coverAssetId && !course.coverFile)) return;
    try {
      const cover = await this.content.cover(course);
      if (revision === this.coverRevision) this.coverUrl = URL.createObjectURL(cover);
    } catch (error) { if (revision === this.coverRevision) this.fail(error); }
  }

  private clearCover(): void {
    this.coverRevision++;
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
    this.coverUrl = '';
  }

  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.draft) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      this.error.set('Choose a PNG or JPEG cover up to 5 MB.');
      return;
    }
    this.draft.coverFile = file;
    this.draft.removeCover = false;
    void this.refreshCover();
    this.change();
  }

  removeCover(): void {
    if (!this.draft) return;
    this.draft.coverFile = undefined;
    this.draft.coverAssetId = undefined;
    this.draft.removeCover = true;
    this.clearCover();
    this.change();
  }

  chooseSlides(event: Event, lesson: InstructorLesson): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || !file.size || file.size > 100 * 1024 * 1024) {
      this.error.set('Choose a nonempty PDF up to 100 MB.');
      return;
    }
    lesson.slides = file;
    lesson.slidesName = file.name;
    lesson.removeSlides = false;
    this.error.set('');
    this.change();
  }

  moveLesson(from: InstructorTopic, lesson: InstructorLesson, destinationId: string): void {
    const destination = this.draft?.topics.find(topic => topic.id === destinationId);
    if (!destination || destination === from) return;
    from.lessons = from.lessons.filter(item => item !== lesson);
    destination.lessons.push(lesson);
    this.change();
  }

  async duplicate(topic: InstructorTopic, lesson: InstructorLesson): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      const copy = await this.content.duplicate(lesson);
      topic.lessons.splice(topic.lessons.indexOf(lesson) + 1, 0, copy);
      this.change();
    } catch (error) { this.fail(error); }
    finally { this.busy.set(false); }
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
  /** Retain raw chapter input until preview or save can validate it. */
  updateChapters(lesson: InstructorLesson, value: string): void { lesson.chapterText = value; this.change(); }
  /** Validate chapter edits and open a local or authenticated server file; ignore downloads superseded by another preview. */
  async showPreview(lesson: InstructorLesson): Promise<void> {
    try { this.applyChapters(lesson); this.closePreview(); const revision = this.previewRevision; const file = await this.content.preview(lesson); if (revision !== this.previewRevision) return; this.preview = lesson; this.previewUrl = URL.createObjectURL(file);
      if (lesson.slidesName) {
        const slides = await this.content.slides(lesson);
        if (revision === this.previewRevision) this.previewSlidesUrl = URL.createObjectURL(slides);
      }
    }
    catch(e) { this.fail(e); }
  }
  /** Parse changed chapter text for media lessons without assigning chapter markers to PDFs. */
  private applyChapters(lesson: InstructorLesson): void {
    const text = lesson.chapterText;
    if (lesson.kind !== 'pdf' && text !== undefined) lesson.chapters = parseChapters(text, lesson.duration);
  }
  /** Invalidate pending previews and revoke the displayed file URL. */
  closePreview(): void { this.previewRevision++; if(this.previewUrl) URL.revokeObjectURL(this.previewUrl); this.previewUrl = ''; if (this.previewSlidesUrl) URL.revokeObjectURL(this.previewSlidesUrl); this.previewSlidesUrl = ''; this.preview = null; }
  /** Jump a playing audio or video element to a chapter offset in seconds. */
  seek(media: HTMLMediaElement, seconds: number): void { media.currentTime = seconds; }
  toggleCoursePreview(): void {
    this.coursePreview = !this.coursePreview;
    if (this.coursePreview) requestAnimationFrame(() => document.getElementById('course-page-preview')?.scrollIntoView());
  }

  publicationIssues(course: InstructorCourse): { target: string; message: string }[] {
    const issues: { target: string; message: string }[] = [];
    if (course.title.trim().length < 4) issues.push({ target: 'course-details', message: 'Enter a course title with at least four characters.' });
    if (!course.description.trim()) issues.push({ target: 'course-details', message: 'Add a course description.' });
    if (!course.topics.some(topic => topic.lessons.length)) issues.push({ target: 'course-curriculum', message: 'Add at least one lesson.' });
    for (const topic of course.topics) {
      const target = 'module-' + topic.id;
      if (!topic.title.trim()) issues.push({ target, message: 'Give this module a title.' });
      for (const lesson of topic.lessons) {
        const lessonTarget = 'lesson-' + lesson.id;
        if (!lesson.title.trim()) issues.push({ target: lessonTarget, message: 'Give this lesson a title.' });
        if (!lesson.file && !lesson.assetId && !lesson.hasFile) issues.push({ target: lessonTarget, message: `Upload a file for ${lesson.title || 'this lesson'}.` });
        const quizError = validateQuiz(lesson.quiz);
        if (quizError) issues.push({ target: lessonTarget, message: `${lesson.title || 'Lesson quiz'}: ${quizError}` });
        if (lesson.kind !== 'pdf') {
          try { parseChapters(lesson.chapterText ?? this.chapterText(lesson), lesson.duration); }
          catch { issues.push({ target: lessonTarget, message: `Check chapter timestamps for ${lesson.title || 'this lesson'}.` }); }
        }
      }
    }
    return issues;
  }

  async save(publish = false): Promise<void> {
    const course = this.draft;
    if (!course || this.busy() || (!publish && !this.dirty)) return;
    clearTimeout(this.autosaveTimer);
    this.error.set('');
    this.busy.set(true);
    this.status.set(publish ? 'Checking course…' : 'Saving draft…');
    try {
      course.updatedAt = Date.now();
      if (publish) {
        for (const topic of course.topics) for (const lesson of topic.lessons) {
          try { this.applyChapters(lesson); }
          catch (error) {
            throw new Error(`${topic.title} → ${lesson.title}: ${error instanceof Error ? error.message : 'Check the chapter timestamps.'}`);
          }
        }
        course.id = await this.content.publish(course, status => this.status.set(status));
        course.published = true;
        course.revision = undefined;
        this.dirty = false;
        this.courses.set(await this.content.list());
        const published = this.courses().find(item => item.id === course.id);
        if (published) this.draft = structuredClone(published);
        this.reviewOpen = false;
        this.message.set('Course published.');
      } else {
        await this.content.save(course, status => this.status.set(status));
        this.courses.update(courses => [structuredClone(course), ...courses.filter(item => item.id !== course.id)]);
        this.dirty = false;
        this.message.set('Draft saved.');
      }
    } catch(error) { this.fail(error); }
    finally { this.status.set(''); this.busy.set(false); }
  }
}
