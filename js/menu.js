/* ============================================================
   menu.js  -  DOM screen controller (main menu, options,
   credits). Pause menu lives in pause.js but shares styles.
   ============================================================ */
import { Input, DEFAULT_BINDINGS } from './input.js';
import { Save } from './save.js';
import { Audio } from './audio.js';
import { DIFFS, DIFF_ORDER } from './difficulty.js';
import { LEVELS } from './levels.js';

const CONTROL_LABELS = {
  left: 'Izquierda', right: 'Derecha', jump: 'Saltar', attack: 'Atacar',
  dodge: 'Esquivar', parry: 'Parada', interact: 'Interactuar', throw: 'Lanzar',
  pause: 'Pausa', cycleL: 'Objeto <', cycleR: 'Objeto >',
};

const CREDITS = [
  { sec: 'MAPACHE CINEMA — LA ÚLTIMA NOCHE' },
  { role: 'Game Design', who: 'Estudio Lumera' },
  { role: 'Programming', who: 'Estudio Lumera' },
  { role: 'Pixel Art', who: 'Estudio Lumera  (placeholders procedurales)' },
  { role: 'Level Design', who: 'Estudio Lumera' },
  { role: 'Audio', who: 'Síntesis procedural (Web Audio API)' },
  { role: 'Story', who: 'La ciudad que recordaba demasiado' },
  { sec: 'GRACIAS POR JUGAR' },
];

export class Menu {
  constructor(hooks) {
    this.hooks = hooks; // { onPlay, onContinue, onOptionsClosed, applyScale }
    this.elMenu = document.getElementById('screen-menu');
    this.elOptions = document.getElementById('screen-options');
    this.elCredits = document.getElementById('screen-credits');
    this.elVictory = document.getElementById('screen-victory');
    this.elLevels = document.getElementById('screen-levels');
    this.elScores = document.getElementById('screen-scores');
    this.elNick = document.getElementById('screen-nick');
    this.elPause = document.getElementById('screen-pause');
    this.optionsReturn = 'menu';
    this._selIndex = 0;
    this._diffSel = 'normal';

    this._wireMenu();
    this._wireOptions();
    this._wireCredits();
    this._wireVictory();
    this._wireLevels();
    this._wireScores();
    this._wireNick();
    this._buildCredits();

    // rebind hint
    this.hint = document.createElement('div');
    this.hint.id = 'rebind-hint';
    this.hint.className = 'hidden';
    this.hint.textContent = 'Pulsa una tecla...';
    document.getElementById('app').appendChild(this.hint);

    // keyboard nav for the menu
    document.addEventListener('keydown', (e) => this._navKey(e));
  }

  /* ---------------- MAIN MENU ---------------- */
  _wireMenu() {
    this.elMenu.querySelectorAll('#menu-nav button').forEach((b) => {
      b.addEventListener('click', () => this._menuAction(b.dataset.act));
      b.addEventListener('mouseenter', () => { Audio.sfx('menu'); });
    });
  }

  _menuAction(act) {
    Audio.resume();
    Audio.sfx('confirm');
    if (act === 'play') {
      this._askNick((nick) => { this.hideAll(); this.hooks.onPlay(nick); });
    }
    else if (act === 'continue') {
      if (Save.hasSave()) { this.hideAll(); this.hooks.onContinue(); }
      else this._flash('No hay partida guardada');
    }
    else if (act === 'levels') { this.showLevels(); }
    else if (act === 'scores') { this.showScores(); }
    else if (act === 'options') { this.optionsReturn = 'menu'; this.showOptions(); }
    else if (act === 'credits') { this.showCredits(); }
    else if (act === 'quit') {
      this._flash('Cierra la pestaña para salir. ¡Gracias por jugar!');
      window.close();
    }
  }

  showMenu() {
    this.hideAll();
    this.elMenu.classList.remove('hidden');
    this.elMenu.style.display = '';
    document.getElementById('app').classList.remove('playing', 'paused');
    const cont = document.getElementById('btn-continue');
    cont.disabled = !Save.hasSave();
    this._refreshMenuSel();
  }

  hideAll() {
    [this.elMenu, this.elOptions, this.elCredits, this.elVictory, this.elLevels, this.elScores, this.elNick, this.elPause].forEach((el) => el.classList.add('hidden'));
    this.elMenu.style.display = 'none';
  }

