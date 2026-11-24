import { Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';

export interface NoteBounds { x: number; y: number; width: number; height: number; }
export type NoteKind = 'sticky' | 'table' | 'graph' | 'flowchart';
export interface StickyNote extends NoteBounds {
  id: string;
  authorId: string;
  authorName: string;
  color: 'yellow' | 'pink';
  kind?: NoteKind;
  text: string;
}
export interface NotePatch { text?: string; bounds?: NoteBounds; }
interface LearningObjectContent {
  fields: (string | undefined)[];
  rows: number;
  columns: number;
  barCount: number;
  rotation: number;
  histogram: boolean;
  binStart: number;
  binWidth: number;
}

@Component({
  selector: 'app-whiteboard-note',
  standalone: true,
  template: `
    <div class="note-titlebar">
      @if (editable()) {
        <button type="button" class="move" [attr.aria-label]="'Move ' + label()"
          (pointerdown)="start($event, 'move')" (pointermove)="move($event)" (pointerup)="finish($event)"
          (pointercancel)="cancel()" (lostpointercapture)="cancel()"
          (keydown)="adjust($event, 'move')"><span aria-hidden="true">⠿</span> {{ title() }}</button>
        <button type="button" class="remove" [attr.aria-label]="'Delete ' + label()" (click)="removed.emit()">×</button>
      } @else {
        <span class="author">{{ title() }}</span>
      }
    </div>
    @if (editable() && (kind() === 'table' || kind() === 'flowchart')) {
      <div class="object-controls">
        <button type="button" aria-label="Rotate clockwise" (click)="rotate()">↻ Rotate</button>
        @if (kind() === 'table') {
          <button type="button" [disabled]="content().rows === 8" (click)="resizeTable('rows', 1)">+ Row</button>
          <button type="button" [disabled]="content().rows === 1" (click)="resizeTable('rows', -1)" aria-label="Remove last row">− Row</button>
          <button type="button" [disabled]="content().columns === 8" (click)="resizeTable('columns', 1)">+ Column</button>
          <button type="button" [disabled]="content().columns === 1" (click)="resizeTable('columns', -1)" aria-label="Remove last column">− Column</button>
        }
      </div>
    }
    @switch (kind()) {
    @case ('sticky') {
      <textarea [attr.aria-label]="'Sticky note by ' + note().authorName" [readOnly]="!editable()"
      [placeholder]="editable() ? 'Type a note…' : ''" [value]="note().text" maxlength="1500"
      (input)="queueText($any($event.target).value)" (blur)="flushText()"></textarea>
    }
    @case ('table') {
      <div class="rotation-stage">
      <div class="object-body rotatable" [class.quarter-turn]="content().rotation % 180 !== 0"
        [style.rotate]="content().rotation + 'deg'">
        <table aria-label="Whiteboard table"><tbody>
          @for (row of rows(); track row) {
            <tr>
              @for (column of columns(); track column) {
                <td><input [attr.aria-label]="'Row ' + (row + 1) + ', column ' + (column + 1)"
                  [readOnly]="!editable()" [value]="fields()[row * content().columns + column] ?? ''" maxlength="24"
                  (change)="setField(row * content().columns + column, $event)" /></td>
              }
            </tr>
          }
        </tbody></table>
      </div>
      </div>
    }
    @case ('graph') {
      <div class="object-controls">
        @if (content().histogram) {
          <label>Start <input type="number" aria-label="First bin start" [readOnly]="!editable()"
            [value]="content().binStart" (change)="setBin('binStart', $event)" /></label>
          <label>Bin width <input type="number" aria-label="Bin width" min="1" [readOnly]="!editable()"
            [value]="content().binWidth" (change)="setBin('binWidth', $event)" /></label>
        }
        @if (editable()) {
          <button type="button" [disabled]="content().barCount === 10" (click)="resizeGraph(1)">{{ content().histogram ? '+ Bin' : '+ Bar' }}</button>
          <button type="button" [disabled]="content().barCount === 1" (click)="resizeGraph(-1)"
            [attr.aria-label]="content().histogram ? 'Remove last bin' : 'Remove last bar'">{{ content().histogram ? '− Bin' : '− Bar' }}</button>
        }
      </div>
      <div class="object-body">
        <div class="graph" [class.histogram]="content().histogram"
          [style.grid-template-columns]="'repeat(' + content().barCount + ', minmax(44px, 1fr))'">
          @for (bar of bars(); track $index; let index = $index) {
            <div class="graph-column">
              <div class="bar-track" aria-hidden="true">
                <div class="bar" [style.height.%]="bar / graphMax() * 100"></div>
              </div>
              <input type="number" min="0" max="9999" step="1"
                [attr.aria-label]="content().histogram ? 'Bin ' + (index + 1) + ' frequency' : 'Bar ' + (index + 1) + ' value'"
                [readOnly]="!editable()" [value]="bar" (change)="setField(index * 2 + 1, $event, true)" />
              @if (content().histogram) {
                <span class="bin-label">{{ binLabel(index) }}</span>
              } @else {
                <input [attr.aria-label]="'Bar ' + (index + 1) + ' label'" [readOnly]="!editable()"
                [value]="fields()[index * 2] ?? graphLabels[index]" maxlength="24"
                (change)="setField(index * 2, $event)" />
              }
            </div>
          }
        </div>
      </div>
    }
    @case ('flowchart') {
      <div class="rotation-stage">
      <div class="object-body flow rotatable" [class.quarter-turn]="content().rotation % 180 !== 0"
        [style.rotate]="content().rotation + 'deg'">
        @for (placeholder of ['Start', 'Next step', 'Finish']; track placeholder; let index = $index) {
          @if (index > 0) { <span aria-hidden="true">↓</span> }
          <input [attr.aria-label]="'Flowchart step ' + (index + 1)" [placeholder]="placeholder"
            [readOnly]="!editable()" [value]="fields()[index] ?? ''" maxlength="24" (change)="setField(index, $event)" />
        }
      </div>
      </div>
    }
    }
    @if (editable()) {
      <button type="button" class="resize" [attr.aria-label]="'Resize ' + label()"
        (pointerdown)="start($event, 'resize')" (pointermove)="move($event)" (pointerup)="finish($event)"
        (pointercancel)="cancel()" (lostpointercapture)="cancel()"
        (keydown)="adjust($event, 'resize')"><span aria-hidden="true">◢</span></button>
    }
  `,
  host: {
    '[class.pink]': "note().color === 'pink'",
    '[class.learning-object]': "kind() !== 'sticky'",
    '[style.left.%]': 'bounds().x / 10',
    '[style.top.%]': 'bounds().y / 10',
    '[style.width.%]': 'bounds().width / 10',
    '[style.height.%]': 'bounds().height / 10',
  },
  styles: [`
    :host { position: absolute; z-index: 1; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d5b66b; border-radius: 5px; color: #302819; background: #fff0a3; box-shadow: 0 3px 8px #36281729; }
    :host(.pink) { border-color: #d98da9; color: #462336; background: #ffcee0; }
    :host(.learning-object) { border-color: #aebfdb; color: #162846; background: #fff; }
    :host(.learning-object) .note-titlebar { background: #e9f0fa; }
    :host(:focus-within) { z-index: 2; }
    .note-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 2px; min-height: 24px; padding-inline: 3px; background: #51350212; }
    .note-titlebar button, .resize { border: 0; background: transparent; color: inherit; font: inherit; line-height: 1; }
    .move, .author { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .68rem; font-weight: 700; }
    .move { flex: 1; min-height: 24px; padding: 2px; text-align: start; cursor: grab; touch-action: none; }
    .move:active { cursor: grabbing; }
    .remove { width: 22px; height: 22px; padding: 0; cursor: pointer; }
    textarea { flex: 1; min-width: 0; min-height: 0; width: 100%; border: 0; border-radius: 0; padding: 5px 7px 14px; resize: none; color: inherit; background: transparent; font: inherit; font-size: clamp(10px, 1.4vw, 14px); }
    textarea:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    .object-body { flex: 1; min-height: 0; overflow: auto; padding: 6px 8px 16px; }
    .object-controls { display: flex; flex-wrap: wrap; gap: 3px; padding: 3px 5px; max-height: 40%; overflow: auto; }
    .object-controls button, .object-controls label { margin: 0; color: inherit; font: inherit; font-size: .7rem; }
    .object-controls button { border: 1px solid #aebfdb; border-radius: 4px; padding: 1px 4px; background: #f1f6fc; }
    .object-controls button:disabled { opacity: .45; }
    .object-controls label { display: inline-flex; align-items: center; gap: 3px; }
    .object-controls input { width: 54px; border: 1px solid #aebfdb; }
    .rotation-stage { position: relative; container-type: size; flex: 1; min-height: 0; overflow: hidden; }
    .rotatable { position: absolute; top: 50%; left: 50%; translate: -50% -50%; box-sizing: border-box; width: 100cqw; height: 100cqh; }
    .rotatable.quarter-turn { width: 100cqh; height: 100cqw; }
    table { width: 100%; height: 100%; min-width: 130px; border-collapse: collapse; table-layout: fixed; }
    td { min-width: 30px; }
    td { border: 1px solid #bdcbe0; padding: 0; }
    tr:first-child { background: #e9f0fa; }
    input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 22px; padding: 2px 4px; border: 0; border-radius: 0; background: transparent; color: inherit; font: inherit; font-size: .75rem; }
    input:focus-visible { outline: 2px solid #355c9c; outline-offset: -2px; }
    .graph { display: grid; gap: 4px; height: 100%; min-height: 76px; }
    .graph.histogram { gap: 0; }
    .graph-column { display: flex; flex-direction: column; min-width: 0; }
    .graph-column input, .flow input { text-align: center; }
    .bar-track { flex: 1; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid #9baecb; }
    .bar { width: 65%; border-radius: 3px 3px 0 0; background: #426caa; }
    .histogram .bar { width: 100%; border-radius: 0; box-shadow: inset -1px 0 #fff; }
    .bin-label { padding: 2px; text-align: center; font-size: .65rem; overflow-wrap: anywhere; }
    .flow { display: grid; justify-items: center; align-content: start; line-height: 1; }
    .flow input { width: min(100%, 230px); border: 1px solid #aebfdb; border-radius: 5px; background: #f1f6fc; }
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
  readonly kind = computed(() => this.note().kind ?? 'sticky');
  readonly label = computed(() => this.content().histogram ? 'histogram'
    : ({ sticky: 'sticky note', table: 'table', graph: 'bar graph', flowchart: 'flowchart' })[this.kind()]);
  readonly title = computed(() => this.kind() === 'sticky'
    ? this.note().authorName
    : this.label().replace(/^./, char => char.toUpperCase()) + ' · ' + this.note().authorName);
  readonly content = computed<LearningObjectContent>(() => {
    let saved: Partial<LearningObjectContent> = {};
    if (this.kind() !== 'sticky' && this.note().text) {
      try {
        const value: unknown = JSON.parse(this.note().text);
        if (Array.isArray(value)) saved = { fields: value };
        else if (value && typeof value === 'object') saved = value;
      } catch {
        // An empty object is usable even if saved content cannot be read.
      }
    }
    return {
      fields: Array.isArray(saved.fields)
        ? saved.fields.slice(0, 64).map(field => typeof field === 'string' ? field.slice(0, 24) : undefined)
        : [],
      rows: this.integer(saved.rows, 3, 1, 8),
      columns: this.integer(saved.columns, 3, 1, 8),
      barCount: this.integer(saved.barCount, 4, 1, 10),
      rotation: [0, 90, 180, 270].find(angle => angle === saved.rotation) ?? 0,
      histogram: this.kind() === 'graph' && saved.histogram === true,
      binStart: this.integer(saved.binStart, 0, -9999, 9999),
      binWidth: this.integer(saved.binWidth, 10, 1, 9999),
    };
  });
  readonly fields = computed(() => this.content().fields);
  readonly rows = computed(() => Array.from({ length: this.content().rows }, (_, index) => index));
  readonly columns = computed(() => Array.from({ length: this.content().columns }, (_, index) => index));
  readonly graphLabels = 'ABCDEFGHIJ';
  readonly bars = computed(() => Array.from({ length: this.content().barCount }, (_, index) => {
    const value = Number(this.fields()[index * 2 + 1] ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.round(value))) : 0;
  }));
  readonly graphMax = computed(() => Math.max(1, ...this.bars()));
  private gesture?: { pointerId: number; mode: 'move' | 'resize'; startX: number; startY: number; board: DOMRect; original: NoteBounds };
  private textTimer?: number;
  private pendingText?: string;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.flushText());
  }

  setField(index: number, event: Event, numeric = false): void {
    if (!this.editable()) return;
    const input = event.target as HTMLInputElement;
    const fields = [...this.fields()];
    fields[index] = numeric
      ? String(Math.max(0, Math.min(9999, Math.round(input.valueAsNumber || 0))))
      : input.value.slice(0, 24);
    input.value = fields[index];
    this.saveContent({ fields });
  }

  rotate(): void {
    this.saveContent({ rotation: (this.content().rotation + 90) % 360 });
  }

  resizeTable(axis: 'rows' | 'columns', step: number): void {
    const { rows, columns, fields } = this.content();
    const nextRows = axis === 'rows' ? rows + step : rows;
    const nextColumns = axis === 'columns' ? columns + step : columns;
    const cells = Array.from({ length: nextRows * nextColumns }, (_, index) => {
      const row = Math.floor(index / nextColumns);
      const column = index % nextColumns;
      return row < rows && column < columns ? fields[row * columns + column] : undefined;
    });
    this.saveContent({ fields: cells, rows: nextRows, columns: nextColumns });
  }

  resizeGraph(step: number): void {
    const barCount = this.content().barCount + step;
    this.saveContent({ barCount, fields: this.fields().slice(0, barCount * 2) });
  }

  setBin(key: 'binStart' | 'binWidth', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.integer(input.valueAsNumber, this.content()[key], key === 'binWidth' ? 1 : -9999, 9999);
    input.value = String(value);
    this.saveContent({ [key]: value });
  }

  binLabel(index: number): string {
    const { binStart, binWidth } = this.content();
    const start = binStart + index * binWidth;
    return start + ' to <' + (start + binWidth);
  }

  private saveContent(patch: Partial<LearningObjectContent>): void {
    if (this.editable()) this.changed.emit({ text: JSON.stringify({ ...this.content(), ...patch }) });
  }

  private integer(value: number | undefined, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
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
