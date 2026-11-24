import { Component, computed, input, output, signal } from '@angular/core';
import { readActivityState } from './whiteboard-activity.component';
import { DrawingSettings, DrawingTool, drawingOutline } from './whiteboard-drawing';

export const MATH_WIDGETS = [
  { kind: 'number-line', label: 'Number line', icon: 'number-line' },
  { kind: 'fraction-bars', label: 'Fraction bars', icon: 'fraction-bars' },
  { kind: 'ten-frame', label: 'Ten-frame', icon: 'ten-frame' },
  { kind: 'coordinate-grid', label: 'Coordinate grid', icon: 'coordinate-grid' },
] as const;
export type MathWidget = typeof MATH_WIDGETS[number]['kind'];
interface Fraction { numerator: number; denominator: number; }
type GridPoint = [x: number, y: number];
type GridDrawing = Omit<DrawingSettings, 'tool'> & { tool: Exclude<DrawingTool, 'text'>; points: GridPoint[] };
const GRID_TOOLS = ['pen', 'highlighter', 'line', 'rectangle', 'ellipse', 'circle', 'arrow'] as const;
const MAX_GRID_STROKE_POINTS = 80;

@Component({
  selector: 'app-whiteboard-math',
  standalone: true,
  template: `
    @switch (widget()) {
      @case ('number-line') {
        @if (editable()) {
          <div class="math-controls">
            <label>Start <input type="number" aria-label="Number line start" min="-1000" max="1000" step="any"
              [value]="line().start" (change)="setLine('start', $event)" /></label>
            <label>Step <input type="number" aria-label="Number line step" min="0.01" max="100" step="any"
              [value]="line().step" (change)="setLine('step', $event)" /></label>
            <label>Intervals <input type="number" aria-label="Number line intervals" min="2" max="20" step="1"
              [value]="line().intervals" (change)="setLine('intervals', $event)" /></label>
          </div>
        }
        <div class="number-line" role="group" aria-label="Number line ticks">
          @for (value of ticks(); track $index; let index = $index) {
            <button type="button" class="tick" [disabled]="!editable()"
              [attr.aria-label]="'Mark ' + value + ' on number line'" [attr.aria-pressed]="line().marks.includes(index)"
              (click)="toggleTick(index)"><span>{{ value }}</span></button>
          }
        </div>
        @if (line().marks.length) {
          <p class="summary">Marked values {{ markedValues() }}</p>
        }
      }
      @case ('fraction-bars') {
        @for (bar of fractions(); track $index; let row = $index) {
          <div class="fraction">
            <div class="math-controls">
              <strong [attr.aria-label]="'Fraction ' + (row + 1)">{{ bar.numerator }}/{{ bar.denominator }}</strong>
              @if (editable()) {
                <label>Parts <input type="number" min="1" max="12" step="1"
                  [attr.aria-label]="'Fraction ' + (row + 1) + ' denominator'" [value]="bar.denominator"
                  (change)="setDenominator(row, $event)" /></label>
                <button type="button" [attr.aria-label]="'Clear fraction ' + (row + 1)" (click)="shade(row, 0)">Clear</button>
              }
            </div>
            <div class="fraction-bar" role="group" [attr.aria-label]="'Fraction bar ' + (row + 1)"
              [style.--parts]="bar.denominator">
              @for (part of range(bar.denominator); track part) {
                <button type="button" [disabled]="!editable()" [attr.aria-pressed]="part < bar.numerator"
                  [attr.aria-label]="'Shade ' + (part + 1) + ' of ' + bar.denominator + ' parts'"
                  (click)="shade(row, part + 1)"></button>
              }
            </div>
          </div>
        }
      }
      @case ('ten-frame') {
        <div class="ten-frame" role="group" aria-label="Ten-frame counters">
          @for (cell of tenCells; track cell) {
            <button type="button" [disabled]="!editable()" [attr.aria-pressed]="counters().includes(cell)"
              [attr.aria-label]="'Counter ' + (cell + 1)" (click)="toggleCounter(cell)">
              @if (counters().includes(cell)) { <span aria-hidden="true"></span> }
            </button>
          }
        </div>
        <div class="math-controls">
          <strong>{{ counters().length }} of 10</strong>
          @if (editable()) { <button type="button" (click)="save({ counters: [] })">Clear</button> }
        </div>
      }
      @case ('coordinate-grid') {
        @if (editable()) {
          <div class="math-controls">
            <label>Axis limit <select aria-label="Coordinate grid axis limit" [value]="grid().limit"
              (change)="setGridRange($event)">
              <option value="3">±3</option><option value="5">±5</option><option value="6">±6</option>
            </select></label>
            <label>Grid size <input class="grid-size" type="range" aria-label="Coordinate grid size"
              min="120" max="600" step="10" [value]="gridSizeDraft() ?? grid().size ?? 230"
              (input)="previewGridSize($event)" (change)="saveGridSize($event)" /></label>
            <button type="button" (click)="clearGridPoints()">Clear points</button>
          </div>
          <div class="math-controls" role="group" aria-label="Coordinate grid mode">
            <button type="button" [attr.aria-pressed]="gridMode() === 'points'" (click)="setGridMode('points')">Plot points</button>
            <button type="button" [attr.aria-pressed]="gridMode() === 'line'" (click)="setGridMode('line')">Line</button>
            <button type="button" [attr.aria-pressed]="gridMode() === 'toolbar'" (click)="setGridMode('toolbar')">Draw</button>
            <button type="button" [disabled]="!grid().drawings.length" (click)="undoDrawing()">Undo drawing</button>
          </div>
        } @else {
          <p class="summary">Shared grid · View only</p>
        }
        <div class="coordinate-grid" role="group" aria-label="Coordinate grid with x and y axes"
          [style.--columns]="grid().limit * 2 + 1" [style.width.px]="gridSizeDraft() ?? grid().size">
          @for (point of gridCells(); track point[0] + ':' + point[1]) {
            <button type="button" class="point" [class.x-axis]="point[1] === 0" [class.y-axis]="point[0] === 0"
              [disabled]="!editable() || drawMode()" [attr.aria-pressed]="plottedPoints().has(point.join(':'))"
              [attr.data-point]="point.join(':')" [attr.tabindex]="focusPoint() === point.join(':') ? 0 : -1"
              [attr.aria-label]="'Point ' + coordinates(point)" [title]="coordinates(point)"
              (focus)="focusPoint.set(point.join(':'))" (keydown)="navigateGrid($event, point)"
              (click)="togglePoint(point)">
              @if (point[0] === grid().limit && point[1] === 0) { <span class="axis-label">x</span> }
              @if (point[0] === 0 && point[1] === grid().limit) { <span class="axis-label">y</span> }
              @if (point[1] === 0) { <span class="tick-label x-tick" aria-hidden="true">{{ point[0] }}</span> }
              @else if (point[0] === 0) { <span class="tick-label y-tick" aria-hidden="true">{{ point[1] }}</span> }
              @if (plottedPoints().has(point.join(':'))) { <span class="dot" aria-hidden="true"></span> }
            </button>
          }
          <svg #gridDrawing class="grid-drawing" viewBox="0 0 100 100" [class.active]="editable() && drawMode()"
            [attr.aria-label]="drawMode() ? 'Coordinate grid drawing surface' : null"
            [attr.aria-hidden]="drawMode() ? null : 'true'"
            (pointerdown)="startGridDrawing($event, gridDrawing)" (pointermove)="moveGridDrawing($event, gridDrawing)"
            (pointerup)="finishGridDrawing($event, gridDrawing)" (pointercancel)="cancelGridDrawing()"
            (lostpointercapture)="cancelGridDrawing()">
            @for (mark of renderedDrawings(); track $index) {
              <path class="grid-stroke" [attr.data-tool]="mark.tool" [attr.d]="gridOutline(mark)"
                [attr.stroke]="mark.color" [attr.stroke-width]="mark.width"
                [attr.stroke-dasharray]="gridDash(mark)" [attr.opacity]="mark.tool === 'highlighter' ? 0.45 : 1"
                vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            }
          </svg>
        </div>
        @if (editable() && drawMode()) {
          <p class="summary">{{ gridMode() === 'line' ? 'Drag from one end of the line to the other.'
            : 'Choose Pen or a shape in the whiteboard toolbar, then draw on the grid.' }}</p>
        }
        @if (drawingError()) { <p class="summary" role="status">{{ drawingError() }}</p> }
        @if (grid().points.length || !drawMode()) {
          <p class="summary">{{ grid().points.length ? 'Plotted points ' + pointList() : 'Select intersections to plot points.' }}</p>
        }
      }
    }
  `,
  styles: [`
    :host { display: block; flex: 1; min-height: 0; overflow: auto; padding: 8px 8px 16px; color: #000; font-size: .75rem; }
    .math-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; margin-bottom: 6px; }
    label { display: inline-flex; align-items: center; gap: 4px; margin: 0; color: inherit; white-space: nowrap; }
    input, select, .math-controls button { box-sizing: border-box; min-height: 24px; margin: 0; padding: 2px 4px;
      border: 1px solid #b4c3d9; border-radius: 4px; background: #fff; color: inherit; font: inherit; }
    input { width: 62px; }
    input.grid-size { width: 100px; min-height: 24px; padding: 0; accent-color: #087765; }
    .math-controls button { background: #eff5fb; cursor: pointer; }
    .math-controls button[aria-pressed="true"] { background: #dcecff; border-color: #7c9cc5; }
    .math-controls button:disabled { opacity: .55; cursor: default; }
    button:focus-visible { outline: 2px solid #164883; outline-offset: -2px; }
    .summary { margin: 5px 0 0; overflow-wrap: anywhere; }
    .number-line { position: relative; display: flex; width: max-content; min-width: 100%; padding-block: 4px; }
    .number-line::before { content: ''; position: absolute; inset: 15px 8px auto; border-top: 2px solid #405985; }
    .tick { position: relative; flex: 1; min-width: 39px; min-height: 38px; padding: 19px 2px 0; border: 0;
      background: transparent; color: inherit; font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; }
    .tick::before { content: ''; position: absolute; top: 5px; left: calc(50% - 1px); width: 2px; height: 14px; background: #405985; }
    .tick[aria-pressed="true"]::before { top: 6px; left: calc(50% - 5px); width: 10px; height: 10px; border-radius: 50%; background: #087765; }
    .fraction + .fraction { margin-top: 10px; }
    .fraction-bar { display: grid; grid-template-columns: repeat(var(--parts), minmax(0, 1fr)); border: 1px solid #667eaa; border-radius: 4px; }
    .fraction-bar button { min-height: 25px; padding: 0; border: 0; border-inline-end: 1px solid #667eaa; background: #f4f8ff; cursor: pointer; }
    .fraction-bar button:last-child { border-inline-end: 0; }
    .fraction-bar button[aria-pressed="true"] { background: #5284c2; }
    .fraction:nth-child(2) .fraction-bar button[aria-pressed="true"] { background: #389b80; }
    .ten-frame { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); max-width: 260px;
      border: 1px solid #667eaa; margin-bottom: 6px; }
    .ten-frame button { display: grid; place-items: center; padding: 4px; min-width: 0; min-height: 25px; aspect-ratio: 1; border: 0;
      border-inline-end: 1px solid #667eaa; border-block-end: 1px solid #667eaa; background: #f7faff; cursor: pointer; }
    .ten-frame button:nth-child(5n) { border-inline-end: 0; }
    .ten-frame button:nth-child(n+6) { border-block-end: 0; }
    .ten-frame span { width: 70%; max-width: 24px; aspect-ratio: 1; border-radius: 50%; background: #087765; }
    .coordinate-grid { position: relative; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); width: clamp(150px, 100%, 230px); aspect-ratio: 1; }
    .grid-drawing { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; }
    .grid-drawing.active { pointer-events: auto; touch-action: none; cursor: crosshair; }
    .grid-drawing path { pointer-events: none; }
    .point { position: relative; display: grid; place-items: center; min-width: 0; padding: 0; border: 0; background: #f6f9ff; color: inherit; cursor: crosshair; }
    .point::before, .point::after { content: ''; position: absolute; pointer-events: none; background: #c7d5e8; }
    .point::before { inset: 50% 0 auto; height: 1px; }
    .point::after { inset: 0 auto 0 50%; width: 1px; }
    .point.x-axis::before, .point.y-axis::after { background: #324f79; }
    .dot { position: relative; z-index: 1; width: min(65%, 10px); aspect-ratio: 1; border: 1px solid #fff; border-radius: 50%; background: #ad2555; }
    .axis-label { position: absolute; z-index: 1; top: 0; right: 1px; font-size: .65rem; font-weight: 700; }
    .tick-label { position: absolute; z-index: 1; color: inherit; font: 9px/1 sans-serif; pointer-events: none; }
    .x-tick { top: calc(50% + 2px); left: 50%; translate: -50% 0; }
    .y-tick { top: 50%; right: calc(50% + 3px); translate: 0 -50%; }
    button:disabled { cursor: default; }
    .tick:hover:not(:disabled), .point:hover:not(:disabled) { background: #e5eefb; }
  `],
})
export class WhiteboardMathComponent {
  readonly widget = input.required<MathWidget>();
  readonly text = input.required<string>();
  readonly editable = input(false);
  readonly drawingSettings = input<DrawingSettings>();
  readonly changed = output<string>();
  private readonly state = computed(() => readActivityState(this.text()));
  readonly tenCells = this.range(10);
  readonly focusPoint = signal('0:0');
  readonly gridMode = signal<'points' | 'line' | 'toolbar'>('points');
  readonly gridSizeDraft = signal<number | null>(null);
  readonly drawMode = computed(() => this.gridMode() !== 'points');
  readonly drawingError = signal('');
  private readonly gridDraft = signal<GridDrawing | null>(null);
  private drawingPointer?: number;

