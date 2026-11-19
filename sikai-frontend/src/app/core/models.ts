export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
import { Category } from './categories';
export type { Category } from './categories';
/** Shared catalog projection; price, publication and real lesson count are supplied by the server. */
export interface Course {
  id: number; title: string; description: string; instructor: string;
  category: Category; subcategory?: string; price: number; isFree: boolean; level: Level;
  rating: number; durationHours: number; lessons: number; emoji: string;
  accent: string; published: boolean; grade?: number;
  summary?: string; audience?: string; prerequisites?: string; outcomes?: string; language?: string; coverAssetId?: string;
}
/** Minimal learning projection: use a real numeric server ID when persisting completion. */
export interface Lesson { id: number; title: string; minutes: number; }
