import * as math from 'mathjs';

export type EquationType = 'explicit' | 'implicit' | 'parametric' | 'polar' | 'inequality' | 'constant' | 'variable';
export type InequalityType = '<' | '>' | '<=' | '>=' | null;

export interface ParsedEquation {
  type: EquationType;
  // For explicit: compiledExpr evaluates with { x }
  // For implicit: compiledExpr evaluates with { x, y } => should equal 0
  // For parametric: compiledExprX and compiledExprY evaluate with { t }
  // For polar: compiledExpr evaluates with { theta } => r
  compiledExpr: math.EvalFunction | null;
  compiledExprX?: math.EvalFunction | null;
  compiledExprY?: math.EvalFunction | null;
  inequality: InequalityType;
  variableName?: string;
  variableValue?: number;
  error: string | null;
}

// Constants built into mathjs: pi, e, etc. We add common ones
const BUILTIN_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  tau: 2 * Math.PI,
};

export function getBuiltinConstants(): Record<string, number> {
  return { ...BUILTIN_CONSTANTS };
}

export function parseEquation(
  text: string,
  variables: Record<string, number> = {}
): ParsedEquation {
  const trimmed = text.trim();

  if (!trimmed) {
    return { type: 'explicit', compiledExpr: null, inequality: null, error: null };
  }

  try {
    // 1) Check for variable/constant assignment: "a = 5" or "k = 3.14"
    const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1].toLowerCase();
      const valueStr = assignMatch[2].trim();

      // Don't treat "y = ...", "x = ...", "r = ..." as variable assignment
      if (varName !== 'y' && varName !== 'x' && varName !== 'r') {
        try {
          const compiled = math.compile(valueStr);
          const scope = { ...BUILTIN_CONSTANTS, ...variables };
          const val = compiled.evaluate(scope);
          if (typeof val === 'number' && isFinite(val)) {
            return {
              type: 'variable',
              compiledExpr: compiled,
              inequality: null,
              variableName: varName,
              variableValue: val,
              error: null,
            };
          }
        } catch {
          // Fall through to try as equation
        }
      }
    }

    // 2) Check for parametric: "(expr, expr)" with t as parameter
    const parametricMatch = trimmed.match(/^\(\s*(.+?)\s*,\s*(.+?)\s*\)$/);
    if (parametricMatch) {
      const exprX = math.compile(parametricMatch[1]);
      const exprY = math.compile(parametricMatch[2]);
      const scope = { t: 0, ...BUILTIN_CONSTANTS, ...variables };
      exprX.evaluate(scope);
      exprY.evaluate(scope);
      return {
        type: 'parametric',
        compiledExpr: null,
        compiledExprX: exprX,
        compiledExprY: exprY,
        inequality: null,
        error: null,
      };
    }

    // 3) Check for polar: "r = f(theta)" or just check if it uses theta
    const polarMatch = trimmed.match(/^r\s*=\s*(.+)$/i);
    if (polarMatch) {
      const expr = math.compile(polarMatch[1]);
      const scope = { theta: 0, ...BUILTIN_CONSTANTS, ...variables };
      expr.evaluate(scope);
      return {
        type: 'polar',
        compiledExpr: expr,
        inequality: null,
        error: null,
      };
    }

    // 4) Check for inequalities: y > f(x), y < f(x), etc.
    const inequalityMatch = trimmed.match(/^y\s*(<=|>=|<|>)\s*(.+)$/i);
    if (inequalityMatch) {
      const ineqType = inequalityMatch[1] as InequalityType;
      const expr = math.compile(inequalityMatch[2]);
      const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };
      expr.evaluate(scope);
      return {
        type: 'inequality',
        compiledExpr: expr,
        inequality: ineqType,
        error: null,
      };
    }

    // 5) Check for explicit: "y = f(x)" or just "f(x)"
    let exprStr = trimmed;
    const explicitMatch = trimmed.match(/^y\s*=\s*(.+)$/i);
    if (explicitMatch) {
      exprStr = explicitMatch[1];
    }

    // 6) Check for vertical line: "x = constant"
    const verticalMatch = trimmed.match(/^x\s*=\s*(.+)$/i);
    if (verticalMatch) {
      const expr = math.compile(verticalMatch[1]);
      const scope = { ...BUILTIN_CONSTANTS, ...variables };
      const val = expr.evaluate(scope);
      if (typeof val === 'number') {
        return {
          type: 'constant',
          compiledExpr: expr,
          inequality: null,
          variableName: 'x',
          variableValue: val,
          error: null,
        };
      }
    }

    // 7) Try as explicit y = f(x)
    try {
      const compiled = math.compile(exprStr);
      const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };
      const result = compiled.evaluate(scope);
      if (typeof result === 'number') {
        return {
          type: 'explicit',
          compiledExpr: compiled,
          inequality: null,
          error: null,
        };
      }
    } catch {
      // Not a simple explicit equation, try implicit
    }

    // 8) Try as implicit equation: anything with "=" sign (e.g., x^2 + y^2 = 25)
    const implicitMatch = trimmed.match(/^(.+?)\s*=\s*(.+)$/);
    if (implicitMatch) {
      // Rewrite as LHS - RHS = 0
      const lhs = implicitMatch[1];
      const rhs = implicitMatch[2];
      const implicitExpr = `(${lhs}) - (${rhs})`;
      const compiled = math.compile(implicitExpr);
      const scope = { x: 0, y: 0, ...BUILTIN_CONSTANTS, ...variables };
      const result = compiled.evaluate(scope);
      if (typeof result === 'number') {
        return {
          type: 'implicit',
          compiledExpr: compiled,
          inequality: null,
          error: null,
        };
      }
    }

    // 9) Implicit inequality: LHS < RHS, LHS > RHS, etc.
    const implicitIneqMatch = trimmed.match(/^(.+?)\s*(<=|>=|<|>)\s*(.+)$/);
    if (implicitIneqMatch) {
      const lhs = implicitIneqMatch[1];
      const ineqType = implicitIneqMatch[2] as InequalityType;
      const rhs = implicitIneqMatch[3];
      const implicitExpr = `(${lhs}) - (${rhs})`;
      const compiled = math.compile(implicitExpr);
      const scope = { x: 0, y: 0, ...BUILTIN_CONSTANTS, ...variables };
      compiled.evaluate(scope);
      return {
        type: 'inequality',
        compiledExpr: compiled,
        inequality: ineqType,
        error: null,
      };
    }

    return {
      type: 'explicit',
      compiledExpr: null,
      inequality: null,
      error: 'Could not parse this equation',
    };
  } catch (err: unknown) {
    return {
      type: 'explicit',
      compiledExpr: null,
      inequality: null,
      error: err instanceof Error ? err.message : 'Invalid equation',
    };
  }
}

