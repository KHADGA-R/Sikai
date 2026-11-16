import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Wait for session restoration, then allow signed-in users or redirect to login with the requested return URL. */
export const authGuard: CanActivateFn = async (_, state) => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.ready;
  return auth.isLoggedIn() || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Require an instructor or administrator after restoring identity; students return to live-class discovery. */
export const instructorGuard: CanActivateFn = async (_, state) => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.ready;
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.isInstructor() || router.createUrlTree(['/live-classes']);
};

/** Require the administrator role; backend authorization independently protects the corresponding API routes. */
export const adminGuard: CanActivateFn = async (_, state) => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.ready;
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.isAdmin() || router.createUrlTree(['/']);
};

/** Accept only safe same-application paths and avoid redirects back into login or registration. */
export function safeReturnUrl(value: string | null): string {
  return value && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value) && !/^\/(login|register)([/?#;]|$)/.test(value) ? value : '/my-learning';
}
