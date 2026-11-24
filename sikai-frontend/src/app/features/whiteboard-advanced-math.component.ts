import { Component, computed, input, output } from '@angular/core';
import { readActivityState } from './whiteboard-activity.component';
import { describeNumbers, estimateIntegral, evaluateAt, readNumbers } from './whiteboard-advanced-math';
import { MathWidget } from './whiteboard-math-tools';

type Field = { key: string; label: string; initial: number; min: number; max: number; step: number };
type Choice = { key: string; label: string; options: readonly string[] };
type Form = { fields?: Field[]; choices?: Choice[] };
type Point = [number, number];
type Path = { d: string; style: 'axis' | 'guide' | 'curve' | 'other' | 'shade' };
type Diagram = { label: string; paths: Path[]; dots?: Point[]; labels?: { text: string; x: number; y: number }[] };
type Matrix = [number, number, number, number];

const field = (key: string, label: string, initial: number, min: number, max: number, step = 1): Field =>
  ({ key, label, initial, min, max, step });
const choice = (key: string, label: string, ...options: string[]): Choice => ({ key, label, options });
const SPINNER_COLORS = ['#aed5f4', '#ffd7a5', '#b5e7d0', '#efb7d1', '#d6c1f1', '#f6e899',
  '#b6e5ec', '#eabca9', '#cfe5a9', '#c2c9f6', '#ffcfdf', '#d4dbe4'];
const MATRIX_OPERATIONS = ['Determinant of A', 'Transpose A', 'A + B', 'A × B'] as const;

