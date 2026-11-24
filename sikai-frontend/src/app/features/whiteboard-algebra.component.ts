import { Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { readActivityState } from './whiteboard-activity.component';
import { calculate } from './whiteboard-calculator';
import { MathWidget } from './whiteboard-math-tools';

type Point = [x: number, y: number];
type Field = { key: string; label: string; initial: number; min: number; max: number; step: number };
const field = (key: string, label: string, initial: number, min = -20, max = 20, step = 1): Field =>
  ({ key, label, initial, min, max, step });
const RELATIONS = ['<', '≤', '>', '≥'] as const;
const TRANSFORMS = ['Translate', 'Rotate', 'Reflect in x-axis', 'Reflect in y-axis', 'Scale about origin'] as const;
const TILE_TYPES = [{ key: 'square', label: 'x²' }, { key: 'linear', label: 'x' }, { key: 'unit', label: '1' }] as const;
const DEFAULT_POINTS: Point[] = [[-4,-2],[0,2],[4,1]];
const ORIGINAL_TRIANGLE: Point[] = [[-2,-2],[2,-2],[0,2]];

@Component({
  selector: 'app-whiteboard-algebra',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    @if (widget() === 'equation-editor' || widget() === 'expression-builder') {
      <div class="controls">
        <label>{{ widget() === 'equation-editor' ? 'Left side' : 'Expression' }}
          <input class="expression" aria-label="Algebra expression" maxlength="120" [value]="expression()"
            [readOnly]="!editable()" (focus)="activeSide = 'expression'" (change)="setText('expression', $event)" />
        </label>
        @if (widget() === 'equation-editor') {
          <label>Right side <input class="expression" aria-label="Equation right side" maxlength="120" [value]="rightSide()"
            [readOnly]="!editable()" (focus)="activeSide = 'right'" (change)="setText('right', $event)" /></label>
        }
      </div>
      @if (editable()) {
        <div class="controls" aria-label="Expression symbols">
          @for (key of symbols; track key.token) {
            <button type="button" (click)="append(key.token)">{{ key.face }}</button>
          }
        </div>
      }
      <p class="result">{{ expression() }}{{ widget() === 'equation-editor' ? ' = ' + rightSide() : ' = ' + format(evaluate(expression(), sampleX())) }}</p>
    }
    @if (widget() === 'function-table' || widget() === 'function-grapher') {
      <div class="controls">
        <label>f(x) <input class="expression" aria-label="Function expression" maxlength="120" [value]="expression()"
          [readOnly]="!editable()" (change)="setText('expression', $event)" /></label>
      </div>
    }
    @if (widget() === 'inequality-tool') {
      <div class="controls"><label>Relation <select aria-label="Inequality relation" [value]="relation()" [disabled]="!editable()"
        (change)="setOption('relation', $event)">
        @for (option of relations; track option) { <option [value]="option">{{ option }}</option> }
      </select></label></div>
    }
    @if (widget() === 'transformations') {
      <div class="controls"><label>Transform <select aria-label="Transformation type" [value]="transformation()" [disabled]="!editable()"
        (change)="setOption('transform', $event)">
        @for (option of transformOptions; track option) { <option [value]="option">{{ option }}</option> }
      </select></label></div>
    }
    @if (fields().length) {
      <div class="controls">
        @for (item of fields(); track item.key) {
          <label>{{ item.label }} <input type="number" [attr.aria-label]="item.label" [value]="number(item)" [min]="item.min" [max]="item.max"
            [step]="item.step" [readOnly]="!editable()" (change)="changeNumber(item, $event)" /></label>
        }
      </div>
    }
    @switch (widget()) {
      @case ('algebra-tiles') {
        @for (sign of signs; track sign.key) {
          <div class="tile-row">
            <strong>{{ sign.label }}</strong>
            @for (kind of tileTypes; track kind.key) {
              <div class="tile-set">
                <div class="controls">
                  <span>{{ kind.label }}</span>
                  <button type="button" [disabled]="!editable() || !tileCount(sign.key, kind.key)"
                    [attr.aria-label]="'Remove ' + sign.label.toLowerCase() + ' ' + kind.label"
                    (click)="changeTiles(sign.key, kind.key, -1)">−</button>
                  <button type="button" [disabled]="!editable() || tileCount(sign.key, kind.key) >= 12"
                    [attr.aria-label]="'Add ' + sign.label.toLowerCase() + ' ' + kind.label"
                    (click)="changeTiles(sign.key, kind.key, 1)">+</button>
                </div>
                @for (tile of range(tileCount(sign.key, kind.key)); track tile) {
                  <span class="tile" [class.square]="kind.key === 'square'" [class.linear]="kind.key === 'linear'"
                    [class.negative]="sign.key === 'minus'" aria-hidden="true">{{ kind.label }}</span>
                }
              </div>
            }
          </div>
        }
        <div class="controls">
          <strong>{{ tileSummary() }}</strong>
          @if (editable()) { <button type="button" (click)="cancelTiles()">Cancel zero pairs</button> }
        </div>
      }
      @case ('equation-solver') {
        <p class="result">{{ equation() }}</p>
        <div class="steps">
          @for (step of equationSteps(); track step) { <p>{{ step }}</p> }
        </div>
      }
      @case ('inequality-tool') {
        <p class="result">{{ inequality().result }}</p>
        @if (inequality().threshold !== null) {
          <svg class="plot" viewBox="0 0 300 60" role="img" aria-label="Inequality number line">
            <path d="M15 28 H285" class="axis" />
            <path [attr.d]="inequality().ray" class="data" />
            <circle cx="150" cy="28" r="5" stroke="#075d53" stroke-width="2" [attr.fill]="inequality().closed ? '#075d53' : '#fff'" />
            <text x="150" y="48" text-anchor="middle" font-size="12">{{ format(inequality().threshold) }}</text>
          </svg>
        }
      }
      @case ('function-table') {
        <table aria-label="Function values"><thead><tr><th scope="col">x</th><th scope="col">f(x)</th></tr></thead>
          <tbody>@for (row of functionRows(); track $index) { <tr><td>{{ format(row.x) }}</td><td>{{ format(row.y) }}</td></tr> }</tbody>
        </table>
      }
      @case ('line-graph') {
        <ng-container *ngTemplateOutlet="plot" />
        <div class="point-editor">
          @for (point of points(); track $index; let index = $index) {
            <div class="controls">
              <label>X <input type="number" [attr.aria-label]="'Point ' + (index + 1) + ' x'" min="-20" max="20" step="0.5"
                [value]="point[0]" [readOnly]="!editable()" (change)="changePoint(index, 0, $event)" /></label>
              <label>Y <input type="number" [attr.aria-label]="'Point ' + (index + 1) + ' y'" min="-20" max="20" step="0.5"
                [value]="point[1]" [readOnly]="!editable()" (change)="changePoint(index, 1, $event)" /></label>
              @if (editable()) { <button type="button" [disabled]="points().length <= 2" [attr.aria-label]="'Remove point ' + (index + 1)"
                (click)="removePoint(index)">×</button> }
            </div>
          }
          @if (editable()) { <button type="button" [disabled]="points().length >= 12" (click)="addPoint()">Add point</button> }
        </div>
      }
      @case ('function-grapher') {
        <ng-container *ngTemplateOutlet="plot" />
        @if (!plotData().paths.length) { <p>No values to plot in this window.</p> }
      }
      @case ('transformations') {
        <ng-container *ngTemplateOutlet="plot" />
        <p>Original {{ pointDescription(originalTriangle) }}</p><p>Image {{ pointDescription(transformedTriangle()) }}</p>
      }
    }
    <ng-template #plot>
      <svg class="plot" viewBox="0 0 300 300" role="img" [attr.aria-label]="plotData().label">
        @for (tick of axisTicks(); track tick.value) {
          <path [attr.d]="tick.lines" [class.axis]="tick.value === 0" />
          @if (tick.value) {
            <text [attr.x]="tick.x" y="165" text-anchor="middle">{{ tick.value }}</text>
            <text x="143" [attr.y]="tick.y" text-anchor="end">{{ tick.value }}</text>
          }
        }
        <text x="289" y="164">x</text><text x="156" y="12">y</text>
        @for (path of plotData().paths; track $index) {
          <path [attr.d]="path" class="data" [class.image]="$index > 0 && widget() === 'transformations'" />
        }
        @for (point of plotData().dots; track $index) { <circle [attr.cx]="point[0]" [attr.cy]="point[1]" r="3.5" /> }
      </svg>
    </ng-template>
  `,
  styles: [`
    :host { display: block; min-width: 0; color: #000; }
    .controls { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 7px; margin-bottom: 5px; }
    label { display: inline-flex; align-items: center; gap: 4px; margin: 0; color: #000; }
    input, select, button { min-height: 23px; margin: 0; padding: 2px 4px; border: 1px solid #b4c3d9; border-radius: 4px; color: #000; background: #fff; font: inherit; }
    input { width: 59px; } .expression { width: min(100%, 165px); }
    button { cursor: pointer; } button:disabled { cursor: default; }
    p { margin: 5px 0 0; overflow-wrap: anywhere; } .result { font-size: .92rem; font-weight: 700; }
    .steps { margin-top: 6px; padding-inline-start: 8px; border-inline-start: 2px solid #91aacd; }
    .tile-row { display: flex; flex-wrap: wrap; align-items: start; gap: 5px 9px; margin-bottom: 6px; }
    .tile-set { max-width: 170px; } .tile { display: inline-grid; place-items: center; vertical-align: top; width: 15px; height: 15px;
      margin: 1px; background: #b5dfcf; border: 1px solid #43816f; border-radius: 2px; font-size: .65rem; }
    .tile.square { width: 30px; height: 30px; } .tile.linear { width: 30px; } .tile.negative { background: #f8ced8; border-color: #ab516a; }
    table { border-collapse: collapse; margin-top: 5px; }
    th, td { min-width: 48px; border: 1px solid #bccce0; padding: 3px 7px; text-align: end; }
    th { background: #e8f0fa; }
    .plot { display: block; width: min(100%, 255px); height: auto; border: 1px solid #bdcbe0; border-radius: 5px; background: #f8fbff; overflow: hidden; }
    .plot path { fill: none; stroke: #d2deed; }
    .plot .axis { stroke: #3c557b; }
    .plot .data { stroke: #075d53; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .plot .image { stroke: #a32c59; stroke-dasharray: 5 3; }
    .plot text { fill: #000; font-size: 8px; } .plot circle { fill: #075d53; }
    .point-editor { margin-top: 6px; }
  `],
})
export class WhiteboardAlgebraComponent {
  readonly widget = input.required<MathWidget>();
  readonly text = input.required<string>();
  readonly editable = input(false);
  readonly changed = output<Record<string, unknown>>();
  private readonly state = computed(() => readActivityState(this.text()));
  readonly relations = RELATIONS;
  readonly transformOptions = TRANSFORMS;
  readonly tileTypes = TILE_TYPES;
  readonly signs = [{ key: 'plus', label: 'Positive' }, { key: 'minus', label: 'Negative' }];
  readonly originalTriangle = ORIGINAL_TRIANGLE;
  readonly symbols = [{ face: 'x', token: 'x' }, { face: '+', token: '+' }, { face: '−', token: '−' },
    { face: '×', token: '×' }, { face: '/', token: '/' }, { face: 'xʸ', token: '^' }, { face: '(', token: '(' }, { face: ')', token: ')' }];
  activeSide = 'expression';
  readonly expression = computed(() => this.string('expression',
    this.widget() === 'equation-editor' ? '2x + 3' : this.widget() === 'function-grapher' ? 'x^2 - 2' : '2x + 1'));
  readonly rightSide = computed(() => this.string('right', '11'));
  readonly sampleX = computed(() => this.n('sample', 3));
  readonly relation = computed(() => RELATIONS.find(item => item === this.state()['relation']) ?? '≤');
  readonly transformation = computed(() => TRANSFORMS.find(item => item === this.state()['transform']) ?? 'Translate');
  readonly fields = computed<Field[]>(() => {
    switch (this.widget()) {
      case 'expression-builder': return [field('sample', 'x value', 3, -100, 100, 0.5)];
      case 'equation-solver': return [field('a', 'Left x coefficient', 2), field('b', 'Left constant', 3),
        field('c', 'Right x coefficient', 0), field('d', 'Right constant', 11)];
      case 'inequality-tool': return [field('a', 'x coefficient', 2), field('b', 'Constant', 3), field('d', 'Right side', 11)];
      case 'function-table': return [field('start', 'Start x', -2, -100, 100, 0.5), field('step', 'Step', 1, 0.5, 20, 0.5), field('rows', 'Rows', 5, 2, 12)];
      case 'line-graph':
      case 'function-grapher': return [field('axis', 'Axis limit', 6, 2, 20)];
      case 'transformations': {
        const axis = field('axis', 'Axis limit', 6, 2, 20);
        switch (this.transformation()) {
          case 'Translate': return [field('dx', 'Horizontal shift', 3), field('dy', 'Vertical shift', 2), axis];
          case 'Rotate': return [field('angle', 'Angle (°)', 90, -360, 360), axis];
          case 'Scale about origin': return [field('factor', 'Scale factor', 2, 0.5, 5, 0.5), axis];
          default: return [axis];
        }
      }
      default: return [];
    }
  });
  readonly equation = computed(() => this.linear(this.n('a', 2), this.n('b', 3)) + ' = ' + this.linear(this.n('c', 0), this.n('d', 11)));
  readonly equationSteps = computed(() => {
    const coefficient = this.n('a', 2) - this.n('c', 0);
    const constant = this.n('d', 11) - this.n('b', 3);
    if (coefficient === 0) return ['0 = ' + constant, constant === 0 ? 'Every real number is a solution.' : 'No solution.'];
    return [this.linear(coefficient, 0) + ' = ' + constant, 'x = ' + this.ratio(constant, coefficient)];
  });
  readonly inequality = computed(() => {
    const a = this.n('a', 2), b = this.n('b', 3), right = this.n('d', 11);
    const relation = this.relation();
    const expression = this.linear(a, b) + ' ' + relation + ' ' + right;
    if (a === 0) {
      const trueForAll = relation === '<' ? b < right : relation === '≤' ? b <= right : relation === '>' ? b > right : b >= right;
      return { result: expression + ' · ' + (trueForAll ? 'All real numbers' : 'No solution'), threshold: null, closed: false, ray: '' };
    }
    const direction = a < 0 ? ({ '<': '>', '≤': '≥', '>': '<', '≥': '≤' })[relation] : relation;
    const threshold = (right - b) / a;
    const ray = direction === '>' || direction === '≥' ? 'M150 28 H282 m-8 -5 8 5 -8 5' : 'M150 28 H18 m8 -5 -8 5 8 5';
    return { result: expression + ' → x ' + direction + ' ' + this.ratio(right - b, a), threshold, closed: direction === '≤' || direction === '≥', ray };
  });
  readonly functionRows = computed(() => this.range(this.n('rows', 5, 2, 12)).map(index => {
    const x = this.n('start', -2, -100, 100, 0.5) + index * this.n('step', 1, 0.5, 20, 0.5);
    return { x, y: this.evaluate(this.expression(), x) };
  }));
  readonly points = computed<Point[]>(() => {
    const saved = this.state()['points'];
    const points = Array.isArray(saved) ? saved.slice(0, 12).filter((point): point is Point =>
      Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && Math.abs(value) <= 20)) : [];
    return points.length >= 2 ? points : DEFAULT_POINTS;
  });
  readonly transformedTriangle = computed<Point[]>(() => {
    const type = this.transformation();
    const angle = this.n('angle', 90, -360, 360) * Math.PI / 180;
    return ORIGINAL_TRIANGLE.map(([x, y]): Point => {
      switch (type) {
        case 'Rotate': return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
        case 'Reflect in x-axis': return [x, -y];
        case 'Reflect in y-axis': return [-x, y];
        case 'Scale about origin': { const factor = this.n('factor', 2, 0.5, 5, 0.5); return [x * factor, y * factor]; }
        default: return [x + this.n('dx', 3), y + this.n('dy', 2)];
      }
    });
  });
  private readonly axisLimit = computed(() => this.n('axis', 6, 2, 20));
  readonly axisTicks = computed(() => {
    const limit = this.axisLimit();
    const interval = Math.max(1, Math.ceil(limit / 6));
    const span = Math.floor(limit / interval);
    return this.range(span * 2 + 1).map(index => {
      const value = (index - span) * interval;
      const [x, y] = this.plotPoint([value, value]);
      return { value, x, y: y + 3, lines: `M${x} 10V290 M10 ${y}H290` };
    });
  });
  readonly plotData = computed(() => {
    switch (this.widget()) {
      case 'line-graph': return { label: 'Line graph with ' + this.points().length + ' points', paths: [this.path(this.points())], dots: this.points().map(point => this.plotPoint(point)) };
      case 'transformations': return { label: this.transformation() + ' triangle transformation',
        paths: [this.path(ORIGINAL_TRIANGLE) + ' Z', this.path(this.transformedTriangle()) + ' Z'], dots: [] };
      default: return { label: 'Function graph of ' + this.expression(), paths: this.functionPaths(), dots: [] };
    }
  });

  range(length: number): number[] { return Array.from({ length }, (_, index) => index); }
  number(setting: Field): number { return this.n(setting.key, setting.initial, setting.min, setting.max, setting.step); }

  changeNumber(setting: Field, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.bound(input.valueAsNumber, this.number(setting), setting.min, setting.max, setting.step);
    input.value = String(value);
    this.patch({ [setting.key]: value });
  }

  setText(key: string, event: Event): void {
    this.patch({ [key]: (event.target as HTMLInputElement).value.slice(0, 120) });
  }

  setOption(key: string, event: Event): void {
    this.patch({ [key]: (event.target as HTMLSelectElement).value });
  }

  append(token: string): void {
    const key = this.widget() === 'equation-editor' ? this.activeSide : 'expression';
    const value = key === 'right' ? this.rightSide() : this.expression();
    this.patch({ [key]: (value + token).slice(0, 120) });
  }

  tileCount(sign: string, key: string): number { return this.n(sign + key, 0, 0, 12); }
  changeTiles(sign: string, key: string, step: number): void {
    this.patch({ [sign + key]: this.bound(this.tileCount(sign, key) + step, 0, 0, 12) });
  }
  cancelTiles(): void {
    const next: Record<string, number> = {};
    for (const tile of TILE_TYPES) {
      const positive = this.tileCount('plus', tile.key);
      const negative = this.tileCount('minus', tile.key);
      const pairs = Math.min(positive, negative);
      next['plus' + tile.key] = positive - pairs;
      next['minus' + tile.key] = negative - pairs;
    }
    this.patch(next);
  }
  tileSummary(): string {
    const terms = TILE_TYPES.flatMap(tile => {
      const net = this.tileCount('plus', tile.key) - this.tileCount('minus', tile.key);
      const value = Math.abs(net);
      const text = tile.key === 'unit' ? String(value) : (value === 1 ? '' : String(value)) + tile.label;
      return net ? [{ negative: net < 0, text }] : [];
    });
    return terms.map((term, index) => (term.negative ? (index ? ' − ' : '−') : index ? ' + ' : '') + term.text).join('') || '0';
  }

  evaluate(expression: string, x: number): number | null {
    try { return calculate(expression, 'rad', x); } catch { return null; }
  }
  format(value: number | null): string {
    if (value === null) return 'Undefined';
    return String(Math.abs(value) < 1e-10 ? 0 : Number(value.toPrecision(8)));
  }
  pointDescription(points: Point[]): string {
    return points.map(([x, y]) => '(' + this.format(x) + ', ' + this.format(y) + ')').join(' ');
  }

  changePoint(index: number, axis: 0 | 1, event: Event): void {
    const input = event.target as HTMLInputElement;
    const points = this.points().map(([x, y]): Point => [x, y]);
    points[index][axis] = this.bound(input.valueAsNumber, points[index][axis], -20, 20, 0.5);
    input.value = String(points[index][axis]);
    this.patch({ points });
  }
  addPoint(): void { if (this.points().length < 12) this.patch({ points: [...this.points(), [0, 0]] }); }
  removePoint(index: number): void { if (this.points().length > 2) this.patch({ points: this.points().filter((_, position) => position !== index) }); }

  private patch(values: Record<string, unknown>): void {
    if (this.editable()) this.changed.emit({ ...this.state(), ...values });
  }
  private string(key: string, fallback: string): string {
    const value = this.state()[key];
    return typeof value === 'string' ? value.slice(0, 120) : fallback;
  }
  private n(key: string, fallback: number, min = -20, max = 20, step = 1): number {
    return this.bound(this.state()[key], fallback, min, max, step);
  }
  private bound(value: unknown, fallback: number, min: number, max: number, step = 1): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value / step) * step)) : fallback;
  }
  private linear(a: number, b: number): string {
    if (!a) return String(b);
    const term = a === 1 ? 'x' : a === -1 ? '−x' : a + 'x';
    return !b ? term : term + (b < 0 ? ' − ' : ' + ') + Math.abs(b);
  }
  private ratio(numerator: number, denominator: number): string {
    let a = Math.abs(numerator);
    let b = Math.abs(denominator);
    while (b) [a, b] = [b, a % b];
    const divisor = (a || 1) * Math.sign(denominator);
    const bottom = denominator / divisor;
    return bottom === 1 ? String(numerator / divisor) : numerator / divisor + '/' + bottom;
  }
  private plotPoint([x, y]: Point): Point {
    return [150 + x / this.axisLimit() * 140, 150 - y / this.axisLimit() * 140];
  }
  private path(points: Point[]): string { return 'M' + points.map(point => this.plotPoint(point).join(' ')).join(' L'); }
  private functionPaths(): string[] {
    const limit = this.axisLimit();
    const paths: string[] = [];
    let points: Point[] = [];
    for (let index = 0; index <= 160; index++) {
      const x = -limit + index * limit / 80;
      const y = this.evaluate(this.expression(), x);
      const previous = points.at(-1)?.[1];
      if (y === null || Math.abs(y) > limit * 2 || (previous !== undefined && Math.abs(y - previous) > limit)) {
        if (points.length > 1) paths.push(this.path(points));
        points = [];
      }
      if (y !== null && Math.abs(y) <= limit * 2) points.push([x, y]);
    }
    if (points.length > 1) paths.push(this.path(points));
    return paths;
  }
}
