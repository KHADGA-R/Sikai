import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LearnHubStore } from '../core/store.service';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ApiLesson } from '../core/api-models';
import { formatTime } from '../core/instructor-content';
import { LessonTool, LessonToolsComponent } from './lesson-tools.component';
import { LessonQuizComponent } from './lesson-quiz.component';

const playerTabs = ['Overview', 'Q&A', 'Notes', 'Announcements', 'Resources', 'Assignments'] as const;
type PlayerTab = (typeof playerTabs)[number];

@Component({ standalone: true, imports: [RouterLink, LessonToolsComponent, LessonQuizComponent], styleUrl: './player.component.css', template: `
<section class="container player-page">
  @if(error()){<p class="error-note" role="alert">{{error()}}</p>}
  @if(loading()){<p role="status">Loading curriculum...</p>}
  @if(course(); as c){
    @if(store.isEnrolled(c.id) || teacher()){
      <header class="player-header">
        <div><a class="back" [routerLink]="teacher() ? '/instructor/courses' : '/my-learning'">{{teacher() ? '← My Courses' : '← My Learning'}}</a><h1>{{c.title}}</h1></div>
        @if (lessons().length && !teacher()) {
          <div class="course-progress">
            <span>{{completedCount()}} of {{lessons().length}} lessons complete</span>
            <progress aria-label="Course progress" [value]="completedCount()" [max]="lessons().length"></progress>
          </div>
        }
      </header>
      @if(!teacher() && lessons().length && completedCount() === lessons().length) {
        <p><a class="button outline" [routerLink]="['/certificates/earn', c.id]">Get your certificate</a></p>
      }
      <div class="lesson-workspace" [class.content-hidden]="!contentOpen() || !lessons().length">
      <div class="lesson-stage">
        @if(selectedLesson(); as lesson){
          @let quizOpen = quizLesson() === lesson.id;
          @if (quizOpen) {
            @for (id of [lesson.id]; track id) {
              <div class="quiz-stage" #quizStage tabindex="-1">
                <app-lesson-quiz [courseId]="c.id" [lessonId]="id"
                  [canAdvance]="!teacher() && !!nextLesson() && !nextLesson()?.locked"
                  [courseComplete]="!teacher() && !nextLesson() && completedCount() === lessons().length"
                  (passed)="refreshUnlocks(c.id)" (advance)="step(1)" (replay)="replayLesson()" />
              </div>
            }
          }
          <div [hidden]="quizOpen">
          @if (lesson.locked) {
            <div class="video-placeholder"><strong>{{lesson.title}}</strong><p>Pass the earlier lesson quiz to unlock this lesson.</p>
              @if (nextAvailable(); as available) {
                <button type="button" class="button light" (click)="choose(available.id)">Go to {{available.title}}</button>
              }
            </div>
          } @else if(fileLoading()){<p role="status">Loading lesson file...</p>}
          @else if(fileUrl()){
            @if(lesson.kind === 'video'){<video #media controls playsinline preload="metadata" [src]="fileUrl()" [attr.aria-label]="lesson.title" (loadedmetadata)="applySeek(lesson.id, media)" (ended)="openQuiz(lesson.id)"></video><div class="chapter-links">@for(chapter of lesson.chapters; track chapter.seconds){<button class="button outline" (click)="media.currentTime = chapter.seconds">{{formatTime(chapter.seconds)}} · {{chapter.title}}</button>}</div>}
            @else if(lesson.kind === 'audio'){<audio #media controls [src]="fileUrl()" (loadedmetadata)="applySeek(lesson.id, media)" style="width:100%"></audio><div class="chapter-links">@for(chapter of lesson.chapters; track chapter.seconds){<button class="button outline" (click)="media.currentTime = chapter.seconds">{{formatTime(chapter.seconds)}} · {{chapter.title}}</button>}</div>}
            @else{<div class="video-placeholder"><span>📄</span><strong>{{lesson.title}}</strong><a class="button primary" [href]="fileUrl()" target="_blank" rel="noopener">Open PDF</a></div>}
          } @else {<div class="video-placeholder"><span>{{c.emoji}}</span><strong>{{lesson.title}}</strong><small>{{lesson.hasFile ? 'Unable to load this file. Select the lesson again to retry.' : 'Your instructor has not uploaded this file yet.'}}</small></div>}
          </div>
          <div class="lesson-navigation">
            <button type="button" class="button outline" [disabled]="!previousLesson() || previousLesson()?.locked" (click)="step(-1)">← Previous lesson</button>
            <button type="button" class="button outline" aria-controls="course-content" [attr.aria-expanded]="contentOpen()" (click)="toggleContent()">
              {{contentOpen() ? 'Hide course content' : 'Show course content'}}
            </button>
            @if (lesson.hasQuiz && !lesson.locked && !quizOpen) {
              <button type="button" class="button outline" (click)="openQuiz(lesson.id)">{{teacher() ? 'Preview quiz' : 'Take quiz'}}</button>
            }
            <button type="button" class="button outline" [disabled]="!nextLesson() || nextLesson()?.locked" (click)="step(1)">
              {{nextLesson()?.locked ? 'Next lesson locked' : 'Next lesson →'}}
            </button>
          </div>
        } @else if(!loading()){<div class="empty"><h2>No lessons yet</h2><p>Your instructor is preparing this course.</p>
          <a class="button outline" [routerLink]="['/courses', c.id, 'assignments']">View assignments</a></div>}
      </div>
      <aside id="course-content" class="course-content" aria-label="Course content" [hidden]="!contentOpen() || !lessons().length">
        <h2>Course content</h2>
        @for(module of store.topics(c.id); track module.id) {
          <details class="curriculum-module" [open]="module.id === currentModule()">
            <summary>{{module.title}} <small>{{module.lessons.length}} lessons</small></summary>
            @if(module.objective){<p class="module-objective">{{module.objective}}</p>}
            @for(lesson of module.lessons; track lesson.id){
              <button type="button" class="curriculum-item" [class.current]="selected()===lesson.id"
                [disabled]="lesson.locked"
                [attr.aria-current]="selected()===lesson.id ? 'step' : null" (click)="choose(lesson.id)">
                <span aria-hidden="true">{{store.completed(c.id).includes(lesson.id) ? '✓' : '▷'}}</span>
                <span>{{lesson.title}}<small>{{lesson.minutes}} min{{lesson.locked ? ' · Locked' : store.completed(c.id).includes(lesson.id) ? ' · Complete' : ''}}</small></span>
              </button>
            }
          </details>
        }
      </aside>
      @let lesson = selectedLesson();
      @if(lesson || teacher()) {
        <section class="lesson-content" aria-label="Lesson details">
          <nav class="player-tabs" aria-label="Lesson sections">
            @for(tab of visibleTabs(); track tab) {
              <button type="button" [attr.aria-pressed]="currentTab() === tab" (click)="activeTab.set(tab)">{{tab}}</button>
            }
          </nav>
          @if (activeTool(); as tool) {
            @for (key of [tool + ':' + (tool === 'Announcements' ? c.id : lesson?.id)]; track key) {
              <app-lesson-tools [tool]="tool" [courseId]="c.id" [lessonId]="lesson?.id ?? 0" [teacher]="teacher()"
                [canTimestamp]="!!mediaElement()" [playbackTime]="playbackTime" (seek)="jumpTo($event)" />
            }
          }
          @if (lesson && !lesson.locked) {
          @switch(currentTab()) {
            @case('Overview') {
              <h2>{{lesson.title}}</h2>
              @if(lesson.description){<p class="lesson-description">{{lesson.description}}</p>}
              @if (!lesson.hasQuiz && !teacher()) {
                <button type="button" class="button primary" [disabled]="store.pending().includes('lesson:'+lesson.id)" (click)="store.toggleLesson(c.id,lesson.id)">{{isCompleted() ? '✓ Completed — mark incomplete' : '✓ Mark lesson complete'}}</button>
              }
            }
            @case('Resources') {
              <h2>Lesson resources</h2>
              @if(lesson.slidesName){
                <button type="button" class="button outline" [disabled]="slidesLoading()" (click)="downloadSlides(lesson.id, lesson.slidesName)">{{slidesLoading() ? 'Downloading slides…' : 'Download ' + lesson.slidesName}}</button>
              } @else { <p>No additional resources for this lesson.</p> }
            }
            @case('Assignments') {
              <h2>Assignments</h2>
              <div class="lesson-links">
                <a class="button primary" [routerLink]="['/courses',c.id,'assignments']" [queryParams]="{lesson: lesson.id}">Lesson assignments</a>
                <a class="button outline" [routerLink]="['/courses',c.id,'assignments']">All course assignments</a>
              </div>
            }
          }
          }
        </section>
      }
      </div>
    } @else if(!store.personalLoading()){<div class="empty"><h2>Enroll to start learning</h2><a class="button primary" [routerLink]="['/courses',c.id]">View course</a></div>}
  } @else if(!loading()){<div class="empty">Course not found. <a routerLink="/">Browse courses</a></div>}
  </section>` })
