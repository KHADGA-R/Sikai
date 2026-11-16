import { Injectable, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { Booking, LiveSlot, LiveState, Teacher } from './live-classes';

interface ServerBooking extends Booking { slot: LiveSlot; }
interface EmailResult { sent: boolean; message?: string; }

/** Public availability and private participant records are merged only for the current session. */
@Injectable({ providedIn: 'root' })
export class LiveClassesService implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly emailNotice = signal('');
  private readonly data = signal<LiveState>({ teachers: [], slots: [], bookings: [] });
  readonly state = this.data.asReadonly();
  private revision = 0;
  private readonly timer = setInterval(() => { if (!document.hidden) void this.refresh(); }, 15000);

  /** Refresh live state when the signed-in account changes and remove the previous account's private records. */
  constructor() {
    effect(() => {
      this.auth.user();
      this.data.set({ teachers: [], slots: [], bookings: [] }); this.emailNotice.set('');
      untracked(() => { void this.refresh(); });
    });
  }
  /** Stop the polling timer when the application injector releases this service. */
  ngOnDestroy(): void { clearInterval(this.timer); }

  /**
   * Merge public teachers and availability with the current participant bookings and owned slots. Revision
   * and identity checks prevent stale requests from restoring another account's private state.
   */
  async refresh(): Promise<void> {
    const revision = ++this.revision;
    const user = this.auth.user();
    this.loading.set(true);
    try {
      const [teachers, publicSlots, bookings, ownSlots] = await Promise.all([
        this.api.request<Teacher[]>('GET', '/live-classes/teachers', undefined, false),
        this.api.request<LiveSlot[]>('GET', '/live-classes/slots', undefined, false),
        user ? this.api.request<ServerBooking[]>('GET', '/live-classes/bookings') : Promise.resolve([]),
        user && this.auth.isInstructor() ? this.api.request<LiveSlot[]>('GET', '/live-classes/teacher/slots') : Promise.resolve([])
      ]);
      if (revision !== this.revision || user?.id !== this.auth.user()?.id) return;
      const slots = [...new Map([...publicSlots.map(s => ({ ...s, meetingUrl: '' })), ...bookings.map(b => b.slot), ...ownSlots].map(s => [s.id, s])).values()];
      this.data.set({ teachers: teachers.map(t => ({ ...t, photoUrl: t.photoUrl ?? '' })), slots, bookings }); this.error.set('');
    } catch (e) { if (revision === this.revision) this.error.set(e instanceof Error ? e.message : 'Unable to load live classes.'); }
    finally { if (revision === this.revision) this.loading.set(false); }
  }
  /** Apply a live-class mutation and reload the server state after it succeeds. */
  private async change(method: string, path: string, input?: unknown): Promise<void> {
    await this.api.request(method, '/live-classes' + path, input); await this.refresh();
  }
  /** Save the authenticated instructor profile; the backend determines its owner and public name. */
  saveTeacher(input: Pick<Teacher, 'subject' | 'bio' | 'languages' | 'photoUrl'>): Promise<void> { return this.change('PUT', '/teacher', input); }
  /** Publish availability using an epoch-millisecond start time and an allowed duration in minutes. */
  addSlot(start: number, minutes: number, meetingUrl: string): Promise<void> { return this.change('POST', '/slots', { start, minutes, meetingUrl }); }
  /** Ask the backend to withdraw owned availability; active bookings must be cancelled first. */
  removeSlot(id: string): Promise<void> { return this.change('DELETE', `/slots/${id}`); }
  /** Save an owned meeting link and request confirmation resends for its confirmed bookings without undoing the saved link on email failure. */
  async updateMeeting(id: string, meetingUrl: string): Promise<void> {
    await this.change('PATCH', `/slots/${id}/meeting`, { meetingUrl });
    for (const booking of this.state().bookings.filter(b => b.slotId === id && b.status === 'confirmed')) {
      try { this.email(await this.api.request<EmailResult>('POST', '/live-classes/confirmation', { bookingId: booking.id })); }
      catch { this.emailNotice.set('Meeting link saved. Confirmation email could not be sent.'); }
    }
  }
  /** Create or atomically reschedule a booking and display email delivery independently from booking success. */
  async book(slotId: string, goals: string, replacing?: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<void> {
    const result = await this.api.request<{ email: EmailResult }>('POST', '/live-classes/bookings', { slotId, goals, replacing, timezone });
    this.email(result.email); await this.refresh();
  }
  /** Translate the optional SMTP result into a notice without treating disabled email as a failed booking. */
  private email(result: EmailResult): void {
    this.emailNotice.set(result.sent ? 'Confirmation email sent with your class details.' : (result.message ?? 'Class saved; confirmation email is unavailable.'));
  }
  /** Cancel a participant's upcoming confirmed booking and reload availability. */
  cancel(id: string): Promise<void> { return this.change('POST', `/bookings/${id}/cancel`); }
  /** Post a participant message to a confirmed booking and refresh the conversation. */
  message(id: string, text: string): Promise<void> { return this.change('POST', `/bookings/${id}/messages`, { text }); }
}
