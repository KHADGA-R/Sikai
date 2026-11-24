import { Component, computed, effect, input, output, signal } from '@angular/core';

export type ActivityWidget = 'pie' | 'timer';
interface Slice { label: string; value: number; }

export function readActivityState(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

@Component({
  selector: 'app-whiteboard-activity',
  standalone: true,
  template: `
    @if (widget() === 'timer') {
      <div class="timer" [class.finished]="finished()">
        <div class="dial" [style.--remaining]="secondsLeft() / timer().duration * 100 + '%'">
          <div class="clock" role="timer" aria-label="Time remaining">{{ clock() }}</div>
        </div>
        <span class="timer-status">{{ timerStatus() }}</span>
        @if (editable()) {
          <div class="controls">
            <label>Seconds <input type="number" aria-label="Timer duration in seconds" min="1" max="3600" step="1"
              [disabled]="running()" [value]="timer().duration" (change)="setDuration($event)" /></label>
            @if (running()) {
              <button type="button" (click)="pause()">Pause</button>
            } @else {
              <button type="button" (click)="start()">{{ timer().paused && !finished() ? 'Resume' : 'Start' }}</button>
            }
            <button type="button" (click)="reset()">Reset</button>
          </div>
        }
      </div>
    } @else {
      <div class="pie-layout">
        <div class="pie" role="img" aria-label="Pie chart" [style.background]="pieGradient()"></div>
        <div class="slice-editor">
          @if (editable()) {
            <div class="controls">
              <button type="button" [disabled]="slices().length >= maxSlices" (click)="addSlice()">+ Slice</button>
              <button type="button" (click)="equalize()">Equal slices</button>
            </div>
          }
          <ul aria-label="Pie chart slices">
            @for (slice of slices(); track $index; let index = $index) {
              <li>
                <span class="swatch" aria-hidden="true" [style.background]="colors[index]"></span>
                @if (editable()) {
                  <input [attr.aria-label]="'Slice ' + (index + 1) + ' label'" maxlength="24" [value]="slice.label"
                    (change)="editSlice(index, $event, false)" />
                  <input type="number" min="0.0001" max="10000" step="any"
                    [attr.aria-label]="'Slice ' + (index + 1) + ' size'" [value]="slice.value"
                    (change)="editSlice(index, $event, true)" />
                } @else {
                  <span class="slice-label">{{ slice.label }}</span>
                }
                <span>{{ share(slice.value) }}%</span>
                @if (editable()) {
                  <button type="button" class="split" [disabled]="slices().length >= maxSlices || slice.value < 0.0002"
                    [attr.aria-label]="'Split slice ' + (index + 1)" (click)="splitSlice(index)">Split</button>
                  <button type="button" class="remove" [disabled]="slices().length === 1"
                    [attr.aria-label]="'Remove slice ' + (index + 1)" (click)="removeSlice(index)">×</button>
                }
              </li>
            }
          </ul>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-height: 0; overflow: auto; flex: 1; container-type: inline-size; padding: 8px 8px 16px; color: #162846; font-size: .75rem; }
    .timer { display: grid; justify-items: center; gap: 5px; }
    .dial { width: clamp(56px, 22cqw, 88px); aspect-ratio: 1; border-radius: 50%; padding: 6px; box-sizing: border-box;
      background: conic-gradient(#287052 var(--remaining), #e6edf5 0); }
    .clock { height: 100%; display: grid; place-items: center; border-radius: 50%; background: #fff; color: #142544;
      font-size: 1.12rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .timer-status { font-weight: 600; }
    .finished .timer-status { color: #a1143a; }
    .controls { display: flex; justify-content: center; flex-wrap: wrap; align-items: center; gap: 4px; }
    label { display: flex; align-items: center; gap: 4px; margin: 0; }
    button, input { box-sizing: border-box; min-height: 23px; margin: 0; padding: 2px 4px; border: 1px solid #b4c3d9; border-radius: 4px;
      background: #fff; color: inherit; font: inherit; }
    button { cursor: pointer; background: #eff5fb; white-space: nowrap; }
    button:disabled { opacity: .5; cursor: default; }
    input[type="number"] { width: 58px; }
    .pie-layout { display: flex; flex-wrap: wrap; align-items: start; justify-content: center; gap: 8px; }
    .pie { width: clamp(60px, 24cqw, 110px); aspect-ratio: 1; border: 1px solid #bdcbe0; border-radius: 50%; }
    .slice-editor { flex: 1 1 210px; min-width: 0; }
    ul { display: grid; gap: 3px; padding: 0; margin: 4px 0 0; list-style: none; }
    li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 20px; }
    .swatch { width: 10px; height: 10px; flex: none; border-radius: 2px; }
    .slice-label, input:not([type="number"]) { flex: 1; min-width: 42px; overflow-wrap: anywhere; }
    .split, .remove { padding-inline: 4px; }
  `],
})
export class WhiteboardActivityComponent {
  readonly widget = input.required<ActivityWidget>();
  readonly text = input.required<string>();
  readonly editable = input(false);
  readonly changed = output<string>();
  readonly maxSlices = 12;
  readonly colors = ['#426caa', '#ea8246', '#3e947a', '#bf5983', '#9984bd', '#e8b247',
    '#5c9ba5', '#b96855', '#7e9d49', '#8262a1', '#e27991', '#5c6478'];
  private readonly state = computed(() => readActivityState(this.text()));
  private readonly now = signal(Date.now());
  readonly timer = computed(() => {
    const state = this.state();
    const duration = Math.round(this.number(state['duration'], 60, 1, 3600));
    return {
      duration,
      remaining: Math.round(this.number(state['remaining'], duration, 0, duration)),
      deadline: this.number(state['deadline'], 0, 0, Number.MAX_SAFE_INTEGER),
      paused: state['paused'] === true,
    };
  });
  readonly secondsLeft = computed(() => {
    const { remaining, deadline, duration } = this.timer();
    return deadline ? Math.max(0, Math.min(duration, Math.ceil((deadline - this.now()) / 1000))) : remaining;
  });
  readonly running = computed(() => this.timer().deadline > 0 && this.secondsLeft() > 0);
  readonly finished = computed(() => this.secondsLeft() === 0);
  readonly clock = computed(() => {
    const seconds = this.secondsLeft();
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  });
  readonly timerStatus = computed(() => this.running() ? 'Running' : this.finished() ? 'Time’s up!'
    : this.timer().paused ? 'Paused' : 'Ready');

