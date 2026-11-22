import { LanguageService } from './core/language.service';
import { NotificationBellComponent } from './shared/notification-bell.component';
import { BrandLogoComponent } from './shared/brand-logo.component';
import { HeaderLayoutDirective } from './shared/header-layout.directive';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { AuthService } from './core/auth.service';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LearnHubStore } from './core/store.service';
import { CartService } from './core/cart.service';
import { SiteFooterComponent } from './shared/site-footer.component';
const nepaliHeader = {
  'Course search': 'पाठ्यक्रम खोजी',
  'Search courses': 'पाठ्यक्रम खोज्नुहोस्',
  'What would you like to learn?': 'तपाईं के सिक्न चाहनुहुन्छ?',
  'Main navigation': 'मुख्य नेभिगेसन',
  'Admin': 'प्रशासन',
  'Dashboard': 'ड्यासबोर्ड',
  'My Courses': 'मेरा पाठ्यक्रमहरू',
  'Live Classes': 'प्रत्यक्ष कक्षाहरू',
  'About me': 'मेरो बारेमा',
  'Courses': 'पाठ्यक्रमहरू',
  'Cart': 'कार्ट',
  'Wishlist': 'इच्छासूची',
  'My Learning': 'मेरो सिकाइ',
  'My Progress': 'मेरो प्रगति',
  'Completed Courses': 'पूरा भएका पाठ्यक्रमहरू',
  'My Achievements': 'मेरा उपलब्धिहरू',
  'Community': 'समुदाय',
  'For Instructors': 'प्रशिक्षकहरूका लागि',
  'Log in': 'लग इन',
  'Log out': 'लग आउट',
  'Sign up': 'खाता खोल्नुहोस्',
  'Language': 'भाषा',
};