@Component({
  selector: 'app-whiteboard-advanced-math',
  standalone: true,
  template: `
    @if (usesFunction()) {
      <div class="controls">
        <label>f(x) <input class="wide" aria-label="Advanced function expression" maxlength="120" [value]="expression()"
          [readOnly]="!editable()" (change)="changeText('expression', $event)" /></label>
      </div>
    }
    @if (usesDataset()) {
      <label class="dataset">Data <textarea aria-label="Statistics data" rows="2" maxlength="400" [value]="dataset()"
        [readOnly]="!editable()" (change)="changeText('dataset', $event)"></textarea></label>
      @if (!statistics()) { <p role="status">Enter up to 60 numbers separated by spaces or commas.</p> }
    }
    @if (form(); as controls) {
      <div class="controls">
        @for (item of controls.choices ?? []; track item.key) {
          <label>{{ item.label }} <select [attr.aria-label]="item.label" [value]="selected(item)" [disabled]="!editable()"
            (change)="setChoice(item, $event)">
            @for (option of item.options; track option) { <option [value]="option">{{ option }}</option> }
          </select></label>
        }
        @for (item of controls.fields ?? []; track item.key) {
          <label>{{ item.label }} <input type="number" [attr.aria-label]="item.label" [value]="number(item)" [min]="item.min" [max]="item.max"
            [step]="item.step" [readOnly]="!editable()" (change)="setNumber(item, $event)" /></label>
        }
      </div>
    }
    @switch (widget()) {
      @case ('mean-median-mode') {
        @if (statistics(); as summary) {
          <div class="results">
            <strong>Mean {{ format(summary.mean) }}</strong>
            <strong>Median {{ format(summary.median) }}</strong>
            <strong>Mode {{ summary.modes.length ? summary.modes.join(', ') : 'None' }}</strong>
          </div>
        }
      }
      @case ('box-plot') {
        @if (statistics(); as summary) {
          <div class="results">
            @for (value of summary.five; track $index) { <span>{{ boxLabels[$index] }} <strong>{{ format(value) }}</strong></span> }
          </div>
          <p>Quartiles use the median of each half.</p>
        }
      }
      @case ('probability-spinner') {
        <div class="spinner-wrap">
          <div class="spinner" [style.background]="spinnerPaint()" [style.transform]="spinnerRotation()">
            @for (sector of range(outcomeLabels().length); track sector) {
              <span [style.left.%]="spinnerLabel(sector)[0]" [style.top.%]="spinnerLabel(sector)[1]">{{ sector + 1 }}</span>
            }
          </div>
          <span class="spinner-pointer" aria-hidden="true">▼</span>
        </div>
        @if (editable()) {
          <div class="controls"><button type="button" (click)="runTrial()">Spin</button><button type="button" (click)="resetTrials()">Reset results</button></div>
        }
        <p>Each sector has probability 1/{{ outcomeLabels().length }}.</p>
      }
      @case ('dice-coin') {
        @if (editable()) {
          <div class="controls"><button type="button" (click)="runTrial()">{{ experiment() === 'Coin' ? 'Toss coin' : 'Roll die' }}</button>
            <button type="button" (click)="resetTrials()">Reset results</button></div>
        }
        <p>Each outcome has probability 1/{{ outcomeLabels().length }}.</p>
      }
      @case ('matrix-tool') {
        <div class="matrices">
          @for (name of displayedMatrices(); track name) {
            <div><strong>Matrix {{ name }}</strong>
              <div class="matrix">
                @for (value of matrix(name); track $index; let index = $index) {
                  <input type="number" min="-20" max="20" step="1" [value]="value" [readOnly]="!editable()"
                    [attr.aria-label]="'Matrix ' + name + ' row ' + (index < 2 ? 1 : 2) + ' column ' + (index % 2 + 1)"
                    (change)="setMatrix(name, index, $event)" />
                }
              </div>
            </div>
          }
          <div><strong>{{ matrixOperation() }}</strong>
            @if (matrixResult(); as result) {
              <div class="matrix result-matrix">@for (value of result; track $index) { <span>{{ value }}</span> }</div>
            } @else { <p>Determinant {{ determinant() }}</p> }
          </div>
        </div>
      }
    }
    @if (widget() === 'probability-spinner' || widget() === 'dice-coin') {
      @if (lastOutcome(); as outcome) { <p class="result">Last result {{ outcome }}</p> }
      <div class="results">
        @for (outcome of outcomeLabels(); track outcome; let index = $index) {
          <span>{{ outcome }} <strong>{{ counts()[index] }}</strong></span>
        }
      </div>
      <p>Total trials {{ totalTrials() }}</p>
    }
    @if (diagram(); as plot) {
      <svg class="diagram" viewBox="0 0 320 180" role="img" [attr.aria-label]="plot.label"
        [class.pick-angle]="widget() === 'unit-circle' && editable()" (click)="pickUnitAngle($event)">
        @for (path of plot.paths; track $index) { <path [attr.d]="path.d" [attr.class]="path.style" /> }
        @for (dot of plot.dots ?? []; track $index) { <circle [attr.cx]="dot[0]" [attr.cy]="dot[1]" r="4" /> }
        @for (label of plot.labels ?? []; track $index) { <text [attr.x]="label.x" [attr.y]="label.y">{{ label.text }}</text> }
      </svg>
    }
    @for (line of results(); track $index) { <p class="result">{{ line }}</p> }
  `,
  styles: [`
    :host { display: block; min-width: 0; color: #000; }
    .controls, .results, .matrices { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 8px; margin: 0 0 5px; }
    .results span { padding: 3px 5px; border: 1px solid #bdd0e6; border-radius: 4px; background: #f3f7fd; }
    label { display: inline-flex; align-items: center; gap: 4px; margin: 0; color: #000; }
    input, select, textarea, button { box-sizing: border-box; min-height: 23px; margin: 0; padding: 2px 4px; border: 1px solid #b4c3d9;
      border-radius: 4px; color: #000; background: #fff; font: inherit; }
    input { width: 66px; } .wide { width: min(175px, 100%); } button { cursor: pointer; }
    .dataset { display: grid; align-items: start; margin-bottom: 6px; } textarea { width: min(100%, 260px); }
    p { margin: 5px 0 0; overflow-wrap: anywhere; } .result { font-weight: 650; }
    .diagram { display: block; width: min(100%, 310px); border: 1px solid #bdcbe0; border-radius: 5px; background: #f8fbff; }
    .diagram path { fill: none; stroke: #275587; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .diagram .axis { stroke: #3e587d; stroke-width: 1; }
    .diagram .guide { stroke: #7896bc; stroke-dasharray: 4 3; }
    .diagram .curve { stroke: #006c5a; stroke-width: 2; } .diagram .other { stroke: #a22d57; stroke-width: 2; }
    .diagram .shade { stroke: none; fill: #91c9b6; fill-opacity: .65; }
    .diagram circle { fill: #a22d57; } .diagram text { fill: #000; font: 9px sans-serif; }
    .diagram.pick-angle { cursor: crosshair; }
    .spinner-wrap { position: relative; width: 95px; margin: 9px 0 5px; }
    .spinner { position: relative; aspect-ratio: 1; border: 1px solid #778eb0; border-radius: 50%; transition: transform .55s ease-out; }
    .spinner span { position: absolute; transform: translate(-50%,-50%); font-weight: 650; }
    .spinner-pointer { position: absolute; left: 50%; top: -8px; transform: translateX(-50%); color: #183456; }
    .matrices { align-items: start; }
    .matrix { display: grid; grid-template-columns: repeat(2, 46px); gap: 3px; margin-top: 4px; border-inline: 2px solid #5277a8; padding: 0 3px; }
    .matrix input { width: 46px; } .result-matrix span { text-align: center; min-height: 23px; background: #eff5fc; padding: 3px; }
    @media (prefers-reduced-motion: reduce) { .spinner { transition: none; } }
  `],
})
export class WhiteboardAdvancedMathComponent {
  readonly widget = input.required<MathWidget>();
  readonly text = input.required<string>();
  readonly editable = input(false);
  readonly changed = output<Record<string, unknown>>();
  private readonly state = computed(() => readActivityState(this.text()));
  readonly boxLabels = ['Min', 'Q1', 'Median', 'Q3', 'Max'];
  readonly usesDataset = computed(() => this.widget() === 'mean-median-mode' || this.widget() === 'box-plot');
  readonly usesFunction = computed(() => this.widget() === 'limits-derivatives' || this.widget() === 'integral-graph');
  readonly expression = computed(() => this.string('expression', 'x^2', 120));
  readonly dataset = computed(() => this.string('dataset', '1, 2, 2, 4, 6, 8, 9', 400));
  readonly statistics = computed(() => {
    const values = readNumbers(this.dataset());
    return values ? describeNumbers(values) : null;
  });
  readonly experiment = computed(() => this.selected(choice('experiment', 'Experiment', 'Die', 'Coin')));
  readonly outcomeLabels = computed(() => this.widget() === 'probability-spinner'
    ? this.range(this.n('sectors', 4, 2, 12)).map(value => String(value + 1))
    : this.experiment() === 'Coin' ? ['Heads', 'Tails'] : ['1', '2', '3', '4', '5', '6']);
  readonly counts = computed(() => {
    const saved = this.state()['counts'];
    return this.outcomeLabels().map((_, index) => this.bound(Array.isArray(saved) ? saved[index] : null, 0, 0, 10000));
  });
  readonly totalTrials = computed(() => this.counts().reduce((total, count) => total + count, 0));
  readonly lastIndex = computed(() => this.n('last', -1, -1, this.outcomeLabels().length - 1));
  readonly lastOutcome = computed(() => this.outcomeLabels()[this.lastIndex()] ?? null);
  readonly spinnerPaint = computed(() => {
    const count = this.outcomeLabels().length;
    return 'conic-gradient(' + this.range(count).map(index => SPINNER_COLORS[index] + ' ' +
      index / count * 100 + '% ' + (index + 1) / count * 100 + '%').join(', ') + ')';
  });
  readonly spinnerRotation = computed(() => this.lastIndex() < 0 ? 'none'
    : 'rotate(' + (this.totalTrials() - (this.lastIndex() + 0.5) / this.outcomeLabels().length) * 360 + 'deg)');
  readonly matrixOperation = computed(() => this.selected(choice('matrixOp', 'Operation', ...MATRIX_OPERATIONS)));
  readonly displayedMatrices = computed<('A' | 'B')[]>(() => this.matrixOperation() === 'A + B' || this.matrixOperation() === 'A × B' ? ['A', 'B'] : ['A']);
  readonly determinant = computed(() => {
    const [a,b,c,d] = this.matrix('A');
    return a * d - b * c;
  });
  readonly matrixResult = computed<Matrix | null>(() => {
    const [a,b,c,d] = this.matrix('A'), [e,f,g,h] = this.matrix('B');
    switch (this.matrixOperation()) {
      case 'Transpose A': return [a,c,b,d];
      case 'A + B': return [a+e,b+f,c+g,d+h];
      case 'A × B': return [a*e+b*g,a*f+b*h,c*e+d*g,c*f+d*h];
      default: return null;
    }
  });

