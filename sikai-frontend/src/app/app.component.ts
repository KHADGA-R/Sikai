import { NotificationBellComponent } from './shared/notification-bell.component';
import { BrandLogoComponent } from './shared/brand-logo.component';
import { HeaderLayoutDirective } from './shared/header-layout.directive';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { AuthService } from './core/auth.service';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LearnHubStore } from './core/store.service';
import { CartService } from './core/cart.service';
@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandLogoComponent, HeaderLayoutDirective, NotificationBellComponent], styles: [`
  .navbar-search {
    display: flex;
    flex: 1 1 420px;
    max-width: 520px;
    min-width: 0;
    background: #fff;
    border: 1px solid #ded8cf;
    border-radius: 999px;
  }
  .navbar-search:focus-within { outline: 2px solid #004c45; outline-offset: 2px; }
  .navbar-search button {
    display: grid;
    place-items: center;
    flex: 0 0 42px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #004c45;
  }
  .navbar-search input {
    width: 100%;
    min-width: 0;
    padding: 10px 12px 10px 0;
    border: 0;
    border-radius: 999px;
    outline: none;
    background: transparent;
    color: #173c3d;
    font-size: 0.875rem;
  }
  @media (max-width: 950px) {
    .site-header .nav { flex-wrap: wrap; }
    .navbar-search { order: 2; flex-basis: 100%; max-width: none; }
    .site-header .nav nav { order: 3; width: 100%; overflow-x: auto; }
    .site-header .auth-actions { margin-inline-start: auto; }
  }
`], template: `
  @if (standalonePage()) { <router-outlet /> } @else {
  <div class="app-shell">
    <header appHeaderLayout class="site-header" [class.signed-in-header]="auth.isLoggedIn()"><div class="container nav">
      <a class="brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a>
      <form class="navbar-search" role="search" aria-label="Course search" (submit)="searchCourses($event, courseQuery.value)">
        <button type="submit" aria-label="Search courses">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        </button>
        <input #courseQuery type="search" aria-label="What would you like to learn?" placeholder="What would you like to learn?" />
      </form>
      <nav aria-label="Main navigation">@if(auth.isAdmin()){<a routerLink="/admin">Admin</a>}
        @if(auth.isInstructor()){
          <a routerLink="/instructor" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Dashboard</a>
          <a routerLink="/instructor/courses" routerLinkActive="active">My Courses</a>
          <a routerLink="/live-classes" routerLinkActive="active">Live Classes</a>
          <a routerLink="/instructor/about" routerLinkActive="active">About me</a>
        }@else{
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Courses</a>
          @if (!landingPage() || auth.isLoggedIn()) {
            <a routerLink="/cart" routerLinkActive="active">Cart <span class="nav-count">{{cart.count()}}</span></a>
          }
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
      </nav><div class="auth-actions">@if (auth.user(); as user) {<app-notification-bell /><div class="avatar" [title]="user.name">{{ user.name.slice(0, 2).toUpperCase() }}</div><span class="user-name">{{ user.name }}</span><button class="button outline" (click)="logout()">Log out</button>} @else {<a class="auth-link" routerLink="/login">Log in</a><a class="button primary" routerLink="/register">Sign up</a>}</div>
    </div></header>
    <main>@if(store.error() || auth.sessionError() || cart.error()){<div class="container error-note" role="alert">{{store.error() || auth.sessionError() || cart.error()}} <button class="text-button" (click)="retry()">Retry</button></div>}@if(store.loading() || store.personalLoading()){<p class="container" role="status">Loading your courses...</p>}<router-outlet /></main>
    <footer><div class="container footer-values"><div><span>&#9671;</span><p><strong>Learn</strong><small>Discover something meaningful</small></p></div><div><span>&#8734;</span><p><strong>Create</strong><small>Build your skills and portfolio</small></p></div><div><span>&#9752;</span><p><strong>Preserve</strong><small>Keep Nepal’s heritage alive</small></p></div><div><span>&#9678;</span><p><strong>Connect</strong><small>A world of shared knowledge</small></p></div></div><div class="container footer-inner"><div><a class="footer-brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a><p>Rooted in Nepal. Open to the World.</p></div><div class="footer-note">Learn &middot; Create &middot; Preserve <span class="footer-dot">&#9679;</span> Made for curious minds everywhere</div></div></footer>
  </div> }` })
export class AppComponent {
  readonly cart = inject(CartService);
  readonly store = inject(LearnHubStore);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly url = toSignal(this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects)
  ), { initialValue: this.router.url });
  readonly standalonePage = computed(() => /^\/(?:admin|login|register|certificates)(?:[/?#;]|$)/.test(this.url()));
  readonly landingPage = computed(() => /^\/(?:[?#]|$)/.test(this.url()));

  async searchCourses(event: Event, value: string): Promise<void> {
    event.preventDefault();
    const query = value.trim();
    const navigated = await this.router.navigate(['/'], { queryParams: { q: query || null }, fragment: 'courses' });
    if (!navigated) document.getElementById('courses')?.scrollIntoView({ block: 'start' });
  }
  /** Revoke the server session and return to the catalog; local credentials are cleared even if revocation fails. */
  async logout(): Promise<void> { try { await this.auth.logout(); } catch { /* Local session is cleared even when the server is unavailable. */ } await this.router.navigateByUrl('/'); }
  /** Retry session restoration when needed, then reload public and authenticated learning data. */
  async retry(): Promise<void> { if (this.auth.sessionError()) await this.auth.retrySession(); await this.store.refreshCatalog(); if (this.auth.isLoggedIn()) await Promise.all([this.store.refreshPersonal(), this.cart.refresh()]); } }
