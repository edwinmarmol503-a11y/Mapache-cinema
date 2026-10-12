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
  assert.equal(state.loop, expectedTheme !== 'ending', 'only the victory song has a natural end');
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
  assert.equal(await page.evaluate(() => MC.Audio.getMusicStatus().configuredTracks), 37);

  report.tracks = await page.evaluate(async () => {
    const manifest = await (await fetch('./assets/audio/tracks.json')).json();
    const result = [];
    for (const track of manifest.tracks) {
      const media = new window.Audio();
      media.muted = true;
      media.preload = 'auto';
      let failure;
      for (const source of [track.src, ...(track.alternateSrcs || [])]) {
        media.src = new URL(source, new URL('./assets/audio/tracks.json', location.href)).href;
        try {
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
          failure = null;
          break;
        } catch (error) { failure = error; }
      }
      if (failure) throw failure;
      result.push({ id: track.id, seconds: media.duration, readyState: media.readyState, error: media.error?.code || null });
      media.removeAttribute('src'); media.load();
    }
    return result;
  });
  assert.equal(report.tracks.length, 37);
  for (const track of report.tracks) {
    assert.ok(Number.isFinite(track.seconds) && track.seconds > 1, track.id + ': decodes a real positive duration');
    assert.ok(track.readyState >= 3, track.id + ': browser can play the file');
    assert.equal(track.error, null, track.id + ': no media error');
  }

  // Options and informational credits are overlays on the same Arcade song.
  await page.locator('#screen-menu').click({ position: { x: 10, y: 10 } });
  const menuSong = await waitPlaying(page, 'menu');
  assert.equal(menuSong.id, 'pista-37');
  await page.locator('#menu-nav [data-act="options"]').click();
  await page.locator('#screen-options [data-act="back"]').click();
  const afterOptions = await playback(page);
  assert.equal(afterOptions.id, menuSong.id);
  assert.ok(afterOptions.seconds >= menuSong.seconds, 'returning from options does not restart Arcade');
  await page.locator('#menu-nav [data-act="credits"]').click();
  await page.locator('#screen-credits [data-act="back"]').click();
  const afterCredits = await playback(page);
  assert.equal(afterCredits.id, menuSong.id);
  assert.ok(afterCredits.seconds >= afterOptions.seconds, 'informational credits do not restart Arcade');
  report.desktop.menu = { initial: menuSong, afterOptions, afterCredits };

  const initial = await startWithGesture(page, false);
  const reserved = new Set(['pista-03', 'pista-34', 'pista-37']);
  assert.equal(reserved.has(initial.id), false, 'fixed songs are absent from random level play');
  await page.evaluate(() => {
    const dialogue = MC.game.dialogue;
    for (let i = 0; i < 30 && dialogue.active; i++) dialogue.advance();
  });
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

  // Closing a gameplay text must leave the current source and position intact.
  const beforeText = await playback(page);
  await page.evaluate(() => MC.game.dialogue.start(['Texto breve para comprobar la continuidad de la canción.']));
  await page.waitForTimeout(150);
  await page.evaluate(() => { MC.game.dialogue.advance(); MC.game.dialogue.advance(); });
  const afterText = await playback(page);
  assert.equal(afterText.id, beforeText.id);
  assert.equal(afterText.src, beforeText.src);
  assert.ok(afterText.seconds >= beforeText.seconds, 'closing text does not reset playback');
  report.desktop.dialogue = { beforeText, afterText };

  // A real death does draw a new random song after the respawn transition.
  await page.evaluate(() => MC.game.killPlayer('fall'));
  await page.waitForFunction(id => MC.game.state === 'playing' && MC.Audio._externalTrack?.id !== id, afterText.id, { timeout: 10000 });
  const afterDeath = await waitPlaying(page, 'roofs');
  assert.equal(reserved.has(afterDeath.id), false);
  report.desktop.death = { before: afterText, after: afterDeath };

  const themes = ['roofs', 'forest', 'sewers', 'district', 'tower'];
  const levelTracks = [await playback(page)];
  for (let level = 1; level < themes.length; level++) {
    await page.evaluate(index => MC.game.loadLevel(index, false), level);
    const state = await waitPlaying(page, themes[level]);
    assert.notEqual(state.id, levelTracks.at(-1).id, 'changing level does not immediately repeat a song');
    levelTracks.push(state);
  }
  assert.equal(new Set(levelTracks.map(track => track.id)).size, 5, 'the five levels share a shuffle bag without repetitions');
  await page.evaluate(() => MC.game.startBoss());
  const boss = await waitPlaying(page, 'boss');
  assert.equal(boss.id, 'pista-03', 'the actual boss encounter uses Chuty vs Aczino');
  for (const track of levelTracks) assert.equal(reserved.has(track.id), false);
  report.desktop.levels = levelTracks;
  report.desktop.boss = boss;

  // Play a random song through its real end at 16x. The media element must
  // loop that same source instead of using another shuffle entry. Freeze
  // gameplay during the accelerated audio check to avoid an unrelated death.
  await page.evaluate(() => {
    window.__soundtrackGameUpdate = MC.game.update;
    MC.game.update = () => {};
    MC.Audio.playMusic('tower', { restart: true });
  });
  const beforeLoop = await waitPlaying(page, 'tower');
  await page.evaluate(() => {
    const media = MC.Audio._media;
    window.__soundtrackLoop = { peak: media.currentTime, wrapped: false };
    window.__soundtrackBag = JSON.stringify([...MC.Audio._shuffleBags.entries()]);
    media.playbackRate = 16;
  });
  await page.waitForFunction(() => {
    const media = MC.Audio._media;
    const check = window.__soundtrackLoop;
    check.wrapped ||= check.peak > media.duration * .8 && media.currentTime < media.duration * .2;
    check.peak = Math.max(check.peak, media.currentTime);
    return check.wrapped;
  }, undefined, { timeout: 40000 });
  await page.evaluate(() => { MC.Audio._media.playbackRate = 1; });
  const afterLoop = await waitPlaying(page, 'tower');
  assert.equal(afterLoop.id, beforeLoop.id);
  assert.equal(afterLoop.src, beforeLoop.src);
  assert.equal(await page.evaluate(() => JSON.stringify([...MC.Audio._shuffleBags.entries()]) === window.__soundtrackBag), true);
  report.desktop.naturalLoop = { before: beforeLoop, after: afterLoop };

  // The final dialogue keeps the boss song. Only the congratulations screen
  // starts Lo Que Soy, and its real natural end automatically returns to Arcade.
  await page.evaluate(() => MC.Audio.playMusic('boss'));
  const beforeFinalText = await waitPlaying(page, 'boss');
  await page.evaluate(() => MC.game._playEnding('C'));
  assert.equal((await playback(page)).id, 'pista-03');
  await page.evaluate(() => {
    const dialogue = MC.game.dialogue;
    for (let i = 0; i < 30 && dialogue.active; i++) dialogue.advance();
  });
  const victory = await waitPlaying(page, 'ending');
  assert.equal(victory.id, 'pista-34');
  await page.locator('#screen-victory').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.__soundtrackVictoryEnded = [];
    MC.Audio._media.addEventListener('ended', event => window.__soundtrackVictoryEnded.push({ trusted: event.isTrusted }), { once: true });
    MC.Audio._media.playbackRate = 16;
  });
  await page.waitForFunction(() => MC.Audio.currentTrack === 'menu' && MC.Audio._externalTrack?.id === 'pista-37', undefined, { timeout: 25000 });
  await page.evaluate(() => { MC.Audio._media.playbackRate = 1; });
  const afterVictory = await waitPlaying(page, 'menu');
  assert.equal(afterVictory.id, 'pista-37');
  await page.locator('#screen-victory').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => window.__soundtrackVictoryEnded), [{ trusted: true }]);
  report.desktop.victory = { beforeFinalText, victory, after: afterVictory };

  // Every canonical source is published in assets/audio. Any fallback error
  // must still be confined to a source with an alternate and never synthesize
  // generic music.
  const recovery = await page.evaluate(() => ({
    errors: window.__soundtrackMediaErrors,
    alternatePrimaries: [...MC.Audio._tracks.values()].filter(entry => entry.sources.length > 1).map(entry => entry.sources[0]),
    unavailable: MC.Audio.getMusicStatus().unavailableTracks,
  }));
  for (const error of recovery.errors) assert.ok(recovery.alternatePrimaries.includes(error.src), 'only a primary with a configured alternate may fail');
  assert.equal(recovery.unavailable, 0, 'all songs recover through their available alternate paths');
  report.desktop.sourceRecovery = recovery;
  await context.close();

  const mobile = await makePage({ mobile: true });
  report.mobile.initial = await startWithGesture(mobile.page, true);
  assert.equal(await mobile.page.evaluate(() => document.getElementById('app').classList.contains('touch-mode')), true);
  await mobile.page.waitForFunction(seconds => MC.Audio._media.currentTime > seconds + .25, report.mobile.initial.seconds);
  report.mobile.advancing = await playback(mobile.page);
  await mobile.context.close();

  assert.deepEqual(errors, [], 'desktop and mobile have no script errors');
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Soundtrack browser: 37 MP3s decoded; Arcade menu continuity, real desktop/mobile playback, independent volume, pause/resume, dialogue continuity, death selection, five random levels, fixed Chuty vs Aczino boss and natural random loop verified. Lo Que Soy ends natively at 16x and returns to Arcade. No ranking writes.');
  console.log(JSON.stringify(report.tracks.map(track => ({ id: track.id, seconds: Number(track.seconds.toFixed(2)) }))));
} finally {
  await browser.close();
}
