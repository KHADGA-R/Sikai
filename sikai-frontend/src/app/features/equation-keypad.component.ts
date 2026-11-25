import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-equation-keypad',
  standalone: true,
  template: `<div class="keys" role="group" aria-label="Equation keypad">
    @for (key of keys; track key.value) {
      <button type="button" [attr.aria-label]="key.label" [attr.title]="key.label" [disabled]="disabled()"
              (click)="insert(key.value)">{{ key.display }}</button>
    }
    @if (hasBlank()) {
      <button type="button" [disabled]="disabled()" (click)="selectEquationBlank(field())">Next blank</button>
    }
  </div>`,
  styles: [`
    .keys { display: flex; flex-wrap: wrap; gap: 4px; width: max-content; max-width: min(360px, 72vw);
      background: white; padding: 5px; border: 1px solid #bcc7c5; border-radius: 7px; }
    button { min-width: 33px; min-height: 33px; padding: 4px 6px; background: white; color: #17212f;
      border: 1px solid #bcc7c5; border-radius: 5px; }
  `],
})
export class EquationKeypadComponent {
  readonly field = input.required<HTMLTextAreaElement>();
  readonly hasBlank = input(false);
  readonly disabled = input(false);
  readonly changed = output<string>();
  readonly selectEquationBlank = selectEquationBlank;
  readonly keys = [
    { label: 'Fraction', display: '½', value: 'frac(□,□)' },
    { label: 'Exponent', display: 'xⁿ', value: 'pow(□,□)' },
    { label: 'Square root', display: '√', value: 'sqrt(□)' },
    { label: 'Subscript', display: 'xₙ', value: 'sub(□,□)' },
    ...[
      ['+', 'Plus'], ['−', 'Minus'], ['×', 'Multiply'], ['÷', 'Divide'], ['=', 'Equals'],
      ['≠', 'Not equal'], ['≤', 'Less than or equal'], ['≥', 'Greater than or equal'],
      ['π', 'Pi'], ['°', 'Degrees'], ['%', 'Percent'], ['(', 'Open parenthesis'], [')', 'Close parenthesis'],
    ].map(([value, label]) => ({ label, display: value, value })),
  ];

  insert(value: string): void {
    const field = this.field();
    const { selectionStart: start, selectionEnd: end } = field;
    const selected = field.value.slice(start, end);
    const insertion = selected && selected !== '□' ? value.replace('□', selected) : value;
    if (field.value.length - (end - start) + insertion.length > field.maxLength) return;
    field.setRangeText(insertion, start, end, 'end');
    this.changed.emit(field.value);
    field.focus();
    const blank = insertion.indexOf('□');
    if (blank >= 0) field.setSelectionRange(start + blank, start + blank + 1);
  }
}

export function selectEquationBlank(field?: HTMLTextAreaElement): void {
  if (!field) return;
  const next = field.value.indexOf('□', field.selectionEnd);
  const blank = next >= 0 ? next : field.value.indexOf('□');
  if (blank >= 0) {
    field.focus();
    field.setSelectionRange(blank, blank + 1);
  }
}
