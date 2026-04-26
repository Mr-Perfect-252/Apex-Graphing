export interface ViewWindow {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Point {
  x: number;
  y: number;
}

export function mapXToCanvas(x: number, viewWindow: ViewWindow, canvasWidth: number): number {
  return ((x - viewWindow.xMin) / (viewWindow.xMax - viewWindow.xMin)) * canvasWidth;
}

export function mapYToCanvas(y: number, viewWindow: ViewWindow, canvasHeight: number): number {
  return canvasHeight - ((y - viewWindow.yMin) / (viewWindow.yMax - viewWindow.yMin)) * canvasHeight;
}

export function mapCanvasToX(px: number, viewWindow: ViewWindow, canvasWidth: number): number {
  return viewWindow.xMin + (px / canvasWidth) * (viewWindow.xMax - viewWindow.xMin);
}

export function mapCanvasToY(py: number, viewWindow: ViewWindow, canvasHeight: number): number {
  return viewWindow.yMin + ((canvasHeight - py) / canvasHeight) * (viewWindow.yMax - viewWindow.yMin);
}

export function calculateGridStep(range: number, pixels: number): number {
  // Target roughly 80 pixels per grid line
  const targetLines = pixels / 80;
  const roughStep = range / targetLines;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalizedStep = roughStep / magnitude;

  let step;
  if (normalizedStep < 1.5) step = 1;
  else if (normalizedStep < 3.5) step = 2;
  else if (normalizedStep < 7.5) step = 5;
  else step = 10;

  return step * magnitude;
}
