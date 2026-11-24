import { Component, computed, input, output, signal } from '@angular/core';
import { readActivityState } from './whiteboard-activity.component';
import { MathWidget } from './whiteboard-math-tools';

type Point = [number, number];
type Vertex = [number, number, number];
type Field = { key: string; label: string; value: number; min: number; max: number; step?: number };
type Choice = { key: string; label: string; options: readonly string[] };
type ToolForm = { fields?: Field[]; choices?: Choice[] };
const field = (key: string, label: string, value: number, min: number, max: number, step = 1): Field =>
  ({ key, label, value, min, max, step });
const choice = (key: string, label: string, ...options: string[]): Choice => ({ key, label, options });
const OPERATORS = ['+', '−', '×', '÷'] as const;
const SOLID_TYPES = ['Cube', 'Sphere', 'Cone', 'Cylinder', 'Pyramid', 'Triangular prism'] as const;
const ANGLE_PRESETS: Record<string, number> = { Acute: 45, Right: 90, Obtuse: 120, Straight: 180, Reflex: 225 };
const DEFAULT_VERTICES: Point[] = [[-4,-2],[4,-2],[0,3]];
const UNIT_GROUPS: Record<string, Record<string, number>> = {
  Length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048 },
  Mass: { mg: 0.000001, g: 0.001, kg: 1, lb: 0.45359237 },
  Volume: { mL: 0.001, L: 1, 'US gal': 3.785411784 },
};
const SOLIDS: Record<string, { vertices: Vertex[]; edges: Point[] }> = {
  Cube: {
    vertices: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    edges: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
  },
  'Triangular prism': {
    vertices: [[-1,1,-1],[1,1,-1],[0,-1,-1],[-1,1,1],[1,1,1],[0,-1,1]],
    edges: [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]],
  },
  Pyramid: {
    vertices: [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],[0,-1,0]],
    edges: [[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]],
  },
};

