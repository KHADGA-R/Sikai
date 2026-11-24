export const MATH_SECTIONS = [
  'Basic Maths', 'Geometry & Shapes', 'Measurement', 'Fractions & Decimals', 'Algebra', 'Graphs & Coordinates',
  'Trigonometry', 'Statistics & Probability', 'Advanced Math',
] as const;

// Ages are broad recommendations. A teacher can always select All.
export const MATH_WIDGETS = [
  { kind: 'number-line', label: 'Number line', icon: 'number-line', section: 0, grades: [-1, 5] },
  { kind: 'number-blocks', label: 'Number Blocks', icon: 'ten-frame', section: 0, grades: [-1, 5] },
  { kind: 'abacus', label: 'Abacus', icon: 'ten-frame', section: 0, grades: [0, 5] },
  { kind: 'place-value', label: 'Place Value Chart', icon: 'table', section: 0, grades: [0, 5] },
  { kind: 'math-operators', label: 'Math Operators', icon: 'calculator', section: 0, grades: [0, 5] },
  { kind: 'multiplication-grid', label: 'Multiplication Grid', icon: 'table', section: 0, grades: [2, 5] },
  { kind: 'ten-frame', label: 'Ten-frame', icon: 'ten-frame', section: 0, grades: [-1, 2] },
  { kind: '2d-shapes', label: '2D Shapes', icon: 'shapes', section: 1, grades: [-1, 12] },
  { kind: '3d-shapes', label: '3D Shapes', icon: 'shapes', section: 1, grades: [0, 12] },
  { kind: 'line-tools', label: 'Line Tools', icon: 'line', section: 1, grades: [0, 12] },
  { kind: 'angles', label: 'Angles', icon: 'shapes', section: 1, grades: [2, 12] },
  { kind: 'polygon-tools', label: 'Polygon Tools', icon: 'shapes', section: 1, grades: [2, 12] },
  { kind: 'symmetry-tools', label: 'Symmetry Tools', icon: 'shapes', section: 1, grades: [0, 12] },
  { kind: 'ruler', label: 'Ruler', icon: 'ruler', section: 2, grades: [0, 12] },
  { kind: 'protractor', label: 'Protractor', icon: 'shapes', section: 2, grades: [3, 12] },
  { kind: 'compass', label: 'Compass', icon: 'circle', section: 2, grades: [3, 12] },
  { kind: 'set-square', label: 'Set Square', icon: 'shapes', section: 2, grades: [3, 12] },
  { kind: 'area-perimeter', label: 'Area & Perimeter', icon: 'rectangle', section: 2, grades: [2, 12] },
  { kind: 'unit-converter', label: 'Unit Converter', icon: 'calculator', section: 2, grades: [2, 12] },
  { kind: 'fraction-circles', label: 'Fraction Circles', icon: 'pie', section: 3, grades: [1, 8] },
  { kind: 'fraction-bars', label: 'Fraction bars', icon: 'fraction-bars', section: 3, grades: [1, 8] },
  { kind: 'fraction-number-line', label: 'Fraction Number Line', icon: 'number-line', section: 3, grades: [2, 8] },
  { kind: 'decimal-grid', label: 'Decimal Grid', icon: 'table', section: 3, grades: [3, 8] },
  { kind: 'percentage-tool', label: 'Percentage Tool', icon: 'pie', section: 3, grades: [4, 12] },
  { kind: 'fraction-calculator', label: 'Fraction Calculator', icon: 'calculator', section: 3, grades: [3, 12] },
  { kind: 'equation-editor', label: 'Equation Editor', icon: 'text', section: 4, grades: [6, 12] },
  { kind: 'algebra-tiles', label: 'Algebra Tiles', icon: 'shapes', section: 4, grades: [6, 12] },
  { kind: 'equation-solver', label: 'Equation Solver', icon: 'calculator', section: 4, grades: [6, 12] },
  { kind: 'inequality-tool', label: 'Inequality Tool', icon: 'number-line', section: 4, grades: [6, 12] },
  { kind: 'function-table', label: 'Function Table', icon: 'table', section: 4, grades: [6, 12] },
  { kind: 'expression-builder', label: 'Expression Builder', icon: 'text', section: 4, grades: [6, 12] },
  { kind: 'coordinate-grid', label: 'Coordinate Plane', icon: 'coordinate-grid', section: 5, grades: [5, 12] },
  { kind: 'point-plotter', label: 'Point Plotter', icon: 'coordinate-grid', section: 5, grades: [5, 12] },
  { kind: 'line-graph', label: 'Line Graph', icon: 'line', section: 5, grades: [5, 12] },
  { kind: 'function-grapher', label: 'Function Grapher', icon: 'growth', section: 5, grades: [7, 12] },
  { kind: 'bar-pie-charts', label: 'Bar & Pie Charts', icon: 'pie', section: 5, grades: [5, 12] },
  { kind: 'transformations', label: 'Transformations', icon: 'shapes', section: 5, grades: [6, 12] },
  { kind: 'right-triangle', label: 'Right Triangle', icon: 'shapes', section: 6, grades: [8, 12] },
  { kind: 'soh-cah-toa', label: 'SOH CAH TOA', icon: 'shapes', section: 6, grades: [8, 12] },
  { kind: 'unit-circle', label: 'Unit Circle', icon: 'circle', section: 6, grades: [9, 12] },
  { kind: 'trig-graphs', label: 'Trigonometric Graphs', icon: 'growth', section: 6, grades: [9, 12] },
  { kind: 'pythagorean', label: 'Pythagorean Theorem', icon: 'shapes', section: 6, grades: [8, 12] },
  { kind: 'angle-converter', label: 'Angle Converter', icon: 'calculator', section: 6, grades: [8, 12] },
  { kind: 'reuse-bar-graph', label: 'Bar Graph', icon: 'bar-graph', section: 7, grades: [3, 12] },
  { kind: 'reuse-histogram', label: 'Histogram', icon: 'histogram', section: 7, grades: [5, 12] },
  { kind: 'mean-median-mode', label: 'Mean, Median & Mode', icon: 'table', section: 7, grades: [4, 12] },
  { kind: 'probability-spinner', label: 'Probability Spinner', icon: 'pie', section: 7, grades: [3, 12] },
  { kind: 'dice-coin', label: 'Dice & Coin Toss', icon: 'shapes', section: 7, grades: [3, 12] },
  { kind: 'box-plot', label: 'Box Plot', icon: 'bar-graph', section: 7, grades: [6, 12] },
  { kind: 'scientific-calculator', label: 'Scientific Calculator', icon: 'calculator', section: 8, grades: [9, 12] },
  { kind: 'matrix-tool', label: 'Matrix Tool', icon: 'table', section: 8, grades: [9, 12] },
  { kind: 'vector-tool', label: 'Vector Tool', icon: 'arrow', section: 8, grades: [9, 12] },
  { kind: 'limits-derivatives', label: 'Limits & Derivatives', icon: 'growth', section: 8, grades: [11, 12] },
  { kind: 'integral-graph', label: 'Integral Graph', icon: 'growth', section: 8, grades: [11, 12] },
  { kind: 'complex-plane', label: 'Complex Plane', icon: 'coordinate-grid', section: 8, grades: [9, 12] },
] as const;

