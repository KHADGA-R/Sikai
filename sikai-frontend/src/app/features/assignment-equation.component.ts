import { Component, ElementRef, effect, inject, input } from '@angular/core';

const mathNamespace = 'http://www.w3.org/1998/Math/MathML';
const structures = {
  frac: { element: 'mfrac', terms: 2 },
  pow: { element: 'msup', terms: 2 },
  sqrt: { element: 'msqrt', terms: 1 },
  sub: { element: 'msub', terms: 2 },
} as const;

@Component({
  selector: 'app-assignment-equation',
  standalone: true,
  template: '',
  styles: [':host { display: inline-block; max-width: 100%; }'],
})
export class AssignmentEquationComponent {
  readonly expression = input.required<string>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const math = document.createElementNS(mathNamespace, 'math');
      math.append(renderExpression(this.expression(), 0));
      this.host.replaceChildren(math);
    });
  }
}

function renderExpression(source: string, depth: number): Element {
  const line = document.createElementNS(mathNamespace, 'mrow');
  const commands = /\b(frac|pow|sqrt|sub)\(/g;
  let cursor = 0;
  const appendText = (text: string) => {
    if (!text) return;
    const token = document.createElementNS(mathNamespace, 'mtext');
    token.textContent = text;
    line.append(token);
  };
  if (depth < 16) {
    for (const match of source.matchAll(commands)) {
      if (match.index < cursor) continue;
      const structure = structures[match[1] as keyof typeof structures];
      const parsed = readTerms(source, match.index + match[0].length);
      if (!parsed || parsed.terms.length !== structure.terms || parsed.terms.some(term => !term.trim())) continue;
      appendText(source.slice(cursor, match.index));
      const node = document.createElementNS(mathNamespace, structure.element);
      node.append(...parsed.terms.map(term => renderExpression(term, depth + 1)));
      line.append(node);
      cursor = parsed.end;
    }
  }
  appendText(source.slice(cursor));
  return line;
}

function readTerms(source: string, start: number): { terms: string[]; end: number } | undefined {
  const terms: string[] = [];
  let from = start;
  let nesting = 0;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (character === ')' && nesting === 0) {
      return { terms: [...terms, source.slice(from, index)], end: index + 1 };
    }
    if (character === '(') nesting++;
    if (character === ')') nesting--;
    if (character === ',' && nesting === 0) {
      terms.push(source.slice(from, index));
      from = index + 1;
    }
  }
  return undefined;
}
