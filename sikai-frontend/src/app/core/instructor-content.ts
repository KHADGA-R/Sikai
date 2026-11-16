import { Category, validClassification } from './categories';
/** Media offset in seconds, as distinct from live-class epoch-millisecond timestamps. */
export interface Chapter { seconds: number; title: string; }
/** A staged upload keeps its Blob; saved lessons retain metadata and fetch the binary on demand. */
export interface InstructorLesson { id: string; title: string; file?: Blob; hasFile?: boolean; fileName: string; kind: 'video' | 'audio' | 'pdf'; duration: number; chapters: Chapter[]; }
/** Editor topic IDs are temporary UUIDs until the server assigns the persisted topic ID. */
export interface InstructorTopic { id: string; title: string; lessons: InstructorLesson[]; }
/** The nested editor keeps course/lesson IDs as strings, including numeric server IDs after save. */
export interface InstructorCourse { id: string; ownerId: string; category?: Category; subcategory?: string; title: string; description: string; topics: InstructorTopic[]; updatedAt: number; price?: number; level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'; published?: boolean; grade?: number; durationHours?: number; emoji?: string; accent?: string; }
/** Parse MM:SS or HH:MM:SS lines, sort them and reject duplicate or out-of-duration chapter timestamps. */
export function parseChapters(text: string, duration: number): Chapter[] {
  const chapters = text.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const match = line.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!match) throw new Error('Use one chapter per line: MM:SS Title or HH:MM:SS Title.');
    const hours = Number(match[1] ?? 0), minutes = Number(match[2]), seconds = Number(match[3]);
    if (minutes > 59 || seconds > 59) throw new Error('Minutes and seconds must be between 00 and 59.');
    const time = hours * 3600 + minutes * 60 + seconds;
    if (!Number.isFinite(duration) || duration <= 0 || time >= duration) throw new Error('Each timestamp must be inside the media duration.');
    return { seconds: time, title: match[4].trim() };
  }).sort((a,b) => a.seconds - b.seconds);
  if (chapters.some((c,i) => i > 0 && c.seconds === chapters[i-1].seconds)) throw new Error('Each chapter must have a different timestamp.');
  return chapters;
}
/** Render media seconds as a zero-padded HH:MM:SS timestamp for display and chapter editing. */
export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':');
}
/** Validate draft metadata, topic and lesson titles, available files and kind-specific chapter constraints. */
export function validateInstructorCourse(course: InstructorCourse): void {
  if (course.category && !validClassification(course.category, course.subcategory)) throw new Error('Choose a subcategory belonging to the selected category.');
  if (!course.title.trim() || !course.description.trim()) throw new Error('Course title and description are required.');
  for (const topic of course.topics) {
    if (!topic.title.trim()) throw new Error('Every topic needs a title.');
    for (const lesson of topic.lessons) {
      if (!lesson.title.trim()) throw new Error('Every lesson needs a title.');
      if ((!lesson.file && !lesson.hasFile) || (lesson.file && (!(lesson.file instanceof Blob) || !lesson.file.size || lesson.file.size > 100 * 1024 * 1024))) throw new Error('Files must be nonempty and no larger than 100 MB.');
      if (lesson.kind === 'pdf' && lesson.chapters.length) throw new Error('PDF lessons cannot have media timestamps.');
      if (lesson.kind !== 'pdf') parseChapters(lesson.chapters.map(c => `${formatTime(c.seconds)} ${c.title}`).join('\n'), lesson.duration);
    }
  }
}