@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandLogoComponent, HeaderLayoutDirective, NotificationBellComponent, SiteFooterComponent], styles: [`
  .language-picker { position: relative; flex: 0 0 auto; color: var(--sikai-teal); }
  .language-trigger { display: flex; align-items: center; justify-content: center; gap: 7px; min-width: 44px; min-height: 44px; padding: 0 11px; border: 1px solid #d8e2dc; border-radius: 12px; background: #fffefa; color: inherit; font: inherit; font-size: .75rem; font-weight: 750; cursor: pointer; }
  .language-trigger:hover, .language-trigger[aria-expanded="true"] { border-color: #a9c3b9; background: #eef5f0; }
  .language-chevron { width: 6px; height: 6px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); }
  .language-trigger[aria-expanded="true"] .language-chevron { transform: translateY(2px) rotate(225deg); }
  .language-options { position: absolute; z-index: 20; inset-inline-end: 0; top: calc(100% + 8px); display: grid; gap: 4px; width: 174px; max-width: calc(100vw - 32px); margin: 0; padding: 6px; border: 1px solid #dce5df; border-radius: 14px; background: #fffefa; box-shadow: 0 10px 28px #10353c26; list-style: none; }
  .language-option { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: #173c3d; font: inherit; font-size: .9rem; text-align: start; cursor: pointer; }
  .language-option[aria-pressed="true"] { background: #e9f3ed; color: var(--sikai-teal); font-weight: 750; }
  .language-option:hover { background: #f0f4ef; }
  .language-check { width: 7px; height: 12px; margin-inline-end: 4px; border: solid currentColor; border-width: 0 2px 2px 0; transform: translateY(-2px) rotate(45deg); }
  .auth-actions > a, .auth-actions > button { white-space: nowrap; }
  .language-globe { position: relative; width: 18px; height: 18px; border: 1.5px solid currentColor; border-radius: 50%; }
  .language-globe::before { content: ''; position: absolute; inset: -1px 3px; border: 1px solid currentColor; border-radius: 50%; }
  .language-globe::after { content: ''; position: absolute; inset: 50% 0 auto; border-top: 1px solid currentColor; }
  @media (max-width: 420px) {
    .language-trigger { padding: 0 8px; }
    .language-code, .language-chevron { display: none; }
  }
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
  .site-header .nav nav a { flex-shrink: 0; white-space: nowrap; }
  @media (max-width: 950px) {
    .site-header .nav { flex-wrap: wrap; }
    .navbar-search { order: 2; flex-basis: 100%; max-width: none; }
    .site-header .nav nav { order: 3; width: 100%; overflow-x: auto; }
    .site-header .auth-actions { margin-inline-start: auto; }
  }
`], template: `
  @if (standalonePage()) { <router-outlet /> } @else {
  <div class="app-shell">
    <header appHeaderLayout class="site-header" [attr.lang]="language()" [class.signed-in-header]="auth.isLoggedIn()"><div class="container nav">
      <a class="brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a>
      <form class="navbar-search" role="search" [attr.aria-label]="label('Course search')" (submit)="searchCourses($event, courseQuery.value)">
        <button type="submit" [attr.aria-label]="label('Search courses')">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        </button>
        <input #courseQuery type="search" [attr.aria-label]="label('What would you like to learn?')" [placeholder]="label('What would you like to learn?')" />
      </form>
      <nav [attr.aria-label]="label('Main navigation')">@if(auth.isAdmin()){<a routerLink="/admin">{{ label('Admin') }}</a>}
        @if(auth.isInstructor()){
          <a routerLink="/instructor" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">{{ label('Dashboard') }}</a>
          <a routerLink="/instructor/courses" routerLinkActive="active">{{ label('My Courses') }}</a>
          <a routerLink="/live-classes" routerLinkActive="active">{{ label('Live Classes') }}</a>
          <a routerLink="/instructor/about" routerLinkActive="active">{{ label('About me') }}</a>
        }@else{
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">{{ label('Courses') }}</a>
          @if(auth.isLoggedIn()){
            <a routerLink="/cart" routerLinkActive="active">{{ label('Cart') }} <span class="nav-count">{{cart.count()}}</span></a>
            <a routerLink="/wishlist" routerLinkActive="active">{{ label('Wishlist') }} <span class="nav-count">{{store.wishlist().length}}</span></a>
            <a routerLink="/my-learning" routerLinkActive="active">{{ label('My Learning') }}</a>
            <a routerLink="/live-classes" routerLinkActive="active">{{ label('Live Classes') }}</a>
            <a routerLink="/my-progress" routerLinkActive="active">{{ label('My Progress') }}</a>
            <a routerLink="/completed-courses" routerLinkActive="active">{{ label('Completed Courses') }}</a>
            <a routerLink="/my-achievements" routerLinkActive="active">{{ label('My Achievements') }}</a>
          }@else{
            <a routerLink="/live-classes" routerLinkActive="active">{{ label('Live Classes') }}</a>
            <a routerLink="/community" routerLinkActive="active">{{ label('Community') }}</a>
            <a routerLink="/instructor" routerLinkActive="active">{{ label('For Instructors') }}</a>
          }
        }
      </nav><div class="auth-actions">@if (auth.user(); as user) {<app-notification-bell /><div class="avatar" [title]="user.name">{{ user.name.slice(0, 2).toUpperCase() }}</div><span class="user-name">{{ user.name }}</span><button class="button outline" (click)="logout()">{{ label('Log out') }}</button>} @else {<a class="auth-link" routerLink="/login">{{ label('Log in') }}</a>}
        @if (!auth.user()) {<a class="button primary" routerLink="/register">{{ label('Sign up') }}</a>}
        <div #languagePicker class="language-picker"
          (document:click)="closeLanguageOutside(languagePicker, $event.target)"
          (focusout)="closeLanguageOutside(languagePicker, $event.relatedTarget)"
          (keydown.escape)="dismissLanguage($event, languageTrigger)">
          <button #languageTrigger type="button" class="language-trigger"
            [attr.aria-label]="label('Language') + ' · ' + (language() === 'ne' ? 'नेपाली' : 'English')"
            [attr.aria-expanded]="languageOpen()" [attr.aria-controls]="languageOpen() ? 'language-options' : null"
            (click)="languageOpen.set(!languageOpen())">
            <span class="language-globe" aria-hidden="true"></span>
            <span class="language-code" aria-hidden="true">{{ language() === 'ne' ? 'NE' : 'EN' }}</span>
            <span class="language-chevron" aria-hidden="true"></span>
          </button>
          @if (languageOpen()) {
            <ul id="language-options" class="language-options" [attr.aria-label]="label('Language')">
              @for (option of languages; track option.code) {
                <li><button type="button" class="language-option" [attr.lang]="option.code"
                  [attr.aria-pressed]="language() === option.code" (click)="setLanguage(option.code, languageTrigger)">
                  {{ option.name }}
                  @if (language() === option.code) { <span class="language-check" aria-hidden="true"></span> }
                </button></li>
              }
            </ul>
          }
        </div>
      </div>
    </div></header>
    <main>@if(store.error() || auth.sessionError() || cart.error()){<div class="container error-note" role="alert">{{store.error() || auth.sessionError() || cart.error()}} <button class="text-button" (click)="retry()">{{ locale.translate('Retry') }}</button></div>}@if(store.loading() || store.personalLoading()){<p class="container" role="status">{{ locale.translate('Loading your courses...') }}</p>}<router-outlet /></main>
    <app-site-footer />
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

  readonly locale = inject(LanguageService);
  readonly language = this.locale.current;
  readonly languageOpen = signal(false);
  readonly languages = [
    { code: 'en', name: 'English' },
    { code: 'ne', name: 'नेपाली' },
  ] as const;

  label(text: keyof typeof nepaliHeader): string {
    return this.language() === 'ne' ? nepaliHeader[text] : text;
  }

  setLanguage(language: 'en' | 'ne', trigger: HTMLButtonElement): void {
    this.locale.set(language);
    trigger.focus();
    this.languageOpen.set(false);
  }

  closeLanguageOutside(picker: HTMLElement, target: EventTarget | null): void {
    if (this.languageOpen() && (!(target instanceof Node) || !picker.contains(target))) {
      this.languageOpen.set(false);
    }
  }

  dismissLanguage(event: Event, trigger: HTMLButtonElement): void {
    if (!this.languageOpen()) return;
    event.stopPropagation();
    trigger.focus();
    this.languageOpen.set(false);
  }

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
