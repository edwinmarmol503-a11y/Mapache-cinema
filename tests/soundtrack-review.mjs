import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Decode the supplied files and exercise the real browser audio player.
// No ranking request is allowed to reach a public or local database.
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const previewOrigin = new URL(baseURL).origin;
const output = path.resolve('test-results/soundtrack');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const report = { tracks: [], desktop: {}, mobile: {}, errors };

async function makePage({ mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
    isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"soundtrack_review_offline"}' });
    } else if (url.origin === previewOrigin) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  await context.addInitScript(() => {
    localStorage.setItem('mapache_cinema_opts_v1', JSON.stringify({ music: 42, sfx: 35, scale: 'auto', visualMode: 'night' }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push((mobile ? 'mobile: ' : 'desktop: ') + error.message));
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'));
  await page.evaluate(async () => {
    await MC.Audio.loadTrackManifest();
    // Keep the automated run quiet without changing either user volume bus.
    MC.Audio.master.gain.value = 0;
  });
  return { context, page };
}

async function playback(page) {
  return page.evaluate(() => {
    const a = MC.Audio, m = a._media;
    return {
      ...a.getMusicStatus(), id: a._externalTrack?.id, src: m?.currentSrc,
      seconds: m?.currentTime, duration: m?.duration, paused: m?.paused,
      readyState: m?.readyState, loop: m?.loop, contextState: a.ctx?.state,
      music: a.musicGain?.gain.value, sfx: a.sfxGain?.gain.value,
      trackGain: a._mediaGain?.gain.value, mediaError: m?.error?.code || null,
    };
  });
}

async function waitPlaying(page, expectedTheme) {
  await page.waitForFunction(theme => {
    const a = MC.Audio, m = a._media;
    return a.currentTrack === theme && a.getMusicStatus().mode === 'external' &&
      m && !m.paused && m.readyState >= 3 && m.currentTime > .06 && !m.error;
  }, expectedTheme, { timeout: 15000 });
  const state = await playback(page);
  assert.equal(state.contextState, 'running', 'user gesture unlocked Web Audio');
  assert.equal(state.loop, false, 'the multi-track playlist rotates when a song ends');
  assert.equal(state.mediaError, null, 'actual supplied MP3 has no playback error');
  assert.match(state.src, /\/assets\/audio\/pista-\d{2}\.mp3$/);
  return state;
}

async function startWithGesture(page, mobile) {
  const play = page.locator('#menu-nav [data-act="play"]');
  if (mobile) await play.tap(); else await play.click();
  await page.locator('#nick-input').fill(mobile ? 'MUSIC-MOVIL' : 'MUSIC-QA');
  if (mobile) await page.locator('#nick-go').tap(); else await page.locator('#nick-go').click();
  return waitPlaying(page, 'roofs');
}

try {
  const { context, page } = await makePage();
  assert.equal(await page.evaluate(() => MC.Audio.getMusicStatus().configuredTracks), 11);

  report.tracks = await page.evaluate(async () => {
    const manifest = await (await fetch('./assets/audio/tracks.json')).json();
    const result = [];
    for (const track of manifest.tracks) {
      const media = new window.Audio();
      media.muted = true;
      media.preload = 'auto';
      media.src = new URL(track.src, new URL('./assets/audio/tracks.json', location.href)).href;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Decode timeout: ' + track.id)), 12000);
        const finish = error => {
          clearTimeout(timer); media.oncanplay = null; media.onerror = null;
          error ? reject(error) : resolve();
        };
        media.oncanplay = () => finish();
        media.onerror = () => finish(new Error('Decode error ' + media.error?.code + ': ' + track.id));
        media.load();
      });
      result.push({ id: track.id, seconds: media.duration, readyState: media.readyState, error: media.error?.code || null });
      media.removeAttribute('src'); media.load();
    }
    return result;
  });
  assert.equal(report.tracks.length, 11);
  for (const track of report.tracks) {
    assert.ok(Number.isFinite(track.seconds) && track.seconds > 1, track.id + ': decodes a real positive duration');
    assert.ok(track.readyState >= 3, track.id + ': browser can play the file');
    assert.equal(track.error, null, track.id + ': no media error');
  }

  const initial = await startWithGesture(page, false);
  await page.evaluate(() => {
    window.__soundtrackMediaErrors = [];
    MC.Audio._media.addEventListener('error', () => {
      if (MC.Audio._media.error) window.__soundtrackMediaErrors.push({ code: MC.Audio._media.error.code, src: MC.Audio._media.currentSrc });
    });
  });
  await page.waitForFunction(seconds => MC.Audio._media.currentTime > seconds + .2, initial.seconds);
  report.desktop.initial = initial;

  // Changing only music volume leaves the SFX bus and media playhead intact.
  const volumeState = await page.evaluate(() => {
    const a = MC.Audio;
    const before = { sfx: a.sfxGain.gain.value, seconds: a._media.currentTime, id: a._externalTrack.id };
    a.setMusicVol(0);
    return { ...before, music: a.musicGain.gain.value, afterSfx: a.sfxGain.gain.value };
  });
  assert.equal(volumeState.music, 0);
  assert.equal(volumeState.afterSfx, volumeState.sfx);
  await page.waitForFunction(seconds => MC.Audio._media.currentTime > seconds + .2, volumeState.seconds);
  assert.equal((await playback(page)).id, volumeState.id);
  await page.evaluate(() => MC.Audio.setMusicVol(.28));
  const restoredVolume = await playback(page);
  assert.ok(Math.abs(restoredVolume.music - .28) < .000001);
  assert.ok(Math.abs(restoredVolume.sfx - .35) < .000001);
  report.desktop.volume = restoredVolume;

  // The actual pause menu stops and resumes this same media element.
  await page.waitForFunction(() => MC.game.state === 'playing');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => MC.pause.active && MC.Audio._media.paused);
  const paused = await playback(page);
  assert.equal(paused.mode, 'paused');
  await page.waitForTimeout(350);
  const stillPaused = await playback(page);
  assert.ok(Math.abs(stillPaused.seconds - paused.seconds) < .05, 'pause freezes the playhead');
  await page.locator('#screen-pause [data-act="resume"]').click();
  const resumed = await waitPlaying(page, 'roofs');
  assert.equal(resumed.id, paused.id, 'resume keeps the same track');
  assert.ok(resumed.seconds >= paused.seconds - .05, 'resume keeps its playback position');
  await page.waitForFunction(seconds => MC.Audio._media.currentTime > seconds + .2, paused.seconds);
  report.desktop.pause = { paused, resumed: await playback(page) };

  const themes = ['roofs', 'forest', 'sewers', 'district', 'tower'];
  const levelTracks = [await playback(page)];
  for (let level = 1; level < themes.length; level++) {
    await page.evaluate(index => MC.game.loadLevel(index, false), level);
    const state = await waitPlaying(page, themes[level]);
    assert.notEqual(state.id, levelTracks.at(-1).id, 'changing level does not immediately repeat a song');
    levelTracks.push(state);
  }
  assert.equal(new Set(levelTracks.map(track => track.id)).size, 5, 'the five levels share a shuffle bag without repetitions');
  await page.evaluate(() => MC.Audio.playMusic('boss'));
  const boss = await waitPlaying(page, 'boss');
  assert.ok(!levelTracks.some(track => track.id === boss.id), 'boss consumes a new track from the same bag');
  report.desktop.levels = levelTracks;
  report.desktop.boss = boss;

  // Play through a real MP3 at 16x until its native ended event advances
  // the playlist. This avoids seeking on the dev server without Range support.
  await page.evaluate(() => {
    const media = MC.Audio._media;
    window.__soundtrackNativeEnded = [];
    media.addEventListener('ended', event => window.__soundtrackNativeEnded.push({
      trusted: event.isTrusted,
    }), { once: true });
    media.playbackRate = 16;
  });
  await page.waitForFunction(id => MC.Audio._externalTrack?.id !== id, boss.id, { timeout: 40000 });
  await page.evaluate(() => { MC.Audio._media.playbackRate = 1; });
  const endedNext = await waitPlaying(page, 'boss');
  assert.notEqual(endedNext.id, boss.id, 'a completed song selects the next random song');
  assert.ok(endedNext.seconds < 5, 'the next song begins near its start');
  report.desktop.nativeEnded = await page.evaluate(() => window.__soundtrackNativeEnded);
  assert.deepEqual(report.desktop.nativeEnded, [{ trusted: true }], 'the browser emits a real native ended event');
  report.desktop.afterEnded = endedNext;
  assert.deepEqual(await page.evaluate(() => window.__soundtrackMediaErrors), []);
  await context.close();

  const mobile = await makePage({ mobile: true });
  report.mobile.initial = await startWithGesture(mobile.page, true);
  assert.equal(await mobile.page.evaluate(() => document.getElementById('app').classList.contains('touch-mode')), true);
  await mobile.page.waitForFunction(seconds => MC.Audio._media.currentTime > seconds + .25, report.mobile.initial.seconds);
  report.mobile.advancing = await playback(mobile.page);
  await mobile.context.close();

  assert.deepEqual(errors, [], 'desktop and mobile have no script errors');
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Soundtrack browser: 11 MP3s decoded; real desktop/mobile gesture, playback, independent volume, pause/resume, all five levels and boss verified. Native ended at 16x rotates to another real MP3. No ranking writes.');
  console.log(JSON.stringify(report.tracks.map(track => ({ id: track.id, seconds: Number(track.seconds.toFixed(2)) }))));
} finally {
  await browser.close();
}
