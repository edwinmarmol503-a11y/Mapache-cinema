import { drawRiko, px } from './sprites.js';

export const EMOTES = Object.freeze([
  { id: 'sleep', label: 'Un descansito', duration: 4 },
  { id: 'flip', label: 'Voltereta', duration: 1.1 },
  { id: 'wave', label: '¡Te veo al otro lado!', duration: 2.5 },
  { id: 'dance', label: 'Pasos de mapache', duration: 3 },
]);

/** Visual poses only: never move the physics body or grant invulnerability. */
export function drawEmote(ctx, player, x, y) {
  const emote = player.emote;
  if (!emote) return false;
  const t = emote.elapsed, k = Math.min(1, t / emote.duration);
  const w = player.w, h = player.h;
  ctx.save();
  if (emote.id === 'sleep') {
    ctx.translate(x + w / 2, y + h - w / 2);
    ctx.rotate(Math.PI / 2);
    drawRiko(ctx, -w / 2, -h / 2, w, h, 1, 'idle', 18, false, false);
    ctx.restore(); ctx.save();
    ctx.font = '400 8px "Monocraft", monospace';
    ctx.fillStyle = '#bfddfa';
    ctx.fillText('z', x + 10, y - 2 - (t * 5 % 8));
    ctx.fillText('Z', x + 16, y - 8 - (t * 5 % 8));
  } else if (emote.id === 'flip') {
    ctx.translate(x + w / 2, y + h / 2 - Math.sin(k * Math.PI) * 20);
    ctx.rotate(k * Math.PI * 2 * player.facing);
    drawRiko(ctx, -w / 2, -h / 2, w, h, player.facing, 'jump', 0, false, false);
  } else if (emote.id === 'wave') {
    drawRiko(ctx, x, y, w, h, 1, 'idle', 18, false, false);
    // Centre the muzzle and pupils toward the viewer, then wave a free paw.
    px(ctx, x + 3, y + 3, 5, 3, '#e8eef7');
    px(ctx, x + 5, y + 3, 2, 1, '#252c3b');
    const handY = y - 2 + Math.sin(t * 12) * 2;
    px(ctx, x + w + 1, handY, 3, 5, '#aeb8c8');
    px(ctx, x + w + 1, handY, 3, 2, '#e8eef7');
    ctx.font = '400 7px "Monocraft", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0b1425'; ctx.fillRect(x - 17, y - 20, 48, 12);
    ctx.strokeStyle = '#8bcdf4'; ctx.strokeRect(x - 16.5, y - 19.5, 47, 11);
    ctx.fillStyle = '#d9efff'; ctx.fillText('¡TE VEO!', x + 7, y - 13);
  } else {
    ctx.translate(x + w / 2, y + h);
    ctx.rotate(Math.sin(t * 9) * 0.16);
    const bounce = Math.abs(Math.sin(t * 9)) * 3;
    drawRiko(ctx, -w / 2, -h - bounce, w, h, Math.sin(t * 5) > 0 ? 1 : -1, 'walk', Math.floor(t * 12), false, false);
    px(ctx, -9, -h + 2 - bounce, 4, 3, '#dbe6f2');
    px(ctx, 7, -h + 2 - bounce, 4, 3, '#dbe6f2');
  }
  ctx.restore();
  return true;
}