  /* ---------------- NICKNAME PROMPT ---------------- */
  _wireNick() {
    this._nickCb = null;
    const input = document.getElementById('nick-input');
    const go = () => {
      const v = (input.value || '').trim().toUpperCase().slice(0, 12) || 'RIKO';
      const o = Save.loadOpts(); o.nick = v; Save.saveOpts(o);
      const cb = this._nickCb; this._nickCb = null;
      this.elNick.classList.add('hidden');
      Audio.sfx('confirm');
      if (cb) cb(v);
    };
    document.getElementById('nick-go').addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.code === 'Enter') { e.preventDefault(); go(); } });
    document.getElementById('nick-cancel').addEventListener('click', () => {
      this._nickCb = null;
      this.elNick.classList.add('hidden');
      Audio.sfx('cancel');
      this.showMenu();
    });
  }

  _askNick(cb) {
    this._nickCb = cb;
    this.hideAll();
    this.elNick.classList.remove('hidden');
    const input = document.getElementById('nick-input');
    input.value = Save.loadOpts().nick || '';
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  /* ---------------- RÉCORDS ---------------- */
  _wireScores() {
    this.elScores.querySelector('[data-act="back"]').addEventListener('click', () => {
      Audio.sfx('cancel');
      this.elScores.classList.add('hidden');
      this.showMenu();
    });
    document.getElementById('scores-clear').addEventListener('click', () => {
      Save.clearScores();
      Audio.sfx('cancel');
      this._renderScores();
    });
  }

  showScores() {
    this.hideAll();
    this.elScores.classList.remove('hidden');
    this._renderScores();
  }

  _renderScores() {
    const box = document.getElementById('score-table');
    const list = Save.loadScores();
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="score-empty">Aún no hay tiempos. ¡Termina una partida!</div>';
      return;
    }
    const head = document.createElement('div');
    head.className = 'score-row head';
    head.innerHTML = '<span class="s-rank">#</span><span>APODO</span><span class="s-time">TIEMPO</span><span class="s-diff">DIFICULTAD</span><span class="s-end">FINAL</span>';
    box.appendChild(head);
    list.forEach((s, i) => {
      const mm = Math.floor(s.time / 60), ss = String(s.time % 60).padStart(2, '0');
      const dlabel = (DIFFS[s.diff] && DIFFS[s.diff].label) || s.diff;
      const row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML =
        '<span class="s-rank">' + (i + 1) + '</span>' +
        '<span>' + esc(s.nick) + '</span>' +
        '<span class="s-time">' + mm + ':' + ss + '</span>' +
        '<span class="s-diff">' + dlabel + '</span>' +
        '<span class="s-end">' + s.ending + '</span>';
      if (DIFFS[s.diff]) row.querySelector('.s-diff').style.color = DIFFS[s.diff].color;
      box.appendChild(row);
    });
  }

  /* ---------------- LEVEL SELECT + DIFFICULTY ---------------- */
  _wireLevels() {
    this.elLevels.querySelector('[data-act="back"]').addEventListener('click', () => {
      Audio.sfx('cancel');
      this.elLevels.classList.add('hidden');
      this.showMenu();
    });
  }

  showLevels() {
    this.hideAll();
    this.elLevels.classList.remove('hidden');
    this._renderLevels();
  }

  _renderLevels() {
    const tabs = document.getElementById('diff-tabs');
    const grid = document.getElementById('level-grid');
    const blurb = document.getElementById('diff-blurb');
    const hint = document.getElementById('levels-hint');
    tabs.innerHTML = '';
    grid.innerHTML = '';

    for (const key of DIFF_ORDER) {
      const D = DIFFS[key];
      const b = document.createElement('button');
      b.textContent = D.label.toUpperCase();
      b.style.borderColor = D.color;
      if (key === this._diffSel) { b.classList.add('sel'); b.style.color = '#fff'; b.style.boxShadow = '0 0 14px ' + D.color + '66'; }
      else { b.style.color = D.color; }
      b.addEventListener('click', () => { this._diffSel = key; Audio.sfx('menu'); this._renderLevels(); });
      tabs.appendChild(b);
    }

    const D = DIFFS[this._diffSel];
    blurb.textContent = D.blurb;
    blurb.style.color = D.color;

    let anyLocked = false;
    LEVELS.forEach((L, i) => {
      const card = document.createElement('div');
      card.className = 'level-card';
      const unlocked = Save.levelUnlocked(this._diffSel, i);
      const beaten = Save.levelBeaten(this._diffSel, i);
      if (!unlocked) { card.classList.add('locked'); anyLocked = true; }
      if (beaten) card.classList.add('beaten');
      card.innerHTML =
        '<div class="lv-badge">' + (beaten ? '✔' : !unlocked ? '🔒' : '') + '</div>' +
        '<div class="lv-num">' + (i + 1) + '</div>' +
        '<div class="lv-name">' + L.name.toUpperCase() + '</div>';
      if (unlocked) {
        card.addEventListener('click', () => {
          Audio.resume();
          Audio.sfx('confirm');
          this.hideAll();
          this.hooks.onPlayLevel(this._diffSel, i);
        });
      }
      grid.appendChild(card);
    });

    hint.textContent = anyLocked
      ? 'Completa un nivel para desbloquear el siguiente en esa dificultad.'
      : 'Todos los niveles disponibles en esta dificultad.';
  }

  _flash(msg) {
    const layer = document.getElementById('toast-layer');
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    layer.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  /* ---------------- OPTIONS ---------------- */
  _wireOptions() {
    this.musicSlider = document.getElementById('opt-music');
    this.sfxSlider = document.getElementById('opt-sfx');
    this.scaleSel = document.getElementById('opt-scale');
    const mv = document.getElementById('opt-music-val');
    const sv = document.getElementById('opt-sfx-val');

    const opts = Save.loadOpts();
    this.musicSlider.value = opts.music;
    this.sfxSlider.value = opts.sfx;
    this.scaleSel.value = opts.scale || 'auto';
    mv.textContent = opts.music;
    sv.textContent = opts.sfx;
    if (opts.bindings) Input.bindings = opts.bindings;

    const persist = () => {
      Save.saveOpts({
        music: +this.musicSlider.value,
        sfx: +this.sfxSlider.value,
        scale: this.scaleSel.value,
        bindings: Input.bindings,
      });
    };

    this.musicSlider.addEventListener('input', () => {
      mv.textContent = this.musicSlider.value;
      Audio.setMusicVol(+this.musicSlider.value / 100);
      persist();
    });
    this.sfxSlider.addEventListener('input', () => {
      sv.textContent = this.sfxSlider.value;
      Audio.setSfxVol(+this.sfxSlider.value / 100);
      persist();
    });
    this.sfxSlider.addEventListener('change', () => Audio.sfx('menu'));
    this.scaleSel.addEventListener('change', () => {
      persist();
      this.hooks.applyScale && this.hooks.applyScale(this.scaleSel.value);
    });

    document.getElementById('opt-fullscreen').addEventListener('click', () => {
      const app = document.getElementById('app');
      if (!document.fullscreenElement) app.requestFullscreen && app.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    });

    // Modo claro (no darkness)
    this.brightBtn = document.getElementById('opt-bright');
    const syncBright = () => {
      const on = !!Save.loadOpts().bright;
      this.brightBtn.textContent = on ? 'Activado' : 'Desactivado';
      this.brightBtn.style.color = on ? 'var(--c-gold)' : '';
      this.brightBtn.style.borderColor = on ? 'var(--c-gold)' : '';
    };
    syncBright();
    this.brightBtn.addEventListener('click', () => {
      const o = Save.loadOpts();
      o.bright = !o.bright;
      Save.saveOpts(o);
      Audio.sfx('menu');
      syncBright();
      this.hooks.applyBright && this.hooks.applyBright(o.bright);
    });

    document.getElementById('opt-reset-controls').addEventListener('click', () => {
      Input.resetBindings();
      persist();
      this._renderControls();
      Audio.sfx('cancel');
    });

    this.elOptions.querySelector('[data-act="back"]').addEventListener('click', () => {
      Audio.sfx('cancel');
      this.closeOptions();
    });

    this._persistOpts = persist;
  }

  showOptions() {
    this.hideAll();
    this.elOptions.classList.remove('hidden');
    this._renderControls();
  }

  closeOptions() {
    this.elOptions.classList.add('hidden');
    if (this.optionsReturn === 'menu') this.showMenu();
    else { this.elPause.classList.remove('hidden'); }
  }

  _renderControls() {
    const list = document.getElementById('control-list');
    list.innerHTML = '';
    for (const action of Object.keys(CONTROL_LABELS)) {
      const row = document.createElement('div');
      row.className = 'ctl';
      const name = document.createElement('span');
      name.textContent = CONTROL_LABELS[action];
      const btn = document.createElement('button');
      btn.textContent = (Input.bindings[action] || []).map(prettyKey).join(' / ') || '—';
      btn.addEventListener('click', () => {
        if (btn.classList.contains('listening')) return;
        btn.classList.add('listening');
        btn.textContent = '...';
        this.hint.classList.remove('hidden');
        Input.captureNext((code) => {
          this.hint.classList.add('hidden');
          btn.classList.remove('listening');
          if (code !== 'Escape') {
            Input.setBinding(action, [code]);
            this._persistOpts();
          }
          this._renderControls();
        });
      });
      row.appendChild(name);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  /* ---------------- CREDITS ---------------- */
  _wireCredits() {
    this.elCredits.querySelector('[data-act="back"]').addEventListener('click', () => {
      Audio.sfx('cancel');
      this.elCredits.classList.add('hidden');
      this.hooks.onCreditsClosed ? this.hooks.onCreditsClosed() : this.showMenu();
    });
  }

  _buildCredits() {
    const body = document.getElementById('credits-body');
    body.innerHTML = '';
    for (const c of CREDITS) {
      const d = document.createElement('div');
      if (c.sec) { d.className = 'sec'; d.textContent = c.sec; }
      else { d.innerHTML = '<span class="role">' + c.role + '</span> — <span class="who">' + c.who + '</span>'; }
      body.appendChild(d);
    }
  }

  showCredits(ending) {
    this.hideAll();
    this.elCredits.classList.remove('hidden');
    const body = document.getElementById('credits-body');
    // remove any previous ending line
    const prev = body.querySelector('.ending-line');
    if (prev) prev.remove();
    if (ending) {
      const d = document.createElement('div');
      d.className = 'sec ending-line';
      d.textContent = 'FINAL OBTENIDO:  ' + ending + (ending === 'C' ? '  (verdadero)' : '');
      body.insertBefore(d, body.firstChild.nextSibling);
    }
  }

  /* ---------------- VICTORY (right after picking an ending) ---------------- */
  _wireVictory() {
    document.getElementById('victory-menu').addEventListener('click', () => {
      Audio.sfx('confirm');
      this.elVictory.classList.add('hidden');
      this.hooks.onVictoryClosed ? this.hooks.onVictoryClosed() : this.showMenu();
    });
  }

  showVictory(ending) {
    this.hideAll();
    this.elVictory.classList.remove('hidden');
    const ENDING_SUB = {
      A: 'Devolviste la luz a Lumera. La ciudad recordó lo justo para seguir.',
      B: 'Conservaste la luz. Lumera quedó perfecta, inmóvil, para siempre.',
      C: 'Compartiste la luz con todos. El final verdadero.',
    };
    document.getElementById('victory-sub').textContent =
      (ENDING_SUB[ending] || 'Terminaste Mapache Cinema: La Última Noche.')
      + '   ·   Final ' + (ending || '?');
  }

  /* ---------------- keyboard nav ---------------- */
  _visibleNav() {
    let container = null;
    if (!this.elMenu.classList.contains('hidden') && this.elMenu.style.display !== 'none') container = this.elMenu.querySelector('#menu-nav');
    else if (!this.elPause.classList.contains('hidden')) container = this.elPause.querySelector('.menu-nav');
    if (!container) return [];
    return [...container.querySelectorAll('button')].filter((b) => !b.disabled);
  }

  _refreshMenuSel() {
    const nav = this._visibleNav();
    nav.forEach((b, i) => b.classList.toggle('sel', i === this._selIndex));
  }

  _navKey(e) {
    const nav = this._visibleNav();
    if (!nav.length) return;
    if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.code)) e.preventDefault();
    if (e.code === 'ArrowDown') { this._selIndex = (this._selIndex + 1) % nav.length; Audio.sfx('menu'); }
    else if (e.code === 'ArrowUp') { this._selIndex = (this._selIndex - 1 + nav.length) % nav.length; Audio.sfx('menu'); }
    else if (e.code === 'Enter') { nav[Math.min(this._selIndex, nav.length - 1)].click(); return; }
    else return;
    this._selIndex = Math.min(this._selIndex, nav.length - 1);
    nav.forEach((b, i) => b.classList.toggle('sel', i === this._selIndex));
  }
}

function prettyKey(code) {
  return code
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Arrow', '')
    .replace('Left', 'Izq')
    .replace('Right', 'Der')
    .replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift')
    .replace('Space', 'Espacio')
    .replace('Escape', 'Esc');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
