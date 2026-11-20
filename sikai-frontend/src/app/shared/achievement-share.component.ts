import { Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-achievement-share',
  standalone: true,
  template: `
    <div class="share-actions">
      @if(nativeShare) {
        <button class="button primary" type="button" (click)="share()">Share</button>
      }
      <button class="button outline" type="button" (click)="copy()">{{url() ? 'Copy link' : 'Copy achievement'}}</button>
      @if(url()) {
        <a class="button outline" [href]="linkedIn()" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      }
      <a class="button outline" [href]="x()" target="_blank" rel="noopener noreferrer">Share on X</a>
    </div>
    @if(message()) { <p role="status">{{message()}}</p> }
    @if(manualCopy()) {
      <input #copyField [value]="url() || text()" aria-label="Share content" readonly (focus)="copyField.select()">
    }
  `,
  styles: [`
    .share-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-block: 12px; }
    input { width: 100%; padding: 8px; }
  `]
})
export class AchievementShareComponent {
  readonly text = input.required<string>();
  readonly url = input('');
  readonly message = signal('');
  readonly manualCopy = signal(false);
  readonly nativeShare = typeof navigator.share === 'function';
  readonly linkedIn = computed(() => 'https://www.linkedin.com/sharing/share-offsite/?' +
    new URLSearchParams({ url: this.url() }));
  readonly x = computed(() => 'https://twitter.com/intent/tweet?' +
    new URLSearchParams(this.url() ? { text: this.text(), url: this.url() } : { text: this.text() }));

  async share(): Promise<void> {
    this.message.set('');
    try {
      await navigator.share({ text: this.text(), url: this.url() || undefined });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.message.set('Sharing is unavailable. You can copy it or open a sharing link.');
      }
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url() || this.text());
      this.manualCopy.set(false);
      this.message.set(this.url() ? 'Link copied.' : 'Achievement copied.');
    } catch {
      this.manualCopy.set(true);
      this.message.set('Select the text below to copy it.');
    }
  }
}
