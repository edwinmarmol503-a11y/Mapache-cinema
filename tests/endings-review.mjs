import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
const output = path.resolve('test-results/endings-v6');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { checks: [], layouts: [], errors: [], apiRequests: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) {
      report.apiRequests.push({ method: route.request().method(), path: url.pathname });
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"ending_review_offline"}' });
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  await page.evaluate(async () => { await document.fonts.ready; await MC.Audio.loadTrackManifest(); MC.Audio.master.gain.value = 0; });
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#developer-controls summary').click();
  await page.locator('#developer-code').fill('wrong');
  await page.locator('.developer-unlock button').click();
  await page.waitForFunction(() => document.getElementById('developer-code-status').textContent === 'Código incorrecto.');
  assert.equal(await page.locator('.developer-endings').isVisible(), false);
  await page.locator('#developer-code').fill('Animacion-cinema');
  await page.locator('.developer-unlock button').click();
  await page.locator('.developer-endings').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => MC.Controls.getMode()), 'keyboard');
  assert.equal(await page.evaluate(() => MC.Controls.isUnlocked()), false);
  report.checks.push('Correct gallery code reveals A/B/C without enabling controller mode; wrong code stays closed');
  const before = await page.evaluate(() => JSON.stringify({ data: MC.Save.data, storage: { ...localStorage } }));
  const apiBefore = report.apiRequests.length;
  for (const ending of ['A', 'B', 'C']) {
    if (ending !== 'A') {
      await page.locator('#victory-menu').click();
      await page.locator('#menu-nav [data-act="credits"]').click();
    }
    await page.locator(`[data-preview-ending="${ending}"]`).click();
    await page.waitForFunction(expected => MC.getState() === 'credits' && MC.Audio.getMusicStatus().id === expected && MC.Audio.getMusicStatus().position > .05,
      ending === 'B' ? 'final-malo' : 'pista-34');
    assert.equal(await page.locator('#screen-victory').getAttribute('data-ending'), ending);
    assert.equal(await page.locator('#victory-preview').isVisible(), true);
    assert.equal(await page.evaluate(() => MC.Audio._media.loop), false);
    await page.waitForTimeout(700);
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        return { title: box('#victory-title'), story: box('#victory-narration'), back: box('#victory-menu'), frameInset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--screen-inset')), viewport: { w: innerWidth, h: innerHeight } };
      });
      assert.ok(layout.title.x >= -1 && layout.title.right <= viewport.width + 1, ending + ': title fits');
      assert.ok(layout.story.x >= 0 && layout.story.right <= viewport.width + 1, ending + ': story fits horizontally');
      assert.ok(layout.story.y >= layout.title.bottom, ending + ': story clears headline');
      assert.ok(layout.story.bottom <= layout.back.y, ending + ': story clears menu button');
      assert.ok(layout.back.bottom <= viewport.height - layout.frameInset, ending + ': menu button stays above the TV cabinet');
      assert.ok(layout.back.right <= viewport.width - layout.frameInset, ending + ': menu button clears the right TV cabinet');
      report.layouts.push({ ending, ...layout });
      await page.screenshot({ path: path.join(output, `ending-${ending}-${viewport.width}.png`) });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  assert.equal(await page.evaluate(() => JSON.stringify({ data: MC.Save.data, storage: { ...localStorage } })), before, 'preview never changes local records, inventory or progress');
  assert.equal(report.apiRequests.length, apiBefore, 'preview sends no player, run or leaderboard requests');
  report.checks.push('All three full-screen previews use the correct fixed song, fit 1920/844/568, preserve save and send no API writes');
  await page.locator('#victory-menu').click();
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('[data-preview-ending="B"]').click();
  await page.waitForFunction(() => MC.Audio.getMusicStatus().id === 'final-malo' && MC.Audio._media.currentTime > .05);
  await page.evaluate(() => {
    window.endingNativeEvents = [];
    MC.Audio._media.addEventListener('ended', event => window.endingNativeEvents.push(event.isTrusted), { once: true });
    MC.Audio._media.playbackRate = 16;
    MC.Audio._media.currentTime = Math.max(0, MC.Audio._media.duration - 1);
  });
  await page.waitForFunction(() => MC.getState() === 'menu' && MC.Audio.getMusicStatus().id === 'pista-37', null, { timeout: 20000 });
  assert.deepEqual(await page.evaluate(() => window.endingNativeEvents), [true]);
  report.checks.push('Native end of Final malo returns to ARCADE without looping or advancing the level sequence');
  assert.deepEqual(report.errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, layouts: report.layouts.length, errors: report.errors }, null, 2));
} catch (error) {
  report.failure = error.stack;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally { await browser.close(); }
