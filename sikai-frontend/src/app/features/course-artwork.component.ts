import { Component, Input, inject } from '@angular/core';
import { API_BASE_URL } from '../core/api.service';

const SAMPLE_COVERS: ReadonlyMap<string, string> = new Map([
  ['Dashain and Tihar Traditions', 'sample-courses/festivals.jpg'],
  ['The History of the Kathmandu Valley', 'nepal-heritage.png'],
  ['Nepali Home Cooking', 'sample-courses/cooking.jpg'],
  ['Madal Rhythms for Beginners', 'nepali-music.png'],
  ['Voice Training for Nepali Folk Songs', 'sample-courses/vocals.jpg'],
  ['Nepali Folk Dance Basics', 'nepali-dance.png'],
  ['Stage Acting and Improvisation', 'sample-courses/acting.jpg'],
  ['Introduction to Thangka Art', 'thangka-art.png'],
  ['Hand-Built Clay Pottery', 'sample-courses/pottery.jpg'],
  ['Dhaka Textile Pattern Design', 'sample-courses/dhaka.jpg'],
  ['Everyday Nepali Conversation', 'nepali-language.png'],
  ['English for Job Interviews', 'sample-courses/interviews.jpg'],
  ['Translating Nepali Short Stories', 'sample-courses/translation.jpg'],
  ['Fractions and Decimals for Grade 5', 'sample-courses/fractions.jpg'],
  ['Geometry and Measurement for Grade 8', 'sample-courses/geometry.jpg'],
  ['SEE Mathematics Practice', 'sample-courses/see-maths.jpg'],
  ['SEE Science Revision', 'sample-courses/science.jpg'],
  ['Build Your First Website', 'sample-courses/website.jpg'],
  ['Small Business Budgeting', 'sample-courses/budgeting.jpg'],
  ['Digital Campaign Measurement', 'sample-courses/marketing.jpg']
]);

const DEFAULT_COVERS = [
  'nepal-heritage.png', 'nepali-music.png', 'nepali-dance.png',
  'thangka-art.png', 'nepali-language.png', 'online-learning.png'
];

@Component({
  selector: 'app-course-artwork',
  standalone: true,
  template: `<img [src]="src" alt="" loading="lazy" decoding="async" />`,
  styles: [`
    :host{display:block;width:100%;height:100%;min-height:90px;overflow:hidden;background:#0f4c46}
    img{display:block;width:100%;height:100%;min-height:inherit;object-fit:cover;object-position:center}
  `]
})
export class CourseArtworkComponent {
  @Input({ required: true }) courseId!: number;
  @Input({ required: true }) title!: string;
  @Input() coverAssetId?: string;
  private readonly apiBase = inject(API_BASE_URL).replace(/\/$/, '');

  get src(): string {
    if (this.coverAssetId) {
      return `${this.apiBase}/courses/${this.courseId}/cover/${this.coverAssetId}`;
    }
    const cover = SAMPLE_COVERS.get(this.title)
      ?? DEFAULT_COVERS[Math.abs(this.courseId - 1) % DEFAULT_COVERS.length];
    return `assets/images/${cover}`;
  }
}
