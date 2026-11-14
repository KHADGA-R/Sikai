export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
import { Category } from './categories';
export type { Category } from './categories';
export interface Course {
  id: number; title: string; description: string; instructor: string;
  category: Category; subcategory?: string; price: number; isFree: boolean; level: Level;
  rating: number; durationHours: number; lessons: number; emoji: string;
  accent: string; published: boolean;
}
export interface Lesson { id: number; title: string; minutes: number; }