@Component({
  selector: 'app-whiteboard-math-kit',
  standalone: true,
  template: `
    @if (form(); as toolForm) {
      <div class="kit-controls">
        @for (item of toolForm.choices ?? []; track item.key) {
          <label>{{ item.label }} <select [attr.aria-label]="item.label" [value]="selected(item)" [disabled]="!editable()"
            (change)="select(item, $event)">
            @for (option of item.options; track option) { <option [value]="option">{{ option }}</option> }
          </select></label>
        }
        @for (item of toolForm.fields ?? []; track item.key) {
          <label>{{ item.label }} <input type="number" [attr.aria-label]="item.label" [min]="item.min" [max]="item.max"
            [step]="item.step ?? 1" [value]="numeric(item)" [readOnly]="!editable()" (change)="setField(item, $event)" /></label>
        }
      </div>
    }
    @switch (widget()) {
      @case ('number-blocks') {
        <div class="places">
          @for (place of places; track place.key) {
            <div class="place">
              <strong>{{ place.label }}</strong>
              <div class="blocks" [attr.aria-label]="place.label + ' blocks'">
                @for (block of range(placeValue(place.key)); track block) { <i [class.rod]="place.key === 'tens'" [class.flat]="place.key === 'hundreds'"></i> }
              </div>
                <div class="kit-controls">
                  <button type="button" [disabled]="!editable() || placeValue(place.key) === 0" [attr.aria-label]="'Remove ' + place.label.toLowerCase()" (click)="adjustPlace(place.key, -1)">−</button>
                  <button type="button" [disabled]="!editable() || placeValue(place.key) === 20" [attr.aria-label]="'Add ' + place.label.toLowerCase()" (click)="adjustPlace(place.key, 1)">+</button>
                </div>
            </div>
          }
        </div>
          <div class="kit-controls">
            <button type="button" [disabled]="!editable() || placeValue('ones') < 10 || placeValue('tens') === 20" (click)="trade('ones', 'tens')">Trade 10 ones</button>
            <button type="button" [disabled]="!editable() || placeValue('tens') < 10 || placeValue('hundreds') === 20" (click)="trade('tens', 'hundreds')">Trade 10 tens</button>
          </div>
        <p>Total {{ placeTotal() }}</p>
      }
      @case ('abacus') {
        <div class="places abacus">
          @for (place of places; track place.key) {
            <div class="place">
              <strong>{{ place.label }}</strong>
              <div class="beads">
                @for (bead of range(9); track bead) {
                  <button type="button" [disabled]="!editable()" [attr.aria-label]="place.label + ' bead ' + (bead + 1)"
                    [attr.aria-pressed]="bead < placeValue(place.key)" (click)="setBeads(place.key, bead + 1)"></button>
                }
              </div>
            </div>
          }
        </div>
        <p>Total {{ placeTotal() }}</p>
      }
      @case ('place-value') {
        <div class="places">
          @for (place of chartPlaces; track place.key) {
            <label class="place"><strong>{{ place.label }}</strong>
              <input type="number" [attr.aria-label]="place.label + ' digit'" min="0" max="9" step="1" [value]="placeValue(place.key)"
                [readOnly]="!editable()" (change)="setPlaceDigit(place.key, $event)" />
            </label>
          }
        </div>
        <p>{{ expandedValue() }} = <strong>{{ placeTotal() }}</strong></p>
      }
      @case ('math-operators') {
        <p class="answer">{{ arithmetic() }}</p>
      }
      @case ('multiplication-grid') {
        <table aria-label="Multiplication table">
          <thead><tr><th scope="col">×</th>@for (x of factors(); track x) { <th scope="col">{{ x }}</th> }</tr></thead>
          <tbody>@for (y of factors(); track y) {
            <tr><th scope="row">{{ y }}</th>
              @for (x of factors(); track x) {
                <td><button type="button" [disabled]="!editable()" [class.chosen]="productCell()[0] === x && productCell()[1] === y"
                  [attr.aria-label]="y + ' times ' + x" (click)="patch({ product: [x, y] })">{{ x * y }}</button></td>
              }
            </tr>
          }</tbody>
        </table>
        @if (productCell()[0] && productCell()[1]) { <p class="answer">{{ productCell()[1] }} × {{ productCell()[0] }} = {{ productCell()[0] * productCell()[1] }}</p> }
      }
      @case ('unit-converter') { <p class="answer">{{ conversion() }}</p> }
      @case ('fraction-calculator') { <p class="answer">{{ fractionAnswer() }}</p> }
      @case ('fraction-circles') {
        <div class="fraction-samples">
          @for (circle of circles(); track circle.side) {
            <div>
              <div class="fraction-disc" [class.shadeable]="editable()" [style.background]="circle.paint"
                (click)="shadeCircle(circle.side, circle.parts, circle.shaded, $event)"></div>
              <strong>{{ circle.shaded }}/{{ circle.parts }}</strong>
            </div>
          }
        </div>
      }
      @case ('fraction-number-line') {
        <div class="fraction-ticks" role="group" aria-label="Fraction ticks">
          @for (tick of range(fractionParts() + 1); track tick) {
            <button type="button" [disabled]="!editable()" [attr.aria-pressed]="markedFraction() === tick"
              (click)="patch({ tick })">{{ tick }}/{{ fractionParts() }}</button>
          }
        </div>
      }
      @case ('decimal-grid') {
        <div class="decimal-grid" role="group" aria-label="Hundredths grid">
          @for (cell of hundred; track cell) {
            <button type="button" [disabled]="!editable()" [attr.aria-label]="'Hundredth ' + (cell + 1)"
              [attr.aria-pressed]="decimalCells().has(cell)" (click)="toggleDecimal(cell)"></button>
          }
        </div>
        <div class="kit-controls">
          <strong>{{ decimalCells().size }}/100 = {{ (decimalCells().size / 100).toFixed(2) }}</strong>
          @if (editable()) { <button type="button" (click)="patch({ cells: [] })">Clear</button> }
        </div>
      }
      @case ('percentage-tool') {
        <div class="percent-bar" aria-hidden="true"><span [style.width.%]="percent()"></span></div>
        <p class="answer">{{ percent() }}% = {{ percent() }}/100 = {{ percent() / 100 }}</p>
      }
      @default {
        <svg class="kit-diagram" viewBox="0 0 300 150" role="img" [attr.aria-label]="diagram().label"
          [class.custom-polygon]="editable() && (widget() === 'angles' || (widget() === 'polygon-tools' && customPolygon()))"
          (click)="editPolygon($event)" (pointerdown)="startAngleDrag($event)" (pointermove)="moveAngleDrag($event)"
          (pointerup)="finishAngleDrag($event)" (pointercancel)="cancelAngleDrag()" (lostpointercapture)="cancelAngleDrag()">
          @for (path of diagram().paths; track $index) { <path [attr.d]="path" /> }
          @for (guide of diagram().guides; track $index) { <path class="axis-guide" [attr.d]="guide" /> }
          @for (dot of diagram().dots; track $index) {
            <circle [class.active-vertex]="widget() === 'polygon-tools' && customPolygon() && vertexIndex() === $index"
              [attr.cx]="dot[0]" [attr.cy]="dot[1]" r="4" />
          }
          @for (label of diagram().ticks; track label.value) {
            <text [attr.x]="label.x" [attr.y]="label.y" text-anchor="middle" font-size="9">{{ label.value }}</text>
          }
        </svg>
        @if (widget() === 'polygon-tools' && customPolygon() && editable()) {
          <p>Click the diagram to add or select a vertex.</p>
          <div class="kit-controls">
            <button type="button" [disabled]="vertices().length >= 12" (click)="addVertex()">Add vertex</button>
            <button type="button" [disabled]="vertices().length <= 3" (click)="removeVertex()">Remove selected vertex</button>
            <button type="button" (click)="patch({ vertices: defaultVertices, vertex: 0 })">Reset vertices</button>
          </div>
        }
        <p>{{ diagram().label }}</p>
      }
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; color: #000; }
    .kit-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; margin-bottom: 5px; }
    label { display: inline-flex; align-items: center; gap: 4px; margin: 0; color: #000; }
    input, select, button { min-height: 22px; margin: 0; padding: 2px 4px; border: 1px solid #b4c3d9; border-radius: 4px; color: #000; background: #fff; font: inherit; }
    input { width: 65px; } button { cursor: pointer; } button:disabled { cursor: default; }
    p { margin: 6px 0 0; } .answer { font-size: 1rem; font-weight: 700; }
    .places { display: flex; flex-wrap: wrap; gap: 6px; }
    .place { display: grid; justify-items: center; align-content: start; flex: 1 1 50px; padding: 4px; border: 1px solid #c5d4e8; border-radius: 5px; }
    .place input { width: 44px; text-align: center; }
    .blocks { display: flex; align-items: end; justify-content: center; flex-wrap: wrap; gap: 3px; min-height: 32px; }
    .blocks i { width: 9px; height: 9px; border: 1px solid #386e9e; background: #bedcf2; }
    .blocks .rod { height: 24px; } .blocks .flat { width: 19px; height: 19px; }
    .beads { display: grid; gap: 2px; justify-items: center; background: linear-gradient(90deg, transparent 47%, #788aa8 47% 53%, transparent 53%); }
    .beads button { width: 24px; min-height: 9px; padding: 0; border-radius: 50%; background: #f0f6fc; }
    .beads button[aria-pressed="true"], .decimal-grid button[aria-pressed="true"] { background: #4789c3; }
    table { border-collapse: collapse; } th, td { padding: 1px; text-align: center; }
    table button { min-width: 25px; } button.chosen, .fraction-ticks button[aria-pressed="true"] { background: #aee2d3; }
    .kit-diagram { display: block; width: min(100%, 330px); height: auto; background: #f6faff; border: 1px solid #c5d4e8; border-radius: 5px; }
    .kit-diagram path { fill: none; stroke: #285488; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .kit-diagram circle { fill: #a62556; }
    .kit-diagram circle.active-vertex { fill: #075d53; stroke: #fff; stroke-width: 1.5; }
    .kit-diagram path.axis-guide { stroke: #a53862; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .kit-diagram.custom-polygon { cursor: crosshair; touch-action: none; }
    .fraction-samples { display: flex; flex-wrap: wrap; gap: 12px; text-align: center; }
    .fraction-disc { width: 84px; aspect-ratio: 1; margin-bottom: 3px; border: 1px solid #6a83a8; border-radius: 50%; }
    .fraction-disc.shadeable { cursor: pointer; }
    .fraction-ticks { position: relative; display: flex; gap: 3px; width: max-content; min-width: 100%; padding-top: 13px; }
    .fraction-ticks::before { content: ''; position: absolute; inset: 8px 12px auto; border-top: 2px solid #285488; }
    .fraction-ticks button { position: relative; flex: 1; min-width: 29px; }
    .fraction-ticks button::before { content: ''; position: absolute; width: 1px; height: 8px; top: -10px; left: 50%; background: #285488; }
    .decimal-grid { display: grid; grid-template-columns: repeat(10,minmax(0,1fr)); width: min(100%, 210px); aspect-ratio: 1; gap: 1px; margin-bottom: 6px; }
    .decimal-grid button { padding: 0; min-width: 0; min-height: 0; border-radius: 0; }
    .percent-bar { width: min(100%,300px); height: 16px; border: 1px solid #6a83a8; border-radius: 4px; overflow: hidden; background: #f0f6fc; }
    .percent-bar span { display: block; height: 100%; background: #4789c3; }
  `],
})
export class WhiteboardMathKitComponent {
  readonly widget = input.required<MathWidget>();
  readonly text = input.required<string>();
  readonly editable = input(false);
  readonly changed = output<Record<string, unknown>>();
  private readonly state = computed(() => readActivityState(this.text()));
  readonly places = [{ key: 'hundreds', label: 'Hundreds' }, { key: 'tens', label: 'Tens' }, { key: 'ones', label: 'Ones' }];
  readonly chartPlaces = [{ key: 'thousands', label: 'Thousands' }, ...this.places];
  readonly hundred = this.range(100);
  readonly defaultVertices = DEFAULT_VERTICES;
  readonly customPolygon = computed(() => this.state()['polygonType'] === 'Custom');
  readonly vertices = computed<Point[]>(() => {
    const value = this.state()['vertices'];
    const points = Array.isArray(value) ? value.slice(0, 12).filter((point): point is Point =>
      Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 7 && Math.abs(point[1]) <= 3.5) : [];
    return points.length >= 3 ? points : DEFAULT_VERTICES;
  });
  readonly vertexIndex = computed(() => this.n('vertex', 0, 0, this.vertices().length - 1));
  readonly solidChoice = choice('solid', 'Solid', ...SOLID_TYPES);
  private readonly angleDraft = signal<number | null>(null);
  private anglePointer?: number;
  readonly displayedAngle = computed(() => this.angleDraft() ?? this.n('angle', 45, 1, 359));
  readonly form = computed<ToolForm | null>(() => {
    const angle = field('angle', 'Angle (°)', 45, 0, 180);
    switch (this.widget()) {
      case 'math-operators': return { fields: [field('left', 'First number', 6, -999, 999), field('right', 'Second number', 3, -999, 999)], choices: [choice('operator', 'Operator', ...OPERATORS)] };
      case 'multiplication-grid': return { fields: [field('size', 'Size', 6, 2, 12)] };
      case '3d-shapes': {
        const solid = this.selected(this.solidChoice);
        const curved = solid === 'Cone' || solid === 'Cylinder' || solid === 'Sphere';
        const size = curved ? field('radius', 'Radius', 3, 1, 12, 0.5) : field('side', 'Side length', 6, 1, 24, 0.5);
        const fields = [size];
        if (solid !== 'Cube' && solid !== 'Sphere') fields.push(field('height', 'Height', 6, 1, 24, 0.5));
        return { choices: [this.solidChoice], fields: [...fields, field('turn', 'Rotation (°)', 25, 0, 360)] };
      }
      case 'line-tools': {
        const line = choice('type', 'Line type', 'Line segment', 'Ray', 'Line');
        const fields = [field('angle', 'Direction (°)', 0, -180, 180)];
        if (this.selected(line) === 'Line segment') fields.push(field('length', 'Length', 6, 1, 10));
        return { choices: [line], fields };
      }
      case 'angles': return { choices: [choice('angleType', 'Angle type', ...Object.keys(ANGLE_PRESETS))],
        fields: [field('angle', 'Angle (°)', 45, 1, 359)] };
      case 'protractor': return { fields: [angle] };
      case 'polygon-tools': {
        const choices = [choice('polygonType', 'Polygon type', 'Regular', 'Custom')];
        if (!this.customPolygon()) return { choices, fields: [field('sides', 'Sides', 5, 3, 12)] };
        choices.push(choice('vertexChoice', 'Vertex', ...this.vertices().map((_, index) => 'Vertex ' + (index + 1))));
        return { choices, fields: [field('vertexX', 'Vertex X', 0, -7, 7, 0.5), field('vertexY', 'Vertex Y', 0, -3.5, 3.5, 0.5)] };
      }
      case 'symmetry-tools': {
        const mode = choice('symmetryMode', 'Mode', 'Reflection', 'Symmetry axes');
        if (this.selected(mode) === 'Symmetry axes') return { choices: [mode, choice('axisShape', 'Shape', 'Square', 'Rectangle', 'Equilateral triangle', 'Regular pentagon', 'Circle')] };
        return { choices: [mode, choice('axis', 'Mirror axis', 'Vertical', 'Horizontal')], fields: [field('x', 'Point X', 3, -6, 6), field('y', 'Point Y', 2, -3, 3)] };
      }
      case 'compass': return { fields: [field('radius', 'Radius', 4, 1, 6), field('sweep', 'Sweep (°)', 360, 5, 360)] };
      case 'set-square': return { choices: [choice('triangle', 'Set square', '45–45–90', '30–60–90')], fields: [field('turn', 'Rotation (°)', 0, -180, 180)] };
      case 'area-perimeter': return { fields: [field('width', 'Width', 6, 1, 20), field('height', 'Height', 4, 1, 20)] };
      case 'unit-converter': {
        const units = Object.keys(this.units());
        return { choices: [choice('category', 'Measure', ...Object.keys(UNIT_GROUPS)), choice('from', 'From', ...units), choice('to', 'To', ...units.slice(1), units[0])],
          fields: [field('amount', 'Value', 1, -10000000, 10000000, 0.001)] };
      }
      case 'fraction-circles': return { fields: [field('partsA', 'Parts A', 3, 1, 12), field('shadeA', 'Shade A', 2, 0, this.n('partsA', 3, 1, 12)),
        field('partsB', 'Parts B', 4, 1, 12), field('shadeB', 'Shade B', 3, 0, this.n('partsB', 4, 1, 12))] };
      case 'fraction-number-line': return { fields: [field('parts', 'Denominator', 4, 2, 12)] };
      case 'percentage-tool': return { fields: [field('percent', 'Percent', 25, 0, 100)] };
      case 'fraction-calculator': return { fields: [
        field('a', 'First numerator', 1, -999, 999), field('b', 'First denominator', 2, 1, 999),
        field('c', 'Second numerator', 1, -999, 999), field('d', 'Second denominator', 3, 1, 999),
      ], choices: [choice('operator', 'Operator', ...OPERATORS)] };
      default: return null;
    }
  });
  readonly factors = computed(() => this.range(this.n('size', 6, 2, 12)).map(i => i + 1));
  readonly productCell = computed<Point>(() => {
    const product = this.state()['product'];
    return Array.isArray(product) && product.length === 2 ? [Number(product[0]), Number(product[1])] : [0, 0];
  });
  readonly decimalCells = computed(() => {
    const cells = this.state()['cells'];
    return new Set<number>(Array.isArray(cells) ? cells.filter(cell => Number.isInteger(cell) && cell >= 0 && cell < 100) : []);
  });
  readonly fractionParts = computed(() => this.n('parts', 4, 2, 12));
  readonly markedFraction = computed(() => this.n('tick', -1, -1, this.fractionParts()));
  readonly percent = computed(() => this.n('percent', 25, 0, 100));
  readonly circles = computed(() => ['A', 'B'].map((side, index) => {
    const parts = this.n('parts' + side, 3 + index, 1, 12);
    const shaded = this.n('shade' + side, 2 + index, 0, parts);
    const slice = 360 / parts;
    const paint = `repeating-conic-gradient(transparent 0deg ${slice - 1}deg, #6a83a8 ${slice - 1}deg ${slice}deg), conic-gradient(#4789c3 ${shaded / parts * 100}%, #f0f6fc 0)`;
    return { side, parts, shaded, paint };
  }));
  readonly diagram = computed(() => this.makeDiagram());

