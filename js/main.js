/* ============================================================
   main.js  -  bootstrap + top-level state machine + fixed
   timestep game loop.  States: 'menu' | 'game' | 'credits'
   ============================================================ */
import { Input, BINDING_VERSION } from './input.js';
import { Audio } from './audio.js';
import { Save } from './save.js';
import { Dialogue } from './dialogue.js';
import { Game } from './game.js';
import { Menu } from './menu.js';
import { Pause } from './pause.js';
import { drawMenuScene } from './ui.js';
import { drawEndingScene, endingMusicTheme, isEnding } from './endings.js';
import { initTouch, isTouchDevice, setTouchEnabled, releaseTouchInputs } from './touch.js';
import { Ranking } from './ranking.js';
import { Controls } from './control-mode.js';
import { GamepadController } from './gamepad.js';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, resizeBacking } from './display.js';

/* ---------------- PWA: offline cache + installability ---------------- */
// bootstrap.js prepares a consistent offline cache before importing the game.
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  const btn = document.getElementById('btn-install');
  if (btn) btn.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  const btn = document.getElementById('btn-install');
  if (btn) btn.classList.add('hidden');
});
{
  const btn = document.getElementById('btn-install');
  if (btn) btn.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    await _installPrompt.userChoice;
    _installPrompt = null;
    btn.classList.add('hidden');
  });
}

/* ---------------- touch controls (phones/tablets) ---------------- */
Controls.initialize({ defaultMode: isTouchDevice ? 'touch' : 'keyboard' });
if (Controls.getMode() === 'touch') initTouch();

const canvas = document.getElementById('gs');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = 'middle';

const IW = LOGICAL_WIDTH;
const IH = LOGICAL_HEIGHT;
let renderScale = 1;

let appState = 'menu';
let creditsStartedAt = 0;
let creditsEnding = 'A';

// Load the local pixel font before measuring text on the high-DPI canvas.
if (document.fonts?.load) await Promise.allSettled([
  document.fonts.load('400 12px "Monocraft"'), document.fonts.load('700 12px "Monocraft"'),
]);

/* ---------------- systems ---------------- */
Input.init();
const opts = Save.loadOpts();
if (Input.loadBindings(opts.bindings, opts.bindingVersion)) Save.saveOpts({ bindings: Input.bindings, bindingVersion: BINDING_VERSION });
Audio.init({ music: opts.music / 100, sfx: opts.sfx / 100 });

const dialogue = new Dialogue({ touch: isTouchDevice });

const game = new Game(ctx, canvas, {
  audio: Audio,
  save: Save,
  dialogue,
  ranking: Ranking,
  onVictory: (ending) => beginEndingCredits(ending),
  onDeath: () => { gamepad.suspend(); releaseTouchInputs(); },
  onRespawn: () => { gamepad.suspend(); releaseTouchInputs(); },
});

const menu = new Menu({
  onPlay: (nick) => startGame(false, nick),
  onContinue: () => startGame(true),
  onPlayLevel: (diff, idx, nick) => {
    appState = 'game';
    document.getElementById('app').classList.add('playing');
    menu.hideAll();
    Audio.resume();
    game.startAt(diff, idx, nick);
  },
  onCreditsClosed: () => returnToMenu(),
  onVictoryClosed: () => returnToMenu(),
  onPreviewEnding: ending => beginEndingCredits(ending, { preview: true }),
  applyVisual: (mode) => { game.setVisualMode(mode); document.documentElement.dataset.visual = mode; },
  applyEffects: (reduced) => { game.reducedEffects = reduced; document.documentElement.classList.toggle('reduced-effects', reduced); },
});

const pause = new Pause({
  onResume: () => {},
  onRestart: () => game.restartLevel(),
  onExitToMenu: () => returnToMenu(),
  onOptions: () => { menu.optionsReturn = 'pause'; menu.showOptions(); },
});

