import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  ViewWindow,
  mapXToCanvas,
  mapYToCanvas,
  mapCanvasToX,
  mapCanvasToY,
  calculateGridStep,
} from '../../lib/math-utils';
import { Equation, PointOfInterest } from '../../hooks/useGraphingEngine';
import { getBuiltinConstants } from '../../lib/math-parser';

interface GraphCanvasProps {
  equations: Equation[];
  viewWindow: ViewWindow;
  userVariables: Record<string, number>;
  pointsOfInterest: PointOfInterest[];
  onPan: (dx: number, dy: number) => void;
  onZoom: (factor: number, centerX: number, centerY: number) => void;
  onResize: (width: number, height: number) => void;
}

export function GraphCanvas({
  equations,
  viewWindow,
  userVariables,
  pointsOfInterest,
  onPan,
  onZoom,
  onResize,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const constants = getBuiltinConstants();
    const scope = { ...constants, ...userVariables };

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid
    const xRange = viewWindow.xMax - viewWindow.xMin;
    const step = calculateGridStep(xRange, width);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;

    const startX = Math.floor(viewWindow.xMin / step) * step;
    for (let x = startX; x <= viewWindow.xMax; x += step) {
      const px = mapXToCanvas(x, viewWindow, width);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }

    const startY = Math.floor(viewWindow.yMin / step) * step;
    for (let y = startY; y <= viewWindow.yMax; y += step) {
      const py = mapYToCanvas(y, viewWindow, height);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    if (viewWindow.xMin <= 0 && viewWindow.xMax >= 0) {
      const px = mapXToCanvas(0, viewWindow, width);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
    if (viewWindow.yMin <= 0 && viewWindow.yMax >= 0) {
      const py = mapYToCanvas(0, viewWindow, height);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = startX; x <= viewWindow.xMax; x += step) {
      if (Math.abs(x) < 1e-10) continue;
      const px = mapXToCanvas(x, viewWindow, width);
      const py = mapYToCanvas(0, viewWindow, height);
      const labelY = Math.max(0, Math.min(height - 15, py + 5));
      ctx.fillText(Number(x.toPrecision(4)).toString(), px, labelY);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = startY; y <= viewWindow.yMax; y += step) {
      if (Math.abs(y) < 1e-10) continue;
      const py = mapYToCanvas(y, viewWindow, height);
      const px = mapXToCanvas(0, viewWindow, width);
      const labelX = Math.max(25, Math.min(width, px - 5));
      ctx.fillText(Number(y.toPrecision(4)).toString(), labelX, py);
    }

    // Draw equations
    equations.forEach((eq) => {
      if (!eq.visible) return;
      const { parsed } = eq;

      // --- INEQUALITY SHADING ---
      if (parsed.type === 'inequality' && parsed.compiledExpr && parsed.inequality) {
        const ineq = parsed.inequality;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const hexColor = eq.color;
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        // Sample every 2 pixels for performance
        const sampleStep = 2;
        for (let px = 0; px < width; px += sampleStep) {
          for (let py = 0; py < height; py += sampleStep) {
            const x = mapCanvasToX(px, viewWindow, width);
            const y = mapCanvasToY(py, viewWindow, height);
            try {
              const val = parsed.compiledExpr.evaluate({ x, y, ...scope });
              if (typeof val !== 'number' || !isFinite(val)) continue;
              let fill = false;
              if (ineq === '<') fill = val < 0;
              else if (ineq === '>') fill = val > 0;
              else if (ineq === '<=') fill = val <= 0;
              else if (ineq === '>=') fill = val >= 0;
              if (fill) {
                for (let dx = 0; dx < sampleStep && px + dx < width; dx++) {
                  for (let dy = 0; dy < sampleStep && py + dy < height; dy++) {
                    const idx = ((py + dy) * width + (px + dx)) * 4;
                    data[idx] = Math.round(data[idx] * 0.7 + r * 0.3);
                    data[idx + 1] = Math.round(data[idx + 1] * 0.7 + g * 0.3);
                    data[idx + 2] = Math.round(data[idx + 2] * 0.7 + b * 0.3);
                  }
                }
              }
            } catch {
              // skip
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }

      // --- IMPLICIT EQUATION (Marching Squares) ---
      if (parsed.type === 'implicit' && parsed.compiledExpr) {
        ctx.strokeStyle = eq.color;
        ctx.lineWidth = 2.5;

        const gridSize = 3; // pixels per cell
        const cols = Math.ceil(width / gridSize);
        const rows = Math.ceil(height / gridSize);

        // Evaluate grid
        const grid: number[][] = [];
        for (let i = 0; i <= rows; i++) {
          grid[i] = [];
          for (let j = 0; j <= cols; j++) {
            const x = mapCanvasToX(j * gridSize, viewWindow, width);
            const y = mapCanvasToY(i * gridSize, viewWindow, height);
            try {
              const val = parsed.compiledExpr.evaluate({ x, y, ...scope });
              grid[i][j] = typeof val === 'number' && isFinite(val) ? val : NaN;
            } catch {
              grid[i][j] = NaN;
            }
          }
        }

        // March through cells
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const tl = grid[i][j];
            const tr = grid[i][j + 1];
            const br = grid[i + 1][j + 1];
            const bl = grid[i + 1][j];
            if (isNaN(tl) || isNaN(tr) || isNaN(br) || isNaN(bl)) continue;

            const code =
              (tl > 0 ? 8 : 0) |
              (tr > 0 ? 4 : 0) |
              (br > 0 ? 2 : 0) |
              (bl > 0 ? 1 : 0);

            if (code === 0 || code === 15) continue;

            const left = j * gridSize;
            const top = i * gridSize;
            const right = (j + 1) * gridSize;
            const bottom = (i + 1) * gridSize;

            const lerpT = (a: number, b: number) => {
              const denom = a - b;
              return Math.abs(denom) < 1e-15 ? 0.5 : a / denom;
            };

            const topEdge = { x: left + (right - left) * lerpT(tl, tr), y: top };
            const rightEdge = { x: right, y: top + (bottom - top) * lerpT(tr, br) };
            const bottomEdge = { x: left + (right - left) * lerpT(bl, br), y: bottom };
            const leftEdge = { x: left, y: top + (bottom - top) * lerpT(tl, bl) };

            const segments: { x: number; y: number }[][] = [];

            switch (code) {
              case 1: case 14: segments.push([leftEdge, bottomEdge]); break;
              case 2: case 13: segments.push([bottomEdge, rightEdge]); break;
              case 3: case 12: segments.push([leftEdge, rightEdge]); break;
              case 4: case 11: segments.push([topEdge, rightEdge]); break;
              case 5: segments.push([leftEdge, topEdge], [bottomEdge, rightEdge]); break;
              case 6: case 9: segments.push([topEdge, bottomEdge]); break;
              case 7: case 8: segments.push([leftEdge, topEdge]); break;
              case 10: segments.push([topEdge, rightEdge], [leftEdge, bottomEdge]); break;
            }

            segments.forEach((seg) => {
              ctx.beginPath();
              ctx.moveTo(seg[0].x, seg[0].y);
              ctx.lineTo(seg[1].x, seg[1].y);
              ctx.stroke();
            });
          }
        }
      }

      // --- CONSTANT (x = c vertical line) ---
      if (parsed.type === 'constant' && parsed.variableName === 'x' && parsed.variableValue !== undefined) {
        const px = mapXToCanvas(parsed.variableValue, viewWindow, width);
        ctx.strokeStyle = eq.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // --- EXPLICIT y = f(x) ---
      if (parsed.type === 'explicit' && parsed.compiledExpr) {
        ctx.strokeStyle = eq.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let isDrawing = false;
        for (let px = 0; px <= width; px++) {
          const x = mapCanvasToX(px, viewWindow, width);
          try {
            const y = parsed.compiledExpr.evaluate({ x, ...scope });
            if (typeof y !== 'number' || isNaN(y) || !isFinite(y)) {
              isDrawing = false;
              continue;
            }
            const py = mapYToCanvas(y, viewWindow, height);
            if (!isDrawing) {
              ctx.moveTo(px, py);
              isDrawing = true;
            } else {
              ctx.lineTo(px, py);
            }
          } catch {
            isDrawing = false;
          }
        }
        ctx.stroke();
      }

      // --- PARAMETRIC (x(t), y(t)) ---
      if (parsed.type === 'parametric' && parsed.compiledExprX && parsed.compiledExprY) {
        ctx.strokeStyle = eq.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let isDrawing = false;
        const tMin = -10 * Math.PI;
        const tMax = 10 * Math.PI;
        const steps = 2000;
        const dt = (tMax - tMin) / steps;
        for (let i = 0; i <= steps; i++) {
          const t = tMin + i * dt;
          try {
            const x = parsed.compiledExprX.evaluate({ t, ...scope });
            const y = parsed.compiledExprY.evaluate({ t, ...scope });
            if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
              isDrawing = false;
              continue;
            }
            const px = mapXToCanvas(x, viewWindow, width);
            const py = mapYToCanvas(y, viewWindow, height);
            if (!isDrawing) {
              ctx.moveTo(px, py);
              isDrawing = true;
            } else {
              ctx.lineTo(px, py);
            }
          } catch {
            isDrawing = false;
          }
        }
        ctx.stroke();
      }

      // --- POLAR r = f(theta) ---
      if (parsed.type === 'polar' && parsed.compiledExpr) {
        ctx.strokeStyle = eq.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let isDrawing = false;
        const steps = 2000;
        const thetaMax = 4 * Math.PI;
        const dTheta = (2 * thetaMax) / steps;
        for (let i = 0; i <= steps; i++) {
          const theta = -thetaMax + i * dTheta;
          try {
            const r = parsed.compiledExpr.evaluate({ theta, ...scope });
            if (typeof r !== 'number' || !isFinite(r)) {
              isDrawing = false;
              continue;
            }
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            const px = mapXToCanvas(x, viewWindow, width);
            const py = mapYToCanvas(y, viewWindow, height);
            if (!isDrawing) {
              ctx.moveTo(px, py);
              isDrawing = true;
            } else {
              ctx.lineTo(px, py);
            }
          } catch {
            isDrawing = false;
          }
        }
        ctx.stroke();
      }
    });

    // Draw points of interest
    pointsOfInterest.forEach((poi) => {
      const px = mapXToCanvas(poi.x, viewWindow, width);
      const py = mapYToCanvas(poi.y, viewWindow, height);
      if (px < -20 || px > width + 20 || py < -20 || py > height + 20) return;

      // Dot
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fillStyle = poi.color === '#ffffff' ? '#6366f1' : poi.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#374151';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(poi.label, px + 8, py - 4);
    });
  }, [equations, viewWindow, userVariables, pointsOfInterest]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Keep onResize in a ref so it never triggers the effect to re-run
  const onResizeRef = useRef(onResize);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applySize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const newWidth = parent.clientWidth;
      const newHeight = parent.clientHeight;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        onResizeRef.current(newWidth, newHeight);
      }
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', applySize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', applySize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !lastMousePos || !canvasRef.current) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    const canvas = canvasRef.current;
    const xRange = viewWindow.xMax - viewWindow.xMin;
    const yRange = viewWindow.yMax - viewWindow.yMin;
    const dxMath = (dx / canvas.width) * xRange;
    const dyMath = -(dy / canvas.height) * yRange;
    onPan(dxMath, dyMath);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastMousePos(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const centerX = mapCanvasToX(px, viewWindow, canvasRef.current.width);
    const centerY = mapCanvasToY(py, viewWindow, canvasRef.current.height);
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    onZoom(zoomFactor, centerX, centerY);
  };

  // Touch support
  const touchRef = useRef<{ x: number; y: number; dist: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist: Math.sqrt(dx * dx + dy * dy),
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current || !touchRef.current) return;

    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchRef.current.x;
      const dy = e.touches[0].clientY - touchRef.current.y;
      const canvas = canvasRef.current;
      const xRange = viewWindow.xMax - viewWindow.xMin;
      const yRange = viewWindow.yMax - viewWindow.yMin;
      onPan((dx / canvas.width) * xRange, -(dy / canvas.height) * yRange);
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      if (touchRef.current.dist > 0) {
        const factor = touchRef.current.dist / newDist;
        const rect = canvasRef.current.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const centerX = mapCanvasToX(cx, viewWindow, canvasRef.current.width);
        const centerY = mapCanvasToY(cy, viewWindow, canvasRef.current.height);
        onZoom(factor, centerX, centerY);
      }
      touchRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist: newDist,
      };
    }
  };

  const handleTouchEnd = () => {
    touchRef.current = null;
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}
