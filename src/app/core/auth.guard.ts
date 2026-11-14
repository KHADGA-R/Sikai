import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_, state) => inject(AuthService).isLoggedIn()
  || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

export const instructorGuard: CanActivateFn = (_, state) => {
  const auth = inject(AuthService), router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.isInstructor() || router.createUrlTree(['/live-classes']);
};

export function safeReturnUrl(value: string | null): string {
  return value && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value) && !/^\/(login|register)([/?#;]|$)/.test(value) ? value : '/my-learning';
}