  readonly form = computed<Form | null>(() => {
    const sideA = field('a', 'Leg a', 3, 0.5, 30, 0.5);
    const sideB = field('b', 'Leg b', 4, 0.5, 30, 0.5);
    const angle = field('angle', 'Degrees', 45, -720, 720);
    const x = field('x', 'X', 3, -12, 12, 0.5);
    const y = field('y', 'Y', 2, -12, 12, 0.5);
    switch (this.widget()) {
      case 'right-triangle': return { fields: [sideA, sideB] };
      case 'soh-cah-toa': return { fields: [sideA, sideB], choices: [choice('reference', 'Reference', 'Angle A', 'Angle B')] };
      case 'unit-circle': return { fields: [angle] };
      case 'pythagorean': {
        const missing = choice('missing', 'Find', 'Hypotenuse', 'Leg a', 'Leg b');
        const leg = this.selected(missing);
        const hypotenuse = field('hypotenuse', 'Hypotenuse', 5, 0.5, 40, 0.5);
        return { choices: [missing], fields: leg === 'Leg a' ? [sideB, hypotenuse] : leg === 'Leg b' ? [sideA, hypotenuse] : [sideA, sideB] };
      }
      case 'angle-converter': {
        const unit = choice('unit', 'Input unit', 'Degrees', 'Radians');
        return { choices: [unit], fields: [this.selected(unit) === 'Degrees' ? angle : field('radians', 'Radians', 1, -20, 20, 0.001)] };
      }
      case 'trig-graphs': return { choices: [choice('function', 'Function', 'sin', 'cos', 'tan')],
        fields: [field('amplitude', 'Vertical scale', 1, 0.5, 5, 0.5), field('frequency', 'Frequency', 1, 0.5, 5, 0.5), field('phase', 'Phase (°)', 0, -360, 360)] };
      case 'probability-spinner': return { fields: [field('sectors', 'Sectors', 4, 2, 12)] };
      case 'dice-coin': return { choices: [choice('experiment', 'Experiment', 'Die', 'Coin')], fields: [field('batch', 'Trials per click', 1, 1, 100)] };
      case 'matrix-tool': return { choices: [choice('matrixOp', 'Operation', ...MATRIX_OPERATIONS)] };
      case 'vector-tool': return { choices: [choice('vectorOp', 'Operation', 'Add', 'Subtract', 'Dot product')],
        fields: [field('ax', 'A x', 3, -10, 10), field('ay', 'A y', 2, -10, 10), field('bx', 'B x', 1, -10, 10), field('by', 'B y', 3, -10, 10)] };
      case 'limits-derivatives': return { fields: [x, field('step', 'Step h', 0.1, 0.001, 1, 0.001)] };
      case 'integral-graph': return { fields: [field('from', 'Integral start', 0, -10, 10, 0.5), field('to', 'Integral end', 2, -10, 10, 0.5)] };
      case 'complex-plane': return { fields: [{ ...x, key: 'real', label: 'Real part' }, { ...y, key: 'imaginary', label: 'Imaginary part' }] };
      default: return null;
    }
  });

