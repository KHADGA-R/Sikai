import type { DrawingPoint } from './whiteboard-drawing';

export interface InkPoint extends DrawingPoint {
  pressure?: number;
}

export function smoothInk(points: InkPoint[], height: number): string {
  return smoothPath(points.map(point => ({ x: point.x * 1000, y: point.y * height })));
}

export function pressureInk(points: InkPoint[], width: number, height: number): string {
  if (!points.some(point => point.pressure != null)) return '';
  const pixels = points.map(point => ({ x: point.x * 1000, y: point.y * height, pressure: point.pressure ?? .5 }));
  const radius = (pressure: number) => width * (.25 + pressure * .5);
  const first = pixels[0];
  if (pixels.length === 1) {
    const r = radius(first.pressure);
    return `M ${first.x - r} ${first.y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }

  const edges = pixels.map((point, index) => {
    const before = pixels[Math.max(0, index - 1)];
    const after = pixels[Math.min(pixels.length - 1, index + 1)];
    const angle = Math.atan2(after.y - before.y, after.x - before.x);
    const r = radius(point.pressure);
    const x = Math.sin(angle) * r;
    const y = -Math.cos(angle) * r;
    return { left: { x: point.x + x, y: point.y + y }, right: { x: point.x - x, y: point.y - y }, r };
  });
  const end = edges.at(-1)!;
  return smoothPath(edges.map(edge => edge.left)) +
    ` A ${end.r} ${end.r} 0 0 1 ${coordinates(end.right)}` +
    smoothSegments(edges.map(edge => edge.right).reverse()) +
    ` A ${edges[0].r} ${edges[0].r} 0 0 1 ${coordinates(edges[0].left)} Z`;
}

function coordinates(point: DrawingPoint): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}

function smoothPath(points: DrawingPoint[]): string {
  const first = points[0];
  if (!first) return '';
  const start = 'M ' + coordinates(first);
  if (points.length === 1) return start + ' h 0.1';
  return start + smoothSegments(points);
}

function smoothSegments(points: DrawingPoint[]): string {
  let path = '';
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    path += ` Q ${coordinates(point)} ${coordinates({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 })}`;
  }
  return path + ' L ' + coordinates(points.at(-1)!);
}
