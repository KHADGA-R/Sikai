import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { InstructorContentService } from '../core/instructor-content.service';
import { InstructorCourse } from '../core/instructor-content';
import { LiveClassesService } from '../core/live-classes.service';

@Component({ standalone: true, imports: [RouterLink], templateUrl: './instructor-dashboard.component.html', styleUrl: './instructor-dashboard.component.css' })
export class InstructorDashboardComponent implements OnInit, OnDestroy {
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly auth = inject(AuthService);
  readonly live = inject(LiveClassesService);
  private readonly content = inject(InstructorContentService);
  readonly courses = signal<InstructorCourse[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly now = signal(Date.now());
  private readonly timer = setInterval(() => this.now.set(Date.now()), 30000);
  readonly profile = computed(() => this.live.state().teachers.find(t => t.ownerId === this.auth.user()?.id));
  readonly lessonCount = computed(() => this.courses().reduce((total, course) => total + course.topics.reduce((count, topic) => count + topic.lessons.length, 0), 0));
  readonly upcoming = computed(() => {
    const state = this.live.state(), teacher = this.profile();
    if (!teacher) return [];
    return state.bookings.filter(b => b.status === 'confirmed').flatMap(booking => {
      const slot = state.slots.find(s => s.id === booking.slotId && s.teacherId === teacher.id && s.end > this.now());
      return slot ? [{ booking, slot }] : [];
    }).sort((a,b) => a.slot.start - b.slot.start);
  });
  readonly recent = computed(() => [...this.courses()].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 3));
  /** Load the instructor's recorded-course overview when the dashboard opens. */
  async ngOnInit(): Promise<void> { await this.reload(); }
  /** Reload owned course metadata and expose retryable loading errors. */
  async reload(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.courses.set(await this.content.list()); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to load your courses.'); }
    finally { this.loading.set(false); }
  }
  /** Format an epoch-millisecond class time in the device's local timezone. */
  when(time: number): string { return new Intl.DateTimeFormat('en', {dateStyle:'medium',timeStyle:'short'}).format(time); }
  /** Stop the local clock used to classify upcoming classes. */
  ngOnDestroy(): void { clearInterval(this.timer); }
}
