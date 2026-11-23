import { Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';

export interface NoteBounds { x: number; y: number; width: number; height: number; }
export interface StickyNote extends NoteBounds {
  id: string;
  authorId: string;
  authorName: string;
  color: 'yellow' | 'pink';
  text: string;
}
export interface NotePatch { text?: string; bounds?: NoteBounds; }

@Component({
  selector: 'app-whiteboard-note',
  standalone: true,
  template: `
    <div class="note-titlebar">
      @if (editable()) {
        <button type="button" class="move" aria-label="Move sticky note"
          (pointerdown)="start($event, 'move')" (pointermove)="move($event)" (pointerup)="finish($event)"
          (pointercancel)="cancel()" (lostpointercapture)="cancel()"
          (keydown)="adjust($event, 'move')"><span aria-hidden="true">⠿</span> {{ note().authorName }}</button>
        <button type="button" class="remove" aria-label="Delete sticky note" (click)="removed.emit()">×</button>
      } @else {
        <span class="author">{{ note().authorName }}</span>
      }
    </div>
    <textarea [attr.aria-label]="'Sticky note by ' + note().authorName" [readOnly]="!editable()"
      [placeholder]="editable() ? 'Type a note…' : ''" [value]="note().text" maxlength="1500"
      (input)="queueText($any($event.target).value)" (blur)="flushText()"></textarea>
    @if (editable()) {
      <button type="button" class="resize" aria-label="Resize sticky note"
        (pointerdown)="start($event, 'resize')" (pointermove)="move($event)" (pointerup)="finish($event)"
        (pointercancel)="cancel()" (lostpointercapture)="cancel()"
        (keydown)="adjust($event, 'resize')"><span aria-hidden="true">◢</span></button>
    }
  `,
  host: {
    '[class.pink]': "note().color === 'pink'",
    '[style.left.%]': 'bounds().x / 10',
    '[style.top.%]': 'bounds().y / 10',
    '[style.width.%]': 'bounds().width / 10',
    '[style.height.%]': 'bounds().height / 10',
  },
  styles: [`
    :host { position: absolute; z-index: 1; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d5b66b; border-radius: 5px; color: #302819; background: #fff0a3; box-shadow: 0 3px 8px #36281729; }
    :host(.pink) { border-color: #d98da9; color: #462336; background: #ffcee0; }
    :host(:focus-within) { z-index: 2; }
    .note-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 2px; min-height: 24px; padding-inline: 3px; background: #51350212; }
    .note-titlebar button, .resize { border: 0; background: transparent; color: inherit; font: inherit; line-height: 1; }
    .move, .author { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .68rem; font-weight: 700; }
    .move { flex: 1; min-height: 24px; padding: 2px; text-align: start; cursor: grab; touch-action: none; }
    .move:active { cursor: grabbing; }
    .remove { width: 22px; height: 22px; padding: 0; cursor: pointer; }
    textarea { flex: 1; min-width: 0; min-height: 0; width: 100%; border: 0; border-radius: 0; padding: 5px 7px 14px; resize: none; color: inherit; background: transparent; font: inherit; font-size: clamp(10px, 1.4vw, 14px); }
    textarea:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    .resize { position: absolute; right: 0; bottom: 0; width: 22px; height: 17px; padding: 0; cursor: nwse-resize; touch-action: none; }
    @media (max-width: 640px) {
      .note-titlebar, .move { min-height: 16px; }
      .remove, .resize { width: 16px; height: 16px; }
      textarea { padding: 2px 3px 4px; }
    }
  `],
})
export class WhiteboardNoteComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly note = input.required<StickyNote>();
  readonly editable = input(false);
  readonly changed = output<NotePatch>();
  readonly removed = output<void>();
  private readonly draft = signal<NoteBounds | null>(null);
  readonly bounds = computed(() => this.draft() ?? this.note());
  private gesture?: { pointerId: number; mode: 'move' | 'resize'; startX: number; startY: number; board: DOMRect; original: NoteBounds };
  private textTimer?: number;
  private pendingText?: string;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.flushText());
  }

  queueText(value: string): void {
    if (!this.editable()) return;
    this.pendingText = value;
    window.clearTimeout(this.textTimer);
    this.textTimer = window.setTimeout(() => this.flushText(), 350);
  }

  flushText(): void {
    window.clearTimeout(this.textTimer);
    const value = this.pendingText;
    this.pendingText = undefined;
    if (value !== undefined && value !== this.note().text) this.changed.emit({ text: value });
  }

  start(event: PointerEvent, mode: 'move' | 'resize'): void {
    if (event.button !== 0 || this.gesture) return;
    const board = this.host.nativeElement.parentElement?.getBoundingClientRect();
    if (!board?.width || !board.height) return;
    event.preventDefault();
    const control = event.currentTarget as HTMLElement;
    control.focus();
    control.setPointerCapture(event.pointerId);
    this.gesture = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, board, original: this.bounds() };
  }

  move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = Math.round((event.clientX - gesture.startX) / gesture.board.width * 1000);
    const dy = Math.round((event.clientY - gesture.startY) / gesture.board.height * 1000);
    this.draft.set(this.shift(gesture.original, gesture.mode, dx, dy));
  }

  finish(event: PointerEvent): void {
    if (this.gesture?.pointerId !== event.pointerId) return;
    this.move(event);
    const bounds = this.draft();
    this.cancel();
    if (bounds) this.changed.emit({ bounds });
  }

  cancel(): void {
    this.gesture = undefined;
    this.draft.set(null);
  }

  adjust(event: KeyboardEvent, mode: 'move' | 'resize'): void {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    this.changed.emit({ bounds: this.shift(this.bounds(), mode, ...step) });
  }

  private shift(bounds: NoteBounds, mode: 'move' | 'resize', dx: number, dy: number): NoteBounds {
    const { x, y, width, height } = bounds;
    const limit = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    return mode === 'move'
      ? { x: limit(x + dx, 0, 1000 - width), y: limit(y + dy, 0, 1000 - height), width, height }
      : { x, y, width: limit(width + dx, 120, 1000 - x), height: limit(height + dy, 140, 1000 - y) };
  }
}
