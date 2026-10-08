import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Uses development Playwright, or the bundled module supplied by the caller.
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const previewOrigin = new URL(baseURL).origin;
const output = path.resolve('test-results/viewport');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const measurements = [];
const mobileMeasurements = [];

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function checkCanvas(page, label, { mobile = false, scale = 'auto' } = {}) {
  await settle(page);
  const result = await page.evaluate(() => {
    const app = document.getElementById('app');
    const canvas = document.getElementById('gs');
    const appRect = app.getBoundingClientRect();
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(app);
    const padding = {
      left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight),
      top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom),
    };
    return {
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      available: {
        left: appRect.left + padding.left, right: appRect.right - padding.right,
        top: appRect.top + padding.top, bottom: appRect.bottom - padding.bottom,
        width: appRect.width - padding.left - padding.right,
        height: appRect.height - padding.top - padding.bottom,
      },
      logical: { width: canvas.width, height: canvas.height },
      dpr: devicePixelRatio,
      smoothing: canvas.getContext('2d').imageSmoothingEnabled,
      imageRendering: getComputedStyle(canvas).imageRendering,
      touch: app.classList.contains('touch-mode'),
      bodyOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    };
  });
  const { canvas: c, available: a } = result;
  assert.deepEqual(result.logical, { width: 480, height: 270 }, label + ': game resolution stays unchanged');
  assert.equal(result.touch, mobile, label + ': expected input layout');
  assert.equal(result.smoothing, false, label + ': pixel art is not smoothed');
  assert.equal(result.imageRendering, 'pixelated', label + ': crisp canvas scaling');
  assert.equal(result.bodyOverflow, false, label + ': no page overflow');
  assert.ok(c.x >= a.left - 1 && c.y >= a.top - 1 && c.x + c.width <= a.right + 1 && c.y + c.height <= a.bottom + 1,
    label + ': canvas stays inside usable screen area ' + JSON.stringify(result));
  // Allow at most one output pixel of height rounding; do not stretch 16:9.
  assert.ok(Math.abs(c.height - c.width * 270 / 480) <= 1, label + ': aspect ratio preserved');
  if (mobile || scale === 'auto') {
    assert.ok(Math.max(c.width / a.width, c.height / a.height) >= .97,
      label + ': canvas fills the limiting usable dimension ' + JSON.stringify(result));
  } else {
    const requested = Number(scale);
    const fit = Math.min(a.width / 480, a.height / 270);
    assert.ok(Math.abs(c.width - 480 * Math.min(requested, fit)) <= 1,
      label + ': manual scale is capped to fit the screen');
  }
  measurements.push({ label, ...result });
  return result;
}

async function makePage(profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: !!profile.mobile,
    hasTouch: !!profile.mobile,
    serviceWorkers: 'block',
  });
  // This visual regression never writes real records or contacts the live API.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'viewport_review_offline' }) });
    } else if (url.origin === previewOrigin) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  await context.addInitScript(({ scale, visual }) => {
    localStorage.setItem('mapache_cinema_opts_v1', JSON.stringify({ scale, visualMode: visual, music: 0, sfx: 0 }));
  }, { scale: profile.scale || 'auto', visual: profile.visual || 'day' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(profile.name + ': ' + error.message));
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  return { context, page };
}

async function restoreDialogue(page) {
  await page.evaluate(() => {
    MC.game.state = 'playing';
    window.__viewportDialogueAdvanced = false;
    MC.game.startDialogue([{ speaker: 'RIKO', text: 'Lumera. Mi ciudad. Cada luz, un recuerdo encendido.' }],
      () => { window.__viewportDialogueAdvanced = true; });
    MC.game.dialogue.char = 1000;
  });
}

async function startScene(page, { showToast = false } = {}) {
  await page.evaluate(() => {
    MC.menu.hooks.onPlayLevel('easy', 0, 'VIEWPORT-QA');
    MC.game.state = 'playing';
    MC.game.introT = 0;
    MC.game.weather = 'clear';
    MC.game.fadeAlpha = 0;
  });
  await restoreDialogue(page);
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing') && !!MC.game.player);
  await page.waitForFunction(() => !MC.game._rankingStarting);
  // Keep the real mobile toast in its screenshot to inspect its placement.
  // Desktop comparison waits for the deliberately disconnected API's toast.
  if (!showToast) await page.waitForFunction(() => !document.querySelector('#toast-layer .toast'));
}

