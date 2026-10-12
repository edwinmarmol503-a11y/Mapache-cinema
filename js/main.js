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
import { drawMenuScene, drawCreditsScene } from './ui.js';
import { initTouch, isTouchDevice, setTouchEnabled } from './touch.js';
import { Ranking } from './ranking.js';
import { Controls } from './control-mode.js';
import { GamepadController } from './gamepad.js';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, resizeBacking } from './display.js';

/* ---------------- PWA: offline cache + installability ---------------- */
if ('serviceWorker' in navigator) {
  const registerOffline = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load', registerOffline, { once: true });
}
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
  },
});
gamepad.init();
let appliedControlMode = null;
Controls.subscribe(({ mode }) => {
  if (mode === appliedControlMode) return;
  appliedControlMode = mode;
  Input.reset();
  Input.setKeyboardEnabled(mode === 'keyboard');
  setTouchEnabled(mode === 'touch');
  dialogue.touch = mode === 'touch';
  gamepad.setEnabled(mode === 'gamepad' && Controls.isUnlocked());
  document.getElementById('app').dataset.controls = mode;
  const hint = document.getElementById('game-control-hint');
  if (hint) hint.textContent = mode === 'gamepad'
    ? 'Stick / cruceta: mover · Arriba: saltar · □: atacar · ○: esquivar · △: usar · OPTIONS: pausa'
    : mode === 'touch' ? 'Joystick: mover · Arriba: saltar · botones de acción a la derecha'
      : 'A/D o flechas: mover · W/↑: saltar · J: atacar · E: usar · Esc: pausa';
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
}

function beginEndingCredits(ending) {
  appState = 'credits';
  creditsStartedAt = performance.now();
  document.getElementById('app').classList.remove('playing', 'paused');
  menu.showVictory(ending);
  Audio.playMusic('ending', { restart: true });
  Input.reset();
}

Audio.subscribeTrackEnd(({ theme }) => {
  if (theme === 'ending' && appState === 'credits') returnToMenu();
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
    if (Input.justPressed('pause')) {
      if (!menu.elOptions.classList.contains('hidden')) menu.closeOptions();
      else if (pause.active) pause.resume();
      else if (!game.transition && game.state === 'playing') pause.open();
    }
    if (!pause.active) game.update(dt);
  }
  Input.clearFrame();
}

function draw() {
  document.getElementById('app').classList.toggle('choosing', appState === 'game' && game.dialogue.isChoice);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'middle';
  if (appState === 'game') {
    game.render();
  } else if (appState === 'credits') {
    drawCreditsScene(ctx, IW, IH, Math.max(0, (performance.now() - creditsStartedAt) / 1000), game.visualMode, game.reducedEffects);
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
    if (Audio.ctx && Audio.ctx.state === 'running') Audio.ctx.suspend();
    if (appState === 'game' && !pause.active && game.state === 'playing') pause.open();
  } else if (wasHidden) {
    wasHidden = false;
    last = performance.now();   // don't dump a huge dt into the loop
    acc = 0;
    Audio.resume();
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
  Save.update({ items: game.inventory.serialize(), levelElapsedMs: game._levelClockCarry + Math.max(0, performance.now() - game._levelClockStart) });
}, 10000);
requestAnimationFrame(frame);

// expose for debugging in the console
window.MC = { game, menu, pause, Save, Audio, Input, Ranking, Controls, gamepad, getState: () => appState };
