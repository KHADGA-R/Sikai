import { Chapter } from './instructor-content';
import { Course } from './models';

/** Catalog response with the server-assigned owner's UUID. */
export interface ApiCourse extends Course { ownerId: string; }
/** Protected curriculum metadata; duration/chapters use seconds and the binary is fetched separately. */
export interface ApiLesson {
  id: number; title: string; minutes: number; kind: 'video' | 'audio' | 'pdf';
  duration: number; chapters: Chapter[]; fileName?: string; hasFile: boolean; position: number;
}
/** Ordered topic containing the backend's real numeric lesson IDs. */
export interface ApiTopic { id: string; title: string; position: number; lessons: ApiLesson[]; }

/** SQL nullable fields map to the optional properties used by Angular form controls. */
export function normalizeCourse<T extends Course>(course: T): T {
  return { ...course, grade: course.grade ?? undefined, subcategory: course.subcategory ?? undefined };
}

/** Only editable fields are sent; server assigns ownership, IDs, rating and lesson counts. */
export function courseInput(course: Course): object {
  const { title, description, category, subcategory, price, level, durationHours, emoji, accent, published, grade } = course;
  return { title, description, category, subcategory, price, level, durationHours, emoji, accent, published, grade };
}
