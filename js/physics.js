/* ============================================================
   physics.js  -  simple 2D platformer physics + tilemap
   collision (axis separated swept AABB). Reusable for any
   "actor" object exposing {x,y,w,h,vx,vy}.
   ============================================================ */
import { rectsOverlap } from './collision.js';

/**
 * Move an actor against the tilemap for `dt` seconds.
 * Sets actor.onGround / onCeiling / onWallL / onWallR flags.
 * Honors actor.dropThrough (skip one-way platforms this frame).
 */
export function moveActor(a, map, dt) {
  a.onGround = false;
  a.onCeiling = false;
  a.onWallL = false;
  a.onWallR = false;

  const ts = map.ts;
  const prevBottom = a.y + a.h;

  /* ---- horizontal ---- */
  let nx = a.x + a.vx * dt;
  if (a.vx !== 0) {
    const dir = a.vx > 0 ? 1 : -1;
    const edgeX = dir > 0 ? nx + a.w : nx;
    const tx = Math.floor(edgeX / ts);
    const y0 = Math.floor((a.y + 1) / ts);
    const y1 = Math.floor((a.y + a.h - 1) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      if (map.isSolidTile(tx, ty)) {
        if (dir > 0) { nx = tx * ts - a.w - 0.01; a.onWallR = true; }
        else { nx = (tx + 1) * ts + 0.01; a.onWallL = true; }
        a.vx = 0;
        break;
      }
    }
  }
  a.x = nx;

  /* ---- vertical ---- */
  let ny = a.y + a.vy * dt;
  if (a.vy !== 0) {
    const dir = a.vy > 0 ? 1 : -1;
    const edgeY = dir > 0 ? ny + a.h : ny;
    const ty = Math.floor(edgeY / ts);
    const x0 = Math.floor((a.x + 1) / ts);
    const x1 = Math.floor((a.x + a.w - 1) / ts);
    for (let tx = x0; tx <= x1; tx++) {
      const solid = map.isSolidTile(tx, ty);
      const oneWay =
        !solid &&
        dir > 0 &&
        !a.dropThrough &&
        map.isOneWayTile(tx, ty) &&
        prevBottom <= ty * ts + 1.5;
      if (solid || oneWay) {
        if (dir > 0) { ny = ty * ts - a.h - 0.01; a.onGround = true; }
        else { ny = (ty + 1) * ts + 0.01; a.onCeiling = true; }
        a.vy = 0;
        break;
      }
    }
  }
  a.y = ny;
}

/** turn back at a wall or before a ledge (for ground patrol AI) */
export function wallAhead(a, map) {
  const dir = a.facing;
  const fx = dir > 0 ? a.x + a.w + 1 : a.x - 1;
  const tx = Math.floor(fx / map.ts);
  const y0 = Math.floor((a.y + 2) / map.ts);
  const y1 = Math.floor((a.y + a.h - 2) / map.ts);
  for (let ty = y0; ty <= y1; ty++) if (map.isSolidTile(tx, ty)) return true;
  return false;
}

export function ledgeAhead(a, map) {
  const dir = a.facing;
  const fx = dir > 0 ? a.x + a.w + 2 : a.x - 2;
  const ty = Math.floor((a.y + a.h + 2) / map.ts);
  const tx = Math.floor(fx / map.ts);
  return !map.isSolidTile(tx, ty) && !map.isOneWayTile(tx, ty);
}

/**
 * Resolve an actor against a list of dynamic solids
 * (doors, moving platforms, crates, rope bridges).
 * Each solid: {x,y,w,h,oneWay?,ref?}
 * On landing on a platform ref, sets a.riding = ref.
 */
export function resolveSolids(a, solids, dt) {
  for (const s of solids) {
    if (s.oneWay) {
      // ride a one-way / moving platform when standing on (or a hair above) it,
      // even if not strictly overlapping -- otherwise a ground-level platform
      // never picks you up.
      const feet = a.y + a.h;
      const horiz = a.x + a.w > s.x + 1 && a.x < s.x + s.w - 1;
      const prevBottom = feet - a.vy * dt;
      if (horiz && !a.dropThrough && a.vy >= -1 &&
          feet >= s.y - 3 && feet <= s.y + s.h && prevBottom <= s.y + 3) {
        a.y = s.y - a.h - 0.01;
        a.vy = 0;
        a.onGround = true;
        if (s.ref) a.riding = s.ref;
      }
      continue;
    }

    if (!rectsOverlap(a.x, a.y, a.w, a.h, s.x, s.y, s.w, s.h)) continue;

    const dxL = s.x - (a.x + a.w);
    const dxR = s.x + s.w - a.x;
    const dyT = s.y - (a.y + a.h);
    const dyB = s.y + s.h - a.y;
    const px = Math.abs(dxL) < Math.abs(dxR) ? dxL : dxR;
    const py = Math.abs(dyT) < Math.abs(dyB) ? dyT : dyB;

    if (Math.abs(px) < Math.abs(py)) {
      a.x += px;
      a.vx = 0;
      if (px < 0) a.onWallR = true; else a.onWallL = true;
    } else {
      a.y += py;
      if (py < 0) { a.onGround = true; if (s.ref) a.riding = s.ref; }
      else a.onCeiling = true;
      a.vy = 0;
    }
  }
}