  readonly line = computed(() => {
    const state = this.state();
    const intervals = this.bounded(state['intervals'], 10, 2, 20);
    return {
      start: this.bounded(state['start'], 0, -1000, 1000, 2),
      step: this.bounded(state['step'], 1, 0.01, 100, 2),
      intervals,
      marks: this.indices(state['marks'], intervals + 1),
    };
  });
  readonly ticks = computed(() => this.range(this.line().intervals + 1).map(index =>
    Number((this.line().start + this.line().step * index).toFixed(2))));
  readonly markedValues = computed(() => this.line().marks.map(index => this.ticks()[index]).join(', '));

  readonly fractions = computed<Fraction[]>(() => {
    const saved = this.state()['fractions'];
    return [3, 4].map((defaultParts, index) => {
      const bar = Array.isArray(saved) ? saved[index] : null;
      const denominator = this.bounded(bar?.denominator, defaultParts, 1, 12);
      return { denominator, numerator: this.bounded(bar?.numerator, 0, 0, denominator) };
    });
  });
  readonly counters = computed(() => this.indices(this.state()['counters'], 10));
  readonly grid = computed(() => {
    const state = this.state();
    const saved = state['points'];
    const limit = state['limit'] === 3 || state['limit'] === 6 ? state['limit'] : 5;
    const points: GridPoint[] = Array.isArray(saved) ? saved.slice(0, 169).filter((point): point is GridPoint =>
      Array.isArray(point) && point.length === 2 && point.every(value => Number.isInteger(value) && Math.abs(value) <= 6)) : [];
    const size = typeof state['size'] === 'number' ? this.bounded(state['size'], 230, 120, 600) : null;
    return { limit, size, points, drawings: this.readGridDrawings(state['drawings']) };
  });
  readonly gridCells = computed<GridPoint[]>(() => {
    const limit = this.grid().limit;
    const span = this.range(limit * 2 + 1);
    return span.flatMap(row => span.map(column => [column - limit, limit - row] as GridPoint));
  });
  readonly plottedPoints = computed(() => new Set(this.grid().points.map(point => point.join(':'))));
  readonly pointList = computed(() => this.grid().points.map(point => this.coordinates(point)).join(', '));
  readonly renderedDrawings = computed(() => {
    const draft = this.gridDraft();
    return draft ? [...this.grid().drawings, draft] : this.grid().drawings;
  });

