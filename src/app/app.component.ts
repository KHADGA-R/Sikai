import { BrandLogoComponent } from './shared/brand-logo.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { AuthService } from './core/auth.service';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LearnHubStore } from './core/store.service';
@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandLogoComponent], template: `
  @if (standalonePage()) { <router-outlet /> } @else {
  <div class="app-shell">
    <header class="site-header" [class.signed-in-header]="auth.isLoggedIn()"><div class="container nav">
      <a class="brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a>
      <nav aria-label="Main navigation">
        @if(auth.isInstructor()){
          <a routerLink="/instructor" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Dashboard</a>
          <a routerLink="/instructor/courses" routerLinkActive="active">My Courses</a>
          <a routerLink="/live-classes" routerLinkActive="active">Live Classes</a>
          <a routerLink="/instructor/about" routerLinkActive="active">About me</a>
        }@else{
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Courses</a>
          @if(auth.isLoggedIn()){
            <a routerLink="/wishlist" routerLinkActive="active">Wishlist <span class="nav-count">{{store.wishlist().length}}</span></a>
            <a routerLink="/my-learning" routerLinkActive="active">My Learning</a>
            <a routerLink="/live-classes" routerLinkActive="active">Live Classes</a>
            <a routerLink="/my-progress" routerLinkActive="active">My Progress</a>
            <a routerLink="/completed-courses" routerLinkActive="active">Completed Courses</a>
            <a routerLink="/my-achievements" routerLinkActive="active">My Achievements</a>
          }@else{
            <a routerLink="/live-classes" routerLinkActive="active">Live Classes</a>
            <a routerLink="/community" routerLinkActive="active">Community</a>
            <a routerLink="/instructor" routerLinkActive="active">For Instructors</a>
          }
        }
      </nav><div class="auth-actions">@if (auth.user(); as user) {<div class="avatar" [title]="user.name">{{ user.name.slice(0, 2).toUpperCase() }}</div><span class="user-name">{{ user.name }}</span><button class="button outline" (click)="logout()">Log out</button>} @else {<a class="auth-link" routerLink="/login">Log in</a><a class="button primary" routerLink="/register">Sign up</a>}</div>
    </div></header>
    <main><router-outlet /></main>
    <footer><div class="container footer-values"><div><span>&#9671;</span><p><strong>Learn</strong><small>Discover something meaningful</small></p></div><div><span>&#8734;</span><p><strong>Create</strong><small>Build your skills and portfolio</small></p></div><div><span>&#9752;</span><p><strong>Preserve</strong><small>Keep Nepal’s heritage alive</small></p></div><div><span>&#9678;</span><p><strong>Connect</strong><small>A world of shared knowledge</small></p></div></div><div class="container footer-inner"><div><a class="footer-brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a><p>Rooted in Nepal. Open to the World.</p></div><div class="footer-note">Learn &middot; Create &middot; Preserve <span class="footer-dot">&#9679;</span> Made for curious minds everywhere</div></div></footer>
  </div> }` })
export class AppComponent { readonly store = inject(LearnHubStore); readonly auth = inject(AuthService); private readonly router = inject(Router); readonly standalonePage = toSignal(this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(event => /^\/(?:admin|login|register)(?:[/?#;]|$)/.test(event.urlAfterRedirects))), { initialValue: /^\/(?:admin|login|register)(?:[/?#;]|$)/.test(this.router.url) }); logout(): void { this.auth.logout(); void this.router.navigateByUrl('/'); } }
