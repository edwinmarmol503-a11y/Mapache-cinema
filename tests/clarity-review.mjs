import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = path.resolve('test-results/clarity');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"clarity_review_offline"}' });
    return url.origin === new URL(baseURL).origin ? route.continue() : route.abort();
  });
  await page.goto(baseURL + '/tests/visual-review.html');
  await page.waitForFunction(() => !document.querySelector('#result').textContent.includes('Comprobando'));
  assert.match(await page.locator('#result').textContent(), /comprobaciones correctas/);
  const result = await page.evaluate(async () => {
    const [{ Game }, { Dialogue }, { Save }, { LEVELS }, { Controls }, sprites] = await Promise.all([
      import('/js/game.js'), import('/js/dialogue.js'), import('/js/save.js'),
      import('/js/levels.js'), import('/js/control-mode.js'), import('/js/sprites.js'),
    ]);
    document.body.innerHTML = '<main id="clarity"></main>';
    const style = document.createElement('style');
    style.textContent = `body { margin:16px; background:#101927; color:#fff; font:16px Arial; }
      #clarity { display:block; }
      canvas { display:block; image-rendering:auto; width:960px; height:540px; margin-bottom:20px; }
      #enemies { width:960px; height:200px; }`;
    document.head.append(style);
    const measurements = [];
    const silent = new Proxy({}, { get: () => () => {} });
    for (const mode of ['keyboard', 'touch']) {
      Controls.initialize({ defaultMode: mode });
      for (const visualMode of ['night', 'day']) {
      for (let index = 0; index < LEVELS.length; index++) {
        const canvas = document.createElement('canvas');
        canvas.width = 1920; canvas.height = 1080;
        canvas.id = 'level-' + index + '-' + mode + '-' + visualMode;
        const ctx = canvas.getContext('2d'); ctx.textBaseline = 'middle';
        ctx.setTransform(4, 0, 0, 4, 0, 0);
        const save = { ...Save, data: null, persist() {}, loadOpts: () => ({ visualMode }),
          loadMeta: () => ({ progress: {}, nightmareDeaths: 0 }), saveMeta() {}, markLevelBeaten() {}, addScore() {} };
        const game = new Game(ctx, canvas, { audio: silent, save, dialogue: new Dialogue({ touch: mode === 'touch' }), logicalWidth: 480, logicalHeight: 270 });
        // Keep the fixture independent of the application backing-store setup.
        game.W = 480; game.H = 270; game.camera.vw = 480; game.camera.vh = 270;
        game.startAt('normal', index); await game._levelTicketPromise;
        game.state = 'playing'; game.fadeAlpha = 0; game.weather = 'clear';
        const before = game.enemies.map(enemy => enemy.rect());
        const dialogueLines = [...(LEVELS[index].triggers || []), ...(LEVELS[index].puzzles || [])]
          .flatMap(trigger => trigger.dialogue || []);
        const allLines = [...dialogueLines, ...(LEVELS[index].intro || []),
          { speaker: 'RIKO', text: '¡Luz, acción y aventura! La ciudad de Lumera recuperará sus faroles.' },
          { speaker: 'RIKO', text: 'A'.repeat(100) }];
        let outside = [], bodyFont = 0;
        const fillText = ctx.fillText;
        ctx.fillText = function (text, x, y, ...rest) {
          const width = this.measureText(text).width;
          const left = this.textAlign === 'right' ? x - width : this.textAlign === 'center' ? x - width / 2 : x;
          if (left < 0 || left + width > 480 || y < 0 || y > 262) outside.push(String(text));
          if (String(text).includes('Lumera')) bodyFont = Math.max(bodyFont, Number(this.font.match(/(\d+)px/)?.[1] || 0));
          return fillText.call(this, text, x, y, ...rest);
        };
        for (const line of allLines) {
          game.dialogue.start([line]); game.dialogue.char = String(line.text || line).length;
          game.dialogue.render(ctx, 480, 270);
        }
        game._startEndingChoice();
        game.dialogue.render(ctx, 480, 270);
        ctx.fillText = fillText;
        game.dialogue.active = false;
        game.skyMsgs = [{ text: 'HUD-TEST', t: 0.1, life: 1.5, color: '#ffffff' }];
        let calloutClear = false;
        ctx.fillText = function (text, x, y, ...rest) {
          if (text === 'HUD-TEST') {
            const size = Number(this.font.match(/(\d+)px/)?.[1] || 0);
            calloutClear = y - size / 2 > (game.boss ? 74 : 32);
          }
          return fillText.call(this, text, x, y, ...rest);
        };
        game.render();
        ctx.fillText = fillText;
        game.skyMsgs = [];
        measurements.push({ index, mode, visualMode, outside, bodyFont, calloutClear, before, after: game.enemies.map(enemy => enemy.rect()) });
        game.dialogue.start([allLines[allLines.length - 2]]); game.dialogue.char = 1000;
        game.state = 'playing';
        game.render();
        if (index === 0) document.querySelector('#clarity').append(canvas);
      }
      }
    }
    const canvas = document.createElement('canvas'); canvas.id = 'enemies'; canvas.width = 1920; canvas.height = 400;
    document.querySelector('#clarity').append(canvas);
    const ctx = canvas.getContext('2d'); ctx.scale(4, 4); ctx.fillStyle = '#14243a'; ctx.fillRect(0, 0, 480, 100);
    const enemyTypes = [
      ['drawSombra', 12, 12], ['drawCuervo', 14, 12],
      ['drawDevorador', 20, 14], ['drawGuardian', 16, 20],
    ];
    for (const [i, [name, width, height]] of enemyTypes.entries()) {
      for (const facing of [-1, 1]) {
        ctx.save(); ctx.translate(25 + i * 115 + (facing === 1 ? 45 : 0), 36); ctx.scale(2, 2);
        sprites[name](ctx, 0, 0, width, height, facing, 4, false, false); ctx.restore();
      }
      ctx.font = '600 11px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = '#e2ecf7';
      ctx.fillText(name.slice(4), 20 + i * 115, 93);
    }
    return measurements;
  });
  for (const item of result) {
    assert.deepEqual(item.outside, [], `dialogue inside viewport: ${item.index}/${item.mode}`);
    assert.ok(item.bodyFont >= 12, `readable body font: ${item.index}/${item.mode}`);
    assert.equal(item.calloutClear, true, 'floating messages leave the clock and boss information clear');
    assert.deepEqual(item.before, item.after, 'visual work preserves enemy hitboxes');
  }
  for (const mode of ['keyboard', 'touch']) for (const visualMode of ['night', 'day']) {
    await page.locator('#level-0-' + mode + '-' + visualMode).screenshot({ path: path.join(output, 'dialogue-' + mode + '-' + visualMode + '.png') });
  }
  await page.locator('#enemies').screenshot({ path: path.join(output, 'enemies.png') });
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('All five levels in night/day: 12px dialogue, accented text, long-word wrapping, ending choices and keyboard/touch layouts fit. Enemy hitboxes preserved. Screenshots: ' + output);
} finally {
  await browser.close();
}
