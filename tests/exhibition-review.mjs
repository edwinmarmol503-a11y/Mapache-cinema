import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise real Credits, menu, gameplay and mode transitions in a clean browser.
// Every API request is intercepted: this review cannot write to any database.
// The developer code is loaded from the ignored local file and never logged.
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const origin = new URL(baseURL).origin;
const output = path.resolve('test-results/exhibition');
const access = JSON.parse(await readFile('.local/developer-controls/access.json', 'utf8'));
const accessCode = access.code || access.accessCode;
assert.equal(typeof accessCode, 'string', 'local developer code is available');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { simulatedController: 'standard DualShock 4', physicalControllerTested: false, checks: [], blockedApiRequests: [], externalRequests: [], screenshots: [], errors: [] };
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (/\/api(?:\/|$)/.test(url.pathname)) {
    report.blockedApiRequests.push({ method: request.method(), pathname: url.pathname });
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"exhibition_review_offline"}' });
  } else if (url.origin === origin) await route.continue();
  else { report.externalRequests.push(url.origin); await route.abort(); }
});
await context.addInitScript(() => {
  localStorage.setItem('mapache_cinema_opts_v1', JSON.stringify({ music: 0, sfx: 0, scale: '2', visualMode: 'night', bindings: { jump: ['Space'], attack: ['KeyF'] } }));
  window.__padReads = 0;
  window.__pads = [];
  window.__makePad = () => ({ index: 0, id: 'DualShock 4 QA (simulado)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { window.__padReads++; return window.__pads; } });
});
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
async function frames(count = 4) {
  await page.evaluate(count => new Promise(resolve => {
    const step = () => { if (--count <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), count);
}
async function button(index, held = true) {
  await page.evaluate(({ index, held }) => {
    const pad = window.__pads[0];
    if (!pad) throw new Error('QA controller is not connected');
    pad.buttons[index] = { pressed: held, touched: held, value: held ? 1 : 0 };
  }, { index, held });
  await frames();
}
async function tap(index) {
  // One physical tap spans one poll, even when Full HD rendering or another
  // browser makes a frame slow. Holding for several frames could cause the
  // intentional directional repeat and make menu-position assertions flaky.
  await page.evaluate(index => new Promise((resolve, reject) => {
    const pad = window.__pads[0];
    if (!pad) throw new Error('QA controller is not connected');
    const before = window.__padReads;
    const deadline = performance.now() + 5000;
    pad.buttons[index] = { pressed: true, touched: true, value: 1 };
    const sampled = () => {
      if (window.__padReads === before) {
        if (performance.now() > deadline) { reject(new Error('QA controller was not polled within five seconds')); return; }
        requestAnimationFrame(sampled); return;
      }
      pad.buttons[index] = { pressed: false, touched: false, value: 0 };
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    };
    requestAnimationFrame(sampled);
  }), index);
}
async function mode(value) {
  await page.locator('#developer-control-mode').selectOption(value);
  await page.waitForFunction(value => MC.Controls.getMode() === value, value);
  await frames();
}
async function state() {
  return page.evaluate(() => ({
    mode: MC.Controls.getMode(), unlocked: MC.Controls.isUnlocked(), pad: MC.gamepad.getStatus(), reads: window.__padReads,
    state: MC.game.state, paused: MC.pause.active, dialogue: MC.game.dialogue.active,
    appState: MC.getState(), music: MC.Audio.getMusicStatus(),
    input: { jump: MC.Input.down('jump'), right: MC.Input.down('right'), attack: MC.Input.down('attack'), interact: MC.Input.down('interact') },
    virtualSources: [...MC.Input._virtualHeld.keys()],
    player: MC.game.player ? { x: MC.game.player.x, y: MC.game.player.y, vx: MC.game.player.vx, vy: MC.game.player.vy, onGround: MC.game.player.onGround, jumpBuffer: MC.game.player.jumpBuffer, usedDouble: MC.game.player.usedDouble, attackT: MC.game.player.attackT, swingId: MC.game.player._swingId } : null,
    canvas: { backingWidth: document.getElementById('gs').width, backingHeight: document.getElementById('gs').height, cssWidth: document.getElementById('gs').getBoundingClientRect().width },
  }));
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  report.screenshots.push(name + '.png');
}
function check(name) { report.checks.push(name); }

try {
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  await page.waitForFunction(() => MC.Audio.getMusicStatus().configuredTracks === 37);
  assert.deepEqual(await page.evaluate(() => MC.Input.bindings.jump), ['KeyW', 'ArrowUp']);
  assert.deepEqual(await page.evaluate(() => MC.Input.bindings.attack), ['KeyF'], 'custom keyboard bindings survive the legacy jump migration');
  assert.equal(await page.evaluate(() => MC.Save.loadOpts().bindingVersion), 4);
  assert.equal(await page.locator('#opt-scale').count(), 0);
  check('all 37 tracks load; legacy Space jump migrates without resetting custom keys; the obsolete scale option is removed');
  await page.evaluate(() => { const pad = window.__makePad(); pad.buttons[0].pressed = true; pad.buttons[0].value = 1; pad.axes[0] = .8; window.__pads = [pad]; });
  await frames(8);
  const locked = await state();
  assert.equal(locked.reads, 0);
  assert.equal(locked.input.jump, false);
  assert.equal(await page.evaluate(() => MC.Controls.setMode('gamepad')), false);
  check('public session ignores connected controllers and rejects mode changes');

  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#developer-controls summary').click();
  await page.locator('#developer-code').fill('INVALID-QA-CODE');
  await page.locator('.developer-unlock button').click();
  await page.waitForFunction(() => document.getElementById('developer-code-status').textContent.includes('incorrecto'));
  assert.equal(await page.evaluate(() => MC.Controls.isUnlocked()), false);
  assert.equal((await state()).reads, 0);
  check('Credits rejects an incorrect code without reading controller state');

  await page.locator('#developer-code').fill(accessCode);
  await page.locator('.developer-unlock button').click();
  await page.waitForFunction(() => MC.Controls.isUnlocked());
  await mode('gamepad');
  assert.equal((await state()).pad.ready, false);
  assert.equal((await state()).input.jump, false);
  await page.evaluate(() => { window.__pads = [window.__makePad()]; });
  await page.waitForFunction(() => MC.gamepad.getStatus().ready);
  assert.ok((await state()).reads > 0);
  await screenshot('full-hd-developer-controls');
  check('correct code unlocks all three modes; DS4 must return to neutral before use');

  await tap(1);
  await page.waitForFunction(() => !document.getElementById('screen-menu').classList.contains('hidden'));
  // Navigate with the actual directional callback, then return to PLAY.
  await tap(13);
  assert.ok(await page.locator('#menu-nav .gamepad-focus').count());
  await tap(12);
  assert.equal(await page.locator('#menu-nav .gamepad-focus').getAttribute('data-act'), 'play');
  await tap(0);
  await page.waitForFunction(() => !document.getElementById('screen-nick').classList.contains('hidden') && document.activeElement.id === 'nick-go');
  await button(0);
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing'));
  await frames(8);
  assert.equal((await state()).input.jump, false, 'held PLAY confirmation must never become a jump');
  assert.equal(await page.evaluate(() => MC.game.dialogue.i), 0, 'held confirmation cannot skip the opening dialogue');
  await button(0, false);
  await page.waitForFunction(() => MC.game.state === 'playing' && !MC.game.transition, null, { timeout: 10000 });
  check('controller navigation enters nickname and starts without a keyboard or inherited jump');

  await page.waitForFunction(() => MC.game.dialogue.active, null, { timeout: 5000 });
  assert.equal((await state()).dialogue, true);
  const beforeDialogue = await page.evaluate(() => ({ i: MC.game.dialogue.i, char: MC.game.dialogue.char }));
  await tap(2);
  const afterDialogue = await page.evaluate(() => ({ i: MC.game.dialogue.i, char: MC.game.dialogue.char }));
  assert.ok(afterDialogue.i > beforeDialogue.i || afterDialogue.char > beforeDialogue.char);
  await screenshot('full-hd-dialogue');
  for (let count = 0; count < 12 && (await state()).dialogue; count++) await tap(3);
  assert.equal((await state()).dialogue, false);
  await page.waitForFunction(() => MC.game.player.onGround, null, { timeout: 5000 });
  // Later control checks deliberately spend time in place near a patrol.
  // Keep combat damage from turning this input review into a survival test.
  await page.evaluate(() => { MC.game.player.invuln = 300; });
  check('Square as well as Triangle advance the real level dialogue');

  // Closing a line with a held action must not execute the same action in the
  // world on the next simulation step or skip several lines at once.
  await page.evaluate(() => {
    MC.game.dialogue.start([{ speaker: 'RIKO', text: 'Un control permite seguir; mantenerlo no salta el resto.' }, { speaker: 'RIKO', text: 'La segunda línea conserva su propia pulsación.' }]);
    MC.game.dialogue.char = MC.game.dialogue.lines[0].text.length;
  });
  await button(2); await frames(8);
  assert.equal(await page.evaluate(() => MC.game.dialogue.i), 1);
  assert.equal((await state()).dialogue, true, 'holding Square cannot skip the next dialogue line');
  await button(2, false);
  await page.evaluate(() => { MC.game.dialogue.char = MC.game.dialogue.lines[1].text.length; });
  const beforeClosingSwing = (await state()).player.swingId;
  await button(2); await frames(8);
  assert.equal((await state()).dialogue, false);
  assert.equal((await state()).player.swingId, beforeClosingSwing, 'the action that closes dialogue cannot attack on the next frame');
  await button(2, false); await tap(2);
  assert.ok((await state()).player.swingId > beforeClosingSwing, 'a new action after dialogue still attacks normally');
  await frames(25);
  check('holding an action advances one line and never carries an attack into the world after closing dialogue');

  await page.evaluate(() => {
    window.__choicePicked = null;
    MC.game.state = 'choice';
    MC.game.dialogue.startChoice('Elige con la cruceta y confirma con un botón de acción.', [{ label: 'Primera opción', value: 'first' }, { label: 'Segunda opción', value: 'second' }], value => { window.__choicePicked = value; MC.game.state = 'playing'; });
  });
  await tap(12);
  assert.equal(await page.evaluate(() => MC.game.dialogue.choiceIndex), 1);
  assert.equal(await page.evaluate(() => window.__choicePicked), null);
  assert.equal((await state()).dialogue, true, 'Up navigates the choice without also confirming through its jump mapping');
  await screenshot('full-hd-choice');
  await tap(2);
  assert.equal(await page.evaluate(() => window.__choicePicked), 'second');
  check('Up navigates dialogue choices without confirming them; any action button confirms the selected option');

  const beforeMove = (await state()).player.x;
  await page.evaluate(() => { window.__pads[0].axes[0] = .8; });
  await frames(14);
  assert.ok((await state()).player.x > beforeMove + 2, 'left stick moves the player');
  await page.evaluate(() => { window.__pads[0].axes[0] = 0; });
  await frames(5);
  const groundedY = (await state()).player.y;
  await button(12);
  assert.ok((await state()).player.y < groundedY - 1, 'D-pad Up jumps from the ground');
  assert.equal((await state()).input.jump, true);
  await frames(8);
  assert.equal((await state()).player.usedDouble, false, 'holding Up cannot repeatedly trigger the double jump');
  await button(12, false);
  assert.equal((await state()).input.jump, false);
  await page.waitForFunction(() => MC.game.player.onGround, null, { timeout: 5000 });
  await screenshot('full-hd-gameplay');
  const display = (await state()).canvas;
  assert.ok(display.backingWidth >= 1440, 'Full HD backing is sharper than the old 480 pixel canvas');
  await tap(0); await frames(3);
  assert.equal((await state()).input.jump, false, 'X confirms without acting as a dedicated jump button');
  assert.ok((await state()).player.jumpBuffer <= 0, 'X never queues a jump');
  check('left stick moves; Up jumps once and releases; X only confirms; Full HD backing resolution ignores legacy fixed scale');

  await button(9);
  assert.equal((await state()).paused, true);
  const settingsTrack = (await state()).music.id;
  await frames(8);
  assert.equal((await state()).paused, true, 'held Options toggles pause only once');
  await screenshot('full-hd-pause');
  await button(9, false);
  await tap(13);
  assert.equal(await page.locator('#screen-pause .gamepad-focus').getAttribute('data-act'), 'options');
  await tap(0);
  await page.waitForFunction(() => !document.getElementById('screen-options').classList.contains('hidden'));
  assert.equal((await state()).paused, true);
  const musicBefore = Number(await page.locator('#opt-music').inputValue());
  await tap(15);
  assert.equal(Number(await page.locator('#opt-music').inputValue()), musicBefore + 5, 'controller changes a real volume slider');
  await tap(14);
  await tap(9);
  assert.equal((await state()).paused, true, 'Options closes settings back to pause without resuming');
  assert.equal(await page.locator('#screen-options').evaluate(el => el.classList.contains('hidden')), true);
  assert.equal(await page.locator('#screen-pause').evaluate(el => el.classList.contains('hidden')), false);
  await tap(9);
  assert.equal((await state()).paused, false);
  assert.equal((await state()).music.id, settingsTrack, 'opening settings, returning and resuming preserve the selected song');
  check('Options pauses once per press; controller opens settings, changes volume and returns to pause before resuming');

  await page.evaluate(() => { window.__pads[0].axes[0] = .8; });
  await frames(4);
  assert.equal((await state()).input.right, true);
  await page.evaluate(() => { window.__pads = [null]; });
  await page.waitForFunction(() => MC.pause.active && !MC.Input.down('right'));
  const disconnected = await state();
  assert.equal(disconnected.pad.connected, false);
  assert.equal(disconnected.virtualSources.includes('gamepad:player'), false);
  await page.evaluate(() => { const pad = window.__makePad(); pad.buttons[0] = { pressed: true, value: 1 }; window.__pads = [pad]; });
  await frames(5);
  assert.equal((await state()).paused, true);
  assert.equal((await state()).pad.ready, false);
  assert.equal((await state()).input.jump, false);
  await button(0, false);
  assert.equal((await state()).pad.ready, true);
  await tap(9);
  assert.equal((await state()).paused, false);
  check('disconnect pauses and releases; reconnect cannot resume or replay held inputs');

  await tap(9);
  // End the test run locally before opening Credits to change input modes.
  await page.locator('#screen-pause [data-act="menu"]').click();
  await page.locator('#menu-nav [data-act="credits"]').click();
  if (!(await page.locator('#developer-controls').evaluate(el => el.open))) await page.locator('#developer-controls summary').click();
  await page.evaluate(() => { window.__pads[0].axes[0] = .8; });
  await frames(4);
  await mode('keyboard');
  const keyboardState = await state();
  assert.equal(keyboardState.pad.enabled, false);
  assert.equal(keyboardState.virtualSources.includes('gamepad:player'), false);
  const keyboardReads = keyboardState.reads; await frames(5);
  assert.equal((await state()).reads, keyboardReads);
  // Native form controls intentionally keep arrows for selection, so test
  // physical gameplay input after focus leaves the mode selector.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('ArrowRight');
  assert.equal(await page.evaluate(() => MC.Input.down('right')), true);
  await mode('touch');
  assert.equal(await page.evaluate(() => MC.Input.keys.size), 0);
  assert.equal((await state()).input.right, false);
  await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(() => MC.game.dialogue.touch), true);
  assert.ok(await page.locator('#touch-layer').count());
  check('keyboard and touch switching releases old sources and disables controller polling');

  await page.locator('#screen-credits [data-act="back"]').click();
  await page.setViewportSize({ width: 568, height: 320 });
  await page.locator('#menu-nav [data-act="continue"]').click();
  await page.waitForFunction(() => MC.game.state === 'playing' && !MC.game.transition, null, { timeout: 10000 });
  // Spawn triggers run on the first live world step, after the intro title.
  // Wait for either their dialogue or landing before settling the test player.
  await page.waitForFunction(() => MC.game.dialogue.active || MC.game.player.onGround, null, { timeout: 5000 });
  while ((await state()).dialogue) await page.evaluate(() => MC.game.dialogue.advance());
  await page.waitForFunction(() => MC.game.player.onGround, null, { timeout: 5000 });
  await page.evaluate(() => { MC.game.player.invuln = 300; });
  assert.equal(await page.locator('#touch-layer .tc-a-jump').count(), 0);
  const mobileTargets = await page.locator('#touch-layer button').evaluateAll(buttons => buttons.filter(el => el.offsetWidth && el.offsetHeight).map(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  assert.ok(mobileTargets.every(r => r.w >= 44 && r.h >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 568 && r.y + r.h <= 320));
  const beforeTouchJump = (await state()).player.y;
  await page.locator('.tc-joystick').evaluate(el => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 25, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 25, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height * .24, bubbles: true }));
  });
  await frames(5);
  assert.ok((await state()).player.y < beforeTouchJump - 1, 'a real joystick pointer movement Up jumps');
  assert.equal((await state()).input.jump, true);
  assert.equal((await state()).player.usedDouble, false);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 25 })));
  await frames(3);
  assert.equal((await state()).input.jump, false);
  await page.waitForFunction(() => MC.game.player.onGround, null, { timeout: 5000 });
  await screenshot('mobile-joystick-controls');
  check('integrated 568x320 touch layout has no Jump button, preserves 44px targets and jumps/releases through native joystick pointer handlers');

  await page.evaluate(() => MC.game.hooks.onVictory('C'));
  await page.waitForFunction(() => MC.getState() === 'credits' && !document.getElementById('screen-victory').classList.contains('hidden'));
  assert.equal(await page.locator('#victory-title').textContent(), 'FELICIDADES');
  assert.equal(await page.locator('.ending-mark-left').textContent(), 'EKD');
  assert.equal(await page.locator('.ending-mark-right').textContent(), '3E');
  assert.equal((await state()).music.theme, 'ending');
  assert.match((await state()).music.title, /LO QUE SOY/i);
  await screenshot('mobile-ending-credits');
  await page.locator('#victory-menu').click();
  assert.equal((await state()).appState, 'menu');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => MC.game.hooks.onVictory('C'));
  // The same media element is reused: metadata alone can still belong to the
  // previous source while the new credits song is loading. Wait for playback,
  // then let the complete native stream end at an accelerated rate.
  await page.waitForFunction(() => MC.Audio.getMusicStatus().mode === 'external' && MC.Audio._media?.readyState >= 3 && !MC.Audio._media.paused, null, { timeout: 15000 });
  await page.locator('#screen-victory .victory-box').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  await screenshot('full-hd-ending-credits');
  await page.evaluate(() => {
    const media = MC.Audio._media;
    const startedAt = performance.now();
    const duration = media.duration;
    const src = media.currentSrc;
    media.addEventListener('ended', () => {
      window.__endingEvidence = { duration, src, elapsedWallSeconds: (performance.now() - startedAt) / 1000, nativeEnded: true, playbackRate: 16 };
    }, { once: true });
    media.playbackRate = 16;
  });
  await page.waitForFunction(() => MC.getState() === 'menu' && window.__endingEvidence?.nativeEnded, null, { timeout: 30000 });
  report.endingEvidence = await page.evaluate(() => window.__endingEvidence);
  assert.match(report.endingEvidence.src, /pista-34\.mp3$/);
  assert.equal(report.endingEvidence.duration, 161.52);
  await page.evaluate(() => { MC.Audio._media.playbackRate = 1; });
  check('ending credits display EKD/FELICIDADES/3E, use LO QUE SOY, return manually and close on the actual media ended event');

  await page.locator('#menu-nav [data-act="credits"]').click();
  if (!(await page.locator('#developer-controls').evaluate(el => el.open))) await page.locator('#developer-controls summary').click();

  await page.evaluate(() => { window.__pads = [window.__makePad()]; });
  await mode('gamepad');
  await page.waitForFunction(() => MC.gamepad.getStatus().ready);
  // A normal reload while access is still open must also close the local gate.
  await page.reload();
  await page.waitForFunction(() => !!window.MC);
  await frames(5);
  assert.equal((await state()).unlocked, false);
  assert.equal((await state()).reads, 0);
  assert.equal((await state()).mode, 'keyboard');
  check('reloading an unlocked session requires the code again');
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#developer-controls summary').click();
  await page.locator('#developer-code').fill(accessCode);
  await page.locator('.developer-unlock button').click();
  await page.waitForFunction(() => MC.Controls.isUnlocked());
  await mode('gamepad');
  await page.locator('.developer-lock').click();
  assert.equal((await state()).unlocked, false);
  assert.equal((await state()).pad.enabled, false);
  assert.equal((await state()).mode, 'keyboard');
  assert.equal(await page.evaluate(() => MC.Controls.setMode('gamepad')), false);
  await page.reload();
  await page.waitForFunction(() => !!window.MC);
  await frames(5);
  assert.equal((await state()).unlocked, false);
  assert.equal((await state()).reads, 0);
  check('closing developer access disables the controller; reload requires the code again');

  assert.deepEqual(report.errors, [], 'no browser runtime errors');
  assert.ok(report.blockedApiRequests.length > 0, 'ranking requests were blocked before reaching a database');
  await writeFile(path.join(output, 'review.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, blockedApiRequests: report.blockedApiRequests.length, screenshots: report.screenshots, physicalControllerTested: false, errors: report.errors }, null, 2));
} catch (error) {
  report.failure = error.message;
  report.failureState = await state().catch(() => null);
  await screenshot('failure').catch(() => {});
  await writeFile(path.join(output, 'review.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
