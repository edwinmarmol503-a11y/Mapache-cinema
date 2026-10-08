import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Install Playwright in development, or point PLAYWRIGHT_MODULE at its module.
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = path.resolve('test-results/world');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1030, height: 980 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"world_review_offline"}' });
    return url.origin === new URL(baseURL).origin ? route.continue() : route.abort();
  });
  await page.goto(baseURL + '/tests/visual-review.html');
  await page.waitForFunction(() => !document.querySelector('#result').textContent.includes('Comprobando'));
  const existingChecks = await page.locator('#result').textContent();
  assert.match(existingChecks, /comprobaciones correctas/, existingChecks);
  const results = await page.evaluate(async () => {
    const [{ Game }, { Dialogue }, { Save }, { LEVELS }, { drawMenuScene }, { Audio }] = await Promise.all([
      import('/js/game.js'), import('/js/dialogue.js'), import('/js/save.js'),
      import('/js/levels.js'), import('/js/ui.js'), import('/js/audio.js'),
    ]);
    document.body.innerHTML = '<main id="world-grid"></main>';
    const style = document.createElement('style');
    style.textContent = `body { margin:16px; font:14px monospace; background:#111b26; color:#eff4ed; }
      #world-grid { display:block; } .mode { display:grid; grid-template-columns:480px 480px; gap:14px; margin-bottom:25px; }
      h2 { margin:4px 0; font-size:14px; } canvas { width:480px; height:270px; image-rendering:pixelated; display:block; }
      .card { width:480px; }`;
    document.head.append(style);
    const modes = ['night', 'clear', 'day'];
    const data = [];
    const silent = new Proxy({}, { get: () => () => {} });
    for (const mode of modes) {
      const panel = document.createElement('div'); panel.className = 'mode'; panel.id = 'mode-' + mode;
      document.querySelector('#world-grid').append(panel);
      for (let index = 0; index < LEVELS.length; index++) {
        const card = document.createElement('div'); card.className = 'card';
        const title = document.createElement('h2'); title.textContent = LEVELS[index].name + ' · ' + mode;
        const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270; canvas.id = LEVELS[index].key + '-' + mode;
        card.append(title, canvas); panel.append(card);
        const save = { ...Save, data: null, persist() {}, loadOpts: () => ({ visualMode: mode }),
          loadMeta: () => ({ progress: {}, nightmareDeaths: 0 }), saveMeta() {}, markLevelBeaten() {}, addScore() {} };
        const ctx = canvas.getContext('2d'); ctx.textBaseline = 'middle';
        const game = new Game(ctx, canvas, { audio: silent, save, dialogue: new Dialogue() });
        game.startAt('normal', index); await game._levelTicketPromise;
        game.state = 'playing'; game.weather = 'clear'; game.fadeAlpha = 0;
        game._levelClockStart = performance.now() - 75000; game._levelClockCarry = 0;
        game._levelTicket = mode === 'day' ? { id: 'visual-fixture' } : null;
        const text = []; const fillText = ctx.fillText;
        ctx.fillText = function (value, ...args) { text.push(String(value)); return fillText.call(this, value, ...args); };
        game.render(); ctx.fillText = fillText;
        const sky = ctx.getImageData(240, 65, 1, 1).data;
        data.push({ key: LEVELS[index].key, mode, sky: [...sky], text });
        // Reduced effects must render without leaving a previous lightning flash.
        game.reducedEffects = true; game.weather = 'rain'; game.render();
        // Restore the screenshot's complete, clear-weather rendering.
        game.reducedEffects = false; game.weather = 'clear'; game.render();
        if (index === 0 && mode === 'day') {
          game._levelFinalMs = 75432; game.render();
        }
      }
      const card = document.createElement('div'); card.className = 'card';
      const heading = document.createElement('h2'); heading.textContent = 'Menú · ' + mode;
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270; canvas.id = 'menu-' + mode;
      card.append(heading, canvas); panel.append(card);
      drawMenuScene(canvas.getContext('2d'), 480, 270, mode);
    }
    Audio.init({ music: 0, sfx: 0 });
    await Audio.loadTrackManifest();
    Audio.configureTracks({ tracks: [], playlists: {} });
    Audio.playMusic('forest');
    const audioStatus = Audio.getMusicStatus();
    Audio.stopMusic();
    return { data, audioStatus };
  });
  for (const key of ['roofs', 'forest', 'sewers', 'district', 'tower']) {
    const samples = results.data.filter((item) => item.key === key);
    const luminance = (sample) => 0.2126 * sample.sky[0] + 0.7152 * sample.sky[1] + 0.0722 * sample.sky[2];
    assert.ok(luminance(samples[2]) > luminance(samples[0]) + 15, key + ' daylight must visibly brighten the scene');
    assert.ok(luminance(samples[1]) > luminance(samples[0]) + 5, key + ' clear mode must be easier to read than night');
    for (const sample of samples) {
      assert.ok(sample.text.some((text) => /^01:15\./.test(text)), key + '/' + sample.mode + ' elapsed-time HUD');
      assert.ok(sample.text.some((text) => text.includes(sample.mode === 'day' ? 'ONLINE' : 'LOCAL')), key + '/' + sample.mode + ' ranking state HUD');
      await page.locator('#' + key + '-' + sample.mode).screenshot({ path: path.join(output, key + '-' + sample.mode + '.png') });
    }
  }
  assert.equal(results.audioStatus.mode, 'procedural', 'empty audio manifest keeps functional synthesized music');
  // Small generated WAV used only by the intercepted test route, never shipped as music.
  const sampleRate = 8000;
  const wave = Buffer.alloc(44 + sampleRate * 2);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(sampleRate * 2, 40);
  for (let index = 0; index < sampleRate; index++) wave.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 220 / sampleRate) * 400), 44 + index * 2);
  await page.route('**/qa-track.wav', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wave }));
  await page.route('**/qa-missing.wav', (route) => route.fulfill({ status: 404, body: 'Missing test audio' }));
  await page.locator('#menu-day').click();
  await page.evaluate(async () => {
    const { Audio } = await import('/js/audio.js');
    await Audio.ctx.resume();
    Audio.configureTracks({ tracks: [{ id: 'test', src: location.origin + '/qa-track.wav', gain: 0 }], playlists: { forest: ['test'] } });
    Audio.playMusic('forest');
    window.audioForReview = Audio;
  });
  await page.waitForFunction(() => window.audioForReview.getMusicStatus().mode === 'external');
  const pausePosition = await page.evaluate(() => {
    const audio = window.audioForReview;
    audio._media.currentTime = 0.4;
    audio.pauseMusic();
    const before = audio._media.currentTime;
    audio.resumeMusic();
    return { before, after: audio._media.currentTime };
  });
  assert.ok(Math.abs(pausePosition.before - pausePosition.after) < 0.05, 'real streamed audio resumes at its paused position');
  await page.evaluate(() => {
    const audio = window.audioForReview;
    audio.configureTracks({ tracks: [{ id: 'missing', src: location.origin + '/qa-missing.wav' }], playlists: { forest: ['missing'] } });
  });
  await page.waitForFunction(() => window.audioForReview.getMusicStatus().mode === 'procedural');
  await page.evaluate(() => window.audioForReview.stopMusic());
  for (const mode of ['night', 'clear', 'day']) await page.locator('#mode-' + mode).screenshot({ path: path.join(output, 'contact-' + mode + '.png') });
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(existingChecks);
  console.log('All five levels and menu render in night, clear and day. Brightness, elapsed timer, online/local HUD, reduced effects and soundtrack fallback passed.');
  console.log('Screenshots saved to ' + output);
} finally {
  await browser.close();
}
