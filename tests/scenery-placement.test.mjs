import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, buildTileMap, TS } from '../js/levels.js';

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('every floor lantern stands on a solid tile or a one-way platform', () => {
  for (const level of LEVELS) {
    const map = buildTileMap(level);
    for (const light of level.lights) {
      if (light.mount === 'wall') continue;
      assert.ok(['#', '='].includes(map.tile(light.tx, light.ty + 1)), `${level.key}: unsupported lamp at ${light.tx},${light.ty}`);
      assert.equal(map.tile(light.tx, light.ty), '.', `${level.key}: lamp buried inside a platform`);
    }
  }
});

test('wall fixtures attach to actual tower masonry and never cover a banner', () => {
  const tower = LEVELS.find(level => level.key === 'tower');
  const map = buildTileMap(tower);
  for (const fixture of [...tower.lights, ...tower.scenery].filter(item => item.mount === 'wall')) {
    assert.ok(['left', 'right'].includes(fixture.side));
    const wallTileX = fixture.side === 'left' ? 2 : map.w - 3;
    const anchorY = fixture.type === 'banner' ? fixture.ty - 4 : fixture.ty - 1;
    assert.equal(map.tile(wallTileX, anchorY), '#', 'mount needs a real wall');
  }
  for (const light of tower.lights) {
    const lamp = { x: (light.tx + .5) * TS - 4, y: (light.ty + .5) * TS - 9, w: 8, h: 15 };
    for (const banner of tower.scenery.filter(item => item.type === 'banner')) {
      const cloth = { x: banner.tx * TS + 4, y: banner.ty * TS - 61, w: 15, h: 39 };
      assert.equal(overlaps(lamp, cloth), false, `lamp ${light.tx},${light.ty} covers banner ${banner.tx},${banner.ty}`);
    }
  }
});

test('ground scenery has supporting ground across its footprint', () => {
  const widths = { vent: 23, planter: 14, fern: 13, bench: 26, pipe: 7, sign: 32, puddle: 32 };
  for (const level of LEVELS) {
    const map = buildTileMap(level);
    for (const item of level.scenery.filter(item => item.mount !== 'wall')) {
      const width = item.w || widths[item.type] || TS;
      for (let x = item.tx * TS; x < item.tx * TS + width; x += 4) {
        assert.ok(['#', '='].includes(map.tile(Math.floor(x / TS), item.ty)), `${level.key}: ${item.type} over an unsupported tile`);
      }
    }
  }
});

test('checkpoint trash cans stand above the platform they save on', () => {
  for (const level of LEVELS) {
    const map = buildTileMap(level);
    for (const checkpoint of level.checkpoints || []) {
      assert.ok(['#', '='].includes(map.tile(checkpoint.tx, checkpoint.ty + 1)), `${level.key}: checkpoint floats below or beside its platform`);
      assert.equal(map.tile(checkpoint.tx, checkpoint.ty), '.', `${level.key}: checkpoint buried in terrain`);
    }
  }
});