  range(size: number): number[] {
    return Array.from({ length: size }, (_, index) => index);
  }

  numeric(item: Field): number {
    if (item.key === 'angle' && this.widget() === 'angles') return this.displayedAngle();
    if (item.key === 'vertexX' || item.key === 'vertexY') return this.vertices()[this.vertexIndex()][item.key === 'vertexX' ? 0 : 1];
    return this.n(item.key, item.value, item.min, item.max, item.step ?? 1);
  }

  selected(item: Choice): string {
    if (item.key === 'angleType') return this.angleType(this.displayedAngle());
    if (item.key === 'vertexChoice') return 'Vertex ' + (this.vertexIndex() + 1);
    const value = this.state()[item.key];
    if (item.key === 'solid' && value === 'Square pyramid') return 'Pyramid';
    return typeof value === 'string' && item.options.includes(value) ? value : item.options[0];
  }

  setField(item: Field, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.bound(input.valueAsNumber, this.numeric(item), item.min, item.max, item.step ?? 1);
    input.value = String(value);
    if (item.key === 'vertexX' || item.key === 'vertexY') {
      const vertices = this.vertices().map(([x, y], index): Point => index !== this.vertexIndex() ? [x, y]
        : item.key === 'vertexX' ? [value, y] : [x, value]);
      this.patch({ vertices });
      return;
    }
    this.patch({ [item.key]: value });
  }

