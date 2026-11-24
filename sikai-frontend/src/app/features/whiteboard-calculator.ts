export type AngleUnit = 'deg' | 'rad';

export function calculate(expression: string, unit: AngleUnit, variable?: number): number {
  const normalized = expression.replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const text = variable === undefined ? normalized : normalized.replace(/(\d|\)|x)(?=x|\(|π)/g, '$1*');
  const pattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|π|[+\-*/^()%]/iy;
  const tokens: string[] = [];
  while (pattern.lastIndex < text.length) {
    const match = pattern.exec(text);
    if (!match) throw new Error('Invalid calculation');
    tokens.push(match[0].toLowerCase());
  }
  let at = 0;
  function take(token: string): boolean {
    if (tokens[at] !== token) return false;
    at++;
    return true;
  }

  function sum(): number {
    let value = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const operator = tokens[at++];
      const next = product();
      value = operator === '+' ? value + next : value - next;
    }
    return value;
  }

  function product(): number {
    let value = signed();
    while (tokens[at] === '*' || tokens[at] === '/') {
      const operator = tokens[at++];
      const next = signed();
      value = operator === '*' ? value * next : value / next;
    }
    return value;
  }

  function signed(): number {
    if (take('-')) return -signed();
    if (take('+')) return signed();
    let value = atom();
    while (take('%')) value /= 100;
    return take('^') ? value ** signed() : value;
  }

  function atom(): number {
    if (take('(')) {
      const value = sum();
      if (!take(')')) throw new Error('Close the parentheses');
      return value;
    }
    const token = tokens[at++];
    if (token === 'x' && variable !== undefined) return variable;
    if (token === 'π' || token === 'pi') return Math.PI;
    if (token === 'e') return Math.E;
    if (token && /^\d|^\./.test(token)) return Number(token);
    if (!take('(')) throw new Error('Enter a complete calculation');
    const value = sum();
    if (!take(')')) throw new Error('Close the parentheses');
    const angle = unit === 'deg' ? value * Math.PI / 180 : value;
    switch (token) {
      case 'sin': return Math.sin(angle);
      case 'cos': return Math.cos(angle);
      case 'tan': return Math.abs(Math.cos(angle)) < 1e-14 ? NaN : Math.tan(angle);
      case 'sqrt': return Math.sqrt(value);
      case 'log': return Math.log10(value);
      case 'ln': return Math.log(value);
      case 'abs': return Math.abs(value);
      default: throw new Error('Unknown function');
    }
  }

  const result = sum();
  if (at !== tokens.length) throw new Error('Check the calculation');
  if (!Number.isFinite(result)) throw new Error('Undefined result');
  return result;
}