/* ---------------- developer-enabled exhibition controls ---------------- */
const gamepad = new GamepadController({
  input: Input,
  onNavigate: (action) => {
    if (appState === 'credits') {
      if (action === 'attack') {
        document.getElementById('victory-menu').click();
        Input.reset(); gamepad.suspend();
      }
      return true;
    }
    if (action === 'attack') return false;
    const handled = menu.navigateWithGamepad(action);
    if (handled && ['confirm', 'cancel'].includes(action)) {
      Input.reset();
      gamepad.suspend();
    }
    return handled;
  },
  onActivity: () => firstGesture(),
  onDisconnect: () => {
    if (appState === 'game' && !pause.active && game.state === 'playing') pause.open();
    if (appState === 'game') game.persistRankingSession();
  },
});
gamepad.init();
let appliedControlMode = null;
Controls.subscribe(({ mode }) => {
  const hint = document.getElementById('game-control-hint');
  if (hint) hint.textContent = mode === 'gamepad'
    ? 'Stick / cruceta: mover · ' + Controls.getHint('jump') + ': saltar · ' + Controls.getHint('attack') + ': atacar · ' + Controls.getHint('dodge') + ': esquivar · ' + Controls.getHint('interact') + ': usar · ' + Controls.getHint('pause') + ': pausa'
    : mode === 'touch' ? 'Joystick: mover · Arriba: saltar · botones de acción a la derecha'
      : 'A/D o flechas: mover · W/↑: saltar · J: atacar · E: usar · G: emotes · Esc: pausa';
  const victoryHint = document.getElementById('victory-pad-hint');
  if (victoryHint) {
    victoryHint.classList.toggle('hidden', mode !== 'gamepad');
    victoryHint.textContent = ' · ' + Controls.getHint('attack');
  }
  if (mode === appliedControlMode) return;
  appliedControlMode = mode;
  Input.reset();
  Input.setKeyboardEnabled(mode === 'keyboard');
  setTouchEnabled(mode === 'touch');
  dialogue.touch = mode === 'touch';
  gamepad.setEnabled(mode === 'gamepad' && Controls.isUnlocked());
  document.getElementById('app').dataset.controls = mode;
  applyScale();
});

/* ---------------- flow ---------------- */
function startGame(useContinue, nick) {
  appState = 'game';
  document.getElementById('app').classList.add('playing');
  menu.hideAll();
  Audio.resume();
  if (useContinue) game.continueGame();
  else game.startNewGame(nick);
}

function returnToMenu() {
  const previous = appState;
  if (appState === 'game') game.suspendRun();
  appState = 'menu';
  creditsStartedAt = 0;
  document.getElementById('app').classList.remove('playing', 'paused');
  if (previous !== 'menu' || !Audio.currentTrack) Audio.playMusic('menu');
  else Audio.resumeMusic();
  menu.showMenu();
  syncDeathPresentation();
}

function beginEndingCredits(ending, { preview = false } = {}) {
  if (!isEnding(ending)) return;
  creditsEnding = ending;
  appState = 'credits';
  creditsStartedAt = performance.now();
  document.getElementById('app').classList.remove('playing', 'paused');
  menu.showVictory(ending, { preview });
  Audio.playMusic(endingMusicTheme(ending), { restart: preview });
  Input.reset();
}

Audio.subscribeTrackEnd(({ theme }) => {
  if (theme === endingMusicTheme(creditsEnding) && appState === 'credits') returnToMenu();
});

/* ---------------- scaling ---------------- */
function applyScale() {
  const app = document.getElementById('app');
  const padding = getComputedStyle(app);
  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const width = Math.max(1, Math.min(app.clientWidth, vw) - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
  const height = Math.max(1, Math.min(app.clientHeight, vh) - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
  const fit = Math.min(width / IW, height / IH);
  // Fill the screen even at Windows/browser scaling such as 125% or 150%.
  // Rounding to whole CSS multiples could throw away almost half its height.
  const touchMode = Controls.getMode() === 'touch';
  const scale = fit;
  canvas.style.width = IW * scale + 'px';
  canvas.style.height = IH * scale + 'px';
  renderScale = resizeBacking(canvas, IW * scale, window.devicePixelRatio || 1);
  if (touchMode) {
    // Place pause in the gap between the central clock and right-hand HUD.
    const rect = canvas.getBoundingClientRect();
    app.style.setProperty('--touch-pause-left', rect.left + rect.width * 0.625 + 'px');
    app.style.setProperty('--touch-pause-right', Math.max(8, parseFloat(padding.paddingRight) + 4) + 'px');
  }
}
window.addEventListener('resize', () => applyScale());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => applyScale());
document.addEventListener('fullscreenchange', () => applyScale());
applyScale();

/* ---------------- first user gesture (audio unlock) ---------------- */
let firstGestureDone = false;
function firstGesture() {
  if (firstGestureDone) return;
  firstGestureDone = true;
  Audio.resume();
  if (appState === 'menu') Audio.playMusic('menu');
  window.removeEventListener('keydown', firstGesture);
  window.removeEventListener('pointerdown', firstGesture);
  const bh = document.getElementById('boot-hint');
  if (bh) bh.classList.add('hide');
}
window.addEventListener('keydown', firstGesture);
window.addEventListener('pointerdown', firstGesture);

/* ---------------- loop ---------------- */
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.2) dt = 0.2;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    tick(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps >= 5) acc = 0;
  draw();
}

