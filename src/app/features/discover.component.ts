import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({ standalone: true, imports: [RouterLink], template: `
  <section class="container section page-min">
    <div class="section-heading"><div><span class="eyebrow purple">EXPLORE SIKAI</span><h1>{{ liveClasses ? 'Live Classes' : 'Community' }}</h1><p>{{ liveClasses ? 'Learn together, wherever you are.' : 'A shared love of learning, culture, and creativity.' }}</p></div></div>
    <div class="empty full"><h2>{{ liveClasses ? 'No live classes scheduled yet' : 'Our community space is coming soon' }}</h2><p>{{ liveClasses ? 'Explore our self-paced courses while we prepare upcoming sessions.' : 'Discover courses and start your learning journey in the meantime.' }}</p><a class="button primary" routerLink="/">Explore Courses</a></div>
  </section>` })
export class DiscoverComponent {
  readonly liveClasses = inject(ActivatedRoute).snapshot.routeConfig?.path === 'live-classes';
}
