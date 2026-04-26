import { useState, useCallback, useMemo } from 'react';
import { ViewWindow } from '../lib/math-utils';
import {
  parseEquation,
  ParsedEquation,
  EquationType,
  InequalityType,
  getBuiltinConstants,
  findRoots,
  findExtrema,
  findIntersections,
} from '../lib/math-parser';

export interface Equation {
  id: string;
  text: string;
  color: string;
  visible: boolean;
  error: string | null;
  parsed: ParsedEquation;
}

export interface PointOfInterest {
  x: number;
  y: number;
  label: string;
  color: string;
}

export type { EquationType, InequalityType };

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export function useGraphingEngine() {
  const [equations, setEquations] = useState<Equation[]>([]);

  const [viewWindow, setViewWindow] = useState<ViewWindow>({
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
  });

  const [canvasSize, setCanvasSizeState] = useState<{ width: number; height: number } | null>(null);

  // Derive user-defined variables from equations
  const userVariables = useMemo(() => {
    const vars: Record<string, number> = {};
    equations.forEach((eq) => {
      if (eq.parsed.type === 'variable' && eq.parsed.variableName && eq.parsed.variableValue !== undefined) {
        vars[eq.parsed.variableName] = eq.parsed.variableValue;
      }
    });
    return vars;
  }, [equations]);

  // Compute points of interest
  const pointsOfInterest = useMemo((): PointOfInterest[] => {
    const points: PointOfInterest[] = [];
    const explicitEqs = equations.filter(
      (eq) => eq.visible && eq.parsed.type === 'explicit' && eq.parsed.compiledExpr
    );

    // Roots and extrema for each explicit equation
    explicitEqs.forEach((eq) => {
      if (!eq.parsed.compiledExpr) return;
      const roots = findRoots(eq.parsed.compiledExpr, viewWindow.xMin, viewWindow.xMax, userVariables);
      roots.forEach((r) =>
        points.push({ x: r.x, y: r.y, label: `(${r.x.toFixed(2)}, 0)`, color: eq.color })
      );
      const extremas = findExtrema(eq.parsed.compiledExpr, viewWindow.xMin, viewWindow.xMax, userVariables);
      extremas.forEach((e) =>
        points.push({
          x: e.x,
          y: e.y,
          label: `${e.type === 'max' ? 'Max' : 'Min'} (${e.x.toFixed(2)}, ${e.y.toFixed(2)})`,
          color: eq.color,
        })
      );
    });

    // Intersections between pairs
    for (let i = 0; i < explicitEqs.length; i++) {
      for (let j = i + 1; j < explicitEqs.length; j++) {
        const fn1 = explicitEqs[i].parsed.compiledExpr;
        const fn2 = explicitEqs[j].parsed.compiledExpr;
        if (!fn1 || !fn2) continue;
        const inters = findIntersections(fn1, fn2, viewWindow.xMin, viewWindow.xMax, userVariables);
        inters.forEach((p) =>
          points.push({
            x: p.x,
            y: p.y,
            label: `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`,
            color: '#ffffff',
          })
        );
      }
    }

    return points;
  }, [equations, viewWindow, userVariables]);

  const setCanvasSize = useCallback((width: number, height: number) => {
    setCanvasSizeState((prevSize) => {
      if (!prevSize) {
        const xRange = 20;
        const yRange = xRange * (height / width);
        setViewWindow({
          xMin: -xRange / 2,
          xMax: xRange / 2,
          yMin: -yRange / 2,
          yMax: yRange / 2,
        });
        return { width, height };
      }

      setViewWindow((prevView) => {
        const unitsPerPixelX = (prevView.xMax - prevView.xMin) / prevSize.width;
        const centerX = (prevView.xMin + prevView.xMax) / 2;
        const centerY = (prevView.yMin + prevView.yMax) / 2;
        const newXRange = width * unitsPerPixelX;
        const newYRange = height * unitsPerPixelX;
        return {
          xMin: centerX - newXRange / 2,
          xMax: centerX + newXRange / 2,
          yMin: centerY - newYRange / 2,
          yMax: centerY + newYRange / 2,
        };
      });

      return { width, height };
    });
  }, []);

  const reparseAllEquations = useCallback((eqs: Equation[], vars: Record<string, number>) => {
    return eqs.map((eq) => {
      if (!eq.text.trim()) return eq;
      const parsed = parseEquation(eq.text, vars);
      return { ...eq, parsed, error: parsed.error };
    });
  }, []);

  const addEquation = useCallback(() => {
    setEquations((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        text: '',
        color: COLORS[prev.length % COLORS.length],
        visible: true,
        error: null,
        parsed: {
          type: 'explicit' as EquationType,
          compiledExpr: null,
          inequality: null,
          error: null,
        },
      },
    ]);
  }, []);

  const updateEquation = useCallback(
    (id: string, text: string) => {
      setEquations((prev) => {
        // Compute current vars from other equations
        const otherVars: Record<string, number> = {};
        prev.forEach((eq) => {
          if (eq.id !== id && eq.parsed.type === 'variable' && eq.parsed.variableName && eq.parsed.variableValue !== undefined) {
            otherVars[eq.parsed.variableName] = eq.parsed.variableValue;
          }
        });

        const updated = prev.map((eq) => {
          if (eq.id !== id) return eq;
          const parsed = parseEquation(text, otherVars);
          return { ...eq, text, parsed, error: parsed.error };
        });

        // If this was a variable definition, reparse others that depend on it
        const changedEq = updated.find((e) => e.id === id);
        if (changedEq?.parsed.type === 'variable') {
          const allVars: Record<string, number> = {};
          updated.forEach((eq) => {
            if (eq.parsed.type === 'variable' && eq.parsed.variableName && eq.parsed.variableValue !== undefined) {
              allVars[eq.parsed.variableName] = eq.parsed.variableValue;
            }
          });
          return reparseAllEquations(updated, allVars);
        }

        return updated;
      });
    },
    [reparseAllEquations]
  );

  const updateVariableValue = useCallback(
    (id: string, value: number) => {
      setEquations((prev) => {
        const updated = prev.map((eq) => {
          if (eq.id !== id) return eq;
          
          // Update the text to reflect the new value
          let newText = eq.text;
          if (eq.parsed.type === 'variable' && eq.parsed.variableName) {
            newText = `${eq.parsed.variableName} = ${value}`;
          }
          
          return {
            ...eq,
            text: newText,
            parsed: {
              ...eq.parsed,
              variableValue: value,
            },
          };
        });
        // Reparse all equations with updated variables
        const allVars: Record<string, number> = {};
        updated.forEach((eq) => {
          if (eq.parsed.type === 'variable' && eq.parsed.variableName && eq.parsed.variableValue !== undefined) {
            allVars[eq.parsed.variableName] = eq.parsed.variableValue;
          }
        });
        return reparseAllEquations(updated, allVars);
      });
    },
    [reparseAllEquations]
  );

  const toggleVisibility = useCallback((id: string) => {
    setEquations((prev) =>
      prev.map((eq) => (eq.id === id ? { ...eq, visible: !eq.visible } : eq))
    );
  }, []);

  const removeEquation = useCallback((id: string) => {
    setEquations((prev) => prev.filter((eq) => eq.id !== id));
  }, []);

  const updateColor = useCallback((id: string, color: string) => {
    setEquations((prev) =>
      prev.map((eq) => (eq.id === id ? { ...eq, color } : eq))
    );
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    setViewWindow((prev) => ({
      xMin: prev.xMin - dx,
      xMax: prev.xMax - dx,
      yMin: prev.yMin - dy,
      yMax: prev.yMax - dy,
    }));
  }, []);

  const zoom = useCallback((factor: number, centerX: number, centerY: number) => {
    setViewWindow((prev) => {
      const width = prev.xMax - prev.xMin;
      const height = prev.yMax - prev.yMin;
      const newWidth = width * factor;
      const newHeight = height * factor;
      const xRatio = (centerX - prev.xMin) / width;
      const yRatio = (centerY - prev.yMin) / height;
      return {
        xMin: centerX - newWidth * xRatio,
        xMax: centerX + newWidth * (1 - xRatio),
        yMin: centerY - newHeight * yRatio,
        yMax: centerY + newHeight * (1 - yRatio),
      };
    });
  }, []);

  const resetView = useCallback(() => {
    setCanvasSizeState((prevSize) => {
      if (prevSize) {
        const xRange = 20;
        const yRange = xRange * (prevSize.height / prevSize.width);
        setViewWindow({
          xMin: -xRange / 2,
          xMax: xRange / 2,
          yMin: -yRange / 2,
          yMax: yRange / 2,
        });
      } else {
        setViewWindow({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
      }
      return prevSize;
    });
  }, []);

  return {
    equations,
    viewWindow,
    userVariables,
    pointsOfInterest,
    addEquation,
    updateEquation,
    updateVariableValue,
    toggleVisibility,
    removeEquation,
    updateColor,
    pan,
    zoom,
    resetView,
    setCanvasSize,
  };
}