  private readonly triangle = computed(() => {
    let a = this.n('a', 3, 0.5, 30, 0.5);
    let b = this.n('b', 4, 0.5, 30, 0.5);
    const leg = this.widget() === 'pythagorean' ? this.selected(choice('missing', 'Find', 'Hypotenuse', 'Leg a', 'Leg b')) : 'Hypotenuse';
    if (leg === 'Hypotenuse') return { a, b, c: Math.hypot(a,b) };
    const c = this.n('hypotenuse', 5, 0.5, 40, 0.5);
    if (leg === 'Leg a') a = Math.sqrt(c * c - b * b);
    else b = Math.sqrt(c * c - a * a);
    return a > 0 && b > 0 ? { a, b, c } : null;
  });
  private readonly vectors = computed(() => {
    const a: Point = [this.n('ax', 3, -10, 10), this.n('ay', 2, -10, 10)];
    const b: Point = [this.n('bx', 1, -10, 10), this.n('by', 3, -10, 10)];
    const operation = this.selected(choice('vectorOp', 'Operation', 'Add', 'Subtract', 'Dot product'));
    const result: Point = operation === 'Subtract' ? [a[0] - b[0], a[1] - b[1]] : [a[0] + b[0], a[1] + b[1]];
    return { a, b, result, operation };
  });
  private readonly integral = computed(() => {
    const from = this.n('from', 0, -10, 10, 0.5), to = this.n('to', 2, -10, 10, 0.5);
    return { from, to, value: estimateIntegral(this.expression(), from, to) };
  });
  readonly results = computed(() => {
    switch (this.widget()) {
      case 'right-triangle':
      case 'soh-cah-toa':
      case 'pythagorean': {
        const triangle = this.triangle();
        if (!triangle) return ['The hypotenuse must be longer than the known leg.'];
        const { a, b, c } = triangle;
        if (this.widget() === 'soh-cah-toa') {
          const angleA = this.selected(choice('reference', 'Reference', 'Angle A', 'Angle B')) === 'Angle A';
          const opposite = angleA ? a : b;
          const adjacent = angleA ? b : a;
          return [`sin = ${this.format(opposite)} / ${this.format(c)} ≈ ${this.format(opposite/c)}`,
            `cos = ${this.format(adjacent)} / ${this.format(c)} ≈ ${this.format(adjacent/c)}`,
            `tan = ${this.format(opposite)} / ${this.format(adjacent)} ≈ ${this.format(opposite/adjacent)}`];
        }
        return [`a = ${this.format(a)} · b = ${this.format(b)} · c = ${this.format(c)}`,
          this.widget() === 'pythagorean' ? 'a² + b² = c²' : `Angle A ≈ ${this.format(Math.atan2(a,b)*180/Math.PI)}° · Angle B ≈ ${this.format(Math.atan2(b,a)*180/Math.PI)}°`];
      }
      case 'unit-circle': {
        const degrees = this.n('angle', 45, -720, 720);
        const angle = degrees * Math.PI / 180;
        return [`${degrees}° · (${this.format(Math.cos(angle))}, ${this.format(Math.sin(angle))})`,
          'x = cos θ · y = sin θ'];
      }
      case 'angle-converter': {
        if (this.selected(choice('unit', 'Input unit', 'Degrees', 'Radians')) === 'Radians') {
          const radians = this.n('radians', 1, -20, 20, 0.001);
          return [`${radians} rad ≈ ${this.format(radians * 180 / Math.PI)}°`];
        }
        const degrees = this.n('angle', 45, -720, 720);
        return [`${degrees}° ≈ ${this.format(degrees * Math.PI / 180)} rad`];
      }
      case 'trig-graphs': return ['Horizontal axis in radians (−2π to 2π).'];
      case 'vector-tool': {
        const { a,b,result,operation } = this.vectors();
        if (operation === 'Dot product') return [`A · B = ${a[0] * b[0] + a[1] * b[1]}`];
        return [`A ${operation === 'Add' ? '+' : '−'} B = (${result.join(', ')})`, 'Magnitude ≈ ' + this.format(Math.hypot(...result))];
      }
      case 'complex-plane': {
        const real = this.n('real', 3, -12, 12, 0.5), imaginary = this.n('imaginary', 2, -12, 12, 0.5);
        return [`z = ${this.complex(real, imaginary)} · Conjugate ${this.complex(real, -imaginary)}`,
          'Magnitude ≈ ' + this.format(Math.hypot(real, imaginary)), real || imaginary
            ? 'Argument ≈ ' + this.format(Math.atan2(imaginary, real) * 180 / Math.PI) + '°' : 'Argument undefined'];
      }
      case 'limits-derivatives': {
        const x = this.n('x', 3, -12, 12, 0.5), h = this.n('step', 0.1, 0.001, 1, 0.001);
        const f = (point: number) => evaluateAt(this.expression(), point);
        const left = f(x - h), right = f(x + h), center = f(x);
        const leftSlope = left === null || center === null ? null : (center - left) / h;
        const rightSlope = right === null || center === null ? null : (right - center) / h;
        return [`f(x − h) ≈ ${this.format(left)} · f(x + h) ≈ ${this.format(right)}`,
          `f(x − h/10) ≈ ${this.format(f(x - h/10))} · f(x + h/10) ≈ ${this.format(f(x + h/10))}`,
          `Left slope ≈ ${this.format(leftSlope)} · Right slope ≈ ${this.format(rightSlope)}`];
      }
      case 'integral-graph': {
        const { from,to,value } = this.integral();
        return [value === null ? 'No estimate for this interval. Check for undefined values or discontinuities.'
          : `Signed integral from ${from} to ${to} ≈ ${this.format(value)}`];
      }
      default: return [];
    }
  });
  readonly diagram = computed<Diagram | null>(() => this.makeDiagram());