const SHORTCUTS = ['bar-pie-charts', 'reuse-bar-graph', 'reuse-histogram', 'scientific-calculator'] as const;
type MathShortcut = typeof SHORTCUTS[number];
export type MathWidget = Exclude<typeof MATH_WIDGETS[number]['kind'], MathShortcut>;
export function isMathShortcut(kind: string): kind is MathShortcut {
  return SHORTCUTS.some(shortcut => shortcut === kind);
}
export const MATH_AUDIENCES = [
  { value: 'all', label: 'All grades', min: -1, max: 12 },
  { value: 'pre-k', label: 'Pre-K', min: -1, max: -1 },
  { value: 'elementary', label: 'Elementary (K–5)', min: 0, max: 5 },
  { value: 'secondary', label: 'Grades 6–12', min: 6, max: 12 },
] as const;
export type MathAudience = typeof MATH_AUDIENCES[number]['value'];

const EARLY_MATH_TOOLS = {
  'pre-k': ['number-blocks', 'ten-frame', 'number-line', '2d-shapes'],
  elementary: ['number-blocks', 'ten-frame', 'number-line', 'fraction-bars', '2d-shapes', 'ruler'],
} as const satisfies Record<string, readonly MathWidget[]>;

export function earlyMathTools(audience: MathAudience) {
  const kinds = audience === 'pre-k' || audience === 'elementary' ? EARLY_MATH_TOOLS[audience] : [];
  return kinds.map(kind => {
    const tool = MATH_WIDGETS.find(item => item.kind === kind)!;
    return { kind, label: tool.label, icon: tool.icon };
  });
}