  range(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
  }

  coordinates([x, y]: GridPoint): string {
    return '(' + x + ', ' + y + ')';
  }

  setLine(key: 'start' | 'step' | 'intervals', event: Event): void {
    const input = event.target as HTMLInputElement;
    const { line } = this;
    const value = this.bounded(input.valueAsNumber, line()[key], Number(input.min), Number(input.max), key === 'intervals' ? 0 : 2);
    input.value = String(value);
    if (value !== line()[key]) this.save({ ...line(), [key]: value, marks: [] });
  }

  toggleTick(index: number): void {
    this.save({ ...this.line(), marks: this.toggle(this.line().marks, index) });
  }

  setDenominator(row: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const denominator = this.bounded(input.valueAsNumber, this.fractions()[row].denominator, 1, 12);
    input.value = String(denominator);
    this.save({ fractions: this.fractions().map((bar, index) =>
      index === row ? { denominator, numerator: Math.min(bar.numerator, denominator) } : bar) });
  }

  shade(row: number, numerator: number): void {
    this.save({ fractions: this.fractions().map((bar, index) => index === row ? { ...bar, numerator } : bar) });
  }

  toggleCounter(cell: number): void {
    this.save({ counters: this.toggle(this.counters(), cell) });
  }

  setGridRange(event: Event): void {
    this.focusPoint.set('0:0');
    this.save({ ...this.grid(), limit: Number((event.target as HTMLSelectElement).value) });
  }

