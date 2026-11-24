import { Component, ElementRef, effect, inject, input, output, signal } from '@angular/core';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { AngleUnit, calculate } from './whiteboard-calculator';

interface PanelPosition { x: number; y: number; }
export interface CalculatorPreview {
  expression: string;
  calculation: string;
  error: string;
  mode: 'standard' | 'scientific';
  angleUnit: AngleUnit;
}

@Component({
  selector: 'app-whiteboard-calculator',
  standalone: true,
  imports: [ThemeIconComponent],
  template: `
    <section [attr.aria-label]="shared() ? 'Teacher’s calculator' : 'Class calculator'">
      <div class="calculator-header">
        <button type="button" class="drag" aria-label="Move calculator" title="Drag or use the arrow keys to move"
          (pointerdown)="beginDrag($event)" (pointermove)="drag($event)" (pointerup)="endDrag()"
          (pointercancel)="endDrag()" (lostpointercapture)="endDrag()" (keydown)="moveWithKey($event)">
          <app-theme-icon name="calculator" /> <span>{{ shared() ? 'Teacher’s calculator' : 'Calculator' }}</span>
        </button>
        @if (position()) {
          <button type="button" class="header-button" title="Dock below Slides" aria-label="Dock calculator"
            (click)="dock()">↙</button>
        }
        @if (!shared()) {
          <button type="button" class="header-button" title="Close calculator" aria-label="Close calculator"
            (click)="closed.emit()">×</button>
        }
      </div>
      <div class="calculator-body">
        @if (shared(); as live) {
          <div class="shared-mode">{{ live.mode === 'scientific' ? 'Scientific · ' + live.angleUnit.toUpperCase() : 'Standard' }} · Live</div>
          @if (live.calculation) { <div class="calculation-history">{{ live.calculation }} =</div> }
          <output class="display shared-display" aria-label="Teacher calculation">{{ live.expression || '0' }}</output>
          @if (live.error) { <p class="calculation-error" role="status">{{ live.error }}</p> }
        } @else {
        @if (sharingAvailable() || sharingUnavailable()) {
          <button type="button" class="share-button" [disabled]="!sharingAvailable()"
            [attr.aria-pressed]="sharingAvailable() && sharing()" (click)="sharing.set(!sharing())">
            {{ sharingAvailable() && sharing() ? 'Sharing live' : 'Share with class' }}
          </button>
          @if (sharingUnavailable(); as reason) { <div class="shared-mode">{{ reason }}</div> }
        }
        <select aria-label="Calculator mode" [value]="mode()" (change)="setMode($event)">
          <option value="standard">Standard</option>
          <option value="scientific">Scientific</option>
        </select>
        @if (calculation()) { <div class="calculation-history">{{ calculation() }} =</div> }
        <input class="display" aria-label="Calculator expression" inputmode="none" autocomplete="off" spellcheck="false"
          maxlength="160" [value]="expression()" [placeholder]="'0'" (input)="edit($event)"
          (keydown.enter)="run($event)" (keydown.escape)="clear()" />
        @if (error()) { <p class="calculation-error" role="status">{{ error() }}</p> }
        @if (mode() === 'scientific') {
          <div class="keypad scientific" role="group" aria-label="Scientific functions">
            <button type="button" aria-label="Angle unit" [title]="angleUnit() === 'deg' ? 'Degrees' : 'Radians'"
              (click)="changeAngleUnit()">{{ angleUnit().toUpperCase() }}</button>
            @for (key of scientificKeys; track key.token) {
              <button type="button" [title]="key.label" (click)="append(key.token)">{{ key.face }}</button>
            }
          </div>
        }
        <div class="keypad" role="group" aria-label="Calculator keypad">
          <button type="button" aria-label="Clear calculation" (click)="clear()">C</button>
          <button type="button" aria-label="Delete last character" (click)="backspace()">⌫</button>
          <button type="button" aria-label="Percent" (click)="append('%')">%</button>
          <button type="button" class="operator" aria-label="Divide" (click)="append('÷')">÷</button>
          @for (key of basicKeys; track key) {
            <button type="button" [class.operator]="operators.includes(key)" (click)="append(key)">{{ key }}</button>
          }
          <button type="button" class="equals" aria-label="Calculate result" (click)="run()">=</button>
        </div>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    :host(.floating) { position: fixed; z-index: 40; width: min(270px, calc(100vw - 16px)); }
    section { display: flex; flex-direction: column; box-sizing: border-box; max-height: calc(100dvh - 16px);
      overflow: hidden; border: 1px solid #c8d9d1; border-radius: 9px; background: #f7faf8; color: #142d2b; }
    :host(.floating) section { box-shadow: 0 10px 30px #173c3d30; }
    .calculator-header { display: flex; align-items: center; gap: 2px; min-width: 0; padding: 3px; background: #e6f0ea; }
    .calculator-header button { min-height: 26px; margin: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; }
    .drag { display: flex; flex: 1; align-items: center; gap: 4px; min-width: 0; padding: 2px; font: inherit; font-size: .75rem;
      font-weight: 700; cursor: grab; touch-action: none; }
    .drag:active { cursor: grabbing; }
    .drag span { overflow: hidden; text-overflow: ellipsis; }
    .drag app-theme-icon { width: 15px; height: 15px; }
    .header-button { flex: none; width: 21px; padding: 0; font: inherit; font-size: .95rem; cursor: pointer; }
    .header-button:hover { background: #d4e6dc; }
    .calculator-body { display: grid; gap: 5px; min-height: 0; overflow-y: auto; padding: 5px; }
    select, .display, .keypad button { box-sizing: border-box; width: 100%; min-width: 0; margin: 0; border: 1px solid #c8d9d1;
      border-radius: 4px; background: #fff; color: #152e2d; font: inherit; }
    select { min-height: 25px; padding: 2px; font-size: .7rem; }
    .display { min-height: 34px; padding: 4px; text-align: end; font-size: .9rem; font-variant-numeric: tabular-nums; }
    .keypad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2px; }
    .keypad button { min-height: 27px; padding: 0 1px; color: #000; font-size: .76rem; font-weight: 600; cursor: pointer; }
    .keypad button:hover { background: #edf5f0; }
    .keypad .operator, .scientific button { background: #e9f1f6; }
    .scientific button { font-size: .66rem; }
    .keypad .equals { grid-column: span 2; background: #d5eee7; border-color: #a6cfc3; }
    .keypad .equals:hover { background: #c4e5da; }
    .calculation-error { margin: 0; color: #9a1c42; font-size: .7rem; }
    .calculation-history, .shared-mode { overflow-wrap: anywhere; color: #3e5551; font-size: .7rem; }
    .calculation-history { text-align: end; }
    .shared-display { display: block; overflow-wrap: anywhere; border: 1px solid #c8d9d1; }
    .share-button { min-height: 23px; padding: 2px 4px; border: 1px solid #c8d9d1; border-radius: 4px;
      background: #fff; color: #153e36; font: inherit; font-size: .7rem; }
    .share-button[aria-pressed="true"] { background: #dff0e6; }
  `],
  host: {
    '[class.floating]': 'position() !== null',
    '[style.left.px]': 'position()?.x',
    '[style.top.px]': 'position()?.y',
    '(window:resize)': 'clampPosition()',
  },
})
export class WhiteboardCalculatorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly shared = input<CalculatorPreview | null>(null);
  readonly initialMode = input<'standard' | 'scientific'>('standard');
  readonly sharingAvailable = input(false);
  readonly sharingUnavailable = input('');
  readonly sharing = signal(true);
  readonly closed = output<void>();
  readonly previewChanged = output<CalculatorPreview | null>();
  readonly position = signal<PanelPosition | null>(null);
  readonly mode = signal<'standard' | 'scientific'>('standard');
  readonly angleUnit = signal<AngleUnit>('deg');
  readonly expression = signal('');
  readonly calculation = signal('');
  readonly error = signal('');
  readonly operators = ['+', '−', '×'];
  readonly basicKeys = ['7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.'];
  readonly scientificKeys = [
    { face: '(', token: '(', label: 'Open parenthesis' },
    { face: ')', token: ')', label: 'Close parenthesis' },
    { face: 'xʸ', token: '^', label: 'Power' },
    { face: 'sin', token: 'sin(', label: 'Sine' },
    { face: 'cos', token: 'cos(', label: 'Cosine' },
    { face: 'tan', token: 'tan(', label: 'Tangent' },
    { face: '√', token: 'sqrt(', label: 'Square root' },
    { face: 'log', token: 'log(', label: 'Base 10 logarithm' },
    { face: 'ln', token: 'ln(', label: 'Natural logarithm' },
    { face: 'π', token: 'π', label: 'Pi' },
    { face: 'e', token: 'e', label: 'Euler’s number' },
  ];
  private evaluated = false;
  private pointer?: { id: number; x: number; y: number; origin: PanelPosition };

  constructor() {
    effect(() => this.mode.set(this.initialMode()));
    effect(() => {
      this.previewChanged.emit(this.sharingAvailable() && this.sharing() ? {
        expression: this.expression(), calculation: this.calculation(), error: this.error(),
        mode: this.mode(), angleUnit: this.angleUnit(),
      } : null);
    });
  }

  setMode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.mode.set(value === 'scientific' ? 'scientific' : 'standard');
    window.requestAnimationFrame(() => this.clampPosition());
  }

  changeAngleUnit(): void {
    this.angleUnit.update(unit => unit === 'deg' ? 'rad' : 'deg');
  }

  append(token: string): void {
    const reset = this.evaluated && !['+', '−', '×', '÷', '^', '%'].includes(token);
    this.editValue((reset ? '' : this.expression()) + token);
  }

  edit(event: Event): void {
    this.editValue((event.target as HTMLInputElement).value);
  }

  backspace(): void {
    this.editValue(this.expression().slice(0, -1));
  }

  clear(): void {
    this.editValue('');
  }

  run(event?: Event): void {
    event?.preventDefault();
    const expression = this.expression().trim();
    if (!expression) return;
    try {
      const result = calculate(expression, this.angleUnit());
      this.calculation.set(expression);
      this.expression.set(String(Number(result.toPrecision(14))));
      this.error.set('');
      this.evaluated = true;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Check the calculation');
    }
  }

  private editValue(value: string): void {
    this.expression.set(value.slice(0, 160));
    this.calculation.set('');
    this.error.set('');
    this.evaluated = false;
  }

  beginDrag(event: PointerEvent): void {
    if (event.button !== 0 || this.pointer) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: rect.left, y: rect.top } };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  drag(event: PointerEvent): void {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!this.position() && Math.hypot(dx, dy) < 4) return;
    this.setPosition({ x: pointer.origin.x + dx, y: pointer.origin.y + dy });
  }

  endDrag(): void {
    this.pointer = undefined;
    this.clampPosition();
  }

  moveWithKey(event: KeyboardEvent): void {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.setPosition({ x: rect.left + offset[0], y: rect.top + offset[1] });
  }

  dock(): void {
    this.position.set(null);
  }

  clampPosition(): void {
    const position = this.position();
    if (position) this.setPosition(position);
  }

  private setPosition(position: PanelPosition): void {
    const width = Math.min(270, window.innerWidth - 16);
    const height = Math.min(this.host.nativeElement.offsetHeight, window.innerHeight - 16);
    this.position.set({
      x: Math.round(Math.max(8, Math.min(position.x, window.innerWidth - width - 8))),
      y: Math.round(Math.max(8, Math.min(position.y, window.innerHeight - height - 8))),
    });
  }
}
