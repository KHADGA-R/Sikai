import { Category, validClassification } from './categories';
export interface Chapter { seconds: number; title: string; }
export interface InstructorLesson { id: string; title: string; file: Blob; fileName: string; kind: 'video' | 'audio' | 'pdf'; duration: number; chapters: Chapter[]; }
export interface InstructorTopic { id: string; title: string; lessons: InstructorLesson[]; }
export interface InstructorCourse { id: string; ownerId: string; category?: Category; subcategory?: string; title: string; description: string; topics: InstructorTopic[]; updatedAt: number; }
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
export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export function validateInstructorCourse(course: InstructorCourse): void {
  if (course.category && !validClassification(course.category, course.subcategory)) throw new Error('Choose a subcategory belonging to the selected category.');
  if (!course.title.trim() || !course.description.trim()) throw new Error('Course title and description are required.');
  for (const topic of course.topics) {
    if (!topic.title.trim()) throw new Error('Every topic needs a title.');
    for (const lesson of topic.lessons) {
      if (!lesson.title.trim()) throw new Error('Every lesson needs a title.');
      if (!(lesson.file instanceof Blob) || !lesson.file.size || lesson.file.size > 100 * 1024 * 1024) throw new Error('Files must be nonempty and no larger than 100 MB.');
      if (lesson.kind === 'pdf' && lesson.chapters.length) throw new Error('PDF lessons cannot have media timestamps.');
      if (lesson.kind !== 'pdf') parseChapters(lesson.chapters.map(c => `${formatTime(c.seconds)} ${c.title}`).join('\n'), lesson.duration);
    }
  }
}
