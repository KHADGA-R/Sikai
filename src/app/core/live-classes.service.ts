import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CATEGORY_NAMES } from './categories';
import { Booking, LiveSlot, LiveState, Teacher, canBook, overlaps, safeMeetingUrl, safeTeacherPhoto, seedLiveClasses } from './live-classes';

const KEY = 'sikai.live-classes.v1';
@Injectable({ providedIn: 'root' })
export class LiveClassesService {
  private readonly auth = inject(AuthService);
  readonly error = signal('');
  readonly emailNotice = signal('');
  private readonly data = signal<LiveState>(this.readInitial());
  readonly state = this.data.asReadonly();
  constructor() { window.addEventListener('storage', event => { if(event.key === KEY) this.refresh(); }); }
  private read(): LiveState {
    const raw = localStorage.getItem(KEY);
    const state = raw ? JSON.parse(raw) : seedLiveClasses();
    if (!state || !Array.isArray(state.teachers) || !Array.isArray(state.slots) || !Array.isArray(state.bookings)
      || !state.teachers.every((t: Teacher) => t && ['id','ownerId','name','subject','bio','languages'].every(k => typeof (t as unknown as Record<string, unknown>)[k] === 'string') && (t.photoUrl === undefined || safeTeacherPhoto(t.photoUrl)))
      || !state.slots.every((s: LiveSlot) => s && typeof s.id === 'string' && typeof s.teacherId === 'string' && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && typeof s.meetingUrl === 'string' && safeMeetingUrl(s.meetingUrl) && (s.closed === undefined || typeof s.closed === 'boolean') && state.teachers.some((t: Teacher) => t.id === s.teacherId))
      || !state.bookings.every((b: Booking) => b && typeof b.id === 'string' && typeof b.studentId === 'string' && typeof b.studentName === 'string' && typeof b.goals === 'string' && ['confirmed','cancelled'].includes(b.status) && state.slots.some((s: LiveSlot) => s.id === b.slotId) && Array.isArray(b.messages) && b.messages.every(m => m && typeof m.id === 'string' && typeof m.senderId === 'string' && typeof m.senderName === 'string' && typeof m.text === 'string' && Number.isFinite(m.sentAt)))) throw new Error('Saved live-class data could not be read.');
    return state;
  }
  private readInitial(): LiveState {
    try { const state = this.read(); if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(state)); return state; }
    catch { this.error.set('Unable to read live-class storage. Enable browser storage and reload; existing data has not been replaced.'); return { teachers: [], slots: [], bookings: [] }; }
  }
  refresh(): void { try { this.data.set(this.read()); this.error.set(''); } catch { this.error.set('Unable to read live-class data. Reload and try again.'); } }
  private user() { const user = this.auth.user(); if(!user) throw new Error('Log in to continue.'); return user; }
  private instructor() {
    const user = this.user();
    if (user.role !== 'instructor') throw new Error('Only instructors can manage teaching availability.');
    return user;
  }
  private async update(change: (state: LiveState) => void): Promise<void> {
    if(this.error()) throw new Error(this.error());
    if (!navigator.locks) throw new Error('Open this demo on localhost or HTTPS to save bookings safely.');
    await navigator.locks.request('sikai-live-classes', () => {
      const state = this.read(); change(state);
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { throw new Error('Unable to save. Check browser storage space and try again.'); }
      this.data.set(state);
    });
  }
  async saveTeacher(input: Pick<Teacher, 'subject' | 'bio' | 'languages' | 'photoUrl'>): Promise<void> {
    const user = this.instructor();
    if (input.photoUrl !== undefined && !safeTeacherPhoto(input.photoUrl)) throw new Error('Choose a valid profile picture under 220 KB after resizing.');
    if (!(CATEGORY_NAMES as readonly string[]).includes(input.subject) || !input.bio.trim() || !input.languages.trim() || input.bio.length > 1000 || input.languages.length > 120) throw new Error('Choose a subject and enter your introduction and teaching languages.');
    await this.update(state => {
      const existing = state.teachers.find(t => t.ownerId === user.id);
      const teacher = { ...input, bio: input.bio.trim(), languages: input.languages.trim(), id: existing?.id ?? crypto.randomUUID(), ownerId: user.id, name: user.name };
      if (existing) Object.assign(existing, teacher); else state.teachers.push(teacher);
    });
  }
  async addSlot(start: number, minutes: number, meetingUrl: string): Promise<void> {
    const user = this.instructor(); meetingUrl = meetingUrl.trim();
    if(!Number.isFinite(start) || start <= Date.now() || ![30,45,60,90].includes(minutes) || !safeMeetingUrl(meetingUrl)) throw new Error('Choose a future time, a valid duration, and an HTTPS meeting link (optional).');
    await this.update(state => {
      const teacher = state.teachers.find(t => t.ownerId === user.id); if(!teacher) throw new Error('Save your teacher profile first.');
      const slot: LiveSlot = { id: crypto.randomUUID(), teacherId: teacher.id, start, end: start + minutes * 60000, meetingUrl };
      if (state.slots.some(s => !s.closed && s.teacherId === teacher.id && overlaps(s,slot))) throw new Error('This time overlaps existing availability.');
      if (state.bookings.some(b => b.studentId === user.id && b.status === 'confirmed' && state.slots.some(s => s.id === b.slotId && overlaps(s,slot)))) throw new Error('You already have a student booking at this time.');
      state.slots.push(slot);
    });
  }
  async removeSlot(id: string): Promise<void> {
    const user = this.instructor();
    await this.update(state => {
      const slot = state.slots.find(s => s.id === id);
      if(!slot || !state.teachers.some(t => t.id === slot.teacherId && t.ownerId === user.id)) throw new Error('You can only remove your own availability.');
      if(state.bookings.some(b => b.slotId === id && b.status === 'confirmed')) throw new Error('Cancel the active booking before removing availability.');
      if(state.bookings.some(b => b.slotId === id)) slot.closed = true;
      else state.slots = state.slots.filter(s => s.id !== id);
    });
  }
  async updateMeeting(id: string, meetingUrl: string): Promise<void> {
    const user = this.instructor(); meetingUrl = meetingUrl.trim();
    if (!safeMeetingUrl(meetingUrl)) throw new Error('Use an HTTPS meeting link.');
    await this.update(state => {
      const slot = state.slots.find(s => s.id === id);
      if (!slot || !state.teachers.some(t => t.id === slot.teacherId && t.ownerId === user.id)) throw new Error('Only the teacher can update this meeting link.');
      slot.meetingUrl = meetingUrl;
    });
    for (const booking of this.data().bookings.filter(b => b.slotId === id && b.status === 'confirmed' && b.studentEmail)) {
      await this.sendConfirmation(booking);
    }
  }
  private async sendConfirmation(booking: Booking): Promise<void> {
    const slot = this.data().slots.find(s => s.id === booking.slotId)!;
    const teacher = this.data().teachers.find(t => t.id === slot.teacherId)!;
    this.emailNotice.set('');
    try {
      const response = await fetch('/api/live-classes/confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ bookingId: booking.id, studentEmail: booking.studentEmail, studentName: booking.studentName,
          teacherName: teacher.name, subject: teacher.subject, start: slot.start, end: slot.end,
          meetingUrl: slot.meetingUrl, goals: booking.goals, timezone: booking.timezone || 'UTC' })
      });
      if (!response.ok || (await response.json()).sent !== true) throw new Error('Email unavailable');
      this.emailNotice.set('Confirmation email sent with class details' + (slot.meetingUrl ? ' and the online class link.' : '. Your teacher will email the meeting link when it is available.'));
    } catch {
      this.emailNotice.set('Your class is saved, but the confirmation email could not be sent. Check your booking for class details and the meeting link.');
    }
  }
  async book(slotId: string, goals: string, replacing?: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<void> {
    const user = this.user(); if(goals.length > 1000) throw new Error('Keep learning goals under 1,000 characters.');
    const id = crypto.randomUUID();
    await this.update(state => {
      const slot = state.slots.find(s => s.id === slotId); if(!slot) throw new Error('This slot no longer exists.');
      const previous = replacing ? state.bookings.find(b => b.id === replacing) : undefined;
      if (replacing && (!previous || previous.studentId !== user.id || previous.status !== 'confirmed' || !state.slots.some(s => s.id === previous.slotId && s.start > Date.now()))) throw new Error('Only your upcoming confirmed bookings can be rescheduled.');
      if(previous?.slotId === slotId) throw new Error('Choose a different time to reschedule.');
      canBook(state,slot,user.id,replacing);
      if (previous) previous.status = 'cancelled';
      state.bookings.push({ id, slotId, studentId: user.id, studentName: user.name, studentEmail: user.email, timezone, goals: goals.trim(), status: 'confirmed', messages: [] });
    });
    await this.sendConfirmation(this.data().bookings.find(b => b.id === id)!);
  }
  private participant(state: LiveState, booking: Booking, userId: string): boolean {
    return booking.studentId === userId || state.slots.some(s => s.id === booking.slotId && state.teachers.some(t => t.id === s.teacherId && t.ownerId === userId));
  }
  async cancel(id: string): Promise<void> {
    const user = this.user(); await this.update(state => {
      const booking = state.bookings.find(b => b.id === id);
      if(!booking || !this.participant(state,booking,user.id)) throw new Error('You cannot change this booking.');
      if(booking.status !== 'confirmed' || !state.slots.some(s => s.id === booking.slotId && s.start > Date.now())) throw new Error('Only upcoming confirmed classes can be cancelled.');
      booking.status = 'cancelled';
    });
  }
  async message(id: string, text: string): Promise<void> {
    const user = this.user(); if (!text.trim() || text.length > 500) throw new Error('Enter a message up to 500 characters.');
    await this.update(state => {
      const booking = state.bookings.find(b => b.id === id);
      if(!booking || booking.status !== 'confirmed' || !this.participant(state,booking,user.id)) throw new Error('Messages are only available to participants of a confirmed booking.');
      booking.messages.push({ id: crypto.randomUUID(), senderId: user.id, senderName: user.name, text: text.trim(), sentAt: Date.now() });
    });
  }
}
