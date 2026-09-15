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
import { initTouch } from './touch.js';

/* ---------------- PWA: offline cache + installability ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
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
  onVictory: (ending) => { appState = 'victory'; document.getElementById('app').classList.remove('playing', 'paused'); menu.showVictory(ending); },
});

const menu = new Menu({
  onPlay: (nick) => startGame(false, nick),
  onContinue: () => startGame(true),
  onPlayLevel: (diff, idx) => {
    appState = 'game';
    document.getElementById('app').classList.add('playing');
    menu.hideAll();
    Audio.resume();
    game.startAt(diff, idx);
  },
  onCreditsClosed: () => returnToMenu(),
  onVictoryClosed: () => returnToMenu(),
  applyScale: (mode) => applyScale(mode),
  applyBright: (v) => game.setBright(v),
});

const pause = new Pause({
  onResume: () => {},
  onRestart: () => { game.loadLevel(game.levelIndex, false); game.state = 'playing'; game.fadeAlpha = 0; },
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
  const fit = Math.min(window.innerWidth / IW, (window.innerHeight - 6) / IH);
  let scale;
  if (mode === 'auto') {
    // ALWAYS an integer scale: pixelated image-rendering only stays crisp when
    // every source pixel maps to a whole number of screen pixels. A fractional
    // scale (tried briefly to fill more of a phone screen) made every bit of
    // text and every sprite look blurry/uneven -- not worth it.
    scale = Math.max(1, Math.floor(fit));
  } else {
    scale = Math.min(parseInt(mode, 10) || 2, Math.max(1, Math.floor(fit)));
  }
  canvas.style.width = IW * scale + 'px';
  canvas.style.height = IH * scale + 'px';
}
window.addEventListener('resize', () => applyScale());
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
      if (pause.active) pause.resume();
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
    drawMenuScene(ctx, IW, IH);
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
    if (appState === 'menu') Audio.playMusic('menu');
    // music for the game resumes when the player closes the pause menu
  }
});
window.addEventListener('pagehide', () => {
  Audio.stopMusic();
  if (Audio.ctx && Audio.ctx.state === 'running') Audio.ctx.suspend();
});

/* ---------------- go ---------------- */
menu.showMenu();
requestAnimationFrame(frame);

// expose for debugging in the console
window.MC = { game, menu, pause, Save, Audio, Input };
