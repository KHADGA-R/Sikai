import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { ApiService } from '../core/api.service';

interface Coupon {id: string; code: string; discountType: string; discountValue: number; minimumSubtotal: number; startsAt: number | null; expiresAt: number | null; active: boolean; maxRedemptions: number | null; perUserLimit: number; redeemed: number; reserved: number;}
function draftCoupon() {return {code: '', discountType: 'percent', discountValue: 10, minimumSubtotal: 0, startsAt: '', expiresAt: '', active: true, maxRedemptions: null as number | null, perUserLimit: 1};}

@Component({standalone: true, imports: [FormsModule, CurrencyPipe, DatePipe, RouterLink, BrandLogoComponent], styleUrls: ['./admin.component.css', './coupon-admin.component.css'], template: `
<div class="admin-shell"><aside class="admin-sidebar"><a class="admin-brand" routerLink="/admin"><app-brand-logo /><small>ADMIN PORTAL</small></a><div class="sidebar-label">WORKSPACE</div><a routerLink="/admin">Course management</a><a class="sidebar-active" routerLink="/admin/coupons">Discount coupons</a><div class="sidebar-bottom"><a routerLink="/">Open user portal ↗</a></div></aside>
<main class="admin-main"><header class="admin-topbar"><span>Workspace / <strong>Discount coupons</strong></span><span class="demo-badge">Administrator</span></header><section class="admin-content">
  <div class="admin-heading"><div><span class="eyebrow purple">GIVE LEARNING A BOOST</span><h1>Discount coupons</h1><p>Create promo codes students can apply to their checkout.</p></div></div>
  @if(error()){<p class="error-note" role="alert">{{error()}}</p>} @if(message()){<p class="success-note" role="status">{{message()}}</p>}
  <section class="admin-card coupon-editor"><h2>Create a coupon</h2><form #form="ngForm" (ngSubmit)="create(form)">
    <div class="form-grid"><label>Promo code<input name="code" [(ngModel)]="draft.code" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" placeholder="e.g. LEARN10" class="coupon-code-input"></label>
    <label>Discount type<select name="discountType" [(ngModel)]="draft.discountType"><option value="percent">Percentage (%)</option><option value="fixed">Fixed amount (USD)</option></select></label>
    <label>Discount value<input name="discountValue" type="number" [(ngModel)]="draft.discountValue" required min="0.01" [max]="draft.discountType === 'percent' ? 100 : 9999999999.99" step="0.01"></label>
    <label>Minimum order subtotal (USD)<input name="minimumSubtotal" type="number" [(ngModel)]="draft.minimumSubtotal" required min="0" step="0.01"></label>
    <label>Starts at (optional)<input name="startsAt" type="datetime-local" [(ngModel)]="draft.startsAt"></label><label>Expires at (optional)<input name="expiresAt" type="datetime-local" [(ngModel)]="draft.expiresAt"></label>
    <label>Total usage limit (optional)<input name="maxRedemptions" type="number" [(ngModel)]="draft.maxRedemptions" min="1" max="1000000" step="1" placeholder="No limit"></label><label>Uses per student<input name="perUserLimit" type="number" [(ngModel)]="draft.perUserLimit" required min="1" max="1000" step="1"></label>
    </div><label class="coupon-active"><input name="active" type="checkbox" [(ngModel)]="draft.active">Activate this code</label><p class="coupon-help">Amounts are in USD. Dates use your local time. One code applies to the entire order; discount terms are fixed after creation.</p><button class="button primary" type="submit" [disabled]="busy()">{{busy() ? 'Saving...' : 'Create coupon'}}</button>
  </form></section>
  <section class="admin-card"><div class="library-header"><h2>Your coupons</h2><button class="text-button" [disabled]="busy() || loading()" (click)="load()">Refresh</button></div><p class="coupon-help">Pending payments reserve a use until the provider confirms completion or failure.</p>
    @if(loading()){<p role="status">Loading coupons...</p>}
    <div class="table-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Validity</th><th>Usage</th><th>Status</th><th>Action</th></tr></thead><tbody>
    @for(c of coupons(); track c.id){<tr><td><strong>{{c.code}}</strong><small>{{c.perUserLimit}} use(s) per student</small></td><td>{{c.discountType === 'percent' ? c.discountValue + '%' : (c.discountValue | currency:'USD')}}</td><td>{{c.minimumSubtotal | currency:'USD'}}</td><td><small>{{c.startsAt ? (c.startsAt | date:'medium') : 'Starts immediately'}}</small><small>{{c.expiresAt ? (c.expiresAt | date:'medium') : 'No expiry'}}</small></td><td>{{c.redeemed}} used<small>{{c.reserved}} pending · {{c.maxRedemptions ?? 'Unlimited'}} total</small></td><td><span class="status-pill" [class.published]="state(c) === 'Active'">{{state(c)}}</span></td><td><button class="text-button" [disabled]="busy()" (click)="toggle(c)">{{c.active ? 'Disable' : 'Enable'}}</button></td></tr>}
    @empty{<tr><td colspan="7" class="admin-empty">No coupons yet. Create your first promo code above.</td></tr>}
    </tbody></table></div>
  </section>
</section></main></div>`})
export class CouponAdminComponent {
  private readonly api = inject(ApiService);
  readonly coupons = signal<Coupon[]>([]); readonly loading = signal(true); readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  draft = draftCoupon();
  constructor() {void this.load();}
  async load(): Promise<void> {
    this.loading.set(true);
    try {this.coupons.set(await this.api.request<Coupon[]>('GET', '/admin/coupons'));}
    catch(e){this.error.set(e instanceof Error ? e.message : 'Unable to load coupons.');}
    finally{this.loading.set(false);}
  }
  async create(form: NgForm): Promise<void> {
    if(this.busy()) return;
    this.error.set(''); this.message.set('');
    if(form.invalid){this.error.set('Check the code, discount value and usage limits.'); return;}
    this.busy.set(true);
    try {
      const {startsAt, expiresAt, ...values} = this.draft;
      const result = await this.api.request<{code: string}>('POST', '/admin/coupons', {...values, code: values.code.trim().toUpperCase(), startsAt: startsAt ? new Date(startsAt).getTime() : null, expiresAt: expiresAt ? new Date(expiresAt).getTime() : null});
      this.draft = draftCoupon(); form.resetForm(this.draft); this.message.set(result.code + ' is ready to use.'); await this.load();
    } catch(e){this.error.set(e instanceof Error ? e.message : 'Unable to create coupon.');}
    finally{this.busy.set(false);}
  }
  async toggle(coupon: Coupon): Promise<void> {
    this.busy.set(true); this.error.set('');
    try {await this.api.request('PUT', `/admin/coupons/${coupon.id}/status`, {active: !coupon.active}); await this.load();}
    catch(e){this.error.set(e instanceof Error ? e.message : 'Unable to update coupon.');}
    finally{this.busy.set(false);}
  }
  state(coupon: Coupon): string {
    if(!coupon.active) return 'Disabled';
    if(coupon.expiresAt && coupon.expiresAt <= Date.now()) return 'Expired';
    if(coupon.startsAt && coupon.startsAt > Date.now()) return 'Scheduled';
    return 'Active';
  }
}