  range(length: number): number[] { return Array.from({ length }, (_, index) => index); }
  number(item: Field): number { return this.n(item.key, item.initial, item.min, item.max, item.step); }
  format(value: number | null): string {
    return value === null ? 'undefined' : String(Math.abs(value) < 1e-10 ? 0 : Number(value.toPrecision(7)));
  }
  selected(item: Choice): string {
    const value = this.state()[item.key];
    return typeof value === 'string' && item.options.includes(value) ? value : item.options[0];
  }
  setChoice(item: Choice, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (item.options.includes(value)) this.patch(item.key === 'experiment' ? { [item.key]: value, counts: [], last: -1 } : { [item.key]: value });
  }
  setNumber(item: Field, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.bound(input.valueAsNumber, this.number(item), item.min, item.max, item.step);
    input.value = String(value);
    this.patch(item.key === 'sectors' && value !== this.number(item) ? { [item.key]: value, counts: [], last: -1 } : { [item.key]: value });
  }
  changeText(key: string, event: Event): void {
    this.patch({ [key]: (event.target as HTMLInputElement).value.slice(0, key === 'dataset' ? 400 : 120) });
  }
  spinnerLabel(index: number): Point {
    const angle = (index + 0.5) * 2 * Math.PI / this.outcomeLabels().length;
    return [50 + Math.sin(angle) * 33, 50 - Math.cos(angle) * 33];
  }
  runTrial(): void {
    if (!this.editable()) return;
    const counts = [...this.counts()];
    const trials = this.widget() === 'dice-coin' ? this.n('batch', 1, 1, 100) : 1;
    let last = 0;
    for (let index = 0; index < trials; index++) {
      last = Math.floor(Math.random() * counts.length);
      counts[last] = Math.min(10000, counts[last] + 1);
    }
    this.patch({ counts, last });
  }
  resetTrials(): void { this.patch({ counts: [], last: -1 }); }
  pickUnitAngle(event: MouseEvent): void {
    if (!this.editable() || this.widget() !== 'unit-circle') return;
    const matrix = (event.currentTarget as SVGSVGElement).getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (Math.hypot(point.x - 160, point.y - 90) < 5) return;
    const degrees = Math.round(Math.atan2(90 - point.y, point.x - 160) * 180 / Math.PI);
    this.patch({ angle: (degrees + 360) % 360 });
  }
  matrix(name: 'A' | 'B'): Matrix {
    const saved = this.state()['matrix' + name];
    const fallback: Matrix = name === 'A' ? [1, 2, 3, 4] : [2, 0, 1, 2];
    return fallback.map((value, index) => this.bound(Array.isArray(saved) ? saved[index] : null, value, -20, 20)) as Matrix;
  }
  setMatrix(name: 'A' | 'B', index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const matrix = this.matrix(name);
    matrix[index] = this.bound(input.valueAsNumber, matrix[index], -20, 20);
    input.value = String(matrix[index]);
    this.patch({ ['matrix' + name]: matrix });
  }

