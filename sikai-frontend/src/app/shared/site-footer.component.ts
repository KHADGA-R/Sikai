import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandLogoComponent } from './brand-logo.component';

@Component({
  selector: 'app-site-footer',
  standalone: true,
  imports: [RouterLink, BrandLogoComponent],
  template: `
    <footer class="sikai-footer">
      <nav class="container footer-directory" aria-label="Footer navigation">
        <div>
          <h2>About Sikai</h2>
          <ul>
            <li><a routerLink="/about">About Us</a></li>
            <li><a routerLink="/careers">Careers</a></li>
            <li><a routerLink="/contact">Contact Us</a></li>
            <li><a routerLink="/blog">Blog</a></li>
          </ul>
        </div>
        <div>
          <h2>Explore Sikai</h2>
          <ul>
            <li><a routerLink="/" fragment="courses">Discover Courses</a></li>
            <li><a routerLink="/" fragment="learning-categories">Learning Categories</a></li>
            <li><a routerLink="/" fragment="grade-heading">Explore by Grade</a></li>
            <li><a routerLink="/live-classes">Live Classes</a></li>
            <li><a routerLink="/community">Community</a></li>
            <li><a routerLink="/get-the-app">Get the app</a></li>
          </ul>
        </div>
        <div>
          <h2>Teach on Sikai</h2>
          <ul>
            @if (auth.isInstructor()) {
              <li><a routerLink="/instructor">Instructor Dashboard</a></li>
              <li><a routerLink="/instructor/courses">Manage Courses</a></li>
            } @else {
              <li><a routerLink="/instructor">Become an Instructor</a></li>
            }
          </ul>
        </div>
        <div>
          <h2>Account &amp; Support</h2>
          <ul>
            <li><a routerLink="/help">Help and Support</a></li>
            @if (!auth.isInstructor()) {
              @if (auth.isLoggedIn()) {
                <li><a routerLink="/my-learning">My Learning</a></li>
                <li><a routerLink="/wishlist">Wishlist</a></li>
              } @else {
                <li><a routerLink="/login">Log in</a></li>
                <li><a routerLink="/register">Create an Account</a></li>
              }
            }
          </ul>
        </div>
      </nav>
      <div class="footer-base">
        <div class="container footer-base-content">
          <a class="footer-brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a>
          <p>Rooted in Nepal. Open to the World.</p>
          <small>&copy; {{ year }} Sikai</small>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    :host { display: block; }
    .sikai-footer {
      background: #f5f2e9;
      color: #173c35;
      border-top: 1px solid #ddd7c9;
      font-family: Inter, system-ui, sans-serif;
    }
    .footer-directory {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 28px 32px;
      padding-block: 44px;
    }
    .footer-directory h2 { color: #12342e; font: 750 1.125rem/1.35 Inter, system-ui, sans-serif; margin: 0 0 12px; }
    .footer-directory ul { display: grid; gap: 4px; padding: 0; margin: 0; list-style: none; }
    .footer-directory a { display: inline-block; padding-block: 5px; color: #285448; font-size: 1rem; font-weight: 550; line-height: 1.5; }
    .footer-directory a:hover { color: #12342e; text-decoration: underline; text-underline-offset: 4px; }
    .sikai-footer a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
    .footer-base { background: #0c352f; color: #fff; }
    .footer-base-content { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; padding-block: 18px; }
    .footer-base-content .footer-brand { padding: 3px 9px; }
    .footer-base-content app-brand-logo { width: 106px; }
    .footer-base-content p { flex: 1; margin: 0; font-size: 1rem; line-height: 1.5; }
    .footer-base-content small { color: #e0eee8; font-size: .875rem; }
    @media (max-width: 800px) {
      .footer-directory { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 12px; padding-block: 28px; }
    }
    @media (max-width: 600px) {
      .footer-base-content p { flex-basis: calc(100% - 146px); }
    }
  `]
})
export class SiteFooterComponent {
  readonly auth = inject(AuthService);
  readonly year = new Date().getFullYear();
}
