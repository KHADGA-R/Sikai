import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface InformationPage {
  title: string;
  introduction: string;
  sections?: { heading: string; text: string }[];
  links?: { label: string; path: string }[];
}

const pages: Record<string, InformationPage> = {
  about: {
    title: 'About Us',
    introduction: 'Sikai brings learning rooted in Nepal to people everywhere. Explore Nepal’s languages, music, arts, and heritage alongside academic subjects and practical skills.',
    sections: [
      { heading: 'Learn at your own pace', text: 'Work through self-paced courses or book a live one-to-one session with an instructor.' }
    ],
    links: [{ label: 'Discover courses', path: '/' }, { label: 'Explore live classes', path: '/live-classes' }]
  },
  careers: {
    title: 'Careers',
    introduction: 'Explore teaching opportunities on Sikai. Instructors can publish self-paced courses or offer one-to-one live classes.',
    links: [{ label: 'Become an instructor', path: '/instructor' }]
  },
  contact: {
    title: 'Contact Us',
    introduction: 'For questions about a booked live class, open My Bookings and message your instructor in the lesson conversation.',
    sections: [
      { heading: 'General inquiries', text: 'A general contact address is pending. For common questions about using Sikai, see Help and Support.' }
    ],
    links: [{ label: 'Open Live Classes', path: '/live-classes' }, { label: 'Help and Support', path: '/help' }]
  },
  blog: {
    title: 'Blog',
    introduction: 'Ideas for getting more out of your time on Sikai.',
    sections: [
      { heading: 'How to choose your first course', text: 'Pick one skill you want to practice. Filter the catalog by level, read the course description, and choose a course you can make time for each week.' },
      { heading: 'Make your first live class count', text: 'Before you book, write down one thing you want to learn and one question to ask. Add them to your booking so your instructor can prepare.' }
    ],
    links: [{ label: 'Explore live classes', path: '/live-classes' }]
  },
  help: {
    title: 'Help and Support',
    introduction: 'Find help with courses, accounts, and live classes.',
    sections: [
      { heading: 'Where are my enrolled courses?', text: 'Sign in and open My Learning to continue your courses.' },
      { heading: 'How do I join or reschedule a live class?', text: 'Open Live Classes and choose My Bookings. Your confirmed booking shows the meeting link when your instructor has added it, along with the available rescheduling options.' },
      { heading: 'Why am I seeing a different class time?', text: 'Live Classes displays times in your selected timezone. Use the timezone menu to check the same session in another timezone.' }
    ],
    links: [{ label: 'My Learning', path: '/my-learning' }, { label: 'Live Classes', path: '/live-classes' }]
  },
  'get-the-app': {
    title: 'Get the app',
    introduction: 'Use Sikai in your mobile browser to browse courses and join live classes.',
    sections: [
      { heading: 'Add Sikai to your home screen', text: 'If your browser offers an option to add the current site to your home screen, use it to create a shortcut to Sikai.' }
    ],
    links: [{ label: 'Open Sikai', path: '/' }]
  }
};

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="container section information-page" aria-labelledby="info-heading">
      <h1 id="info-heading">{{ page.title }}</h1>
      <p class="introduction">{{ page.introduction }}</p>
      @for (section of page.sections; track section.heading) {
        <section class="panel information-section">
          <h2>{{ section.heading }}</h2>
          <p>{{ section.text }}</p>
        </section>
      }
      @if (page.links?.length) {
        <div class="information-links">
          @for (link of page.links; track link.path) {
            <a class="button outline" [routerLink]="link.path">{{ link.label }}</a>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .information-page { max-width: 760px; }
    .information-page h1 { margin: 0 0 14px; }
    .introduction { margin: 0 0 24px; font-size: 1.1rem; line-height: 1.65; }
    .information-section { margin-bottom: 14px; }
    .information-section h2 { font-size: 1.125rem; margin-bottom: 8px; }
    .information-section p { margin: 0; color: inherit; font-size: .95rem; }
    .information-links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
  `]
})
export class SiteInformationComponent {
  readonly page = pages[inject(ActivatedRoute).snapshot.routeConfig!.path!];
}
