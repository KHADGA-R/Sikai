import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountRole, AuthService } from '../core/auth.service';
import { safeReturnUrl } from '../core/auth.guard';

@Component({ standalone: true, imports: [FormsModule, RouterLink], template: `
  <section class="container section page-min auth-page">
    <div class="panel auth-panel">
      <span class="eyebrow purple">YOUR LEARNING JOURNEY</span>
      <h1>{{ registering ? 'Create your account' : 'Welcome back' }}</h1>
      <p>{{ registering ? 'Join Sikai and start building your skills.' : 'Log in to continue learning.' }}</p>
      <form #form="ngForm" (ngSubmit)="submit(form)" novalidate>
        @if (registering) {
          <label for="role">Account type<select id="role" name="role" [(ngModel)]="role" required><option value="student">Student</option><option value="instructor">Instructor (Teacher)</option></select></label>
          <label for="name">Full name<input id="name" name="name" [(ngModel)]="name" required minlength="2" maxlength="80" autocomplete="name" #fullName="ngModel" />
          @if ((fullName.touched || form.submitted) && (fullName.invalid || name.trim().length < 2)) { <small class="field-error">Enter your name (2–80 characters).</small> }</label>
        }
        <label for="email">Email<input id="email" name="email" type="email" [(ngModel)]="email" required email autocomplete="email" #emailField="ngModel" />
          @if ((emailField.touched || form.submitted) && emailField.invalid) { <small class="field-error">Enter a valid email address.</small> }</label>
        <label for="password">Password<input id="password" name="password" type="password" [(ngModel)]="password" required [minlength]="registering ? 8 : 1" maxlength="128" [autocomplete]="registering ? 'new-password' : 'current-password'" #passwordField="ngModel" />
          @if ((passwordField.touched || form.submitted) && passwordField.invalid) { <small class="field-error">{{ registering ? 'Use 8–128 characters.' : 'Enter your password.' }}</small> }</label>
        @if (registering) {
          <label for="confirm">Confirm password<input id="confirm" name="confirm" type="password" [(ngModel)]="confirm" required autocomplete="new-password" #confirmField="ngModel" />
            @if ((confirmField.touched || form.submitted) && confirm !== password) { <small class="field-error">Passwords must match.</small> }</label>
        }
        @if (error()) { <div class="error-note" role="alert">{{ error() }}</div> }
        <button class="button primary" type="submit" [disabled]="busy()">{{ busy() ? 'Please wait…' : registering ? 'Create account' : 'Log in' }}</button>
      </form>
      <p>{{ registering ? 'Already have an account?' : 'New to Sikai?' }} <a class="auth-link" [routerLink]="registering ? '/login' : '/register'" [queryParams]="{ returnUrl: returnUrl }">{{ registering ? 'Log in' : 'Create an account' }}</a></p>
      <div class="demo-note">Local demo: accounts are saved in this browser. Use a demo password. Your session ends when you log out or close this tab.</div>
    </div>
  </section>` })
export class AuthComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly registering = this.route.snapshot.routeConfig?.path === 'register';
  readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  name = ''; email = ''; password = ''; confirm = '';
  role: AccountRole = 'student';
  readonly busy = signal(false);
  readonly error = signal('');

  async submit(form: NgForm): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    if (form.invalid || (this.registering && (this.confirm !== this.password || this.name.trim().length < 2))) return;
    this.busy.set(true);
    try {
      if (this.registering) await this.auth.register(this.name, this.email, this.password, this.role);
      else await this.auth.login(this.email, this.password);
      this.password = ''; this.confirm = '';
      await this.router.navigateByUrl(this.auth.isInstructor() && !this.route.snapshot.queryParamMap.get('returnUrl') ? '/instructor' : this.returnUrl);
    } catch (error) {
      this.error.set(error instanceof Error && !(error instanceof DOMException) ? error.message : 'Unable to access browser storage. Allow storage and try again.');
    } finally { this.busy.set(false); }
  }
}
