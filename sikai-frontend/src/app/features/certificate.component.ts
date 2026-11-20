import { DatePipe, DecimalPipe, Location, TitleCasePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { Certificate, OwnedCertificate } from '../core/certificate';
import { AchievementShareComponent } from '../shared/achievement-share.component';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { toDataURL } from 'qrcode';

@Component({
  standalone: true,
  imports: [DatePipe, DecimalPipe, TitleCasePipe, RouterLink, BrandLogoComponent, AchievementShareComponent],
  template: `
    <section class="certificate-page">
      <nav aria-label="Certificate navigation">
        @if(courseId()) { <a routerLink="/my-achievements">Back to My Achievements</a> }
        @else { <a routerLink="/">Explore Sikai</a> }
      </nav>
      @if(error()) { <p role="alert">{{error()}}</p> }
      @if(loading()) {
        <p role="status">Loading certificate…</p>
      } @else if(certificate(); as cert) {
        <article class="certificate">
          <div class="certificate-header">
            <div class="certificate-brand"><app-brand-logo /><span>Learning<br>Platform</span></div>
            <div class="verification">
              <div>Certificate ID: <span>{{cert.id}}</span></div>
              @if(qrCode(); as qr) {
                <a class="qr" [href]="verificationUrl()" aria-label="Verify this certificate"><img [src]="qr" alt="" width="88" height="88"></a>
              }
            </div>
          </div>
          <h1>Certificate of Completion</h1>
          <p class="certificate-caption">This certifies that</p>
          <h2>{{cert.recipient}}</h2>
          <p class="certificate-caption">has successfully completed the course</p>
          <h3>{{cert.courseTitle}}</h3>
          <dl class="certificate-details">
            @if(cert.instructor) {
              <div><dt>Instructor</dt><dd>{{cert.instructor}}</dd></div>
            }
            @if(cert.durationHours != null && cert.durationHours > 0) {
              <div><dt>Total Learning Time</dt><dd>{{cert.durationHours | number:'1.1-2'}} hours</dd></div>
            }
            @if(cert.level) {
              <div><dt>Level</dt><dd>{{cert.level.toLowerCase() | titlecase}}</dd></div>
            }
            <div><dt>{{cert.completedAt == null ? 'Issued on' : 'Completed on'}}</dt>
              <dd>{{(cert.completedAt ?? cert.issuedAt) | date:'longDate':'UTC'}}</dd></div>
          </dl>
          @if(cert.instructor) {
            <div class="certificate-issuers">
              <div><strong>{{cert.instructor}}</strong><span>Course Instructor</span></div>
            </div>
          }
          <footer class="certificate-disclosure">
            <p>This certificate verifies course completion recorded in Sikai.</p>
            @if(verificationUrl(); as url) {
              <p>Verify at: <a [href]="url">{{url}}</a></p>
            }
          </footer>
        </article>
        <div class="certificate-actions">
          <button class="button outline" type="button" (click)="print()">Print / Save as PDF</button>
          @if(owned(); as owner) {
            <button class="button primary" type="button" (click)="setSharing(owner)" [disabled]="busy()">
              {{owner.shared ? 'Turn off public link' : 'Enable public link'}}
            </button>
            @if(owner.shared) {
              <p>Anyone with the link can view this certificate.</p>
              <app-achievement-share [text]="'I completed ' + cert.courseTitle + ' on Sikai!'" [url]="publicUrl()" />
            } @else {
              <p>Enable a public link to add a verification QR code and share your certificate.</p>
            }
          } @else {
            <p>Verified by Sikai</p>
          }
        </div>
      } @else if(canGenerate()) {
        <div class="panel">
          <h1>Course completion certificate</h1>
          <p>Complete every lesson in an enrolled course to generate your certificate.</p>
          <button class="button primary" type="button" (click)="generate()" [disabled]="busy()">Generate certificate</button>
        </div>
      } @else if(error()) {
        <button class="button outline" type="button" (click)="reload()">Retry</button>
      }
    </section>
  `,
  styleUrl: './certificate.component.css'
})
export class CertificateComponent {
  private readonly api = inject(ApiService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly courseId = computed(() => this.params().get('courseId'));
  private readonly retry = signal(0);
  readonly certificate = signal<Certificate | null>(null);
  readonly owned = signal<OwnedCertificate | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly canGenerate = signal(false);
  readonly error = signal('');
  readonly publicUrl = computed(() => {
    const cert = this.certificate();
    if (!cert) return '';
    const path = this.router.serializeUrl(this.router.createUrlTree(['/certificates', cert.id]));
    return new URL(this.location.prepareExternalUrl(path), document.baseURI).href;
  });
  readonly verificationUrl = computed(() =>
    this.courseId() && !this.owned()?.shared ? '' : this.publicUrl());
  private readonly qr = signal<{ url: string; image: string } | null>(null);
  readonly qrCode = computed(() => {
    const qr = this.qr();
    return qr && qr.url === this.verificationUrl() ? qr.image : '';
  });

  constructor() {
    effect(onCleanup => {
      const url = this.verificationUrl();
      if (!url) return;
      let active = true;
      onCleanup(() => { active = false; });
      void toDataURL(url, { width: 264, margin: 4 }).then(image => {
        if (active) this.qr.set({ url, image });
      }).catch(() => { /* The verification link remains available. */ });
    });
    effect(onCleanup => {
      this.retry();
      const params = this.params();
      const courseId = params.get('courseId');
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      this.certificate.set(null);
      this.owned.set(null);
      this.canGenerate.set(false);
      this.error.set('');
      this.loading.set(true);
      this.busy.set(false);
      const request = courseId
        ? this.api.request<OwnedCertificate>('GET', `/me/certificates/${encodeURIComponent(courseId)}`)
        : this.api.request<Certificate>('GET', `/certificates/${encodeURIComponent(params.get('id') ?? '')}`, undefined, false);
      void request.then(cert => {
        if (cancelled) return;
        this.certificate.set(cert);
        if (courseId) this.owned.set(cert as OwnedCertificate);
      }).catch((error: ApiError) => {
        if (cancelled) return;
        if (courseId && error.status === 404) this.canGenerate.set(true);
        else this.error.set(error.status === 404 ? 'This certificate link is unavailable.' : error.message);
      }).finally(() => { if (!cancelled) this.loading.set(false); });
    });
  }

  reload(): void { this.retry.update(value => value + 1); }
  print(): void { window.print(); }

  generate(): void {
    const courseId = this.courseId();
    if (courseId) void this.update('PUT', `/me/certificates/${encodeURIComponent(courseId)}`);
  }

  setSharing(cert: OwnedCertificate): void {
    void this.update('PATCH', `/me/certificates/${cert.id}`, { shared: !cert.shared });
  }

  private async update(method: 'PUT' | 'PATCH', path: string, body?: unknown): Promise<void> {
    if (this.busy()) return;
    const params = this.params();
    this.busy.set(true);
    this.error.set('');
    try {
      const cert = await this.api.request<OwnedCertificate>(method, path, body);
      if (this.params() !== params) return;
      this.certificate.set(cert);
      this.owned.set(cert);
    } catch (error) {
      if (this.params() === params) this.error.set((error as ApiError).message);
    } finally {
      if (this.params() === params) this.busy.set(false);
    }
  }
}
