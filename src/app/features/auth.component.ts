import { ThemeIconComponent } from '../shared/theme-icon.component';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountRole, AuthService } from '../core/auth.service';
import { safeReturnUrl } from '../core/auth.guard';

@Component({ standalone: true, styleUrl: './auth.component.css', imports: [FormsModule, RouterLink, BrandLogoComponent, ThemeIconComponent], template: `
  <section class="container section page-min auth-page" aria-labelledby="auth-title">
    <div class="panel auth-panel" [class.signup-panel]="registering">
      <a class="auth-brand" routerLink="/" aria-label="Sikai home"><app-brand-logo /></a>
      <div class="auth-heading">
      <h1 id="auth-title">{{ registering ? 'Create your account' : 'Welcome Back' }}</h1>
      <p>{{ registering ? 'Start your Sikai learning journey.' : 'Log in to your Sikai account' }}</p></div>
      <form #form="ngForm" (ngSubmit)="submit(form)" [attr.aria-busy]="busy()" novalidate>
        @if (registering) {
          <fieldset class="account-choice"><legend>I'm here to</legend><div class="account-options"><label [class.selected]="role === 'student'"><input type="radio" name="role" value="student" [(ngModel)]="role" required /><span>Learn</span></label><label [class.selected]="role === 'instructor'"><input type="radio" name="role" value="instructor" [(ngModel)]="role" required /><span>Teach</span></label></div></fieldset>
          <div class="auth-field"><label class="sr-only" for="name">Full name</label><div class="input-wrap"><app-theme-icon name="person" /><input id="name" name="name" placeholder="Full name" [(ngModel)]="name" required minlength="2" maxlength="80" autocomplete="name" [attr.aria-invalid]="(fullName.touched || form.submitted) && (fullName.invalid || name.trim().length < 2) ? true : null" [attr.aria-describedby]="(fullName.touched || form.submitted) && (fullName.invalid || name.trim().length < 2) ? 'name-error' : null" #fullName="ngModel" /></div>
          @if ((fullName.touched || form.submitted) && (fullName.invalid || name.trim().length < 2)) { <small id="name-error" class="field-error">Enter your name (2–80 characters).</small> }</div>
        }
        <div class="auth-field">
          <label class="sr-only" for="email">Email</label>
          <div class="input-wrap"><app-theme-icon name="mail" /><input id="email" name="email" type="email" placeholder="Email" [(ngModel)]="email" required email autocomplete="username" autocapitalize="none" spellcheck="false" [attr.aria-invalid]="(emailField.touched || form.submitted) && emailField.invalid ? true : null" [attr.aria-describedby]="(emailField.touched || form.submitted) && emailField.invalid ? 'email-error' : null" #emailField="ngModel" /></div>
          @if ((emailField.touched || form.submitted) && emailField.invalid) { <small id="email-error" class="field-error">Enter a valid email address.</small> }
        </div>
        <div class="auth-field">
          <label class="sr-only" for="password">Password</label>
          <div class="input-wrap"><app-theme-icon name="lock" /><input id="password" name="password" [type]="showPassword() ? 'text' : 'password'" placeholder="Password" [(ngModel)]="password" required [minlength]="registering ? 8 : 1" maxlength="128" [autocomplete]="registering ? 'new-password' : 'current-password'" [attr.aria-invalid]="(passwordField.touched || form.submitted) && passwordField.invalid ? true : null" [attr.aria-describedby]="(passwordField.touched || form.submitted) && passwordField.invalid ? 'password-error' : null" #passwordField="ngModel" /><button class="password-toggle" type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="showPassword()" aria-controls="password"><app-theme-icon [name]="showPassword() ? 'eye-off' : 'eye'" /></button></div>
          @if ((passwordField.touched || form.submitted) && passwordField.invalid) { <small id="password-error" class="field-error">{{ registering ? 'Use 8–128 characters.' : 'Enter your password.' }}</small> }
        </div>
        @if(!registering){<div class="forgot-row"><button type="button" class="forgot-password" (click)="recoveryHelp.set(!recoveryHelp())" [attr.aria-expanded]="recoveryHelp()" aria-controls="recovery-help">Forgot password?</button></div>
          @if(recoveryHelp()){<p id="recovery-help" class="recovery-help" role="status">Password recovery is not available for this local demo. Use the password you chose in this browser, or create an account with a different email.</p>}
        }
        @if (registering) {
          <div class="auth-field"><label class="sr-only" for="confirm">Confirm password</label><div class="input-wrap"><app-theme-icon name="lock" /><input id="confirm" name="confirm" [type]="showConfirm() ? 'text' : 'password'" placeholder="Confirm password" [(ngModel)]="confirm" required autocomplete="new-password" [attr.aria-invalid]="(confirmField.touched || form.submitted) && (confirmField.invalid || confirm !== password) ? true : null" [attr.aria-describedby]="(confirmField.touched || form.submitted) && (confirmField.invalid || confirm !== password) ? 'confirm-error' : null" #confirmField="ngModel" /><button class="password-toggle" type="button" (click)="showConfirm.set(!showConfirm())" [attr.aria-label]="showConfirm() ? 'Hide confirmation password' : 'Show confirmation password'" [attr.aria-pressed]="showConfirm()" aria-controls="confirm"><app-theme-icon [name]="showConfirm() ? 'eye-off' : 'eye'" /></button></div>
            @if ((confirmField.touched || form.submitted) && (confirmField.invalid || confirm !== password)) { <small id="confirm-error" class="field-error">Passwords must match.</small> }</div>
        }
        @if (error()) { <div class="error-note" role="alert">{{ error() }}</div> }
        <button class="button primary" type="submit" [disabled]="busy()">{{ busy() ? 'Please wait…' : registering ? 'Create account' : 'Log In' }}</button>
      </form>
        <div class="auth-divider"><span>or</span></div>
        <button type="button" class="google-signin" disabled aria-describedby="google-availability"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285f4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.2Z"/><path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#fbbc05" d="M12.6 27.5a12.3 12.3 0 0 1 0-7V15H5.7a20.4 20.4 0 0 0 0 18l6.9-5.5Z"/><path fill="#ea4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15l6.9 5.5c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>{{ registering ? 'Sign up with Google' : 'Continue with Google' }}</button>
        <p id="google-availability" class="google-availability">Google sign-in is not available in this demo.</p>
      <p class="auth-switch">{{ registering ? 'Already have an account?' : 'New to Sikai?' }} <a class="auth-link" [routerLink]="registering ? '/login' : '/register'" [queryParams]="{ returnUrl: returnUrl }">{{ registering ? 'Log in' : 'Create an account' }}</a></p>

    </div>
    <p class="auth-demo">Local demo &middot; Accounts are saved in this browser. Use a demo password.</p>
  </section>` })
export class AuthComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly registering = this.route.snapshot.routeConfig?.path === 'register';
  readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  name = ''; email = ''; password = ''; confirm = '';
  role: AccountRole = 'student';
  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);
  readonly recoveryHelp = signal(false);
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
      this.password = ''; this.confirm = ''; this.showPassword.set(false); this.showConfirm.set(false);
      await this.router.navigateByUrl(this.auth.isInstructor() && !this.route.snapshot.queryParamMap.get('returnUrl') ? '/instructor' : this.returnUrl);
    } catch (error) {
      this.error.set(error instanceof Error && !(error instanceof DOMException) ? error.message : 'Unable to access browser storage. Allow storage and try again.');
    } finally { this.busy.set(false); }
  }
}
