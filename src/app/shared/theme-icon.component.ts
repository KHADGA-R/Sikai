import { Component, input } from '@angular/core';

@Component({
  selector: 'app-theme-icon',
  standalone: true,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="paths[name()] || paths['star']" /></svg>`,
  styles: [`:host{display:inline-flex;flex-shrink:0;width:24px;height:24px}svg{width:100%;height:100%}`],
})
export class ThemeIconComponent {
  readonly name = input('star');
  readonly paths: Record<string, string> = {
    person: 'M20 21v-2a7 7 0 0 0-14 0v2 M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M2 6l10 7L22 6',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3 M5 10h14v12H5z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    'eye-off': 'M3 3l18 18 M10.6 5.1C17 4 22 12 22 12a22 22 0 0 1-3.2 3.9 M6.4 6.4C3.7 8.6 2 12 2 12s4 7 10 7c1.7 0 3.2-.5 4.6-1.3 M9.9 9.9a3 3 0 0 0 4.2 4.2',
    translate: 'M3 5h12 M9 2v3 M5 5c0 6 5 9 9 11 M13 5c-1 6-5 9-10 11 M13 22l5-12 5 12 M15 18h6',
    calculator: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 M8 6h8 M8 11h.01 M12 11h.01 M16 11h.01 M8 15h.01 M12 15h.01 M16 15v4 M8 19h.01 M12 19h.01',
    graduation: 'M1 8l11-5 11 5-11 5L1 8 M5 10v7c4 4 10 4 14 0v-7 M23 8v8',
    laptop: 'M4 4h16v12H4z M2 20h20l-2-4H4z M9 8l-2 2 2 2 M15 8l2 2-2 2',
    people: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M16 4a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z',
    play: 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0 M10 8l6 4-6 4z',
    globe: 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0 M2 12h20 M12 2c6 5 6 15 0 20-6-5-6-15 0-20 M4 6.5c5 3 11 3 16 0 M4 17.5c5-3 11-3 16 0',
    growth: 'M3 14h4v7H3z M10 9h4v12h-4z M17 3h4v18h-4z',
    temple: 'M12 2v3 M6 7l6-3 6 3H6 M4 12l8-4 8 4H4 M2 18l10-5 10 5H2 M5 18v4 M10 18v4 M14 18v4 M19 18v4 M2 22h20 M9 7v3 M15 7v3 M7 12v3 M17 12v3',
    palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 .8-2.8H17a4 4 0 0 0 4-4C21 6 17 3 12 3 M7 10h.01 M10 7h.01 M15 7h.01 M18 10h.01 M7 15h.01',
    chat: 'M21 11a8 8 0 0 1-8 8H8l-5 3 1.5-6A8 8 0 1 1 21 11 M7 11h.01 M12 11h.01 M17 11h.01',
    music: 'M9 18V5l12-3v13 M9 9l12-3 M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3 M21 15a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3',
  };
}
