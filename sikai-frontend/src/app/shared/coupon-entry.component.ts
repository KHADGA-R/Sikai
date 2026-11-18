import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';

@Component({selector: 'app-coupon-entry', standalone: true, imports: [FormsModule], template: `
<section class="coupon-entry" aria-label="Promo code">
  @if (couponCode) {
    <div class="applied-coupon"><div><span aria-hidden="true">✓</span><strong>{{couponCode}}</strong><small>Promo code applied</small></div><button type="button" [disabled]="locked || busy()" (click)="remove()" aria-label="Remove promo code">Remove</button></div>
  } @else {
    <form (ngSubmit)="apply()"><label [for]="'promo-'+(orderId || 'course')">Have a promo code?</label><div class="coupon-input-row"><input [id]="'promo-'+(orderId || 'course')" name="promoCode" [(ngModel)]="code" maxlength="32" autocomplete="off" autocapitalize="characters" placeholder="Enter code" [disabled]="locked || busy()" [attr.aria-describedby]="'promo-help-'+(orderId || 'course')"><button type="submit" [disabled]="locked || busy() || !code.trim()">{{busy() ? 'Applying...' : 'Apply'}}</button></div><small [id]="'promo-help-'+(orderId || 'course')">One code per order. Discounts apply before currency conversion.</small></form>
  }
  @if (locked) {<p class="coupon-note">Promo changes are unavailable while payment is in progress.</p>}
  @if (error()) {<p class="coupon-error" role="alert">{{error()}}</p>}
</section>`, styles: [`:host{display:block}.coupon-entry{border-block:1px solid var(--line);padding:20px 0;margin:20px 0}.coupon-entry label{display:block;font-size:13px;font-weight:750;margin-bottom:10px}.coupon-input-row{display:flex;gap:8px}.coupon-input-row input{min-width:0;flex:1;width:100%;border:1px solid #d9d3e4;background:#fff;border-radius:10px;padding:12px;font-size:13px;text-transform:uppercase;color:var(--ink)}.coupon-entry button{border:1px solid #e4b9c4;color:var(--sikai-red);background:#fff5f7;border-radius:10px;font-size:12px;font-weight:750;padding:11px 16px;cursor:pointer}.coupon-entry button:disabled,.coupon-entry input:disabled{opacity:.55;cursor:default}.coupon-entry small{display:block;color:var(--muted);font-size:11px;line-height:1.6;margin-top:8px}.coupon-entry input:focus-visible,.coupon-entry button:focus-visible{outline:3px solid #c3a5db;outline-offset:2px}.applied-coupon{display:flex;justify-content:space-between;gap:12px;align-items:center}.applied-coupon>div{min-width:0}.applied-coupon strong{font-size:13px;overflow-wrap:anywhere}.applied-coupon span{color:#28735c;margin-right:8px}.applied-coupon small{margin-top:5px}.coupon-note{color:var(--muted);font-size:11px;line-height:1.5;margin-bottom:0}.coupon-error{color:#a91c34;font-size:12px;line-height:1.6;margin-bottom:0}`]})
export class CouponEntryComponent {
  @Input() orderId?: string;
  @Input() courseIds: number[] = [];
  @Input() couponCode: string | null = null;
  @Input() locked = false;
  @Output() changed = new EventEmitter<void>();
  @Output() busyChange = new EventEmitter<boolean>();
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly busy = signal(false); readonly error = signal('');
  code = '';
  async apply(): Promise<void> {
    if (this.locked || this.busy() || !this.code.trim()) return;
    this.busy.set(true); this.busyChange.emit(true); this.error.set('');
    try {
      let id = this.orderId;
      if (!id) id = (await this.api.request<{id: string}>('POST', '/checkout/orders', {courseIds: this.courseIds})).id;
      await this.api.request('PUT', `/checkout/orders/${encodeURIComponent(id)}/coupon`, {code: this.code.trim().toUpperCase()});
      if (this.orderId) this.changed.emit(); else await this.router.navigate(['/checkout/orders', id]);
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to apply promo code.'); }
    finally { this.busy.set(false); this.busyChange.emit(false); }
  }
  async remove(): Promise<void> {
    if (!this.orderId || this.locked || this.busy()) return;
    this.busy.set(true); this.busyChange.emit(true); this.error.set('');
    try { await this.api.request('DELETE', `/checkout/orders/${encodeURIComponent(this.orderId)}/coupon`); this.code = ''; this.changed.emit(); }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Unable to remove promo code.'); }
    finally { this.busy.set(false); this.busyChange.emit(false); }
  }
}
