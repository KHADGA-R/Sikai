import { Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { readActivityState } from './whiteboard-activity.component';
import { DrawingPoint, DrawingSettings, DrawingTool, drawingOutline } from './whiteboard-drawing';
import { MATH_WIDGETS, MathWidget } from './whiteboard-math-tools';
import { WhiteboardMathKitComponent } from './whiteboard-math-kit.component';
import { WhiteboardAlgebraComponent } from './whiteboard-algebra.component';
import { WhiteboardAdvancedMathComponent } from './whiteboard-advanced-math.component';
interface Fraction { numerator: number; denominator: number; }
type GridPoint = [x: number, y: number];
type GridDrawing = Omit<DrawingSettings, 'tool'> & { tool: Exclude<DrawingTool, 'text'>; points: GridPoint[] };
const GRID_TOOLS = ['pen', 'highlighter', 'line', 'rectangle', 'ellipse', 'circle', 'arrow'] as const;
const MAX_GRID_STROKE_POINTS = 80;

@Component({
  selector: 'app-whiteboard-math',
  standalone: true,
  imports: [NgTemplateOutlet, WhiteboardMathKitComponent, WhiteboardAlgebraComponent, WhiteboardAdvancedMathComponent],
  template: `
    @switch (isCoordinateWidget() ? 'coordinate-grid' : widget()) {
      @case ('2d-shapes') {
        @if (editable()) {
          <div class="math-controls">
            <label>Shape <select aria-label="2D shape" [value]="shapeModel().shape" (change)="setGeometryShape($event)">
              @for (shape of geometryShapes; track shape) { <option [value]="shape">{{ shape }}</option> }
            </select></label>
            <label>{{ shapeModel().shape === 'Circle' ? 'Diameter' : shapeModel().shape === 'Square' ? 'Side' : 'Width' }}
              <input type="number" aria-label="Shape width" min="15" max="90" [value]="shapeModel().width"
                (change)="setShapeSize('width', $event)" />%</label>
            @if (!equalShapeSides()) {
              <label>Height <input type="number" aria-label="Shape height" min="15" max="90" [value]="shapeModel().height"
                (change)="setShapeSize('height', $event)" />%</label>
            }
            @if (shapeModel().shape === 'Polygon') {
              <label>Sides <input type="number" aria-label="Shape sides" min="3" max="12" [value]="shapeModel().sides"
                (change)="setShapeSize('sides', $event)" /></label>
            }
          </div>
          <div class="math-controls" role="group" aria-label="2D Shapes mode">
            <button type="button" [attr.aria-pressed]="!drawMode()" (click)="setGridMode('points')">Interact</button>
            <button type="button" [attr.aria-pressed]="drawMode()" (click)="setGridMode('toolbar')">Draw</button>
            <button type="button" [disabled]="!shapeModel().drawings.length" (click)="undoDrawing()">Undo drawing</button>
          </div>
        }
        <div #drawingFrame class="shape-frame" [class.movable]="editable() && !drawMode()"
          (pointerdown)="startShapeMove($event)" (pointermove)="moveShape($event)"
          (pointerup)="finishShapeMove($event)" (pointercancel)="cancelShapeMove()" (lostpointercapture)="cancelShapeMove()">
          <svg [attr.viewBox]="drawingViewBox()" role="img" [attr.aria-label]="shapeModel().shape + ' preview'">
            @let geometry = shapeGeometry();
            @if (geometry.polygon) { <polygon [attr.points]="geometry.polygon" /> }
            @else { <ellipse [attr.cx]="geometry.x" [attr.cy]="geometry.y" [attr.rx]="geometry.rx" [attr.ry]="geometry.ry" /> }
          </svg>
          <ng-container *ngTemplateOutlet="drawingLayer; context: { label: '2D Shapes drawing surface' }" />
        </div>
      }
      @case ('ruler') {
        @if (editable()) {
          <div class="math-controls">
            <label>Angle <input type="number" aria-label="Ruler angle" min="-180" max="180" step="5"
              [value]="ruler().angle" (change)="setRuler('angle', $event)" /></label>
            <label>From <input type="number" aria-label="Ruler start" min="0" max="10" step="0.5"
              [value]="ruler().from" (change)="setRuler('from', $event)" /></label>
            <label>To <input type="number" aria-label="Ruler end" min="0" max="10" step="0.5"
              [value]="ruler().to" (change)="setRuler('to', $event)" /></label>
            <button type="button" [disabled]="ruler().from === ruler().to" (click)="traceRuler(rulerFace)">Trace edge</button>
          </div>
        }
        <div class="ruler-stage" [style.--ruler-angle]="ruler().angle + 'deg'">
          <svg #rulerFace class="ruler-face" viewBox="0 0 320 50" aria-label="Ruler scale from 0 to 10 units">
            <rect x="1" y="1" width="318" height="48" rx="5" fill="#fff0b5" stroke="#a18439" />
            <line [attr.x1]="rulerX(ruler().from)" [attr.x2]="rulerX(ruler().to)" y1="2" y2="2" stroke="#087765" stroke-width="3" />
            @for (tick of rulerTicks; track tick) {
              <line [attr.x1]="rulerX(tick / 2)" [attr.x2]="rulerX(tick / 2)" y1="3" [attr.y2]="tick % 2 === 0 ? 19 : 12" stroke="#342a16" />
              @if (tick % 2 === 0) {
                <text [attr.x]="rulerX(tick / 2)" y="34" text-anchor="middle" font-size="12">{{ tick / 2 }}</text>
              }
            }
          </svg>
        </div>
        <p class="summary">Distance {{ rulerDistance() }} ruler units</p>
        @if (drawingError()) { <p class="summary" role="status">{{ drawingError() }}</p> }
      }
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
          <div class="math-controls" role="group" aria-label="Number line mode">
            <button type="button" [attr.aria-pressed]="gridMode() === 'points'" (click)="setGridMode('points')">Mark values</button>
            <button type="button" [attr.aria-pressed]="gridMode() === 'line'" (click)="setGridMode('line')">Line</button>
            <button type="button" [attr.aria-pressed]="gridMode() === 'toolbar'" (click)="setGridMode('toolbar')">Draw</button>
            <button type="button" [disabled]="!line().drawings.length" (click)="undoDrawing()">Undo drawing</button>
          </div>
        }
        <div #drawingFrame class="number-line" role="group" aria-label="Number line ticks">
          @for (value of ticks(); track $index; let index = $index) {
            <button type="button" class="tick" [disabled]="!editable() || drawMode()"
              [attr.aria-label]="'Mark ' + value + ' on number line'" [attr.aria-pressed]="line().marks.includes(index)"
              (click)="toggleTick(index)"><span>{{ value }}</span></button>
          }
          <ng-container *ngTemplateOutlet="drawingLayer; context: { label: 'Number line drawing surface' }" />
        </div>
        @if (editable() && drawMode()) {
          <p class="summary">{{ gridMode() === 'line' ? 'Drag from one endpoint to the other.'
            : 'Choose Pen or a shape in the whiteboard toolbar, then draw on the number line.' }}</p>
        }
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
          <ng-container *ngTemplateOutlet="drawingLayer; context: { label: 'Coordinate grid drawing surface' }" />
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
      @default {
        @if (editable()) {
          <div class="math-controls" role="group" aria-label="Maths activity mode">
            <button type="button" [attr.aria-pressed]="!drawMode()" (click)="setGridMode('points')">Interact</button>
            <button type="button" [attr.aria-pressed]="drawMode()" (click)="setGridMode('toolbar')">Draw</button>
            <button type="button" [disabled]="!activityDrawings().length" (click)="undoDrawing()">Undo drawing</button>
          </div>
        }
        <div #drawingFrame class="activity-frame">
          @if (isAdvancedActivity()) {
            <app-whiteboard-advanced-math [widget]="widget()" [text]="text()" [editable]="editable()"
              [attr.inert]="drawMode() ? '' : null" (changed)="save($event)" />
          } @else if (isAlgebraActivity()) {
            <app-whiteboard-algebra [widget]="widget()" [text]="text()" [editable]="editable()"
              [attr.inert]="drawMode() ? '' : null" (changed)="save($event)" />
          } @else {
            <app-whiteboard-math-kit [widget]="widget()" [text]="text()" [editable]="editable()"
              [attr.inert]="drawMode() ? '' : null" (changed)="save($event)" />
          }
          <ng-container *ngTemplateOutlet="drawingLayer; context: { label: 'Maths activity drawing surface' }" />
        </div>
      }
    }
    <ng-template #drawingLayer let-label="label">
      <svg #drawingSurface class="grid-drawing" [attr.viewBox]="drawingViewBox()" preserveAspectRatio="none" [class.active]="editable() && drawMode()"
        [attr.aria-label]="drawMode() ? label : null" [attr.aria-hidden]="drawMode() ? null : 'true'"
        (pointerdown)="startGridDrawing($event, drawingSurface)" (pointermove)="moveGridDrawing($event, drawingSurface)"
        (pointerup)="finishGridDrawing($event, drawingSurface)" (pointercancel)="cancelGridDrawing()"
        (lostpointercapture)="cancelGridDrawing()">
        @for (mark of renderedDrawings(); track $index) {
          <path [class.grid-stroke]="isCoordinateWidget()" [class.number-line-stroke]="widget() === 'number-line'"
            [class.geometry-stroke]="widget() === '2d-shapes'"
            [class.activity-stroke]="!isCoordinateWidget() && !['number-line','2d-shapes'].includes(widget())"
            [attr.data-tool]="mark.tool" [attr.d]="gridOutline(mark)"
            [attr.stroke]="mark.color" [attr.stroke-width]="mark.width"
            [attr.stroke-dasharray]="gridDash(mark)" [attr.opacity]="mark.tool === 'highlighter' ? 0.45 : 1"
            vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        }
      </svg>
    </ng-template>
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
    .shape-frame { position: relative; min-height: 120px; height: clamp(120px, 55%, 280px); border: 1px solid #c7d5e8; border-radius: 6px; background: #f9fbff; overflow: hidden; }
    .shape-frame.movable { cursor: grab; touch-action: none; }
    .shape-frame > svg:not(.grid-drawing) { display: block; width: 100%; height: 100%; pointer-events: none; }
    .shape-frame polygon, .shape-frame ellipse { fill: #b7d5f6; stroke: #315d92; stroke-width: 2; }
    .activity-frame { position: relative; min-height: 75px; }
    .ruler-stage { display: grid; place-items: center; min-height: 125px; }
    .ruler-face { width: min(85%, 320px); transform: rotate(var(--ruler-angle)); overflow: visible; }
    .number-line { position: relative; display: flex; width: max-content; min-width: 100%; padding-block: 4px; }
    .number-line::before { content: ''; position: absolute; inset: 25px 8px auto; border-top: 2px solid #405985; }
    .tick { position: relative; flex: 1; min-width: 39px; min-height: 52px; padding: 31px 2px 0; border: 0;
      background: transparent; color: inherit; font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; }
    .tick::before { content: ''; position: absolute; top: 15px; left: calc(50% - 1px); width: 2px; height: 14px; background: #405985; }
    .tick[aria-pressed="true"]::before { top: 16px; left: calc(50% - 5px); width: 10px; height: 10px; border-radius: 50%; background: #087765; }
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
  readonly isCoordinateWidget = computed(() => this.widget() === 'coordinate-grid' || this.widget() === 'point-plotter');
  private readonly widgetSection = computed(() => MATH_WIDGETS.find(tool => tool.kind === this.widget())?.section ?? 0);
  readonly isAlgebraActivity = computed(() => this.widgetSection() === 4 || this.widgetSection() === 5);
  readonly isAdvancedActivity = computed(() => this.widgetSection() >= 6);
  readonly text = input.required<string>();
  readonly editable = input(false);
  readonly drawingSettings = input<DrawingSettings>();
  readonly changed = output<string>();
  readonly traced = output<DrawingPoint[]>();
  private readonly state = computed(() => readActivityState(this.text()));
  readonly tenCells = this.range(10);
  readonly focusPoint = signal('0:0');
  readonly gridMode = signal<'points' | 'line' | 'toolbar'>('points');
  readonly gridSizeDraft = signal<number | null>(null);
  readonly drawMode = computed(() => this.gridMode() !== 'points');
  private readonly drawingFrame = viewChild<ElementRef<HTMLElement>>('drawingFrame');
  private readonly frameSize = signal({ width: 100, height: 100 });
  readonly drawingViewBox = computed(() => {
    if (this.isCoordinateWidget()) return '0 0 100 100';
    const { width, height } = this.frameSize();
    return '0 0 ' + width + ' ' + height;
  });
  readonly drawingError = signal('');
  private readonly gridDraft = signal<GridDrawing | null>(null);
  private drawingPointer?: number;
  readonly geometryShapes = ['Square', 'Circle', 'Triangle', 'Polygon', 'Rectangle', 'Ellipse', 'Pentagon', 'Hexagon'] as const;
  private readonly shapeDraft = signal<GridPoint | null>(null);
  private shapePointer?: number;
  readonly rulerTicks = this.range(21);
  readonly shapeModel = computed(() => {
    const state = this.state();
    return {
      shape: this.geometryShapes.find(value => value === state['shape']) ?? 'Square',
      width: this.bounded(state['width'], 55, 15, 90),
      height: this.bounded(state['height'], 60, 15, 90),
      sides: this.bounded(state['sides'], 5, 3, 12),
      x: this.bounded(state['x'], 0.5, 0.05, 0.95, 3),
      y: this.bounded(state['y'], 0.5, 0.05, 0.95, 3),
      drawings: this.readGridDrawings(state['drawings']),
    };
  });
  readonly equalShapeSides = computed(() => this.shapeModel().shape === 'Circle' || this.shapeModel().shape === 'Square');
  readonly shapeGeometry = computed(() => {
    const shape = this.shapeModel();
    const { width, height } = this.frameSize();
    const [cx, cy] = this.shapeDraft() ?? [shape.x, shape.y];
    const radiusX = shape.width / 200 * width;
    const radiusY = shape.height / 200 * height;
    const rx = this.equalShapeSides() ? shape.width / 200 * Math.min(width, height) : radiusX;
    const ry = this.equalShapeSides() ? rx : radiusY;
    const x = Math.max(rx, Math.min(width - rx, cx * width));
    const y = Math.max(ry, Math.min(height - ry, cy * height));
    let polygon = '';
    if (shape.shape === 'Rectangle' || shape.shape === 'Square') polygon = `${x - rx},${y - ry} ${x + rx},${y - ry} ${x + rx},${y + ry} ${x - rx},${y + ry}`;
    else if (shape.shape !== 'Circle' && shape.shape !== 'Ellipse') {
      const sides = shape.shape === 'Polygon' ? shape.sides : shape.shape === 'Triangle' ? 3 : shape.shape === 'Pentagon' ? 5 : 6;
      polygon = this.range(sides).map(index => {
        const angle = index * Math.PI * 2 / sides - Math.PI / 2;
        return `${x + Math.cos(angle) * rx},${y + Math.sin(angle) * ry}`;
      }).join(' ');
    }
    return { x, y, rx, ry, polygon };
  });
  readonly ruler = computed(() => {
    const state = this.state();
    return {
      angle: this.bounded(state['angle'], 0, -180, 180),
      from: this.bounded(state['from'], 0, 0, 10, 1),
      to: this.bounded(state['to'], 10, 0, 10, 1),
    };
  });
  readonly rulerDistance = computed(() => Number(Math.abs(this.ruler().to - this.ruler().from).toFixed(1)));

  readonly line = computed(() => {
    const state = this.state();
    const intervals = this.bounded(state['intervals'], 10, 2, 20);
    return {
      start: this.bounded(state['start'], 0, -1000, 1000, 2),
      step: this.bounded(state['step'], 1, 0.01, 100, 2),
      intervals,
      marks: this.indices(state['marks'], intervals + 1),
      drawings: this.readGridDrawings(state['drawings']),
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
  readonly activityDrawings = computed(() => this.readGridDrawings(this.state()['drawings']));
  private readonly drawingState = computed(() => {
    if (this.widget() === 'number-line') return this.line();
    if (this.widget() === '2d-shapes') return this.shapeModel();
    if (this.isCoordinateWidget()) return this.grid();
    return { ...this.state(), drawings: this.activityDrawings() };
  });
  readonly renderedDrawings = computed(() => {
    const draft = this.gridDraft();
    const { drawings } = this.drawingState();
    return draft ? [...drawings, draft] : drawings;
  });

  constructor() {
    effect(cleanup => {
      const element = this.drawingFrame()?.nativeElement;
      if (!element) return;
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.target.getBoundingClientRect();
        if (width > 0 && height > 0) this.frameSize.set({ width, height });
      });
      observer.observe(element);
      cleanup(() => observer.disconnect());
    });
  }

  setGeometryShape(event: Event): void {
    const shape = (event.target as HTMLSelectElement).value;
    if (this.geometryShapes.some(value => value === shape)) this.save({ ...this.shapeModel(), shape });
  }

  setShapeSize(key: 'width' | 'height' | 'sides', event: Event): void {
    const input = event.target as HTMLInputElement;
    const size = this.bounded(input.valueAsNumber, this.shapeModel()[key], Number(input.min), Number(input.max));
    input.value = String(size);
    this.save({ ...this.shapeModel(), [key]: size });
  }

  startShapeMove(event: PointerEvent): void {
    if (!this.editable() || this.drawMode() || event.button !== 0 || this.shapePointer !== undefined) return;
    event.preventDefault();
    this.shapePointer = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.moveShape(event);
  }

  moveShape(event: PointerEvent): void {
    if (event.pointerId !== this.shapePointer) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.shapeDraft.set([
      this.bounded((event.clientX - rect.left) / rect.width, 0.5, 0.05, 0.95, 3),
      this.bounded((event.clientY - rect.top) / rect.height, 0.5, 0.05, 0.95, 3),
    ]);
  }

  finishShapeMove(event: PointerEvent): void {
    if (event.pointerId !== this.shapePointer) return;
    this.moveShape(event);
    const position = this.shapeDraft();
    if (position) this.save({ ...this.shapeModel(), x: position[0], y: position[1] });
    this.cancelShapeMove();
  }

  cancelShapeMove(): void {
    this.shapePointer = undefined;
    this.shapeDraft.set(null);
  }

  rulerX(value: number): number {
    return 12 + value * 29.6;
  }

  setRuler(key: 'angle' | 'from' | 'to', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.bounded(input.valueAsNumber, this.ruler()[key], Number(input.min), Number(input.max), key === 'angle' ? 0 : 1);
    input.value = String(value);
    this.drawingError.set('');
    this.save({ ...this.ruler(), [key]: value });
  }

  traceRuler(face: Element): void {
    const matrix = (face as SVGSVGElement).getScreenCTM();
    const surface = face.closest('.surface')?.getBoundingClientRect();
    if (!this.editable() || !matrix || !surface?.width || !surface.height || this.ruler().from === this.ruler().to) return;
    const points = [this.ruler().from, this.ruler().to].map(value => {
      const point = new DOMPoint(this.rulerX(value), 2).matrixTransform(matrix);
      return { x: (point.x - surface.left) / surface.width, y: (point.y - surface.top) / surface.height };
    });
    if (points.some(point => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
      this.drawingError.set('Move the ruler edge inside the whiteboard to trace it.');
      return;
    }
    this.drawingError.set('');
    this.traced.emit(points);
  }

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
    const state = this.drawingState();
    const drawings = [...state.drawings, mark];
    if (drawings.length > 32 || JSON.stringify(drawings).length > 9500) {
      this.drawingError.set('Drawing limit reached. Undo a drawing to add another.');
      return;
    }
    this.save({ ...state, drawings });
  }

  cancelGridDrawing(): void {
    this.drawingPointer = undefined;
    this.gridDraft.set(null);
  }

  undoDrawing(): void {
    this.drawingError.set('');
    const state = this.drawingState();
    this.save({ ...state, drawings: state.drawings.slice(0, -1) });
  }

  gridOutline(mark: GridDrawing): string {
    if (this.widget() === 'number-line') {
      const { start, step, intervals } = this.line();
      const { width, height } = this.frameSize();
      const points = mark.points.map(([x, y]) => ({ x: ((x - start) / step + 0.5) / (intervals + 1), y }));
      return drawingOutline(mark.tool, points, width, height, 12);
    }
    if (!this.isCoordinateWidget()) {
      const { width, height } = this.frameSize();
      return drawingOutline(mark.tool, mark.points.map(([x, y]) => ({ x, y })), width, height, 12);
    }
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
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (this.widget() === 'number-line') {
      const { start, step, intervals } = this.line();
      const span = step * (intervals + 1);
      const minimum = start - step / 2;
      return [this.bounded(minimum + x * span, start, minimum, minimum + span, 4), this.bounded(y, 0.5, 0, 1, 4)];
    }
    if (!this.isCoordinateWidget()) return [this.bounded(x, 0.5, 0, 1, 4), this.bounded(y, 0.5, 0, 1, 4)];
    const edge = this.grid().limit + 0.5;
    return [
      this.bounded((x * 2 - 1) * edge, 0, -edge, edge, 2),
      this.bounded((1 - y * 2) * edge, 0, -edge, edge, 2),
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
        Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) &&
        (this.widget() === 'number-line' ? Math.abs(point[0]) <= 3050 && point[1] >= 0 && point[1] <= 1
          : this.isCoordinateWidget() ? point.every(coord => Math.abs(coord) <= 6.5)
            : point.every(coord => coord >= 0 && coord <= 1)));
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