  readonly slices = computed<Slice[]>(() => {
    const saved = this.state()['slices'];
    if (!Array.isArray(saved) || !saved.length) {
      return Array.from({ length: 4 }, (_, index) => ({ label: 'Slice ' + (index + 1), value: 1 }));
    }
    return saved.slice(0, this.maxSlices).map((slice, index) => ({
      label: typeof slice?.label === 'string' ? slice.label.slice(0, 24) : 'Slice ' + (index + 1),
      value: this.number(slice?.value, 1, 0.0001, 10000),
    }));
  });
  readonly total = computed(() => this.slices().reduce((sum, slice) => sum + slice.value, 0));
  share(value: number): number {
    return Math.round(value / this.total() * 1000) / 10;
  }
  readonly pieGradient = computed(() => {
    let end = 0;
    const stops = this.slices().map((slice, index) => {
      const start = end;
      end += slice.value / this.total() * 100;
      return this.colors[index] + ' ' + start + '% ' + Math.min(100, end) + '%';
    });
    return 'conic-gradient(' + stops.join(', ') + ')';
  });

  constructor() {
    effect(cleanup => {
      if (this.widget() !== 'timer' || !this.timer().deadline) return;
      this.now.set(Date.now());
      const tick = window.setInterval(() => {
        this.now.set(Date.now());
        if (!this.running()) window.clearInterval(tick);
      }, 150);
      cleanup(() => window.clearInterval(tick));
    });
  }

  setDuration(event: Event): void {
    const input = event.target as HTMLInputElement;
    const duration = Math.round(this.number(input.valueAsNumber, this.timer().duration, 1, 3600));
    input.value = String(duration);
    this.save({ duration, remaining: duration, deadline: 0 });
  }

  start(): void {
    const { duration } = this.timer();
    const remaining = this.secondsLeft() || duration;
    this.now.set(Date.now());
    this.save({ duration, remaining, deadline: Date.now() + remaining * 1000 });
  }

  pause(): void {
    const { duration, deadline } = this.timer();
    const remaining = Math.max(0, Math.min(duration, Math.ceil((deadline - Date.now()) / 1000)));
    this.save({ duration, remaining, deadline: 0, paused: true });
  }

  reset(): void {
    const { duration } = this.timer();
    this.save({ duration, remaining: duration, deadline: 0 });
  }

  editSlice(index: number, event: Event, numeric: boolean): void {
    const input = event.target as HTMLInputElement;
    const slices = this.slices().map((slice, position) => {
      if (position !== index) return slice;
      if (!numeric) return { ...slice, label: input.value.trim().slice(0, 24) || 'Slice ' + (index + 1) };
      return { ...slice, value: this.number(input.valueAsNumber, slice.value, 0.0001, 10000) };
    });
    input.value = String(numeric ? slices[index].value : slices[index].label);
    this.save({ slices });
  }

  addSlice(): void {
    const slices = this.slices();
    if (slices.length < this.maxSlices) this.save({ slices: [...slices, { label: 'Slice ' + (slices.length + 1), value: 1 }] });
  }

  splitSlice(index: number): void {
    const slices = [...this.slices()];
    const slice = slices[index];
    if (slices.length >= this.maxSlices || slice.value < 0.0002) return;
    slices.splice(index, 1, { ...slice, value: slice.value / 2 }, { label: 'Slice ' + (slices.length + 1), value: slice.value / 2 });
    this.save({ slices });
  }

  equalize(): void {
    this.save({ slices: this.slices().map(slice => ({ ...slice, value: 1 })) });
  }

  removeSlice(index: number): void {
    if (this.slices().length > 1) this.save({ slices: this.slices().filter((_, position) => position !== index) });
  }

  private number(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }

  private save(state: object): void {
    if (this.editable()) this.changed.emit(JSON.stringify({ widget: this.widget(), ...state }));
  }
}