export function textToLatex(text: string): string {
  if (!text.trim()) return '';

  const latex = text;

  // Handle parametric
  const parametricMatch = latex.match(/^\(\s*(.+?)\s*,\s*(.+?)\s*\)$/);
  if (parametricMatch) {
    return `\\left(${convertExprToLatex(parametricMatch[1])},\\; ${convertExprToLatex(parametricMatch[2])}\\right)`;
  }

  // Handle r = ...
  const polarMatch = latex.match(/^r\s*=\s*(.+)$/i);
  if (polarMatch) {
    return `r = ${convertExprToLatex(polarMatch[1])}`;
  }

  // Handle y = ... or y >/</>=/<= ...
  const yMatch = latex.match(/^y\s*([=<>]=?|[<>])\s*(.+)$/i);
  if (yMatch) {
    const op = yMatch[1].replace('<=', '\\leq').replace('>=', '\\geq');
    return `y ${op} ${convertExprToLatex(yMatch[2])}`;
  }

  // Handle implicit with =
  const implicitMatch = latex.match(/^(.+?)\s*=\s*(.+)$/);
  if (implicitMatch) {
    return `${convertExprToLatex(implicitMatch[1])} = ${convertExprToLatex(implicitMatch[2])}`;
  }

  // Handle implicit with inequality
  const ineqMatch = latex.match(/^(.+?)\s*(<=|>=|<|>)\s*(.+)$/);
  if (ineqMatch) {
    const op = ineqMatch[2].replace('<=', '\\leq').replace('>=', '\\geq');
    return `${convertExprToLatex(ineqMatch[1])} ${op} ${convertExprToLatex(ineqMatch[3])}`;
  }

  return convertExprToLatex(latex);
}

function convertExprToLatex(expr: string): string {
  let result = expr;
  // Replace common math functions
  result = result.replace(/\bsin\b/g, '\\sin');
  result = result.replace(/\bcos\b/g, '\\cos');
  result = result.replace(/\btan\b/g, '\\tan');
  result = result.replace(/\bsqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  result = result.replace(/\babs\(([^)]+)\)/g, '\\left|$1\\right|');
  result = result.replace(/\blog\b/g, '\\log');
  result = result.replace(/\bln\b/g, '\\ln');
  result = result.replace(/\bexp\b/g, '\\exp');
  result = result.replace(/\bpi\b/g, '\\pi');
  result = result.replace(/\btheta\b/g, '\\theta');
  result = result.replace(/\btau\b/g, '\\tau');
  result = result.replace(/\bphi\b/g, '\\phi');
  result = result.replace(/\^(\d+)/g, '^{$1}');
  result = result.replace(/\^([a-zA-Z])/g, '^{$1}');
  result = result.replace(/\*\*/g, '^');
  result = result.replace(/\*/g, '\\cdot ');
  return result;
}

