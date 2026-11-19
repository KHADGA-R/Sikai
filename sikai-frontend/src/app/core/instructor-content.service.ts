import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { ApiCourse, ApiTopic, normalizeCourse } from './api-models';
import { InstructorCourse, InstructorLesson, validateInstructorCourse } from './instructor-content';
import { LearnHubStore } from './store.service';

interface Workspace {
  revision: number;
  course: InstructorCourse;
}

@Injectable({ providedIn: 'root' })
export class InstructorContentService {
  private readonly api = inject(ApiService);
  private readonly store = inject(LearnHubStore);

  async list(): Promise<InstructorCourse[]> {
    const [courses, workspaces] = await Promise.all([
      this.api.request<ApiCourse[]>('GET', '/instructor/courses'),
      this.api.request<Workspace[]>('GET', '/instructor/workspaces')
    ]);
    const drafts = new Map(workspaces.map(({ course, revision }) => [course.id, { ...course, revision }]));
    const saved = await Promise.all(courses.map(async course => {
      const id = String(course.id);
      const draft = drafts.get(id);
      if (draft) {
        drafts.delete(id);
        return { ...draft, published: course.published };
      }
      const topics = await this.api.request<ApiTopic[]>('GET', `/courses/${id}/content`);
      return {
        ...normalizeCourse(course), id, updatedAt: 0,
        topics: topics.map(topic => ({
          ...topic, lessons: topic.lessons.map(lesson => ({
            ...lesson, id: String(lesson.id), fileName: lesson.fileName ?? ''
          }))
        }))
      };
    }));
    return [...drafts.values(), ...saved];
  }

  async preview(lesson: InstructorLesson): Promise<Blob> {
    if (lesson.file) return lesson.file;
    if (lesson.assetId) return this.api.blob(`/instructor/workspaces/assets/${lesson.assetId}`);
    return this.api.file(lesson.id);
  }

  cover(course: InstructorCourse): Promise<Blob> {
    if (course.coverFile) return Promise.resolve(course.coverFile);
    return this.api.blob(`/instructor/workspaces/assets/${course.coverAssetId}`);
  }

  slides(lesson: InstructorLesson): Promise<Blob> {
    if (lesson.slides) return Promise.resolve(lesson.slides);
    if (lesson.slidesAssetId) return this.api.blob(`/instructor/workspaces/assets/${lesson.slidesAssetId}`);
    return this.api.file(lesson.id, 'slides');
  }

  async duplicate(lesson: InstructorLesson): Promise<InstructorLesson> {
    const copy: InstructorLesson = { ...structuredClone(lesson), id: crypto.randomUUID(), title: (lesson.title + ' (copy)').slice(0, 160), hasFile: false };
    if (!copy.assetId && !copy.file) {
      copy.file = await this.preview(lesson);
    }
    if (copy.slidesName && !copy.slidesAssetId && !copy.slides && !copy.removeSlides) {
      const slides = await this.api.file(lesson.id, 'slides');
      copy.slides = new File([slides], copy.slidesName, { type: 'application/pdf' });
    }
    return copy;
  }

  async save(course: InstructorCourse, report: (status: string) => void): Promise<void> {
    if (course.coverFile) {
      const asset = await this.stage(course.coverFile, course.coverFile.name, report);
      course.coverAssetId = asset.id;
      course.coverFile = undefined;
    }
    for (const topic of course.topics) for (const lesson of topic.lessons) {
      if (lesson.file) {
        const asset = await this.stage(lesson.file, lesson.fileName, report);
        lesson.assetId = asset.id;
        lesson.fileName = asset.fileName;
        lesson.file = undefined;
      }
      if (lesson.slides) {
        const asset = await this.stage(lesson.slides, lesson.slides.name, report);
        lesson.slidesAssetId = asset.id;
        lesson.slidesName = asset.fileName;
        lesson.slides = undefined;
      }
    }
    const result = await this.api.request<Workspace>('PUT', `/instructor/workspaces/${course.id}`, {
      revision: course.revision ?? course.baseRevision ?? 0, course
    });
    course.revision = result.revision;
  }

  async publish(course: InstructorCourse, report: (status: string) => void): Promise<string> {
    validateInstructorCourse(course);
    if (course.title.trim().length < 4) throw new Error('Course title must contain at least four characters.');
    if (!course.topics.some(topic => topic.lessons.length)) throw new Error('Add at least one lesson before publishing.');
    course.durationHours = course.topics.flatMap(topic => topic.lessons).reduce((total, lesson) => total + lesson.duration, 0) / 3600;
    course.emoji ??= '📚';
    course.accent ??= 'teal';
    course.price ??= 0;
    course.level ??= 'BEGINNER';
    await this.save(course, report);
    report('Publishing course…');
    const published = await this.api.request<{ id: number }>('POST', `/instructor/workspaces/${course.id}/publish`, { revision: course.revision });
    void this.store.refreshCatalog().catch(() => undefined);
    return String(published.id);
  }

  private async stage(file: Blob, name: string, report: (status: string) => void): Promise<{ id: string; fileName: string }> {
    report(`Uploading ${name}…`);
    const form = new FormData();
    form.append('file', file, name);
    try {
      return await this.api.upload('/instructor/workspaces/assets', form, percent => {
        report(percent === 100 ? `Saving ${name}…` : `Uploading ${name} (${percent}%)…`);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Upload failed.';
      throw new Error(`${name}: ${reason}`);
    }
  }
}
