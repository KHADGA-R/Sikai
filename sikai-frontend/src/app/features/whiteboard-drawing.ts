export type Shape = 'line' | 'rectangle' | 'ellipse' | 'circle' | 'arrow';
export type DrawingTool = 'pen' | 'highlighter' | 'text' | Shape;
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export interface DrawingPoint { x: number; y: number; }
export interface DrawingSettings {
  tool: DrawingTool | 'eraser';
  color: string;
  strokeStyle: StrokeStyle;
  width: number;
}

export function drawingOutline(tool: DrawingTool, points: DrawingPoint[], width: number, height: number, arrowSize = 20): string {
  const first = points[0];
  if (!first) return '';
  const last = points.at(-1)!;
  const x = first.x * width, y = first.y * height;
  const endX = last.x * width, endY = last.y * height;
  switch (tool) {
    case 'line':
      return `M ${x} ${y} L ${endX} ${endY}`;
    case 'rectangle':
      return `M ${x} ${y} H ${endX} V ${endY} H ${x} Z`;
    case 'ellipse': {
      const rx = Math.abs(endX - x) / 2, ry = Math.abs(endY - y) / 2;
      const left = Math.min(x, endX), right = Math.max(x, endX), centerY = (y + endY) / 2;
      return `M ${left} ${centerY} A ${rx} ${ry} 0 1 0 ${right} ${centerY} A ${rx} ${ry} 0 1 0 ${left} ${centerY}`;
    }
    case 'circle': {
      const radius = Math.hypot(endX - x, endY - y);
      return `M ${x - radius} ${y} A ${radius} ${radius} 0 1 0 ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y}`;
    }
    case 'arrow': {
      const angle = Math.atan2(endY - y, endX - x);
      const size = Math.min(arrowSize, Math.hypot(endX - x, endY - y) * 0.4);
      const wing = (offset: number) => `${endX - size * Math.cos(angle + offset)} ${endY - size * Math.sin(angle + offset)}`;
      return `M ${x} ${y} L ${endX} ${endY} M ${wing(-0.55)} L ${endX} ${endY} L ${wing(0.55)}`;
    }
    default: {
      const path = 'M ' + points.map(point => point.x * width + ' ' + point.y * height).join(' L ');
      return points.length === 1 ? path + ' h 0.1' : path;
    }
  }
}