export class PlayerComponent {
  readonly store = inject(LearnHubStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly id = computed(() => Number(this.params().get('id')));
  readonly course = computed(() => this.store.getCourse(this.id()));
  readonly lessons = computed(() => this.store.lessons(this.id()));
  readonly selected = signal<number | null>(null);
  readonly selectedLesson = computed(() => this.lessons().find(l => l.id === this.selected()));
  readonly completedCount = computed(() => this.lessons().filter(l => this.store.completed(this.id()).includes(l.id)).length);
  readonly teacher = computed(() => this.canManage(this.course()?.ownerId));
  readonly activeTab = signal<PlayerTab>('Overview');
  readonly quizLesson = signal<number | null>(null);
  readonly visibleTabs = computed<readonly PlayerTab[]>(() => {
    const lesson = this.selectedLesson();
    if (!lesson || lesson.locked) return ['Announcements'];
    return playerTabs;
  });
  readonly currentTab = computed(() => this.visibleTabs().includes(this.activeTab()) ? this.activeTab() : this.visibleTabs()[0]);
  readonly activeTool = computed<LessonTool | null>(() => {
    const tab = this.currentTab();
    return tab === 'Q&A' || tab === 'Notes' || tab === 'Announcements' ? tab : null;
  });
  readonly mediaElement = viewChild<ElementRef<HTMLMediaElement>>('media');
  private readonly quizStage = viewChild<ElementRef<HTMLElement>>('quizStage');
  readonly playbackTime = (): number | null => {
    const media = this.mediaElement()?.nativeElement;
    return media && Number.isFinite(media.currentTime) ? Math.floor(media.currentTime) : null;
  };
  private pendingSeek: { lessonId: number; seconds: number } | null = null;
  readonly contentOpen = signal(window.matchMedia('(min-width: 850px)').matches);
  readonly currentModule = computed(() => this.store.topics(this.id())
    .find(module => module.lessons.some(lesson => lesson.id === this.selected()))?.id);
  readonly lessonIndex = computed(() => this.lessons().findIndex(lesson => lesson.id === this.selected()));
  readonly previousLesson = computed<ApiLesson | undefined>(() => this.lessons()[this.lessonIndex() - 1]);
  readonly nextLesson = computed<ApiLesson | undefined>(() => this.lessons()[this.lessonIndex() + 1]);
  readonly nextAvailable = computed(() => [...this.lessons()].reverse().find(lesson => !lesson.locked));
  readonly isCompleted = computed(() => this.selected() !== null && this.store.completed(this.id()).includes(this.selected()!));
  readonly loading = signal(false); readonly error = signal(''); readonly fileLoading = signal(false); readonly fileUrl = signal('');
  readonly formatTime = formatTime;
  readonly slidesLoading = signal(false);
  private readonly fileRetry = signal(0);

  /** Load the route's real curriculum, keep lesson selection valid and manage authenticated file object URLs with effect cleanup. */
  constructor() {
    effect(onCleanup => {
      const id = this.id(); const enrolled = this.store.isEnrolled(id);
      let active = true; onCleanup(() => active = false); this.error.set(''); this.loading.set(true);
      void (async () => {
        try {
          const course = await this.store.loadCourse(id);
          if (active && (enrolled || this.canManage(course.ownerId))) await this.store.loadContent(id);
        }
        catch(e) { if (active) this.error.set(e instanceof Error ? e.message : 'Unable to load lessons.'); }
        finally { if (active) this.loading.set(false); }
      })();
    });
    effect(() => {
      const tab = this.query().get('tab');
      if (tab === 'Q&A' || tab === 'Announcements') this.activeTab.set(tab);
    });
    effect(() => {
      const lessons = this.lessons();
      const requested = Number(this.query().get('lesson'));
      this.selected.set(lessons.find(lesson => lesson.id === requested)?.id ?? lessons[0]?.id ?? null);
    });
    effect(onCleanup => {
      const lesson = this.selectedLesson(); this.fileRetry();
      let active = true; let url = '';
      this.fileUrl.set(''); this.fileLoading.set(false);
      onCleanup(() => { active = false; if (url) URL.revokeObjectURL(url); });
      if (!lesson?.hasFile || lesson.locked) return;
      this.fileLoading.set(true);
      this.api.file(lesson.id).then(blob => { if (active) { url = URL.createObjectURL(blob); this.fileUrl.set(url); } })
        .catch(e => { if (active) this.error.set(e.message); }).finally(() => { if (active) this.fileLoading.set(false); });
    });
  }
  async downloadSlides(id: number, name: string): Promise<void> {
    this.slidesLoading.set(true);
    this.error.set('');
    try {
      const url = URL.createObjectURL(await this.api.file(id, 'slides'));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to download slides.');
    } finally { this.slidesLoading.set(false); }
  }

  /** Select a real lesson ID and trigger a file retry even if that lesson was already selected. */
  choose(id: number): void {
    this.pendingSeek = null;
    this.selectLesson(id);
  }

  private selectLesson(id: number): void {
    this.quizLesson.set(null);
    this.selected.set(id);
    this.fileRetry.update(n => n + 1);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { lesson: id }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  jumpTo(target: { lessonId: number; seconds: number }): void {
    if (this.lessons().find(lesson => lesson.id === target.lessonId)?.locked) return;
    this.quizLesson.set(null);
    const media = this.mediaElement()?.nativeElement;
    if (target.lessonId === this.selected() && media && media.readyState > 0) {
      media.currentTime = target.seconds;
      media.scrollIntoView({ block: 'nearest' });
      return;
    }
    this.pendingSeek = target;
    if (target.lessonId !== this.selected()) this.selectLesson(target.lessonId);
  }

  applySeek(lessonId: number, media: HTMLMediaElement): void {
    if (this.pendingSeek?.lessonId !== lessonId) return;
    media.currentTime = this.pendingSeek.seconds;
    this.pendingSeek = null;
    media.scrollIntoView({ block: 'nearest' });
  }

  private canManage(ownerId?: string): boolean {
    const user = this.auth.user();
    return !!user && (user.role === 'admin' || (user.role === 'instructor' && user.id === ownerId));
  }

  step(offset: -1 | 1): void {
    const lesson = offset === -1 ? this.previousLesson() : this.nextLesson();
    if (lesson && !lesson.locked) this.choose(lesson.id);
  }

  openQuiz(id: number): void {
    const lesson = this.selectedLesson();
    if (lesson?.id !== id || !lesson.hasQuiz || lesson.locked) return;
    const media = this.mediaElement()?.nativeElement;
    media?.pause();
    if (media && document.fullscreenElement === media) void document.exitFullscreen().catch(() => {});
    this.quizLesson.set(id);
    afterNextRender(() => {
      if (this.quizLesson() !== id) return;
      const stage = this.quizStage()?.nativeElement;
      stage?.focus({ preventScroll: true });
      stage?.scrollIntoView({ block: 'nearest' });
    }, { injector: this.injector });
  }

  replayLesson(): void {
    this.quizLesson.set(null);
    const media = this.mediaElement()?.nativeElement;
    if (media) {
      media.currentTime = 0;
      void media.play().catch(() => {});
    }
  }


  async refreshUnlocks(courseId: number): Promise<void> {
    if (this.teacher()) return;
    try {
      await Promise.all([this.store.loadContent(courseId), this.store.refreshPersonal()]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to refresh your lesson progress. Reload to try again.');
    }
  }

  toggleContent(): void {
    this.contentOpen.update(open => !open);
  }
}
