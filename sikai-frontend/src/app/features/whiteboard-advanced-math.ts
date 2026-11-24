import { calculate } from './whiteboard-calculator';

export function readNumbers(source: string): number[] | null {
  const tokens = source.trim().split(/[,;\s]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 60 || tokens.some(token => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token))) return null;
  const values = tokens.map(Number);
  return values.every(value => Number.isFinite(value) && Math.abs(value) <= 1e9) ? values.sort((a, b) => a - b) : null;
}

export function median(values: number[]): number {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function describeNumbers(values: number[]) {
  const frequencies = new Map<number, number>();
  for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const frequency = Math.max(...frequencies.values());
  const modes = frequency > 1 ? [...frequencies].filter(([, count]) => count === frequency).map(([value]) => value) : [];
  const half = Math.floor(values.length / 2);
  const midpoint = median(values);
  return {
    mean: values.reduce((total, value) => total + value, 0) / values.length,
    median: midpoint,
    modes,
    five: [values[0], half ? median(values.slice(0, half)) : midpoint, midpoint,
      half ? median(values.slice(-half)) : midpoint, values[values.length - 1]],
  };
}

export function evaluateAt(expression: string, x: number): number | null {
  try { return calculate(expression, 'rad', x); } catch { return null; }
}

export function estimateIntegral(expression: string, from: number, to: number): number | null {
  if (from === to) return evaluateAt(expression, from) === null ? null : 0;
  const intervals = 160;
  const step = (to - from) / intervals;
  let sum = 0;
  let previous: number | null = null;
  for (let index = 0; index <= intervals; index++) {
    const y = evaluateAt(expression, from + step * index);
    if (y === null || Math.abs(y) > 1e8 || (previous !== null && y * previous < 0 &&
      Math.min(Math.abs(previous), Math.abs(y)) > 1 / Math.sqrt(Math.abs(step)))) return null;
    sum += (index === 0 || index === intervals ? 1 : index % 2 ? 4 : 2) * y;
    previous = y;
  }
  return sum * step / 3;
}