// Find roots (x-intercepts) of an explicit function
export function findRoots(
  evalFn: math.EvalFunction,
  xMin: number,
  xMax: number,
  variables: Record<string, number> = {}
): { x: number; y: number }[] {
  const roots: { x: number; y: number }[] = [];
  const step = (xMax - xMin) / 500;
  const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };

  let prevY: number | null = null;
  for (let x = xMin; x <= xMax; x += step) {
    try {
      scope.x = x;
      const y = evalFn.evaluate(scope);
      if (typeof y !== 'number' || !isFinite(y)) {
        prevY = null;
        continue;
      }
      if (prevY !== null && prevY * y < 0) {
        // Sign change detected - use bisection to refine
        const root = bisect(evalFn, x - step, x, variables);
        if (root !== null) {
          // Check it's not a duplicate
          if (!roots.some(r => Math.abs(r.x - root) < step)) {
            roots.push({ x: root, y: 0 });
          }
        }
      }
      prevY = y;
    } catch {
      prevY = null;
    }
  }
  return roots;
}

function bisect(
  evalFn: math.EvalFunction,
  a: number,
  b: number,
  variables: Record<string, number>
): number | null {
  const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };
  for (let i = 0; i < 50; i++) {
    const mid = (a + b) / 2;
    scope.x = mid;
    const fMid = evalFn.evaluate(scope);
    if (Math.abs(fMid) < 1e-10) return mid;
    scope.x = a;
    const fA = evalFn.evaluate(scope);
    if (fA * fMid < 0) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

// Find local extrema (min/max)
export function findExtrema(
  evalFn: math.EvalFunction,
  xMin: number,
  xMax: number,
  variables: Record<string, number> = {}
): { x: number; y: number; type: 'min' | 'max' }[] {
  const extrema: { x: number; y: number; type: 'min' | 'max' }[] = [];
  const step = (xMax - xMin) / 500;
  const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };
  const h = step / 10;

  for (let x = xMin + step; x <= xMax - step; x += step) {
    try {
      scope.x = x - h;
      const yLeft = evalFn.evaluate(scope);
      scope.x = x;
      const yMid = evalFn.evaluate(scope);
      scope.x = x + h;
      const yRight = evalFn.evaluate(scope);

      if (typeof yLeft !== 'number' || typeof yMid !== 'number' || typeof yRight !== 'number') continue;
      if (!isFinite(yLeft) || !isFinite(yMid) || !isFinite(yRight)) continue;

      // Approximate derivative sign change
      const dLeft = yMid - yLeft;
      const dRight = yRight - yMid;

      if (dLeft > 0 && dRight < 0) {
        extrema.push({ x, y: yMid, type: 'max' });
      } else if (dLeft < 0 && dRight > 0) {
        extrema.push({ x, y: yMid, type: 'min' });
      }
    } catch {
      continue;
    }
  }
  return extrema;
}

// Find intersections between two explicit functions
export function findIntersections(
  fn1: math.EvalFunction,
  fn2: math.EvalFunction,
  xMin: number,
  xMax: number,
  variables: Record<string, number> = {}
): { x: number; y: number }[] {
  const intersections: { x: number; y: number }[] = [];
  const step = (xMax - xMin) / 500;
  const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };

  let prevDiff: number | null = null;
  for (let x = xMin; x <= xMax; x += step) {
    try {
      scope.x = x;
      const y1 = fn1.evaluate({ ...scope });
      const y2 = fn2.evaluate({ ...scope });
      if (typeof y1 !== 'number' || typeof y2 !== 'number') { prevDiff = null; continue; }
      if (!isFinite(y1) || !isFinite(y2)) { prevDiff = null; continue; }
      const diff = y1 - y2;
      if (prevDiff !== null && prevDiff * diff < 0) {
        // Sign change - refine with bisection on the difference
        const ix = bisectDiff(fn1, fn2, x - step, x, variables);
        if (ix !== null) {
          scope.x = ix;
          const iy = fn1.evaluate({ ...scope });
          if (!intersections.some(p => Math.abs(p.x - ix) < step)) {
            intersections.push({ x: ix, y: iy });
          }
        }
      }
      prevDiff = diff;
    } catch {
      prevDiff = null;
    }
  }
  return intersections;
}

function bisectDiff(
  fn1: math.EvalFunction,
  fn2: math.EvalFunction,
  a: number,
  b: number,
  variables: Record<string, number>
): number | null {
  const scope = { x: 0, ...BUILTIN_CONSTANTS, ...variables };
  for (let i = 0; i < 50; i++) {
    const mid = (a + b) / 2;
    scope.x = mid;
    const diff = fn1.evaluate({ ...scope }) - fn2.evaluate({ ...scope });
    if (Math.abs(diff) < 1e-10) return mid;
    scope.x = a;
    const diffA = fn1.evaluate({ ...scope }) - fn2.evaluate({ ...scope });
    if (diffA * diff < 0) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}
