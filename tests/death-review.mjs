import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const origin = new URL(baseURL).origin;
const output = path.resolve('test-results/death-v5');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const report = { checks: [], tracks: [], desktop: {}, mobile: {}, errors, apiRequestsBlocked: 0 };
const longPhrase = 'Uy... eso dolió. La ciudad todavía espera a su héroe: respira, sacúdete el polvo y vuelve a intentarlo.';

async function makePage(mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 568, height: 320 } : { width: 1920, height: 1080 },
    hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) {
      report.apiRequestsBlocked++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"death_review_offline"}' });
    }
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('mapache_cinema_opts_v1', JSON.stringify({ music: 42, sfx: 35, visualMode: 'night', touchMode: 'joystick' }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push((mobile ? 'mobile: ' : 'desktop: ') + error.message));
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  await page.evaluate(async () => { await MC.Audio.loadTrackManifest(); MC.Audio.master.gain.value = 0; });
  return { page, context };
}

async function state(page) {
  return page.evaluate(() => ({ state: MC.game.state, appState: MC.getState(), music: MC.Audio.getMusicStatus(), cue: MC.Audio.getCueStatus(),
    soul: MC.game._deathSoul, deaths: MC.game._rankDeaths, pending: MC.game._respawnSoundPending,
    reservation: MC.game._respawnReservation, player: MC.game.player ? { x: MC.game.player.x, y: MC.game.player.y, dead: MC.game.player.dead } : null,
    touch: MC.Controls.getMode() === 'touch', phraseVisible: !document.getElementById('screen-death').classList.contains('hidden') }));
}
async function waitMusic(page, id, theme = 'roofs') {
  await page.waitForFunction(expected => {
    const a = MC.Audio, m = a._media;
    return a.currentTrack === expected.theme && a.getMusicStatus().id === expected.id && a.getMusicStatus().mode === 'external' &&
      m && !m.paused && m.currentTime > .04 && !m.error;
  }, { id, theme }, { timeout: 15000 });
  return state(page);
}
async function start(page, mobile = false) {
  const click = async locator => mobile ? locator.tap() : locator.click();
  await click(page.locator('#menu-nav [data-act="play"]'));
  await page.locator('#nick-input').fill(mobile ? 'DEATH-MOBILE-QA' : 'DEATH-DESKTOP-QA');
  await click(page.locator('#nick-go'));
  await page.waitForFunction(() => MC.getState() === 'game' && !!MC.game.player);
  await page.evaluate(() => {
    const g = MC.game;
    g.state = 'playing'; g.dialogue.active = false; g.transition = null; g.fadeAlpha = 0;
    g.triggers.forEach(trigger => trigger.fired = true);
    const cp = g.checkpointRects[0];
    g.player.x = cp.x; g.player.y = 15 * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
    g._activateCheckpoint(cp); g.player.invuln = 60; g.camera.snapTo(g.player);
  });
  return waitMusic(page, 'pista-01');
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(output, name + '.png') }); }
async function death(page, reason = 'fall', held = false, imagePrefix = '') {
  await page.evaluate(reason => {
    const g = MC.game;
    g.dialogue.active = false; g.transition = null; g.state = 'playing'; g.player.invuln = 0;
    if (reason === 'enemy') {
      const enemy = g.enemies[0];
      if (!enemy) throw new Error('Expected a real enemy fixture');
      g.player.hp = 1; g.player.vy = 0;
      enemy.x = g.player.x; enemy.y = g.player.y; enemy.dead = false; enemy.stunT = 0;
      enemy._touch(g, 1 / 60);
      if (!g.player.dead) throw new Error('Actual enemy contact did not cause lethal damage');
    } else g.killPlayer(reason);
  }, reason);
  await page.waitForFunction(() => MC.game.state === 'dying' && MC.game._deathSoul?.elapsed > .35);
  const soul = await state(page);
  assert.ok(soul.soul, reason + ' gets a soul animation');
  assert.equal(soul.player.dead, true);
  assert.equal(soul.music.theme, null, 'background song stops when actual death happens');
  if (held) await page.keyboard.down('j');
  if (imagePrefix) await screenshot(page, imagePrefix + '-soul');
  await page.waitForFunction(() => MC.game.state === 'death-black' && MC.Audio.getCueStatus().mode === 'playing');
  const black = await state(page);
  const blackPresentation = await page.evaluate(() => {
    const app = document.getElementById('app'), c = document.getElementById('game');
    const canvas = c?.getContext ? c : document.querySelector('canvas');
    const pixels = canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    const layer = document.getElementById('touch-layer');
    const previousVisual = document.documentElement.dataset.visual;
    document.documentElement.dataset.visual = 'day';
    const dayBlack = { background: getComputedStyle(app).backgroundColor, shadow: getComputedStyle(canvas).boxShadow,
      border: getComputedStyle(canvas).borderColor, toastHidden: getComputedStyle(document.getElementById('toast-layer')).display === 'none' };
    document.documentElement.dataset.visual = previousVisual;
    return { dayBlack, black: app.classList.contains('death-screen'), phraseHidden: document.getElementById('screen-death').classList.contains('hidden'),
      controlsHidden: !layer || getComputedStyle(layer).display === 'none', centerPixel: [...pixels] };
  });
  assert.equal(blackPresentation.black, true);
  assert.equal(blackPresentation.dayBlack.background, 'rgb(0, 0, 0)', 'day mode still has a fully black death background');
  assert.equal(blackPresentation.dayBlack.shadow, 'none');
  assert.equal(blackPresentation.dayBlack.border, 'rgba(0, 0, 0, 0)');
  assert.equal(blackPresentation.dayBlack.toastHidden, true);
  assert.equal(blackPresentation.phraseHidden, true);
  assert.equal(blackPresentation.controlsHidden, true);
  assert.deepEqual(blackPresentation.centerPixel.slice(0, 3), [0, 0, 0]);
  if (imagePrefix) await screenshot(page, imagePrefix + '-black');
  await page.waitForFunction(() => MC.game.state === 'death-phrase', null, { timeout: 12000 });
  const phrase = await state(page);
  assert.equal(phrase.cue.mode, 'stopped', 'the quote waits in silence after the complete burla');
  assert.equal(phrase.music.theme, null);
  if (held) {
    await page.waitForTimeout(250);
    assert.equal((await state(page)).state, 'death-phrase', 'holding an earlier action cannot auto-respawn');
    await page.keyboard.up('j');
  }
  if (imagePrefix) {
    await page.evaluate(text => MC.game._deathPhrase = text, longPhrase);
    await page.waitForFunction(text => document.getElementById('death-phrase').textContent === text, longPhrase);
    const layout = await page.evaluate(() => {
      const el = document.getElementById('screen-death'), text = document.getElementById('death-phrase'), prompt = document.getElementById('death-prompt');
      const b = text.getBoundingClientRect(), p = prompt.getBoundingClientRect();
      return { scrollHeight: el.scrollHeight, height: el.clientHeight, textLeft: b.left, textRight: b.right, textBottom: b.bottom,
        promptTop: p.top, promptBottom: p.bottom, font: getComputedStyle(text).fontSize, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(layout.textLeft >= 0 && layout.textRight <= layout.viewportWidth);
    assert.ok(layout.textBottom <= layout.promptTop, 'long phrase never covers the retry button');
    assert.ok(layout.promptBottom <= layout.viewportHeight + 1, 'retry remains visible');
    await screenshot(page, imagePrefix + '-long-phrase');
    phrase.layout = layout;
  }
  return { soul, black, phrase, blackPresentation };
}
async function respawn(page, mobile = false, imagePrefix = '') {
  if (mobile) await page.locator('#death-prompt').tap(); else await page.keyboard.press('j');
  await page.waitForFunction(() => MC.game.state === 'playing' && !MC.game.player.dead && MC.Audio.getCueStatus().name === 'respawn' && MC.Audio.getCueStatus().mode === 'playing');
  const resumed = await state(page);
  assert.equal(resumed.music.theme, null);
  assert.equal(resumed.cue.id, 'reaparicion');
  assert.equal(resumed.phraseVisible, false);
  await page.evaluate(() => { MC.game.player.invuln = 60; MC.game.enemies = []; MC.game.triggers.forEach(trigger => trigger.fired = true); });
  if (imagePrefix) await screenshot(page, imagePrefix + '-respawn');
  return resumed;
}

try {
  const desktop = await makePage();
  const page = desktop.page;
  assert.equal(await page.evaluate(() => MC.Audio.getMusicStatus().configuredTracks), 41);
  await page.locator('#screen-menu').click({ position: { x: 8, y: 8 } });
  const menu = await waitMusic(page, 'pista-37', 'menu');
  await page.locator('#menu-nav [data-act="options"]').click();
  await page.locator('#screen-options [data-act="back"]').click();
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#screen-credits [data-act="back"]').click();
  const afterMenu = await state(page);
  assert.equal(afterMenu.music.id, menu.music.id);
  assert.ok(afterMenu.music.position >= menu.music.position);
  report.checks.push('ARCADE persists through options and informational credits');
  report.tracks = await page.evaluate(async () => {
    const result = [];
    for (const entry of MC.Audio._tracks.values()) {
      const response = await fetch(entry.src);
      if (!response.ok) throw new Error(entry.id + ': fetch ' + response.status);
      const bytes = await response.arrayBuffer(), byteLength = bytes.byteLength;
      const decoded = await MC.Audio.ctx.decodeAudioData(bytes);
      result.push({ id: entry.id, bytes: byteLength, duration: decoded.duration, channels: decoded.numberOfChannels });
    }
    return result;
  });
  assert.equal(report.tracks.length, 41);
  assert.ok(report.tracks.every(track => track.bytes > 0 && track.duration > 2 && track.channels > 0));
  report.checks.push('All 41 published-form MP3 files decode successfully');
  report.desktop.initial = await start(page);
  report.desktop.enemyDeath = await death(page, 'enemy', true, 'desktop-enemy');
  assert.equal(report.desktop.enemyDeath.black.cue.id, 'burla-01');
  report.desktop.firstRespawn = await respawn(page, false, 'desktop');
  assert.equal(report.desktop.firstRespawn.reservation.id, 'pista-02');
  const x = report.desktop.firstRespawn.player.x;
  await page.keyboard.down('a');
  await page.waitForFunction(old => MC.game.player.x < old - 3 && MC.Audio.getCueStatus().name === 'respawn', x);
  await page.keyboard.up('a');
  report.checks.push('Actual enemy contact shows soul, complete Burla1, black screen and silent quote; held key cannot retry');
  report.checks.push('Fresh action immediately restores playable Riko while full REAPARICION plays');

  // Pause uses the actual application menu while REAPARICION is active.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => MC.pause.active && MC.Audio.getCueStatus().mode === 'paused');
  const pausedCue = (await state(page)).cue;
  await page.waitForTimeout(350);
  const heldCue = (await state(page)).cue;
  assert.ok(Math.abs(heldCue.position - pausedCue.position) < .005);
  await page.locator('#screen-pause [data-act="resume"]').click();
  await page.waitForFunction(() => MC.Audio.getCueStatus().mode === 'playing');
  const resumedCue = (await state(page)).cue;
  assert.equal(resumedCue.id, pausedCue.id);
  assert.ok(resumedCue.position >= pausedCue.position - .02);
  await waitMusic(page, 'pista-02');
  report.desktop.pause = { pausedCue, heldCue, resumedCue };
  report.checks.push('Pause/resume preserves respawn clip position and its reserved next song');

  report.desktop.secondDeath = await death(page, 'fall', false, 'desktop-fall');
  assert.equal(report.desktop.secondDeath.black.cue.id, 'burla-02');
  report.desktop.interruptedRespawn = await respawn(page);
  assert.equal(report.desktop.interruptedRespawn.reservation.id, 'pista-04');
  report.desktop.thirdDeath = await death(page, 'fall');
  assert.equal(report.desktop.thirdDeath.black.cue.id, 'burla-03');
  report.desktop.thirdRespawn = await respawn(page);
  assert.equal(report.desktop.thirdRespawn.reservation.id, 'pista-05');
  await waitMusic(page, 'pista-05');
  report.checks.push('Falls also show a visible soul; death during REAP cancels the stale song and advances only once');

  // Exercise the real visibility handlers with a controlled hidden-state fixture.
  report.desktop.fourthDeath = await death(page, 'fall');
  assert.equal(report.desktop.fourthDeath.black.cue.id, 'burla-01');
  await respawn(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => MC.Audio.getCueStatus().mode === 'paused');
  const hiddenCue = (await state(page)).cue;
  await page.waitForTimeout(250);
  assert.ok(Math.abs((await state(page)).cue.position - hiddenCue.position) < .005);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal(await page.evaluate(() => MC.pause.active), true);
  assert.equal((await state(page)).cue.mode, 'paused', 'returning to a paused game keeps the recording paused');
  assert.ok(Math.abs((await state(page)).cue.position - hiddenCue.position) < .005);
  await page.locator('#screen-pause [data-act="resume"]').click();
  await page.waitForFunction(() => MC.Audio.getCueStatus().mode === 'playing');
  assert.ok((await state(page)).cue.position >= hiddenCue.position - .02);
  await waitMusic(page, 'pista-06');
  report.checks.push('Simulated visibilitychange freezes and resumes PCM without restarting it');

  const levelThemes = ['roofs', 'forest', 'sewers', 'district', 'tower'];
  const levelSongs = [];
  for (let index = 1; index < 5; index++) {
    await page.evaluate(index => {
      MC.game.loadLevel(index, false); MC.game.state = 'playing'; MC.game.player.invuln = 60;
      MC.game.enemies = []; MC.game.triggers.forEach(trigger => trigger.fired = true);
    }, index);
    const id = ['pista-07', 'pista-08', 'pista-09', 'pista-10'][index - 1];
    levelSongs.push((await waitMusic(page, id, levelThemes[index])).music);
  }
  await page.evaluate(() => MC.game.startBoss());
  assert.equal((await waitMusic(page, 'pista-03', 'boss')).music.id, 'pista-03');
  report.desktop.levelSongs = levelSongs;
  report.checks.push('Worlds share the ordered list; the boss always uses CHUTY VS ACZINO');

  await page.evaluate(() => {
    MC.game.update = () => {};
    MC.Audio.playMusic('tower', { restart: true });
  });
  await waitMusic(page, 'pista-11', 'tower');
  const beforeLoop = await page.evaluate(() => {
    const a = MC.Audio, m = a._media;
    window.loopProbe = { peak: m.duration * .8, wrapped: false };
    const cursor = JSON.stringify([...a._playlistCursors]);
    m.currentTime = m.duration - .4; m.playbackRate = 16;
    return { id: a.getMusicStatus().id, cursor };
  });
  await page.waitForFunction(() => {
    const m = MC.Audio._media, p = window.loopProbe;
    p.wrapped ||= m.currentTime < m.duration * .2;
    return p.wrapped;
  }, null, { timeout: 12000 });
  await page.evaluate(() => MC.Audio._media.playbackRate = 1);
  const afterLoop = await page.evaluate(() => ({ id: MC.Audio.getMusicStatus().id, cursor: JSON.stringify([...MC.Audio._playlistCursors]) }));
  assert.deepEqual(afterLoop, beforeLoop);
  report.checks.push('Natural ending loops the same level file without advancing the ordered cursor');

  await page.evaluate(() => { MC.Audio.playMusic('boss'); MC.game._playEnding('C'); });
  assert.equal((await state(page)).music.id, 'pista-03');
  await page.evaluate(() => { for (let i = 0; i < 30 && MC.game.dialogue.active; i++) MC.game.dialogue.advance(); });
  await waitMusic(page, 'pista-34', 'ending');
  await page.evaluate(() => {
    window.victoryEnded = [];
    MC.Audio._media.addEventListener('ended', event => window.victoryEnded.push(event.isTrusted), { once: true });
    MC.Audio._media.playbackRate = 16;
  });
  await waitMusic(page, 'pista-37', 'menu');
  assert.deepEqual(await page.evaluate(() => window.victoryEnded), [true]);
  assert.equal(await page.evaluate(() => MC.getState()), 'menu');
  report.checks.push('Full native LO QUE SOY ending at 16x returns the application to ARCADE');
  await desktop.context.close();

  const mobile = await makePage(true);
  report.mobile.initial = await start(mobile.page, true);
  assert.equal(report.mobile.initial.touch, true, 'a native touch browser selects mobile automatically');
  report.mobile.death = await death(mobile.page, 'fall', false, 'mobile');
  report.mobile.respawn = await respawn(mobile.page, true, 'mobile');
  assert.equal(report.mobile.respawn.reservation.id, 'pista-02');
  const mobileX = report.mobile.respawn.player.x;
  const stick = await mobile.page.locator('.tc-joystick').boundingBox();
  const touchClient = await mobile.context.newCDPSession(mobile.page);
  await touchClient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x + stick.width * .2, y: stick.y + stick.height * .5 }] });
  await mobile.page.waitForFunction(old => MC.game.player.x < old - 3 && MC.Audio.getCueStatus().name === 'respawn', mobileX);
  await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitMusic(mobile.page, 'pista-02');
  report.checks.push('568x320 native mobile: full-screen black / long quote fit, controls hide, fresh tap retries and joystick works during REAP');
  await mobile.context.close();
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks, decodedFiles: report.tracks.length, apiRequestsBlocked: report.apiRequestsBlocked, errors }, null, 2));
} catch (error) {
  report.failure = error.stack;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }


