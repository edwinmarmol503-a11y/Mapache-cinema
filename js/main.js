/* ============================================================
   main.js  -  bootstrap + top-level state machine + fixed
   timestep game loop.  States: 'menu' | 'game' | 'credits'
   ============================================================ */
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Save } from './save.js';
import { Dialogue } from './dialogue.js';
import { Game } from './game.js';
import { Menu } from './menu.js';
import { Pause } from './pause.js';
import { drawMenuScene } from './ui.js';
import { initTouch, isTouchDevice } from './touch.js';
import { Ranking } from './ranking.js';

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
initTouch();

const canvas = document.getElementById('gs');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = 'middle';

const IW = canvas.width;   // 480
const IH = canvas.height;  // 270

let appState = 'menu';

/* ---------------- systems ---------------- */
Input.init();
const opts = Save.loadOpts();
if (opts.bindings) Input.bindings = opts.bindings;
Audio.init({ music: opts.music / 100, sfx: opts.sfx / 100 });

const dialogue = new Dialogue();

const game = new Game(ctx, canvas, {
  audio: Audio,
  save: Save,
  dialogue,
  ranking: Ranking,
  onVictory: (ending) => { appState = 'victory'; document.getElementById('app').classList.remove('playing', 'paused'); menu.showVictory(ending); },
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
  applyScale: (mode) => applyScale(mode),
  applyVisual: (mode) => { game.setVisualMode(mode); document.documentElement.dataset.visual = mode; },
  applyEffects: (reduced) => { game.reducedEffects = reduced; document.documentElement.classList.toggle('reduced-effects', reduced); },
});

const pause = new Pause({
  onResume: () => {},
  onRestart: () => game.restartLevel(),
  onExitToMenu: () => returnToMenu(),
  onOptions: () => { menu.optionsReturn = 'pause'; menu.showOptions(); },
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
  if (appState === 'game') game.suspendRun();
  appState = 'menu';
  document.getElementById('app').classList.remove('playing', 'paused');
  Audio.stopMusic();
  Audio.playMusic('menu');
  menu.showMenu();
}

/* ---------------- scaling ---------------- */
function applyScale(mode) {
  const o = Save.loadOpts();
  mode = mode || o.scale || 'auto';
  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const fit = Math.min((vw - (isTouchDevice ? 8 : 64)) / IW, (vh - (isTouchDevice ? 8 : 64)) / IH);
  let scale;
  if (mode === 'auto' && isTouchDevice) {
    // Mobile landscape heights often sit between integer scales. Fill the
    // available viewport while preserving the game's 16:9 aspect ratio.
    scale = fit;
  } else if (mode === 'auto') {
    // ALWAYS an integer scale: pixelated image-rendering only stays crisp when
    // every source pixel maps to a whole number of screen pixels on desktop.
    scale = fit < 1 ? fit : Math.floor(fit);
  } else {
    scale = Math.min(parseInt(mode, 10) || 2, Math.max(1, Math.floor(fit)));
  }
  canvas.style.width = Math.floor(IW * scale) + 'px';
  canvas.style.height = Math.floor(IH * scale) + 'px';
}
window.addEventListener('resize', () => applyScale());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => applyScale());
applyScale();

/* ---------------- first user gesture (audio unlock) ---------------- */
function firstGesture() {
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
  ctx.imageSmoothingEnabled = false;
  if (appState === 'game') {
    game.render();
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
    if (appState === 'menu') { Audio.resumeMusic(); if (!Audio.currentTrack) Audio.playMusic('menu'); }
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
window.MC = { game, menu, pause, Save, Audio, Input, Ranking };