  previewGridSize(event: Event): void {
    this.gridSizeDraft.set((event.target as HTMLInputElement).valueAsNumber);
  }

  saveGridSize(event: Event): void {
    const size = this.bounded((event.target as HTMLInputElement).valueAsNumber, 230, 120, 600);
    this.save({ ...this.grid(), size });
    this.gridSizeDraft.set(null);
  }

  togglePoint(point: GridPoint): void {
    const key = point.join(':');
    const grid = this.grid();
    this.save({ ...grid, points: this.plottedPoints().has(key) ? grid.points.filter(value => value.join(':') !== key) : [...grid.points, point] });
  }

  setGridMode(mode: 'points' | 'line' | 'toolbar'): void {
    this.cancelGridDrawing();
    this.drawingError.set('');
    this.gridMode.set(mode);
  }

  clearGridPoints(): void {
    this.save({ ...this.grid(), points: [] });
  }

  startGridDrawing(event: PointerEvent, surface: Element): void {
    if (!this.editable() || !this.drawMode() || event.button !== 0 || this.drawingPointer !== undefined) return;
    const toolbar = this.drawingSettings();
    const settings = this.gridMode() === 'line'
      ? { tool: 'line' as const, color: toolbar?.color ?? '#004c45', strokeStyle: toolbar?.strokeStyle ?? 'solid' as const, width: 3 }
      : toolbar;
    if (!settings || !this.isGridTool(settings.tool)) return;
    event.preventDefault();
    this.drawingError.set('');
    this.drawingPointer = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    this.gridDraft.set({ ...settings, tool: settings.tool, points: [this.gridPoint(event, surface)] });
  }