  select(item: Choice, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!item.options.includes(value)) return;
    if (item.key === 'angleType') {
      this.patch({ angle: ANGLE_PRESETS[value] });
      return;
    }
    if (item.key === 'vertexChoice') {
      this.patch({ vertex: item.options.indexOf(value) });
      return;
    }
    this.patch(item.key === 'category' ? { category: value, from: null, to: null } : { [item.key]: value });
  }

  editPolygon(event: MouseEvent): void {
    if (!this.editable() || this.widget() !== 'polygon-tools' || !this.customPolygon()) return;
    const matrix = (event.currentTarget as SVGSVGElement).getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const close = this.vertices().findIndex(([x, y]) => Math.hypot(150 + x * 20 - point.x, 75 - y * 20 - point.y) < 10);
    if (close >= 0) this.patch({ vertex: close });
    else if (this.vertices().length < 12) this.patch({
      vertices: [...this.vertices(), [this.bound((point.x - 150) / 20, 0, -7, 7, 0.5),
        this.bound((75 - point.y) / 20, 0, -3.5, 3.5, 0.5)]],
      vertex: this.vertices().length,
    });
  }

  addVertex(): void {
    if (this.vertices().length >= 12) return;
    this.patch({ vertices: [...this.vertices(), [0, 0]], vertex: this.vertices().length });
  }

  removeVertex(): void {
    if (this.vertices().length > 3) this.patch({
      vertices: this.vertices().filter((_, index) => index !== this.vertexIndex()),
      vertex: Math.max(0, this.vertexIndex() - 1),
    });
  }

  private angleType(angle: number): string {
    if (angle < 90) return 'Acute';
    if (angle === 90) return 'Right';
    if (angle < 180) return 'Obtuse';
    return angle === 180 ? 'Straight' : 'Reflex';
  }

  startAngleDrag(event: PointerEvent): void {
    if (!this.editable() || this.widget() !== 'angles' || event.button !== 0 || this.anglePointer !== undefined) return;
    event.preventDefault();
    this.anglePointer = event.pointerId;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.moveAngleDrag(event);
  }

  moveAngleDrag(event: PointerEvent): void {
    if (event.pointerId !== this.anglePointer) return;
    const matrix = (event.currentTarget as SVGSVGElement).getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (Math.hypot(point.x - 150, 75 - point.y) < 5) return;
    const angle = (Math.atan2(75 - point.y, point.x - 150) * 180 / Math.PI + 360) % 360;
    this.angleDraft.set(this.bound(angle, 45, 1, 359));
  }

  finishAngleDrag(event: PointerEvent): void {
    if (event.pointerId !== this.anglePointer) return;
    this.moveAngleDrag(event);
    const angle = this.angleDraft();
    if (angle !== null) this.patch({ angle });
    this.cancelAngleDrag();
  }

  cancelAngleDrag(): void {
    this.anglePointer = undefined;
    this.angleDraft.set(null);
  }

  patch(values: Record<string, unknown>): void {
    if (this.editable()) this.changed.emit({ ...this.state(), ...values });
  }

  placeValue(key: string): number {
    return this.n(key, 0, 0, this.widget() === 'number-blocks' ? 20 : 9);
  }

  setPlaceDigit(key: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.bound(input.valueAsNumber, this.placeValue(key), 0, 9);
    input.value = String(value);
    this.patch({ [key]: value });
  }

  placeTotal(): number {
    return this.chartPlaces.reduce((total, place, index) => total + this.placeValue(place.key) * 10 ** (3 - index), 0);
  }

  expandedValue(): string {
    return this.chartPlaces.map((place, index) => this.placeValue(place.key) * 10 ** (3 - index)).filter(Boolean).join(' + ') || '0';
  }

  adjustPlace(key: string, step: number): void {
    this.patch({ [key]: this.placeValue(key) + step });
  }

  setBeads(key: string, count: number): void {
    this.patch({ [key]: this.placeValue(key) === count ? count - 1 : count });
  }

  trade(from: string, to: string): void {
    if (this.placeValue(from) >= 10 && this.placeValue(to) < 20) {
      this.patch({ [from]: this.placeValue(from) - 10, [to]: this.placeValue(to) + 1 });
    }
  }

  arithmetic(): string {
    const a = this.n('left', 6, -999, 999), b = this.n('right', 3, -999, 999);
    const op = this.selected(choice('operator', 'Operator', ...OPERATORS));
    const result = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
    return `${a} ${op} ${b} = ${Number.isFinite(result) ? this.round(result) : 'Undefined'}`;
  }

  conversion(): string {
    const units = this.units();
    const names = Object.keys(units);
    const from = this.selected(choice('from', 'From', ...names));
    const to = this.selected(choice('to', 'To', ...names.slice(1), names[0]));
    const amount = this.n('amount', 1, -10000000, 10000000, 0.001);
    return `${amount} ${from} = ${this.round(amount * units[from] / units[to])} ${to}`;
  }

  fractionAnswer(): string {
    const a = this.n('a', 1, -999, 999), b = this.n('b', 2, 1, 999);
    const c = this.n('c', 1, -999, 999), d = this.n('d', 3, 1, 999);
    const op = this.selected(choice('operator', 'Operator', ...OPERATORS));
    const prefix = `${a}/${b} ${op} ${c}/${d} = `;
    if (op === '÷' && c === 0) return prefix + 'Undefined';
    const numerator = op === '+' ? a * d + c * b : op === '−' ? a * d - c * b : op === '×' ? a * c : a * d;
    const denominator = op === '÷' ? b * c : b * d;
    const factor = this.gcd(Math.abs(numerator), Math.abs(denominator)) * Math.sign(denominator);
    return prefix + numerator / factor + '/' + denominator / factor;
  }

  toggleDecimal(cell: number): void {
    const cells = new Set(this.decimalCells());
    if (!cells.delete(cell)) cells.add(cell);
    this.patch({ cells: [...cells] });
  }

  shadeCircle(side: string, parts: number, shaded: number, event: MouseEvent): void {
    if (!this.editable()) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    if (Math.hypot(x, y) > box.width / 2) return;
    const angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
    const count = Math.floor(angle / (Math.PI * 2) * parts) + 1;
    this.patch({ ['shade' + side]: count === shaded ? count - 1 : count });
  }

  private units(): Record<string, number> {
    return UNIT_GROUPS[this.selected(choice('category', 'Measure', ...Object.keys(UNIT_GROUPS)))];
  }

  private n(key: string, fallback: number, min: number, max: number, step = 1): number {
    return this.bound(this.state()[key], fallback, min, max, step);
  }

  private bound(value: unknown, fallback: number, min: number, max: number, step = 1): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return Math.min(max, Math.max(min, fallback));
    return Number(Math.min(max, Math.max(min, Math.round(value / step) * step)).toFixed(6));
  }

  private round(value: number): number {
    return Number(value.toPrecision(8));
  }

  private gcd(a: number, b: number): number {
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }

  private polar(center: Point, radius: number, degrees: number): Point {
    const angle = degrees * Math.PI / 180;
    return [center[0] + radius * Math.cos(angle), center[1] - radius * Math.sin(angle)];
  }

  private segment(from: Point, to: Point): string {
    return 'M' + from.join(' ') + ' L' + to.join(' ');
  }

  private arc(center: Point, radius: number, sweep: number): string {
    const start = this.polar(center, radius, 0);
    const end = this.polar(center, radius, sweep);
    return 'M' + start.join(' ') + ' A' + radius + ' ' + radius + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 0 ' + end.join(' ');
  }

  private solidDiagram(): { paths: string[]; label: string } {
    const solid = this.selected(this.solidChoice);
    const angle = this.n('turn', 25, 0, 360) * Math.PI / 180;
    const side = this.n('side', 6, 1, 24, 0.5);
    const radius = this.n('radius', 3, 1, 12, 0.5);
    const height = solid === 'Cube' ? side : solid === 'Sphere' ? radius * 2 : this.n('height', 6, 1, 24, 0.5);
    const curved = solid === 'Sphere' || solid === 'Cone' || solid === 'Cylinder';
    const width = curved ? radius * 2 : side;
    const scale = Math.min(11, 120 / (height + width * 0.45));
    const project = ([x, y, z]: Vertex): Point => [
      150 + (x * Math.cos(angle) - z * Math.sin(angle)) * scale,
      75 + (y + (x * Math.sin(angle) + z * Math.cos(angle)) * 0.3) * scale,
    ];
    const paths: string[] = [];
    const mesh = SOLIDS[solid];
    if (mesh) {
      const vertices = mesh.vertices.map(([x, y, z]) => project([x * side / 2, y * height / 2, z * side / 2]));
      for (const [a, b] of mesh.edges) paths.push(this.segment(vertices[a], vertices[b]));
    } else {
      const ring = (point: (theta: number) => Vertex) => {
        const coordinates = this.range(32).map(index => project(point(index * Math.PI / 16)));
        paths.push('M' + coordinates.map(value => value.join(' ')).join(' L') + ' Z');
      };
      const radial = (theta: number, y: number): Vertex => [radius * Math.cos(theta), y, radius * Math.sin(theta)];
      if (solid === 'Sphere') {
        ring(theta => radial(theta, 0));
        for (const direction of [0, Math.PI / 3, Math.PI * 2 / 3]) {
          ring(theta => [radius * Math.cos(direction) * Math.cos(theta), radius * Math.sin(theta),
            radius * Math.sin(direction) * Math.cos(theta)]);
        }
      } else {
        ring(theta => radial(theta, height / 2));
        if (solid === 'Cylinder') ring(theta => radial(theta, -height / 2));
        const apex = project([0, -height / 2, 0]);
        for (const edge of [-angle, Math.PI - angle]) {
          paths.push(this.segment(project(radial(edge, height / 2)), solid === 'Cone' ? apex : project(radial(edge, -height / 2))));
        }
      }
    }
    const dimension = curved ? 'Radius ' + radius : 'Side ' + side;
    const heightLabel = solid === 'Sphere' || solid === 'Cube' ? '' : ' · Height ' + height;
    return { paths, label: solid + ' wireframe · ' + dimension + heightLabel };
  }

  private makeDiagram(): { label: string; paths: string[]; guides: string[]; dots: Point[]; ticks: { value: number; x: number; y: number }[] } {
    const center: Point = [150, 75];
    const dots: Point[] = [];
    const paths: string[] = [];
    const guides: string[] = [];
    const ticks: { value: number; x: number; y: number }[] = [];
    let label = '';
    switch (this.widget()) {
      case '3d-shapes': {
        const solid = this.solidDiagram();
        paths.push(...solid.paths);
        label = solid.label;
        break;
      }
      case 'line-tools': {
        const type = this.selected(choice('type', 'Line type', 'Line segment', 'Ray', 'Line'));
        const angle = this.n('angle', 0, -180, 180);
        const length = this.n('length', 6, 1, 10);
        const isSegment = type === 'Line segment';
        const radius = isSegment ? length * 6 : 67;
        const from = type === 'Ray' ? center : this.polar(center, radius, angle + 180);
        const to = this.polar(center, radius, angle);
        paths.push(this.segment(from, to));
        if (!isSegment) {
          paths.push(this.segment(this.polar(to, 10, angle + 150), to) + ' L' + this.polar(to, 10, angle - 150).join(' '));
          if (type === 'Line') paths.push(this.segment(this.polar(from, 10, angle + 30), from) + ' L' + this.polar(from, 10, angle - 30).join(' '));
        }
        if (type !== 'Line') dots.push(from);
        if (isSegment) dots.push(to);
        label = isSegment ? 'Line segment of ' + length + ' units' : type;
        break;
      }
      case 'angles':
      case 'protractor': {
        const protractor = this.widget() === 'protractor';
        const angle = protractor ? this.n('angle', 45, 0, 180) : this.displayedAngle();
        const vertex: Point = protractor ? [150, 132] : center;
        if (protractor) {
          paths.push(this.arc(vertex, 110, 180));
          for (let tick = 0; tick <= 180; tick += 10) {
            paths.push(this.segment(this.polar(vertex, tick % 30 ? 104 : 98, tick), this.polar(vertex, 110, tick)));
            if (tick % 30 === 0) {
              const [x, y] = this.polar(vertex, 119, tick);
              ticks.push({ value: tick, x, y: y + 3 });
            }
          }
        }
        const arm = protractor ? 89 : 61;
        paths.push(this.segment(vertex, this.polar(vertex, arm, 0)), this.segment(vertex, this.polar(vertex, arm, angle)));
        if (angle > 0) paths.push(this.arc(vertex, 29, angle));
        dots.push(vertex);
        label = (protractor ? 'Angle' : this.angleType(angle) + ' angle') + ' ' + angle + '°';
        break;
      }
      case 'polygon-tools': {
        if (this.customPolygon()) {
          const vertices = this.vertices().map(([x, y]): Point => [150 + x * 20, 75 - y * 20]);
          paths.push('M' + vertices.map(point => point.join(' ')).join(' L') + ' Z');
          dots.push(...vertices);
          label = 'Custom polygon · ' + vertices.length + ' vertices';
          break;
        }
        const sides = this.n('sides', 5, 3, 12);
        const vertices = this.range(sides).map(index => this.polar(center, 59, 90 + index * 360 / sides));
        paths.push('M' + vertices.map(point => point.join(' ')).join(' L') + ' Z');
        dots.push(...vertices);
        label = `Regular polygon · ${sides} sides · Interior angles ${this.round((sides - 2) * 180 / sides)}°`;
        break;
      }
      case 'symmetry-tools': {
        if (this.state()['symmetryMode'] === 'Symmetry axes') {
          const shape = this.selected(choice('axisShape', 'Shape', 'Square', 'Rectangle', 'Equilateral triangle', 'Regular pentagon', 'Circle'));
          const axes = shape === 'Rectangle' ? 2 : shape === 'Equilateral triangle' ? 3 : shape === 'Regular pentagon' ? 5 : 4;
          if (shape === 'Circle') paths.push('M102 75a48 48 0 1 0 96 0a48 48 0 1 0-96 0');
          else if (shape === 'Rectangle') paths.push('M76 45h148v60H76Z');
          else {
            const vertices = this.range(axes).map(index => this.polar(center, 54, (shape === 'Square' ? 45 : 90) + index * 360 / axes));
            paths.push('M' + vertices.map(value => value.join(' ')).join(' L') + ' Z');
          }
          for (const index of this.range(axes)) {
            const angle = (axes % 2 ? 90 : 0) + index * 180 / axes;
            guides.push(this.segment(this.polar(center, 65, angle + 180), this.polar(center, 65, angle)));
          }
          label = shape + ' · ' + (shape === 'Circle' ? 'Infinitely many symmetry axes' : axes + ' symmetry axes');
          break;
        }
        const vertical = this.selected(choice('axis', 'Mirror axis', 'Vertical', 'Horizontal')) === 'Vertical';
        const x = this.n('x', 3, -6, 6), y = this.n('y', 2, -3, 3);
        const reflected: Point = vertical ? [-x, y] : [x, -y];
        guides.push(vertical ? 'M150 8 V142' : 'M15 75 H285');
        dots.push([150 + x * 18, 75 - y * 18], [150 + reflected[0] * 18, 75 - reflected[1] * 18]);
        label = `(${x}, ${y}) → (${reflected.join(', ')})`;
        break;
      }
      case 'compass': {
        const radius = this.n('radius', 4, 1, 6);
        const sweep = this.n('sweep', 360, 5, 360);
        if (sweep === 360) paths.push(this.arc(center, radius * 10, 180) + ` A${radius * 10} ${radius * 10} 0 0 0 ${150 + radius * 10} 75`);
        else paths.push(this.arc(center, radius * 10, sweep));
        paths.push(this.segment(center, this.polar(center, radius * 10, sweep)));
        dots.push(center);
        label = `Radius ${radius} units · Sweep ${sweep}°`;
        break;
      }
      case 'set-square': {
        const angles = this.selected(choice('triangle', 'Set square', '45–45–90', '30–60–90'));
        const rotation = this.n('turn', 0, -180, 180) * Math.PI / 180;
        const vertices = ([[0, 0], [62, 0], [0, angles === '45–45–90' ? 62 : 62 / Math.sqrt(3)]] as Point[]).map(([x, y]): Point =>
          [center[0] + x * Math.cos(rotation) - y * Math.sin(rotation), center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)]);
        paths.push('M' + vertices.map(point => point.join(' ')).join(' L') + ' Z');
        dots.push(vertices[0]);
        label = angles + ' set square';
        break;
      }
      case 'area-perimeter': {
        const width = this.n('width', 6, 1, 20), height = this.n('height', 4, 1, 20);
        paths.push(`M30 18 h${width * 6} v${height * 6} h-${width * 6} Z`);
        label = `Area ${width * height} square units · Perimeter ${2 * (width + height)} units`;
        break;
      }
    }
    return { label, paths, guides, dots, ticks };
  }
}