function tick(dt) {
  gamepad.poll(performance.now());
  Controls.setGamepadStatus(gamepad.getStatus());
  if (appState === 'game') {
    if (game.state === 'death-phrase' && gamepad.getAnyButtonPressed()) game.requestRespawn();
    if (Input.justPressed('pause')) {
      if (!menu.elOptions.classList.contains('hidden')) menu.closeOptions();
      else if (pause.active) pause.resume();
      else if (!game.transition && game.state === 'playing') pause.open();
    }
    if (!pause.active) game.update(dt);
  }
  syncDeathPresentation();
  Input.clearFrame();
}

const deathScreen = document.getElementById('screen-death');
const deathPhrase = document.getElementById('death-phrase');
const deathContext = document.getElementById('death-context');
const deathPrompt = document.getElementById('death-prompt');
deathScreen.addEventListener('pointerdown', () => {
  if (appState === 'game' && game.requestRespawn()) syncDeathPresentation();
});
function syncDeathPresentation() {
  const black = appState === 'game' && ['death-black', 'death-phrase'].includes(game.state);
  const phrase = black && game.state === 'death-phrase';
  document.getElementById('app').classList.toggle('death-screen', black);
  deathScreen.classList.toggle('hidden', !phrase);
  if (!phrase) return;
  if (deathPhrase.textContent !== game._deathPhrase) deathPhrase.textContent = game._deathPhrase;
  if (deathContext.textContent !== game._deathContext) deathContext.textContent = game._deathContext;
  deathPrompt.textContent = Controls.getMode() === 'touch' ? 'TOCA PARA REAPARECER'
    : Controls.getMode() === 'gamepad' ? 'PULSA CUALQUIER BOTÓN PARA REAPARECER' : 'PULSA CUALQUIER TECLA PARA REAPARECER';
}

function draw() {
  document.getElementById('app').classList.toggle('choosing', appState === 'game' && game.dialogue.isChoice);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'middle';
  if (appState === 'game') {
    game.render();
  } else if (appState === 'credits') {
    drawEndingScene(ctx, IW, IH, Math.max(0, (performance.now() - creditsStartedAt) / 1000), creditsEnding, game.visualMode,
      game.reducedEffects || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, canvas.clientHeight < 500);
  } else {
    drawMenuScene(ctx, IW, IH, game.visualMode, game.reducedEffects);
  }
}

/* ---------------- tab hidden: silence audio, freeze cleanly ---------------- */
let wasHidden = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    wasHidden = true;
    Audio.pauseMusic();
    Audio.pauseTransientCue?.();
    if (Audio.ctx && Audio.ctx.state === 'running') Audio.ctx.suspend();
    if (appState === 'game' && !pause.active && game.state === 'playing') pause.open();
    if (appState === 'game') game.persistRankingSession();
  } else if (wasHidden) {
    wasHidden = false;
    last = performance.now();   // don't dump a huge dt into the loop
    acc = 0;
    Audio.resume();
    if (appState === 'game' && !pause.active && (['death-black', 'death-phrase'].includes(game.state) || game._respawnSoundPending)) Audio.resumeTransientCue?.();
    if (appState === 'menu' || appState === 'credits') { Audio.resumeMusic(); if (!Audio.currentTrack && appState === 'menu') Audio.playMusic('menu'); }
    // music for the game resumes when the player closes the pause menu
  }
});
window.addEventListener('pagehide', () => {
  if (appState === 'game') game.suspendRun();
  Audio.stopMusic();
  if (Audio.ctx && Audio.ctx.state === 'running') Audio.ctx.suspend();
});

/* ---------------- go ---------------- */
menu.showMenu();
document.documentElement.dataset.visual = game.visualMode;
document.documentElement.classList.toggle('reduced-effects', game.reducedEffects);
Ranking.init?.().catch(() => {});
// Persist only every ten seconds, keeping disk writes out of the simulation loop.
setInterval(() => {
  if (appState !== 'game' || !Save.data || !game.player) return;
  Save.update({ items: game.inventory.serialize(), levelElapsedMs: game.getLevelElapsedMs() });
  game.persistRankingSession?.();
}, 10000);
requestAnimationFrame(frame);

// expose for debugging in the console
window.MC = { game, menu, pause, Save, Audio, Input, Ranking, Controls, gamepad, getState: () => appState };