async function checkMobileUI(page, label) {
  await settle(page);
  const result = await page.evaluate(() => {
    const canvas = document.getElementById('gs');
    const bounds = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const strokes = [];
    const strokeRect = ctx.strokeRect;
    ctx.strokeRect = function (x, y, width, height) {
      strokes.push({ x, y, width, height });
      return strokeRect.call(this, x, y, width, height);
    };
    try { MC.game.dialogue.render(ctx, canvas.width, canvas.height); }
    finally { ctx.strokeRect = strokeRect; }
    const outer = strokes[0];
    if (!outer) throw new Error('Expected an active dialogue box');
    const project = rect => ({
      x: bounds.x + rect.x * bounds.width / canvas.width,
      y: bounds.y + rect.y * bounds.height / canvas.height,
      width: rect.width * bounds.width / canvas.width,
      height: rect.height * bounds.height / canvas.height,
    });
    const rectOf = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const appStyle = getComputedStyle(document.getElementById('app'));
    return {
      choice: MC.game.dialogue.isChoice,
      dialogue: project({ x: outer.x - .5, y: outer.y - .5, width: outer.width + 1, height: outer.height + 1 }),
      movement: rectOf('.tc-movement'), actions: rectOf('.tc-actions'), pause: rectOf('.tc-pause'),
      hud: {
        timer: project({ x: 193, y: 5, width: 94, height: 27 }),
        objectives: project({ x: 378, y: 20, width: 96, height: 30 }),
        memories: project({ x: 444, y: 6, width: 30, height: 15 }),
      },
      usable: {
        left: parseFloat(appStyle.paddingLeft), top: parseFloat(appStyle.paddingTop),
        right: innerWidth - parseFloat(appStyle.paddingRight),
        bottom: innerHeight - parseFloat(appStyle.paddingBottom),
      },
      toolsCollapsed: document.querySelector('.tc-secondary').hidden,
    };
  });
  assert.equal(result.toolsCollapsed, true, label + ': secondary tools are collapsed');
  assert.equal(overlaps(result.dialogue, result.movement), false, label + ': dialogue clears joystick ' + JSON.stringify(result));
  assert.equal(overlaps(result.dialogue, result.actions), false, label + ': dialogue clears action buttons ' + JSON.stringify(result));
  for (const [name, hud] of Object.entries(result.hud)) {
    assert.equal(overlaps(result.pause, hud), false, label + ': pause clears HUD ' + name + ' ' + JSON.stringify(result));
  }
  const { pause: p, usable: u } = result;
  assert.ok(p.x >= u.left && p.y >= u.top && p.x + p.width <= u.right && p.y + p.height <= u.bottom,
    label + ': pause stays within usable viewport ' + JSON.stringify(result));
  assert.equal(p.width, 42, label + ': accessible pause target width');
  assert.equal(p.height, 42, label + ': accessible pause target height');
  mobileMeasurements.push({ label, ...result });
}

async function assertReleased(page, label) {
  await settle(page);
  const held = await page.evaluate(() => ({
    keys: MC.Input.keys.size, virtual: MC.Input._virtualHeld.size,
    activeButtons: document.querySelectorAll('#touch-layer .tc-btn.active').length,
  }));
  assert.deepEqual(held, { keys: 0, virtual: 0, activeButtons: 0 }, label + ': no held input remains after touch');
}

async function checkMobileInteraction(page, profile) {
  await checkMobileUI(page, profile.name + '/dialogue');
  await page.locator('.tc-a-interact').tap();
  await page.waitForFunction(() => window.__viewportDialogueAdvanced === true);
  await assertReleased(page, profile.name + '/dialogue-USAR');
  await page.evaluate(() => {
    MC.game.state = 'choice';
    window.__viewportChoicePicked = null;
    MC.game.dialogue.startChoice(
      'La esfera del Farolero late en tus manos. ¿Qué haces con la luz?',
      [
        { label: 'Devolverla a Lumera', value: 'A' },
        { label: 'Conservarla, como él', value: 'B' },
        { label: 'Compartirla con todos', value: 'C' },
      ],
      value => { window.__viewportChoicePicked = value; MC.game.state = 'playing'; },
    );
  });
  await checkMobileUI(page, profile.name + '/choice');
  await page.waitForFunction(() => !document.querySelector('#toast-layer .toast'));
  await page.screenshot({ path: path.join(output, profile.name + '-choice.png') });
  await page.locator('.tc-a-interact').tap();
  await page.waitForFunction(() => window.__viewportChoicePicked === 'A');
  await assertReleased(page, profile.name + '/choice-USAR');
  await restoreDialogue(page);
  await page.screenshot({ path: path.join(output, profile.name + '-dialogue-clear.png') });
}

