import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppNotification, NotificationService } from '../core/notification.service';

@Component({ selector: 'app-notification-bell', standalone: true, imports: [DatePipe], templateUrl: './notification-bell.component.html', styleUrl: './notification-bell.component.css' })
export class NotificationBellComponent {
  readonly notifications = inject(NotificationService);
  readonly open = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  @ViewChild('bell') private bell?: ElementRef<HTMLButtonElement>;
  constructor() { this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.open.set(false)); }
  toggle(): void { this.open.update(value => !value); if (this.open()) void this.notifications.refresh(true); }
  @HostListener('document:click', ['$event']) outside(event: MouseEvent): void { if (!event.composedPath().includes(this.host.nativeElement)) this.open.set(false); }
  @HostListener('document:keydown.escape') escape(): void { if (this.open()) { this.open.set(false); this.bell?.nativeElement.focus(); } }
  async activate(item: AppNotification): Promise<void> {
    await this.notifications.markRead(item.id);
    const target = /^\/(?!\/)/.test(item.target) && !/[\\\r\n]/.test(item.target) ? item.target : '/';
    this.open.set(false); await this.router.navigateByUrl(target);
  }
  icon(type: string): string {
    if (type === 'enrollment' || type === 'new_student') return '+';
    if (type === 'course_completed' || type === 'student_completed') return '✓';
    if (type === 'course_updated') return '↻';
    if (type === 'live_message') return '✉';
    return '◷';
  }
}
