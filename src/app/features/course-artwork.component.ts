import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-course-artwork',
  standalone: true,
  template: `<img [src]="scene.src" [alt]="scene.label" loading="lazy" decoding="async" />`,
  styles: [`
    :host{display:block;width:100%;height:100%;min-height:90px;overflow:hidden;background:#0f4c46}
    img{display:block;width:100%;height:100%;min-height:inherit;object-fit:cover;object-position:center}
  `]
})
export class CourseArtworkComponent {
  @Input({ required: true }) courseId!: number;
  private readonly scenes = [
    { label: 'Nepalese pagoda temple and Himalayan mountains', src: 'assets/images/nepal-heritage.png' },
    { label: 'Nepali musician with traditional flute and madal', src: 'assets/images/nepali-music.png' },
    { label: 'Traditional Nepali cultural dance', src: 'assets/images/nepali-dance.png' },
    { label: 'Artisan painting a traditional thangka', src: 'assets/images/thangka-art.png' },
    { label: 'Learning Nepali Devanagari letters', src: 'assets/images/nepali-language.png' },
    { label: 'Learning online from home', src: 'assets/images/online-learning.png' }
  ];
  get scene(): { label: string; src: string } {
    return this.scenes[Math.abs(this.courseId - 1) % this.scenes.length];
  }
}
