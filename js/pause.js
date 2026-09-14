/* ============================================================
   pause.js  -  in-game pause menu (DOM). Freezes the game
   loop (main.js checks `Pause.active`).
   ============================================================ */
import { Audio } from './audio.js';

export class Pause {
  constructor(hooks) {
    this.hooks = hooks; // { onResume, onRestart, onExitToMenu, onOptions }
    this.el = document.getElementById('screen-pause');
    this.active = false;

    this.el.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => this._action(b.dataset.act));
      b.addEventListener('mouseenter', () => Audio.sfx('menu'));
    });
  }

  _action(act) {
    Audio.sfx('confirm');
    if (act === 'resume') this.resume();
    else if (act === 'options') { this.el.classList.add('hidden'); this.hooks.onOptions(); }
    else if (act === 'restart') { this.resume(); this.hooks.onRestart(); }
    else if (act === 'menu') { this.resume(); this.hooks.onExitToMenu(); }
  }

  open() {
    if (this.active) return;
    this.active = true;
    this.el.classList.remove('hidden');
    document.getElementById('app').classList.add('paused');
    Audio.pauseMusic();
    Audio.sfx('menu');
  }

  resume() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    document.getElementById('app').classList.remove('paused');
    Audio.resumeMusic();
    if (this.hooks.onResume) this.hooks.onResume();
  }

  /** called by Menu when options is closed and we came from pause */
  reopenFromOptions() {
    this.el.classList.remove('hidden');
  }

  toggle() {
    if (this.active) this.resume();
    else this.open();
  }
}