  private string(key: string, fallback: string, max: number): string {
    const value = this.state()[key];
    return typeof value === 'string' ? value.slice(0, max) : fallback;
  }
  private n(key: string, fallback: number, min: number, max: number, step = 1): number {
    return this.bound(this.state()[key], fallback, min, max, step);
  }
  private bound(value: unknown, fallback: number, min: number, max: number, step = 1): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Number(Math.round(Math.max(min, Math.min(max, value)) / step * step).toFixed(6)) : fallback;
  }
  private patch(values: Record<string, unknown>): void {
    if (this.editable()) this.changed.emit({ ...this.state(), ...values });
  }
  private complex(real: number, imaginary: number): string {
    return real + (imaginary < 0 ? ' − ' : ' + ') + Math.abs(imaginary) + 'i';
  }
  private path(points: Point[], style: Path['style'], close = false): Path {
    return { d: 'M' + points.map(point => point.join(' ')).join(' L') + (close ? ' Z' : ''), style };
  }
  private arrow(tip: Point, center: Point, style: Path['style']): Path[] {
    const direction = Math.atan2(tip[1] - center[1], tip[0] - center[0]);
    const wing = (offset: number): Point => [tip[0] - 8 * Math.cos(direction + offset), tip[1] - 8 * Math.sin(direction + offset)];
    return Math.hypot(tip[0] - center[0], tip[1] - center[1]) < 3
      ? [] : [this.path([center, tip], style), this.path([wing(-0.5), tip, wing(0.5)], style)];
  }
  private makeDiagram(): Diagram | null {
    switch (this.widget()) {
      case 'right-triangle':
      case 'soh-cah-toa':
      case 'pythagorean': {
        const values = this.triangle();
        if (!values) return null;
        const { a,b } = values;
        const scale = Math.min(105 / a, 195 / b);
        const origin: Point = [42,145], right: Point = [42 + b * scale,145], top: Point = [42,145 - a * scale];
        return { label: 'Right triangle', paths: [this.path([origin, right, top], 'curve', true),
          this.path([[42,132],[55,132],[55,145]], 'guide')], labels: [
          { text: 'A', x: right[0] + 7, y: 148 }, { text: 'B', x: 32, y: top[1] - 4 },
          { text: 'a', x: 27, y: (top[1] + 145) / 2 }, { text: 'b', x: (42 + right[0]) / 2, y: 160 },
        ] };
      }
      case 'unit-circle': {
        const angle = this.n('angle', 45, -720, 720) * Math.PI / 180;
        const point: Point = [160 + 62*Math.cos(angle), 90 - 62*Math.sin(angle)];
        return { label: 'Unit circle and angle', paths: [
          { d: 'M98 90a62 62 0 1 0 124 0a62 62 0 1 0-124 0', style: 'axis' },
          { d: 'M74 90H246 M160 10V170', style: 'axis' },
          this.path([[160,90], point], 'curve'), this.path([point, [point[0],90]], 'guide'),
        ], dots: [point], labels: [{text: '1',x: 227,y: 104},{text: 'y',x: 166,y: 15}] };
      }
      case 'box-plot': {
        const values = this.statistics()?.five;
        if (!values) return null;
        const [min, q1, med, q3, max] = values;
        const x = (n: number) => max === min ? 160 : 25 + (n - min) / (max - min) * 270;
        return { label: 'Box and whisker plot', paths: [
          { d: `M${x(min)} 90H${x(q1)} M${x(q3)} 90H${x(max)} M${x(min)} 77V103 M${x(max)} 77V103`, style: 'axis' },
          { d: `M${x(q1)} 66H${x(q3)}V114H${x(q1)}Z`, style: 'curve' },
          { d: `M${x(med)} 66V114`, style: 'other' },
        ] };
      }
      case 'vector-tool':
      case 'complex-plane': {
        const center: Point = [160,90];
        const point = ([x,y]: Point): Point => [160 + x * 3.5,90 - y * 3.5];
        const paths: Path[] = [{d:'M75 90H245 M160 10V170',style:'axis'}];
        if (this.widget() === 'complex-plane') {
          const real = this.n('real', 3, -12, 12, 0.5), imaginary = this.n('imaginary', 2, -12, 12, 0.5);
          const plotted: Point = [160 + real * 6,90 - imaginary * 6];
          paths.push(...this.arrow(plotted, center, 'curve'));
          return { label: 'Complex plane', paths, dots: [plotted], labels: [{text:'Re',x:240,y:104},{text:'Im',x:165,y:15}] };
        }
        const { a,b,result,operation } = this.vectors();
        paths.push(...this.arrow(point(a), center, 'curve'), ...this.arrow(point(b), center, 'other'));
        if (operation !== 'Dot product') paths.push(...this.arrow(point(result), center, 'axis'));
        return { label: 'Vectors on a coordinate plane', paths };
      }
      case 'trig-graphs': {
        const fn = this.selected(choice('function', 'Function', 'sin', 'cos', 'tan'));
        const amplitude = this.n('amplitude', 1, 0.5, 5, 0.5), frequency = this.n('frequency', 1, 0.5, 5, 0.5);
        const phase = this.n('phase', 0, -360, 360) * Math.PI / 180;
        const trig = fn === 'sin' ? Math.sin : fn === 'cos' ? Math.cos : Math.tan;
        return this.graph(fn + ' graph', -2 * Math.PI, 2 * Math.PI, fn === 'tan' ? amplitude * 3 : amplitude * 1.2,
          value => amplitude * trig(frequency * value + phase), undefined, true);
      }
      case 'integral-graph': {
        const { from,to,value } = this.integral();
        const low = Math.min(-2, from - 1, to - 1), high = Math.max(2, from + 1, to + 1);
        const fn = (x: number) => evaluateAt(this.expression(), x);
        const magnitudes = this.range(21).map(i => Math.abs(fn(low + i * (high - low) / 20) ?? 0)).sort((a,b) => a-b);
        const yLimit = Math.max(2, magnitudes[18] || 0);
        return this.graph('Integral graph of ' + this.expression(), low, high, yLimit, fn,
          value === null ? undefined : [Math.min(from,to), Math.max(from,to)]);
      }
      default: return null;
    }
  }
  private graph(label: string, low: number, high: number, limit: number, fn: (x: number) => number | null,
                shade?: Point, radians = false): Diagram {
    const project = (x: number, y: number): Point => [16 + (x - low)/(high - low)*288, 86 - y/limit*72];
    const yAxis = project(0, 0)[0];
    const paths: Path[] = [{ d: `M16 86H304 M${yAxis} 12V158`, style: 'axis' }];
    const sample = (from: number, to: number, fill: boolean) => {
      let current: Point[] = [];
      let previous: number | null = null;
      const saveSegment = () => {
        if (current.length > 1) {
          const first = current[0], last = current.at(-1)!;
          paths.push(fill ? this.path([[first[0], 86], ...current, [last[0], 86]], 'shade', true) : this.path(current, 'curve'));
        }
        current = [];
      };
      for (let index = 0; index <= 180; index++) {
        const x = from + (to - from) * index / 180;
        const y = fn(x);
        if (y === null || !Number.isFinite(y) || Math.abs(y) > limit * 1.25 ||
            (previous !== null && Math.abs(y - previous) > limit)) saveSegment();
        if (y !== null && Number.isFinite(y) && Math.abs(y) <= limit * 1.25) current.push(project(x,y));
        previous = y;
      }
      saveSegment();
    };
    if (shade && shade[0] !== shade[1]) sample(shade[0], shade[1], true);
    sample(low, high, false);
    return { label, paths, labels: [
      { text: radians ? '−2π' : this.format(low), x: 16, y: 173 },
      { text: '0', x: yAxis + 4, y: 102 },
      { text: radians ? '2π' : this.format(high), x: 289, y: 173 },
    ] };
  }
}
