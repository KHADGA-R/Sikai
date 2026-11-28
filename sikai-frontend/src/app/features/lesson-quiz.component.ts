import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

interface Quiz { questions: { prompt: string; options: string[] }[]; passed: boolean; }
interface Result { correct: number; total: number; passed: boolean; feedback: { correct: boolean; explanation: string }[]; }

@Component({
  selector: 'app-lesson-quiz',
  template: `
    <section aria-label="Lesson quiz">
      <button type="button" class="button outline" (click)="replay.emit()">Replay lesson</button>
      <h2>Lesson quiz</h2>
      @if (loading()) { <p role="status">Loading quiz…</p> }
      @if (error()) {
        <p class="error-note" role="alert">{{error()}}</p>
        <button type="button" class="button outline" (click)="reloadQuiz()">Reload quiz</button>
      }
      @if (quiz(); as content) {
        <p>Answer all {{content.questions.length}} questions correctly to pass. You can retry as many times as you need.</p>
        @if (result(); as score) {
          <p role="status"><strong>{{score.correct}} of {{score.total}} correct.</strong> {{score.passed ? 'Quiz passed.' : 'Review the feedback and try again.'}}</p>
          @if (!score.passed) {
            <ul>
              @for (feedback of score.feedback; track $index) {
                @if (!feedback.correct) { <li><strong>{{content.questions[$index].prompt}}</strong> {{feedback.explanation}}</li> }
              }
            </ul>
          }
        }
        @if (result()?.passed || content.passed) {
          @if (!result()) { <p>You’ve already passed this quiz.</p> }
          @if (canAdvance()) { <button type="button" class="button primary" (click)="advance.emit()">Next lesson</button> }
          @else if (courseComplete()) { <p role="status"><strong>Course complete</strong></p> }
        } @else if (result()) {
          <button type="button" class="button primary" (click)="retry()">Retry quiz</button>
        } @else {
          @let index = questionIndex();
          @let question = content.questions[index];
          <p aria-live="polite">Question {{index + 1}} of {{content.questions.length}}</p>
          <fieldset [disabled]="busy()">
            <legend>{{question.prompt}}</legend>
            @for (option of question.options; track $index; let oi = $index) {
              <label><input type="radio" [name]="'quiz-question-' + index" [checked]="answers()[index] === oi" (change)="select(index, oi)"> {{option}}</label>
            }
          </fieldset>
          <div class="quiz-actions">
            @if (index > 0) { <button type="button" class="button outline" [disabled]="busy()" (click)="move(-1)">Back</button> }
            @if (index < content.questions.length - 1) {
              <button type="button" class="button primary" [disabled]="answers()[index] === undefined" (click)="move(1)">Next question</button>
            } @else {
              <button type="button" class="button primary" [disabled]="busy() || !complete()" (click)="submit()">Submit quiz</button>
            }
          </div>
        }
      }
    </section>
  `,
  styles: `
    section { padding: clamp(16px, 4vw, 40px); }
    .quiz-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    h2 { font-size: 1.15rem; }
    fieldset { margin: 14px 0; border: 1px solid #d9ded9; border-radius: 8px; }
    legend { font-weight: 650; }
    label { display: block; padding: 5px; }
    button:disabled { opacity: .55; cursor: default; }
  `,
})
export class LessonQuizComponent {
  private readonly api = inject(ApiService);
  readonly courseId = input.required<number>();
  readonly lessonId = input.required<number>();
  readonly canAdvance = input(false);
  readonly courseComplete = input(false);
  readonly passed = output<void>();
  readonly replay = output<void>();
  readonly advance = output<void>();
  readonly questionIndex = signal(0);
  readonly quiz = signal<Quiz | null>(null);
  readonly result = signal<Result | null>(null);
  readonly answers = signal<Record<number, number>>({});
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly reload = signal(0);
  readonly complete = computed(() => Object.keys(this.answers()).length === this.quiz()?.questions.length);
  private readonly path = computed(() => `/courses/${this.courseId()}/lessons/${this.lessonId()}/quiz`);

  constructor() {
    effect(onCleanup => {
      this.reload();
      const path = this.path();
      let current = true;
      onCleanup(() => current = false);
      this.loading.set(true);
      this.quiz.set(null);
      this.error.set('');
      this.retry();
      this.api.request<Quiz>('GET', path)
        .then(quiz => { if (current) this.quiz.set(quiz); })
        .catch(error => { if (current) this.error.set(error.message); })
        .finally(() => { if (current) this.loading.set(false); });
    });
  }

  select(question: number, answer: number): void {
    this.answers.update(answers => ({ ...answers, [question]: answer }));
  }

  reloadQuiz(): void { this.reload.update(n => n + 1); }

  move(offset: -1 | 1): void {
    this.questionIndex.update(index => index + offset);
  }

  retry(): void {
    this.questionIndex.set(0);
    this.answers.set({});
    this.result.set(null);
  }

  async submit(): Promise<void> {
    const quiz = this.quiz();
    if (!quiz || !this.complete() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.request<Result>('POST', this.path(), { answers: quiz.questions.map((_, i) => this.answers()[i]) });
      this.result.set(result);
      if (result.passed) this.passed.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not submit the quiz.');
    } finally { this.busy.set(false); }
  }
}