try {
  const profiles = [
    { name: 'desktop-1280x600-dpr150', width: 1280, height: 600, dpr: 1.5 },
    { name: 'desktop-1920x900', width: 1920, height: 900, dpr: 1 },
    { name: 'desktop-800x450', width: 800, height: 450, dpr: 1 },
    { name: 'desktop-small-manual3', width: 360, height: 240, dpr: 1.25, scale: '3' },
    { name: 'desktop-manual1', width: 1280, height: 600, dpr: 1.5, scale: '1' },
    { name: 'desktop-manual2', width: 1280, height: 600, dpr: 1.5, scale: '2' },
    { name: 'mobile-844x390-saved1', width: 844, height: 390, dpr: 3, mobile: true, scale: '1' },
    { name: 'mobile-667x375', width: 667, height: 375, dpr: 2, mobile: true },
    { name: 'mobile-568x320', width: 568, height: 320, dpr: 2, mobile: true },
    { name: 'mobile-915x412', width: 915, height: 412, dpr: 2.625, mobile: true },
  ];
  for (const profile of profiles) {
    const { context, page } = await makePage(profile);
    try {
      const sizing = { mobile: !!profile.mobile, scale: profile.scale || 'auto' };
      const menu = await checkCanvas(page, profile.name + '/menu', sizing);
      assert.equal(menu.dpr, profile.dpr, profile.name + ': expected device scaling');
      await startScene(page, { showToast: !!profile.mobile });
      await checkCanvas(page, profile.name + '/game', sizing);
      assert.equal(await page.locator('#touch-layer').isVisible(), !!profile.mobile, profile.name + ': landscape controls');
      assert.equal(await page.locator('#rotate-overlay').isVisible(), false, profile.name + ': landscape needs no rotation prompt');
      await page.screenshot({ path: path.join(output, profile.name + '-day-game.png') });
      if (profile.mobile) await checkMobileInteraction(page, profile);
      if (profile.name === 'desktop-1280x600-dpr150') {
        await page.setViewportSize({ width: 800, height: 450 });
        await checkCanvas(page, profile.name + '/resize-small', sizing);
        await page.setViewportSize({ width: 1280, height: 600 });
        await checkCanvas(page, profile.name + '/resize-back', sizing);
      }
      if (profile.mobile) {
        if (profile.name === 'mobile-844x390-saved1') {
          // Headless devices have zero env() safe areas. Exercise asymmetric
          // effective padding to reproduce a landscape notch and home bar.
          await page.evaluate(() => {
            document.getElementById('app').style.padding = '4px 12px 21px 44px';
            MC.menu.hooks.applyScale('auto');
          });
          await checkCanvas(page, profile.name + '/asymmetric-safe-area', sizing);
          await checkMobileUI(page, profile.name + '/asymmetric-safe-area-dialogue');
          await page.screenshot({ path: path.join(output, profile.name + '-safe-area.png') });
          await page.evaluate(() => {
            document.getElementById('app').style.removeProperty('padding');
            MC.menu.hooks.applyScale('auto');
          });
          await checkCanvas(page, profile.name + '/safe-area-restored', sizing);
        }
        await page.evaluate(() => MC.menu.showOptions());
        assert.equal(await page.locator('#opt-scale').isDisabled(), true, profile.name + ': mobile uses fitted scaling');
      }
    } finally { await context.close(); }
  }

  const portrait = { name: 'mobile-rotate', width: 390, height: 844, dpr: 3, mobile: true, scale: '1' };
  const { context, page } = await makePage(portrait);
  try {
    await checkCanvas(page, 'mobile-rotate/portrait-menu', { mobile: true });
    await startScene(page);
    await checkCanvas(page, 'mobile-rotate/portrait-game', { mobile: true });
    assert.equal(await page.locator('#rotate-overlay').isVisible(), true, 'portrait game asks to rotate');
    assert.equal(await page.locator('#touch-layer').isVisible(), false, 'portrait game hides landscape controls');
    await page.screenshot({ path: path.join(output, 'mobile-portrait-rotate.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await checkCanvas(page, 'mobile-rotate/landscape-game', { mobile: true });
    assert.equal(await page.locator('#rotate-overlay').isVisible(), false, 'rotation prompt disappears in landscape');
    assert.equal(await page.locator('#touch-layer').isVisible(), true, 'landscape restores controls');
    await page.screenshot({ path: path.join(output, 'mobile-rotated-day-game.png') });
  } finally { await context.close(); }

  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2) + '\n');
  await writeFile(path.join(output, 'mobile-ui.json'), JSON.stringify(mobileMeasurements, null, 2) + '\n');
  console.log(`${measurements.length} viewport checks passed: maximum automatic fit, desktop manual scales, device scaling, landscape controls and phone rotation.`);
  console.log(`${mobileMeasurements.length} mobile UI checks passed: dialogue and choices clear controls, pause clears HUD, and USAR touch advances without held input.`);
  console.log('Screenshots and dimensions saved to ' + output);
} finally {
  await browser.close();
}
