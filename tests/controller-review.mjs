import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(playwrightPath) ? pathToFileURL(playwrightPath).href : playwrightPath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = path.resolve('test-results/controller-v5');
await mkdir(output, { recursive: true });
const report = { controller: 'DualShock 4 simulado', physicalControllerTested: false, checks: [], errors: [], screenshots: [], blockedApiRequests: 0 };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
await context.route('**/api/**', route => { report.blockedApiRequests++; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"controller_review_offline"}' }); });
await context.addInitScript(() => {
  if (!localStorage.getItem('mapache_cinema_opts_v1')) localStorage.setItem('mapache_cinema_opts_v1', JSON.stringify({ music: 0, sfx: 0 }));
  window.__padReads = 0;
  window.__pads = [{ index: 0, id: 'DualShock 4 QA simulado', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { window.__padReads++; return window.__pads; } });
});
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
const frames = async (count = 4) => page.evaluate(count => new Promise(resolve => {
  const next = () => { if (--count <= 0) resolve(); else requestAnimationFrame(next); }; requestAnimationFrame(next);
}), count);
async function held(index, down) {
  await page.evaluate(({ index, down }) => { window.__pads[0].buttons[index] = { pressed: down, value: down ? 1 : 0 }; }, { index, down });
  await frames();
}
async function tap(index) {
  await page.evaluate(index => new Promise((resolve, reject) => {
    const device = window.__pads[0], before = window.__padReads, deadline = performance.now() + 5000;
    device.buttons[index] = { pressed: true, value: 1 };
    const next = () => {
      if (window.__padReads === before) { if (performance.now() > deadline) reject(new Error('Mando no sondeado')); else requestAnimationFrame(next); return; }
      device.buttons[index] = { pressed: false, value: 0 }; requestAnimationFrame(() => requestAnimationFrame(resolve));
    }; requestAnimationFrame(next);
  }), index);
}
// Find a path through the actual menu's geometric navigation, then execute
// only physical D-pad presses. This also proves each mapping is reachable.
async function navigateTo(selector) {
  await tap(12);
  const directions = await page.evaluate(selector => {
    const screen = MC.menu._activeGamepadScreen(), targets = MC.menu._gamepadTargets(screen), target = document.querySelector(selector);
    const focused = MC.menu._gamepadFocus;
    if (!targets.includes(target)) throw new Error('El objetivo no es un control visible del mando: ' + selector);
    const choices = [['up', 12, true, -1], ['down', 13, true, 1], ['left', 14, false, -1], ['right', 15, false, 1]];
    const nextTarget = (from, vertical, direction) => {
      const a = from.getBoundingClientRect(), x = a.left + a.width / 2, y = a.top + a.height / 2;
      const candidates = targets.filter(el => el !== from).map(el => {
        const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - x, dy = b.top + b.height / 2 - y;
        const primary = (vertical ? dy : dx) * direction, cross = Math.abs(vertical ? dx : dy);
        return { el, primary, score: primary + cross * 2 };
      }).filter(value => value.primary > 3).sort((a, b) => a.score - b.score);
      return candidates[0]?.el || targets[(targets.indexOf(from) + direction + targets.length) % targets.length];
    };
    const queue = [[focused, []]], visited = new Set([focused]);
    while (queue.length) {
      const [from, path] = queue.shift(); if (from === target) return path;
      for (const [, button, vertical, direction] of choices) {
        // Horizontal input edits these values instead of moving focus.
        if (!vertical && (from.tagName === 'SELECT' || from.type === 'range')) continue;
        const next = nextTarget(from, vertical, direction);
        if (!visited.has(next)) { visited.add(next); queue.push([next, [...path, button]]); }
      }
    }
    throw new Error('El objetivo no se puede alcanzar con cruceta: ' + selector);
  }, selector);
  for (const direction of directions) await tap(direction);
  assert.equal(await page.evaluate(selector => MC.menu._gamepadFocus === document.querySelector(selector), selector), true, 'real D-pad reached ' + selector);
}
const check = name => report.checks.push(name);
const shot = async name => { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); report.screenshots.push(name + '.png'); };

