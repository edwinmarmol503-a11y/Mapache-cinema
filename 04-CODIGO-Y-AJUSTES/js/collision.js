/* ============================================================
   collision.js  -  reusable AABB primitives
   ============================================================ */

/** overlap test between two {x,y,w,h} rects */
export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** overlap test between raw rect components */
export function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** point inside rect */
export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** minimum translation vector to push rect `a` out of rect `b` (or null) */
export function resolveAABB(a, b) {
  if (!aabb(a, b)) return null;
  const dxL = b.x - (a.x + a.w);
  const dxR = b.x + b.w - a.x;
  const dyT = b.y - (a.y + a.h);
  const dyB = b.y + b.h - a.y;
  const px = Math.abs(dxL) < Math.abs(dxR) ? dxL : dxR;
  const py = Math.abs(dyT) < Math.abs(dyB) ? dyT : dyB;
  return Math.abs(px) < Math.abs(py) ? { x: px, y: 0 } : { x: 0, y: py };
}
