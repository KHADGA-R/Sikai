import { Lesson } from './models';

export function lessonProgress(lessons: Lesson[], saved: number[]): { completed: number; total: number; percent: number; finished: boolean } {
  const completed = lessons.filter(l => saved.includes(l.id)).length;
  const total = lessons.length;
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0, finished: total > 0 && completed === total };
}
