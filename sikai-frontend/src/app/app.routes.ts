import { adminGuard, authGuard, instructorGuard } from './core/auth.guard';
import { Routes } from '@angular/router';
export const routes: Routes = [
  { path: 'cart', canActivate: [authGuard], loadComponent: () => import('./features/cart.component').then(m => m.CartComponent), title: 'Your cart | Sikai' },
  { path: 'checkout/orders/:orderId/payment/:attempt', canActivate: [authGuard], loadComponent: () => import('./features/order-checkout.component').then(m => m.OrderCheckoutComponent), title: 'Verify payment | Sikai' },
  { path: 'checkout/orders/:orderId', canActivate: [authGuard], loadComponent: () => import('./features/order-checkout.component').then(m => m.OrderCheckoutComponent), title: 'Checkout | Sikai' },
  { path: 'checkout/:id/payment/:attempt', canActivate: [authGuard], loadComponent: () => import('./features/checkout.component').then(m => m.CheckoutComponent), title: 'Verify payment | Sikai' },
  { path: 'checkout/:id', canActivate: [authGuard], loadComponent: () => import('./features/checkout.component').then(m => m.CheckoutComponent), title: 'Checkout | Sikai' },
  { path: 'my-progress', canActivate: [authGuard], loadComponent: () => import('./features/learning-dashboard.component').then(m => m.LearningDashboardComponent), title: 'My Progress | Sikai' },
  { path: 'completed-courses', canActivate: [authGuard], loadComponent: () => import('./features/learning-dashboard.component').then(m => m.LearningDashboardComponent), title: 'Completed Courses | Sikai' },
  { path: 'my-achievements', canActivate: [authGuard], loadComponent: () => import('./features/learning-dashboard.component').then(m => m.LearningDashboardComponent), title: 'My Achievements | Sikai' },
  { path: 'live-classes', loadComponent: () => import('./features/live-classes.component').then(m => m.LiveClassesComponent), title: 'Live Classes | Sikai' },
  { path: 'community', loadComponent: () => import('./features/discover.component').then(m => m.DiscoverComponent), title: 'Community | Sikai' },
  { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent), title: 'Course management | Sikai Admin' },
  { path: 'login', loadComponent: () => import('./features/auth.component').then(m => m.AuthComponent), title: 'Log in | Sikai' },
  { path: 'register', loadComponent: () => import('./features/auth.component').then(m => m.AuthComponent), title: 'Create account | Sikai' },
  { path: '', loadComponent: () => import('./features/catalog.component').then(m => m.CatalogComponent), title: 'Explore courses | Sikai' },
  { path: 'courses/:id', loadComponent: () => import('./features/course-detail.component').then(m => m.CourseDetailComponent), title: 'Course details | Sikai' },
  { path: 'wishlist', canActivate: [authGuard], loadComponent: () => import('./features/wishlist.component').then(m => m.WishlistComponent), title: 'Wishlist | Sikai' },
  { path: 'my-learning', canActivate: [authGuard], loadComponent: () => import('./features/my-learning.component').then(m => m.MyLearningComponent), title: 'My learning | Sikai' },
  { path: 'learn/:id', canActivate: [authGuard], loadComponent: () => import('./features/player.component').then(m => m.PlayerComponent), title: 'Course player | Sikai' },
  { path: 'instructor/courses', canActivate: [instructorGuard], canDeactivate: [(component: { canLeave(): boolean }) => component.canLeave()], loadComponent: () => import('./features/instructor.component').then(m => m.InstructorComponent), title: 'My Courses | Sikai' },
  { path: 'instructor/about', canActivate: [instructorGuard], data: {view: 'profile'}, loadComponent: () => import('./features/live-classes.component').then(m => m.LiveClassesComponent), title: 'About me | Sikai' },
  { path: 'instructor', canActivate: [instructorGuard], loadComponent: () => import('./features/instructor-dashboard.component').then(m => m.InstructorDashboardComponent), title: 'Instructor dashboard | Sikai' },
  { path: '**', redirectTo: '' }
];
