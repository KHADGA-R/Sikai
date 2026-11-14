import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CATEGORY_NAMES } from '../core/categories';
import { LiveClassesService } from '../core/live-classes.service';
import { Booking, LiveSlot } from '../core/live-classes';

@Component({ standalone: true, imports: [FormsModule, RouterLink], templateUrl: './live-classes.component.html', styleUrl: './live-classes.component.css' })
export class LiveClassesComponent implements OnDestroy {
  readonly live = inject(LiveClassesService); readonly auth = inject(AuthService); private readonly router = inject(Router); private readonly route = inject(ActivatedRoute);
  readonly aboutPage = this.route.snapshot.data['view'] === 'profile';
  readonly categories = CATEGORY_NAMES;
  readonly tab = signal(this.auth.isInstructor() ? 'bookings' : 'browse'); readonly query = signal(''); readonly subject = signal('All'); readonly teacherId = signal(''); readonly date = signal('');
  readonly timezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);
  readonly timezones = [...new Set([this.timezone(), 'Asia/Kathmandu', 'UTC', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Australia/Sydney'])];
  readonly now = signal(Date.now()); private readonly timer = setInterval(() => { this.now.set(Date.now()); },30000);
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal(''); readonly selectedSlot = signal(''); readonly rescheduling = signal('');
  goals = ''; start = ''; minutes = 45; meetingUrl = ''; bio = ''; languages = ''; teachingSubject = 'Culture & Heritage';
  photoUrl = '';
  readonly editingProfile = signal(false);
  readonly photoBusy = signal(false);
  messageDrafts: Record<string,string> = {};
  readonly myTeacher = computed(() => this.live.state().teachers.find(t => t.ownerId === this.auth.user()?.id));
  readonly teachers = computed(() => this.live.state().teachers.filter(t => (this.subject() === 'All' || t.subject === this.subject()) && (t.name + ' ' + t.subject + ' ' + t.languages).toLowerCase().includes(this.query().trim().toLowerCase())));
  readonly selectedTeacher = computed(() => this.live.state().teachers.find(t => t.id === this.teacherId()));
  readonly slots = computed(() => this.live.state().slots.filter(s => !s.closed && s.teacherId === this.teacherId() && s.start > this.now() && !this.live.state().bookings.some(b => b.slotId === s.id && b.status === 'confirmed') && (!this.date() || this.dateKey(s.start) === this.date())).sort((a,b) => a.start - b.start));
  readonly mySlots = computed(() => this.live.state().slots.filter(s => !s.closed && s.teacherId === this.myTeacher()?.id && s.end > this.now()).sort((a,b) => a.start - b.start));
  readonly bookings = computed(() => this.live.state().bookings.filter(b => this.auth.isInstructor() ? this.live.state().slots.some(s => s.id === b.slotId && s.teacherId === this.myTeacher()?.id) : b.studentId === this.auth.user()?.id).map(b => ({ booking: b, slot: this.live.state().slots.find(s => s.id === b.slotId) })).filter(row => !!row.slot).sort((a,b) => b.slot!.start - a.slot!.start));
  constructor() { const view = this.aboutPage ? 'profile' : this.route.snapshot.queryParamMap.get('view'); if((view === 'teach' || view === 'profile') && this.auth.isInstructor()) this.tab.set(view); if(view === 'profile' && !this.aboutPage && this.auth.isInstructor()) void this.router.navigateByUrl('/instructor/about', {replaceUrl:true}); this.loadProfile(); }
  private loadProfile(): void {
    const teacher = this.myTeacher();
    this.bio = teacher?.bio ?? ''; this.languages = teacher?.languages ?? '';
    this.teachingSubject = teacher?.subject ?? 'Culture & Heritage'; this.photoUrl = teacher?.photoUrl ?? '';
  }
  editProfile(): void { this.loadProfile(); this.editingProfile.set(true); this.error.set(''); }
  cancelProfile(): void { this.loadProfile(); this.editingProfile.set(false); this.error.set(''); }
  async uploadPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
    if (!file || this.photoBusy() || this.busy()) return;
    this.error.set('');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      this.error.set('Choose a JPG, PNG, or WebP picture up to 2 MB.'); return;
    }
    this.photoBusy.set(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image preview unavailable');
        const side = Math.min(bitmap.width, bitmap.height);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 320);
        ctx.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 320, 320);
        this.photoUrl = canvas.toDataURL('image/jpeg', 0.85);
      } finally { bitmap.close(); }
    } catch { this.error.set('This picture could not be read. Try another JPG, PNG, or WebP image.'); }
    finally { this.photoBusy.set(false); }
  }
  ngOnDestroy(): void { clearInterval(this.timer); }
  dateKey(time: number): string { const parts = new Intl.DateTimeFormat('en-US', { timeZone: this.timezone(), year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(time); return ['year','month','day'].map(type => parts.find(p => p.type === type)?.value).join('-'); }
  when(time: number): string { return new Intl.DateTimeFormat('en', { timeZone: this.timezone(), weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }).format(time); }
  teacherName(id: string): string { return this.live.state().teachers.find(t => t.id === id)?.name ?? 'Teacher'; }
  chooseTeacher(id: string): void { this.teacherId.set(id); this.selectedSlot.set(''); this.date.set(''); this.error.set(''); }
  chooseSlot(id: string): void { if(!this.auth.isLoggedIn()) { void this.router.navigate(['/login'],{queryParams:{returnUrl:'/live-classes'}}); return; } this.selectedSlot.set(id); this.error.set(''); }
  changeTab(tab: string): void { if(tab === 'profile' && this.auth.isInstructor()) { void this.router.navigateByUrl('/instructor/about'); return; } if(tab === 'browse' && this.auth.isInstructor()) { this.tab.set('bookings'); return; } if((tab === 'teach' || tab === 'profile') && !this.auth.isInstructor()) { this.tab.set('browse'); return; } if(tab !== 'browse' && !this.auth.isLoggedIn()) { void this.router.navigate(['/login'],{queryParams:{returnUrl:'/live-classes'}}); return; } this.tab.set(tab); this.error.set(''); }
  async action(work: () => Promise<void>, message: string): Promise<void> { if(this.busy()) return; this.busy.set(true); this.error.set(''); this.notice.set(''); try { await work(); this.notice.set(message); } catch(e) { this.error.set(e instanceof Error ? e.message : 'Please try again.'); this.live.refresh(); } finally { this.busy.set(false); } }
  async book(): Promise<void> { await this.action(async () => { await this.live.book(this.selectedSlot(),this.goals,this.rescheduling() || undefined,this.timezone()); this.selectedSlot.set(''); this.rescheduling.set(''); this.goals = ''; this.tab.set('bookings'); }, 'Your class is confirmed. Add it to your calendar or send your teacher a note.'); }
  reschedule(booking: Booking): void { this.rescheduling.set(booking.id); this.goals = booking.goals; const slot = this.live.state().slots.find(s => s.id === booking.slotId); this.tab.set('browse'); this.chooseTeacher(slot?.teacherId ?? ''); this.notice.set('Choose a new teacher or time. Your existing booking stays confirmed until you confirm the replacement.'); }
  cancelReschedule(): void { this.rescheduling.set(''); this.selectedSlot.set(''); this.goals = ''; this.notice.set('Rescheduling cancelled. Your original booking is unchanged.'); }
  async cancel(booking: Booking): Promise<void> { if(window.confirm('Cancel this class? The time will become available to other students.')) await this.action(() => this.live.cancel(booking.id),'Class cancelled.'); }
  async saveProfile(): Promise<void> {
    if (this.photoBusy()) return;
    const updating = !!this.myTeacher();
    await this.action(async () => {
      await this.live.saveTeacher({subject:this.teachingSubject,bio:this.bio,languages:this.languages,photoUrl:this.photoUrl});
      this.editingProfile.set(false);
    }, updating ? 'Teacher profile updated.' : 'Teacher profile saved. Open Live Classes to set your availability.');
  }
  async addSlot(): Promise<void> { await this.action(async () => { await this.live.addSlot(new Date(this.start).getTime(),this.minutes,this.meetingUrl); this.start = ''; this.meetingUrl = ''; },'Availability published. Students can now book this time.'); }
  async updateMeeting(id: string, url: string): Promise<void> { await this.action(() => this.live.updateMeeting(id,url),'Meeting link updated for this class.'); }
  async removeSlot(id: string): Promise<void> { if(window.confirm('Remove this available time?')) await this.action(() => this.live.removeSlot(id),'Availability removed.'); }
  async send(id: string): Promise<void> { await this.action(async () => { await this.live.message(id,this.messageDrafts[id] ?? ''); this.messageDrafts[id] = ''; },'Message saved for the other participant in this browser.'); }
  calendar(booking: Booking, slot: LiveSlot): void {
    const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
    const escape = (text: string) => text.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sikai//Live Classes//EN','BEGIN:VEVENT',`UID:${booking.id}@sikai.local`,`DTSTAMP:${stamp(Date.now())}`,`DTSTART:${stamp(slot.start)}`,`DTEND:${stamp(slot.end)}`,`SUMMARY:${escape('Sikai class with ' + this.teacherName(slot.teacherId))}`,`DESCRIPTION:${escape(booking.goals || 'Your Sikai live learning session.')}`,`LOCATION:${escape(slot.meetingUrl || 'Meeting link to be shared by your teacher')}`,'END:VEVENT','END:VCALENDAR'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'})); const link = document.createElement('a'); link.href = url; link.download = 'sikai-class.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
}