  moveGridDrawing(event: PointerEvent, surface: Element): void {
    const draft = this.gridDraft();
    if (!draft || this.drawingPointer !== event.pointerId) return;
    const next = this.gridPoint(event, surface);
    const last = draft.points.at(-1)!;
    if (last[0] === next[0] && last[1] === next[1]) return;
    let points = [draft.points[0], next];
    if (draft.tool === 'pen' || draft.tool === 'highlighter') {
      const sampled = draft.points.length < MAX_GRID_STROKE_POINTS ? draft.points : draft.points.filter((_, index) => index % 2 === 0);
      points = [...sampled, next];
    }
    this.gridDraft.set({ ...draft, points });
  }

  finishGridDrawing(event: PointerEvent, surface: Element): void {
    if (this.drawingPointer !== event.pointerId) return;
    this.moveGridDrawing(event, surface);
    const mark = this.gridDraft();
    this.cancelGridDrawing();
    if (!mark || (mark.points.length === 1 && mark.tool !== 'pen' && mark.tool !== 'highlighter')) return;
    const grid = this.grid();
    const drawings = [...grid.drawings, mark];
    if (drawings.length > 32 || JSON.stringify(drawings).length > 9500) {
      this.drawingError.set('Drawing limit reached. Undo a drawing to add another.');
      return;
    }
    this.save({ ...grid, drawings });
  }

