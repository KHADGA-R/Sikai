import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LearnHubStore } from '../core/store.service';
import { ApiService } from '../core/api.service';
import { formatTime } from '../core/instructor-content';

@Component({ standalone: true, imports: [RouterLink], template: `
<section class="container player-page">
  @if(error()){<p class="error-note" role="alert">{{error()}}</p>}
  @if(loading()){<p role="status">Loading curriculum...</p>}
  @if(course(); as c){
    @if(store.isEnrolled(c.id)){
      <div class="player-header"><a class="back" routerLink="/my-learning">← My learning</a><span class="eyebrow purple">LEARNING PLAYER</span><h1>{{c.title}}</h1><p>Work through your lessons and track your progress.</p></div>
      <div class="player-layout"><div>
        @if(selectedLesson(); as lesson){
          @if(fileLoading()){<p role="status">Loading lesson file...</p>}
          @if(fileUrl()){
            @if(lesson.kind === 'video'){<video #video controls preload="metadata" [src]="fileUrl()" style="width:100%"></video><div class="chapter-links">@for(chapter of lesson.chapters; track chapter.seconds){<button class="button outline" (click)="video.currentTime = chapter.seconds">{{formatTime(chapter.seconds)}} · {{chapter.title}}</button>}</div>}
            @else if(lesson.kind === 'audio'){<audio #audio controls [src]="fileUrl()" style="width:100%"></audio><div class="chapter-links">@for(chapter of lesson.chapters; track chapter.seconds){<button class="button outline" (click)="audio.currentTime = chapter.seconds">{{formatTime(chapter.seconds)}} · {{chapter.title}}</button>}</div>}
            @else{<div class="video-placeholder"><span>📄</span><strong>{{lesson.title}}</strong><a class="button primary" [href]="fileUrl()" target="_blank" rel="noopener">Open PDF</a></div>}
          } @else if(!fileLoading()){<div class="video-placeholder"><span>{{c.emoji}}</span><strong>{{lesson.title}}</strong><small>{{lesson.hasFile ? 'Unable to load this file. Select the lesson again to retry.' : 'Your instructor has not uploaded this file yet.'}}</small></div>}
          <div class="lesson-content"><h2>{{lesson.title}}</h2>@if(lesson.description){<p style="white-space:pre-line">{{lesson.description}}</p>}
            @if(lesson.slidesName){<button type="button" class="button outline" [disabled]="slidesLoading()" (click)="downloadSlides(lesson.id, lesson.slidesName)">{{slidesLoading() ? 'Downloading slides…' : 'Download ' + lesson.slidesName}}</button>}<button class="button primary" [disabled]="store.pending().includes('lesson:'+lesson.id)" (click)="store.toggleLesson(c.id,lesson.id)">{{isCompleted() ? '✓ Completed — mark incomplete' : '✓ Mark lesson complete'}}</button></div>
        } @else if(!loading()){<div class="empty"><h2>No lessons yet</h2><p>Your instructor is preparing this course.</p></div>}
      </div><aside class="curriculum-panel"><h3>Course curriculum</h3><p>{{completedCount()}} / {{lessons().length}} completed</p><div class="progress-line"><span [style.width.%]="progressPercent()"></span></div>
        @for(module of store.topics(c.id); track module.id) {
          <div class="curriculum-module">
            <h4>{{module.title}}</h4>
            @if(module.objective){<p>{{module.objective}}</p>}
            @for(lesson of module.lessons; track lesson.id){
              <button class="curriculum-item" [class.current]="selected()===lesson.id" (click)="choose(lesson.id)">
                <span aria-hidden="true">{{store.completed(c.id).includes(lesson.id) ? '✓' : '▷'}}</span>
                <span>{{lesson.title}}<small>{{lesson.minutes}} min</small></span>
              </button>
            }
          </div>
        }
      </aside></div>
    } @else if(!store.personalLoading()){<div class="empty"><h2>Enroll to start learning</h2><a class="button primary" [routerLink]="['/courses',c.id]">View course</a></div>}
  } @else if(!loading()){<div class="empty">Course not found. <a routerLink="/">Browse courses</a></div>}
</section>` })
export class PlayerComponent {
  readonly store = inject(LearnHubStore);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly id = computed(() => Number(this.params().get('id')));
  readonly course = computed(() => this.store.getCourse(this.id()));
  readonly lessons = computed(() => this.store.lessons(this.id()));
  readonly selected = signal<number | null>(null);
  readonly selectedLesson = computed(() => this.lessons().find(l => l.id === this.selected()));
  readonly completedCount = computed(() => this.lessons().filter(l => this.store.completed(this.id()).includes(l.id)).length);
  readonly progressPercent = computed(() => this.lessons().length ? Math.round(this.completedCount() / this.lessons().length * 100) : 0);
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
        try { await this.store.loadCourse(id); if (enrolled) await this.store.loadContent(id); }
        catch(e) { if (active) this.error.set(e instanceof Error ? e.message : 'Unable to load lessons.'); }
        finally { if (active) this.loading.set(false); }
      })();
    });
    effect(() => { const lessons = this.lessons(); if (!lessons.some(l => l.id === this.selected())) this.selected.set(lessons[0]?.id ?? null); });
    effect(onCleanup => {
      const lesson = this.selectedLesson(); this.fileRetry();
      let active = true; let url = '';
      this.fileUrl.set(''); this.fileLoading.set(false);
      onCleanup(() => { active = false; if (url) URL.revokeObjectURL(url); });
      if (!lesson?.hasFile) return;
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
  choose(id: number): void { this.selected.set(id); this.fileRetry.update(n => n + 1); }
}