try {
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  assert.equal(await page.evaluate(() => window.__padReads), 0);
  await page.locator('#menu-nav [data-act="options"]').click();
  assert.equal(await page.locator('#control-list').isVisible(), true);
  assert.equal(await page.locator('#opt-reset-controls').isVisible(), true);
  assert.equal(await page.locator('#controller-settings').isVisible(), false);
  assert.equal(await page.locator('.controller-cancel').isVisible(), false);
  await shot('keyboard-options-no-controller');
  check('keyboard options visibly show keyboard bindings/reset and hide the controller panel and capture cancellation');
  await page.locator('#screen-options [data-act="back"]').click();
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#developer-controls summary').click();
  await page.locator('#developer-code').fill('Mapache-cinema');
  await page.locator('.developer-unlock button').click();
  await page.waitForFunction(() => MC.Controls.getMode() === 'gamepad' && MC.gamepad.getStatus().ready);
  assert.equal(await page.locator('#developer-control-mode').count(), 0);
  assert.equal(await page.evaluate(() => MC.Controls.setMode('touch')), false);
  assert.equal(await page.evaluate(() => MC.Controls.setMode('keyboard')), false);
  check('Mapache-cinema enables only the controller; no mode selector or locked pad polling');
  await navigateTo('.developer-configure'); await tap(0);
  await page.waitForFunction(() => !document.getElementById('screen-options').classList.contains('hidden'));
  assert.equal(await page.locator('#controller-settings button[data-pad-bind]').count(), 13);
  assert.equal(await page.locator('#controller-settings').isVisible(), true);
  assert.equal(await page.locator('#control-list').isVisible(), false);
  assert.equal(await page.locator('#opt-reset-controls').isVisible(), false);
  assert.equal(await page.locator('.controller-cancel').isVisible(), false);
  check('mando options visibly hide keyboard rows/reset and show only the controller configuration');
  await navigateTo('[data-pad-bind="jump"]');
  await held(0, true);
  await page.waitForFunction(() => document.querySelector('[data-pad-bind="jump"]').textContent.includes('Suelta'));
  assert.equal(await page.locator('.controller-cancel').isVisible(), true);
  assert.equal(await page.evaluate(() => MC.Save.loadOpts().padBindings.jump), 0);
  await held(0, false);
  await page.waitForFunction(() => document.querySelector('[data-pad-bind="jump"]').textContent.includes('Pulsa'));
  await held(2, true);
  await page.waitForFunction(() => MC.Save.loadOpts().padBindings.jump === 2 && MC.Save.loadOpts().padBindings.attack === 0);
  assert.equal(await page.locator('.controller-cancel').isVisible(), false);
  assert.equal(await page.evaluate(() => MC.Input.down('jump') || MC.Input.down('attack')), false);
  await held(2, false);
  assert.equal(await page.evaluate(() => MC.Controls.getHint('jump')), '□');
  await shot('full-hd-controller-remap');
  check('mando navigation opens settings; held confirm is ignored; buttons swap and save without carry');
  // All actions must be reachable on a television, including the final rows.
  for (const action of ['attack', 'dodge', 'parry', 'interact', 'throw', 'cycleL', 'cycleR', 'pause', 'left', 'right', 'up', 'down']) await navigateTo('[data-pad-bind="' + action + '"]');
  check('all thirteen mapping rows are reachable using only D-pad navigation');
  await navigateTo('[data-pad-bind="jump"]'); await tap(0);
  await page.waitForFunction(() => document.querySelector('[data-pad-bind="jump"]').textContent.includes('Pulsa'));
  await held(9, true);
  await page.waitForFunction(() => !document.querySelector('[data-pad-bind="jump"]').classList.contains('listening'));
  assert.equal(await page.locator('.controller-cancel').isVisible(), false);
  await held(9, false);
  assert.equal(await page.evaluate(() => MC.Save.loadOpts().padBindings.jump), 2);
  check('capture cancellation is visible only during capture; holding OPTIONS cancels without changing saved mappings');
  await page.reload();
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  assert.equal(await page.evaluate(() => MC.Controls.isUnlocked()), false);
  assert.equal(await page.evaluate(() => MC.Save.loadOpts().padBindings.jump), 2);
  assert.equal(await page.evaluate(() => window.__padReads), 0);
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#developer-controls summary').click();
  await page.locator('#developer-code').fill('Mapache-cinema'); await page.locator('.developer-unlock button').click();
  await page.waitForFunction(() => MC.gamepad.getStatus().ready);
  assert.equal(await page.evaluate(() => MC.Controls.getHint('jump')), '□');
  check('reload locks access while preserving the assigned controller layout');
  await page.evaluate(() => MC.game.hooks.onVictory('C'));
  await page.waitForFunction(() => MC.getState() === 'credits');
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.victory-box')).opacity) >= .99);
  await shot('full-hd-ending-mapped-attack');
  await tap(0);
  await page.waitForFunction(() => MC.getState() === 'menu');
  assert.equal(await page.evaluate(() => MC.Input.down('attack') || MC.Input.down('jump')), false);
  check('custom attack button exits the final credits and cannot carry into gameplay');
  await page.locator('#menu-nav [data-act="options"]').click();
  await navigateTo('.controller-reset'); await tap(0);
  assert.equal(await page.evaluate(() => MC.Save.loadOpts().padBindings.jump), 0);
  assert.equal(await page.evaluate(() => MC.Save.loadOpts().padBindings.attack), 2);
  check('restore defaults works entirely with the controller');
  for (const viewport of [{ width: 960, height: 540 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport); await frames(4);
    const layout = await page.evaluate(() => [...document.querySelectorAll('[data-pad-bind]')].map(el => { const box = el.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
    assert.ok(layout.every(box => box.width >= 44 && box.height >= 44));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }
  await shot('controller-settings-television');
  check('all mapping buttons remain 44 px or larger without horizontal overflow at 960×540 and Full HD');
  await tap(1);
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('.developer-lock').click();
  assert.equal(await page.evaluate(() => MC.Controls.getMode()), 'keyboard');
  await page.locator('#screen-credits [data-act="back"]').click();
  await page.locator('#menu-nav [data-act="options"]').click();
  assert.equal(await page.locator('#controller-settings').isVisible(), false);
  assert.equal(await page.locator('#opt-reset-controls').isVisible(), true);
  assert.equal(await page.locator('#control-list').isVisible(), true);
  await page.locator('#screen-options [data-act="back"]').click();
  await page.evaluate(() => MC.game.hooks.onVictory('C'));
  await page.waitForFunction(() => MC.getState() === 'credits');
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.victory-box')).opacity) >= .99);
  assert.equal(await page.locator('#victory-menu').isVisible(), true);
  assert.equal(await page.locator('#victory-pad-hint').isVisible(), false);
  await shot('keyboard-ending-no-controller-hint');
  check('closing mando access visibly restores keyboard settings and hides the controller hint in actual final credits');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.stack; await shot('failure'); throw error;
} finally {
  await writeFile(path.join(output, 'review.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
