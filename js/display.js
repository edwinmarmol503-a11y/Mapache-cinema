export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;

// Integer backing scales keep the artwork's grid, while glyphs are rasterised
// at screen resolution. Cap at Full HD so a 4K TV does not exhaust its browser.
export function backingScale(cssWidth, deviceScale = 1) {
  const width = Number.isFinite(cssWidth) ? Math.max(1, cssWidth) : LOGICAL_WIDTH;
  const dpr = Number.isFinite(deviceScale) ? Math.min(2, Math.max(1, deviceScale)) : 1;
  return Math.min(4, Math.max(2, Math.ceil(width / LOGICAL_WIDTH * dpr)));
}

export function resizeBacking(canvas, cssWidth, deviceScale = 1) {
  const scale = backingScale(cssWidth, deviceScale);
  const width = LOGICAL_WIDTH * scale;
  const height = LOGICAL_HEIGHT * scale;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return scale;
}
