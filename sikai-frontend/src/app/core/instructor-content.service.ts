import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { ApiCourse, ApiTopic, normalizeCourse } from './api-models';
import { InstructorCourse, InstructorLesson, validateInstructorCourse } from './instructor-content';
import { LearnHubStore } from './store.service';

/** Adapts the existing nested editor to course/topic/lesson APIs; media is loaded on demand. */
@Injectable({ providedIn: 'root' })
export class InstructorContentService {
  private readonly api = inject(ApiService);
  private readonly store = inject(LearnHubStore);

  /** Load the instructor course hierarchy as metadata; lesson binaries are fetched only when previewed. */
  async list(): Promise<InstructorCourse[]> {
    const courses = await this.api.request<ApiCourse[]>('GET', '/instructor/courses');
    return Promise.all(courses.map(async course => ({
      ...normalizeCourse(course), id: String(course.id), updatedAt: 0,
      topics: (await this.api.request<ApiTopic[]>('GET', `/courses/${course.id}/content`)).map(topic => ({
        id: topic.id, title: topic.title, lessons: topic.lessons.map(lesson => ({
          ...lesson, id: String(lesson.id), fileName: lesson.fileName ?? '', file: undefined
        }))
      }))
    })));
  }

  /** Use a newly selected local file when available, otherwise fetch the saved lesson through authenticated download. */
  async preview(lesson: InstructorLesson): Promise<Blob> {
    return lesson.file ?? await this.api.file(lesson.id);
  }

  /**
   * Synchronize a nested draft through separate course, topic, lesson and upload requests, then publish last.
   * Server IDs are copied back immediately so a partial save can be retried without duplicating created
   * records.
   */
  async save(course: InstructorCourse): Promise<void> {
    validateInstructorCourse(course);
    if (course.title.trim().length < 4) throw new Error('Course title must contain at least four characters.');
    const published = course.published ?? false;
    const input = {
      title: course.title, description: course.description, category: course.category ?? 'Skills & Training',
      subcategory: course.subcategory, price: course.price ?? 0, level: course.level ?? 'BEGINNER',
      durationHours: course.durationHours ?? course.topics.flatMap(t => t.lessons).reduce((n, l) => n + l.duration, 0) / 3600,
      emoji: course.emoji ?? '📚', accent: course.accent ?? 'teal', published: false, grade: course.grade
    };
    // Save as a draft while its hierarchy/uploads are synchronized. IDs are assigned back immediately,
    // so retrying a partially completed save updates existing records instead of duplicating them.
    if (!/^\d+$/.test(course.id)) {
      const created = await this.api.request<ApiCourse>('POST', '/instructor/courses', input);
      course.id = String(created.id);
    } else await this.api.request('PUT', `/instructor/courses/${course.id}`, input);
    const previous = await this.api.request<ApiTopic[]>('GET', `/courses/${course.id}/content`);
    for (const [position, topic] of course.topics.entries()) {
      const existing = previous.find(t => t.id === topic.id);
      if (!existing) topic.id = (await this.api.request<{ id: string }>('POST', `/instructor/courses/${course.id}/topics`, { title: topic.title, position })).id;
      else await this.api.request('PUT', `/instructor/topics/${topic.id}`, { title: topic.title, position });
      for (const [lessonPosition, lesson] of topic.lessons.entries()) {
        const metadata = { title: lesson.title, minutes: Math.ceil(lesson.duration / 60), kind: lesson.kind, duration: lesson.duration, chapters: lesson.chapters, position: lessonPosition };
        if (!/^\d+$/.test(lesson.id)) lesson.id = String((await this.api.request<{ id: number }>('POST', `/instructor/topics/${topic.id}/lessons`, metadata)).id);
        else await this.api.request('PUT', `/instructor/lessons/${lesson.id}`, metadata);
        if (lesson.file) {
          const form = new FormData(); form.append('file', lesson.file, lesson.fileName);
          await this.api.request('POST', `/instructor/lessons/${lesson.id}/file`, form);
          lesson.hasFile = true; lesson.file = undefined;
        }
      }
      for (const old of existing?.lessons ?? []) if (!topic.lessons.some(l => l.id === String(old.id))) await this.api.request('DELETE', `/instructor/lessons/${old.id}`);
    }
    for (const old of previous) if (!course.topics.some(t => t.id === old.id)) await this.api.request('DELETE', `/instructor/topics/${old.id}`);
    await this.api.request('PUT', `/instructor/courses/${course.id}`, { ...input, published });
    await this.store.refreshCatalog();
  }
}
