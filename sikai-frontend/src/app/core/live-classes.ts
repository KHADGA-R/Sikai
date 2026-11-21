export interface Teacher { id: string; ownerId: string; name: string; subject: string; bio: string; languages: string; photoUrl?: string; }
/** Allow an empty picture or a bounded JPEG, PNG or WebP base64 data URI for profile display. */
export function safeTeacherPhoto(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || value.length <= 300000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}
export interface LiveSlot { id: string; teacherId: string; start: number; end: number; meetingUrl: string; closed?: boolean; }
export interface LiveClassDiscovery {
  slotId: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  start: number;
  recentBookings: number;
}
export interface ClassMessage { id: string; senderId: string; senderName: string; text: string; sentAt: number; }
export interface Booking { id: string; slotId: string; studentId: string; studentName: string; studentEmail?: string; timezone?: string; goals: string; status: 'confirmed' | 'cancelled'; messages: ClassMessage[]; }
export interface LiveState { teachers: Teacher[]; slots: LiveSlot[]; bookings: Booking[]; }
/** Compare half-open time intervals; a class ending exactly when another starts does not overlap. */
export function overlaps(a: LiveSlot, b: LiveSlot): boolean { return a.start < b.end && b.start < a.end; }
/**
 * Validate a legacy in-memory booking against closed slots, self-booking and both participants' time
 * conflicts. Connected bookings are authorized independently by the backend.
 */
export function canBook(state: LiveState, slot: LiveSlot, studentId: string, replacing?: string, now = Date.now()): void {
  const teacher = state.teachers.find(t => t.id === slot.teacherId);
  if (!teacher || teacher.ownerId === studentId) throw new Error('Choose a class with another teacher.');
  if (slot.closed) throw new Error('This availability has been withdrawn. Choose another time.');
  if (slot.start <= now) throw new Error('This class has already started. Choose a future time.');
  const active = state.bookings.filter(b => b.status === 'confirmed' && b.id !== replacing);
  if (active.some(b => b.slotId === slot.id)) throw new Error('This time was just booked. Please select another slot.');
  if (active.some(b => {
    const other = state.slots.find(s => s.id === b.slotId);
    const otherTeacher = state.teachers.find(t => t.id === other?.teacherId);
    return other && overlaps(slot, other) && [b.studentId, otherTeacher?.ownerId].some(id => id === studentId || id === teacher.ownerId);
  })) throw new Error('This time overlaps another booking for you or the teacher.');
}
/** Allow an omitted meeting link or HTTPS without embedded username or password. */
export function safeMeetingUrl(value: string): boolean {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
/** Generate legacy sample teachers and future availability for demo fixtures; the connected service does not seed server data. */
export function seedLiveClasses(now = Date.now()): LiveState {
  const teachers: Teacher[] = [
    { id: 'demo-music', ownerId: 'demo-music', name: 'Aarav · Demo teacher', subject: 'Music', bio: 'Explore rhythm, madal basics, and traditional Nepali music. Sample teacher for trying the booking flow.', languages: 'Nepali, English' },
    { id: 'demo-language', ownerId: 'demo-language', name: 'Sita · Demo teacher', subject: 'Languages', bio: 'Build confidence in everyday Nepali conversation. Sample teacher for trying the booking flow.', languages: 'Nepali, English' },
    { id: 'demo-art', ownerId: 'demo-art', name: 'Pema · Demo teacher', subject: 'Arts & Crafts', bio: 'Discover drawing, color, and traditional art. Sample teacher for trying the booking flow.', languages: 'Nepali, English' }
  ];
  return { teachers, bookings: [], slots: teachers.flatMap((t,i) => [1,2,3].map(day => {
    const start = Math.ceil((now + day * 86400000) / 3600000) * 3600000 + i * 3600000;
    return { id: `${t.id}-${day}`, teacherId: t.id, start, end: start + 45 * 60000, meetingUrl: '' };
  })) };
}