  cancelGridDrawing(): void {
    this.drawingPointer = undefined;
    this.gridDraft.set(null);
  }

  undoDrawing(): void {
    this.drawingError.set('');
    const grid = this.grid();
    this.save({ ...grid, drawings: grid.drawings.slice(0, -1) });
  }

  gridOutline(mark: GridDrawing): string {
    const edge = this.grid().limit + 0.5;
    return drawingOutline(mark.tool, mark.points.map(([x, y]) => ({ x: (x + edge) / (edge * 2), y: (edge - y) / (edge * 2) })), 100, 100, 5);
  }

  gridDash(mark: GridDrawing): string | null {
    if (mark.strokeStyle === 'dashed') return mark.width * 3 + ' ' + mark.width * 2;
    if (mark.strokeStyle === 'dotted') return '1 ' + mark.width * 2;
    return null;
  }

  private gridPoint(event: PointerEvent, surface: Element): GridPoint {
    const rect = surface.getBoundingClientRect();
    const edge = this.grid().limit + 0.5;
    return [
      this.bounded(((event.clientX - rect.left) / rect.width * 2 - 1) * edge, 0, -edge, edge, 2),
      this.bounded((1 - (event.clientY - rect.top) / rect.height * 2) * edge, 0, -edge, edge, 2),
    ];
  }

  private isGridTool(tool: unknown): tool is GridDrawing['tool'] {
    return GRID_TOOLS.some(value => value === tool);
  }

  private readGridDrawings(value: unknown): GridDrawing[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 32).flatMap((mark): GridDrawing[] => {
      if (!mark || !this.isGridTool(mark.tool) || !Array.isArray(mark.points)) return [];
      const points: GridPoint[] = mark.points.slice(0, MAX_GRID_STROKE_POINTS).filter((point: unknown): point is GridPoint =>
        Array.isArray(point) && point.length === 2 && point.every(coord => Number.isFinite(coord) && Math.abs(coord) <= 6.5));
      if (!points.length) return [];
      const color = typeof mark.color === 'string' && /^#[a-f0-9]{6}$/i.test(mark.color) ? mark.color : '#004c45';
      const strokeStyle = mark.strokeStyle === 'dotted' || mark.strokeStyle === 'dashed' ? mark.strokeStyle : 'solid';
      return [{ tool: mark.tool, points, color, strokeStyle, width: this.bounded(mark.width, 3, 1, 10, 1) }];
    });
  }

  navigateGrid(event: KeyboardEvent, [x, y]: GridPoint): void {
    const displacements: Record<string, GridPoint> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const offset = displacements[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(
      '[data-point="' + (x + offset[0]) + ':' + (y + offset[1]) + '"]');
    next?.focus();
  }

  save(state: object): void {
    if (this.editable()) this.changed.emit(JSON.stringify({ widget: this.widget(), ...state }));
  }

  private indices(value: unknown, stop: number): number[] {
    return Array.isArray(value) ? [...new Set(value.filter(index => Number.isInteger(index) && index >= 0 && index < stop))].sort((a, b) => a - b) : [];
  }

  private toggle(values: number[], index: number): number[] {
    return values.includes(index) ? values.filter(value => value !== index) : [...values, index];
  }

  private bounded(value: unknown, fallback: number, min: number, max: number, decimals = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? Number(Math.min(max, Math.max(min, value)).toFixed(decimals)) : fallback;
  }
}
