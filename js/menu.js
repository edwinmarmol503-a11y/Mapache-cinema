/* ============================================================
   menu.js  -  DOM screen controller (main menu, options,
   credits). Pause menu lives in pause.js but shares styles.
   ============================================================ */
import { Input, DEFAULT_BINDINGS, BINDING_VERSION } from './input.js';
import { Save } from './save.js';
import { Audio } from './audio.js';
import { DIFFS, DIFF_ORDER } from './difficulty.js';
import { LEVELS } from './levels.js';
import { Ranking } from './ranking.js';
import { Controls } from './control-mode.js';
import { createDeveloperControls } from './developer-controls.js';
import { createControllerSettings } from './controller-settings.js';
import { ENDINGS } from './endings.js';

const CONTROL_LABELS = {
  left: 'Izquierda', right: 'Derecha', jump: 'Saltar', attack: 'Atacar',
  dodge: 'Esquivar', parry: 'Parada', interact: 'Interactuar', throw: 'Lanzar',
  pause: 'Pausa', cycleL: 'Objeto <', cycleR: 'Objeto >',
  emote: 'Emote (cambia al pulsar)',
};

const CREDITS = [
  { sec: 'MAPACHE CINEMA — LA ÚLTIMA NOCHE' },
  { role: 'Game Design', who: 'Estudio Lumera' },
  { role: 'Programming', who: 'Estudio Lumera' },
  { role: 'Pixel Art', who: 'Estudio Lumera  (placeholders procedurales)' },
  { role: 'Tipografía', who: 'Monocraft · Idrees Hassan · SIL Open Font License 1.1' },
  { role: 'Level Design', who: 'Estudio Lumera' },
  { role: 'Audio', who: '37 canciones · 4 clips de muerte y reaparición · efectos con Web Audio API' },
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
    this._scoreDiff = 'normal';
    this._scoresRevision = 0;
    this._gamepadScreen = null;
    this._gamepadFocus = null;
    this._originalHint = this.elMenu.querySelector('.hint')?.innerHTML;

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
    Controls.subscribe(() => this._refreshInputPresentation());
    this._refreshInputPresentation();
  }

  /* ---------------- MAIN MENU ---------------- */
  _wireMenu() {
    const content = this.elMenu.querySelector('.menu-content');
    const heading = document.createElement('header');
    heading.className = 'menu-heading';
    content.querySelectorAll('.title, .subtitle, .menu-tagline, .network-badge').forEach((el) => heading.append(el));
    content.prepend(heading);
    const footer = document.createElement('footer');
    footer.className = 'menu-footer';
    content.querySelectorAll('.hint, .version').forEach((el) => footer.append(el));
    content.append(footer);
    this._menuGlitchLayer = document.createElement('div');
    this._menuGlitchLayer.className = 'menu-glitch-layer';
    this._menuGlitchLayer.setAttribute('aria-hidden', 'true');
    this.elMenu.prepend(this._menuGlitchLayer);
    this._syncMenuBounds = () => {
      const canvas = document.getElementById('gs').getBoundingClientRect();
      const screen = this.elMenu.getBoundingClientRect();
      if (!canvas.width || !screen.width) return;
      content.style.left = (canvas.left - screen.left) + 'px';
      content.style.top = (canvas.top - screen.top) + 'px';
      content.style.width = canvas.width + 'px';
      content.style.height = canvas.height + 'px';
    };
    if (typeof ResizeObserver === 'function') {
      this._menuResizeObserver = new ResizeObserver(this._syncMenuBounds);
      this._menuResizeObserver.observe(document.getElementById('gs'));
    }
    window.addEventListener('resize', this._syncMenuBounds);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._clearMenuGlitch(); });
    this.elMenu.querySelectorAll('#menu-nav button').forEach((b) => {
      b.addEventListener('click', () => this._menuAction(b.dataset.act));
      b.addEventListener('mouseenter', () => { Audio.sfx('menu'); });
    });
  }

  _clearMenuGlitch() {
    clearTimeout(this._menuGlitchEnd);
    this.elMenu.classList.remove('menu-glitch');
    document.getElementById('app').classList.remove('menu-interference');
  }

  _scheduleMenuGlitch() {
    clearTimeout(this._menuGlitchTimer);
    // One faint interference burst, with a fresh random delay and location.
    // It never flashes the full screen or affects navigation/click targets.
    this._menuGlitchTimer = setTimeout(() => {
      if (this.elMenu.classList.contains('hidden')) return;
      const reduced = document.documentElement.classList.contains('reduced-effects')
        || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduced && !document.hidden) {
        this.elMenu.style.setProperty('--glitch-y', (12 + Math.random() * 70).toFixed(1) + '%');
        this.elMenu.style.setProperty('--glitch-h', (2 + Math.random() * 4).toFixed(1) + '%');
        this.elMenu.style.setProperty('--glitch-shift', (Math.random() < .5 ? -1 : 1) + 'px');
        this.elMenu.classList.add('menu-glitch');
        document.getElementById('app').classList.add('menu-interference');
        this._menuGlitchEnd = setTimeout(() => this._clearMenuGlitch(), 110 + Math.random() * 110);
      }
      this._scheduleMenuGlitch();
    }, 5500 + Math.random() * 14000);
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
    this._syncMenuBounds();
    this._scheduleMenuGlitch();
  }

  hideAll() {
    clearTimeout(this._menuGlitchTimer);
    this._clearMenuGlitch();
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
      Ranking.setNickname(v);
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
    setTimeout(() => {
      if (this.elNick.classList.contains('hidden')) return;
      if (Controls.getMode() === 'gamepad') this._focusWithGamepad(document.getElementById('nick-go'), this.elNick);
      else { input.focus(); input.select(); }
    }, 30);
  }

  /* ---------------- RÉCORDS ---------------- */
  _wireScores() {
    const assistance = document.createElement('select');
    assistance.id = 'score-assisted';
    assistance.setAttribute('aria-label', 'Tipo de partida en la clasificación');
    for (const [value, label] of [['standard', 'Estándar'], ['assisted', 'Con ayuda']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; assistance.append(option);
    }
    document.getElementById('scores-refresh').before(assistance);
    this.elScores.querySelector('[data-act="back"]').addEventListener('click', () => {
      Audio.sfx('cancel');
      this.elScores.classList.add('hidden');
      this.showMenu();
    });
    document.getElementById('scores-clear').addEventListener('click', () => {
      if (!window.confirm('¿Borrar los récords guardados en este dispositivo? La clasificación mundial se conserva.')) return;
      Save.clearScores();
      Audio.sfx('cancel');
      this._renderScores();
    });
    const level = document.getElementById('score-level');
    LEVELS.forEach((L, i) => {
      const option = document.createElement('option'); option.value = i; option.textContent = (i + 1) + ' · ' + L.name;
      level.appendChild(option);
    });
    for (const id of ['score-scope', 'score-level', 'score-assisted']) document.getElementById(id).addEventListener('change', () => this._renderScores());
    document.getElementById('scores-refresh').addEventListener('click', () => this._renderScores());
    Ranking.subscribe(() => {
      const s = Ranking.getStatus();
      const badge = document.getElementById('menu-network');
      badge.textContent = s.online ? '● CLASIFICACIÓN CONECTADA' : s.configured ? '○ CLASIFICACIÓN · SIN CONEXIÓN' : '○ RÉCORDS EN ESTE DISPOSITIVO';
      badge.classList.toggle('connected', !!s.online);
    });
    this._scoreInterval = setInterval(() => {
      if (!this.elScores.classList.contains('hidden') && document.getElementById('score-scope').value === 'global' && !document.hidden) this._renderScores(true);
    }, 30000);
  }

  showScores() {
    this.hideAll();
    this.elScores.classList.remove('hidden');
    this._renderScores();
  }

  async _renderScores(quiet = false) {
    const revision = ++this._scoresRevision;
    const box = document.getElementById('score-table');
    const status = document.getElementById('score-status');
    const player = document.getElementById('score-player');
    const scope = document.getElementById('score-scope').value;
    const level = +document.getElementById('score-level').value;
    const assisted = document.getElementById('score-assisted').value === 'assisted';
    const kind = level < 0 ? 'campaign' : 'level';
    const tabs = document.getElementById('score-diff-tabs'); tabs.replaceChildren();
    for (const key of DIFF_ORDER) {
      const button = document.createElement('button'); button.textContent = DIFFS[key].label;
      button.classList.toggle('sel', key === this._scoreDiff); button.style.borderColor = DIFFS[key].color;
      button.setAttribute('aria-pressed', String(key === this._scoreDiff));
      button.addEventListener('click', () => { this._scoreDiff = key; this._renderScores(); }); tabs.append(button);
    }
    document.getElementById('scores-clear').classList.toggle('hidden', scope !== 'local');
    player.textContent = '';
    if (!quiet) { box.innerHTML = '<div class="score-empty">Consultando tiempos…</div>'; status.textContent = scope === 'global' ? 'Conectando con Lumera…' : 'Récords guardados en este dispositivo.'; }
    let list;
    if (scope === 'local') {
      list = Save.loadScores().filter(s => s.diff === this._scoreDiff && !!s.assisted === assisted && (s.kind || 'campaign') === kind && (s.level ?? -1) === level).sort((a, b) => (a.timeMs ?? a.time * 1000) - (b.timeMs ?? b.time * 1000));
      status.textContent = 'Solo este dispositivo · no son posiciones mundiales.';
    } else {
      try {
        const result = await Ranking.getLeaderboard({ difficulty: this._scoreDiff, kind, level, assisted });
        if (revision !== this._scoresRevision || this.elScores.classList.contains('hidden')) return;
        list = result.entries || [];
        status.textContent = result.cached ? 'Sin conexión · última tabla guardada; puede haber cambiado.' : result.status === 'ready' ? 'Mundial · se actualiza cada 30 segundos.' : result.reason || 'No se pudo conectar con la clasificación. Puedes jugar y ver tus récords locales.';
        if (result.player) player.textContent = 'TU MEJOR TIEMPO · #' + result.player.rank + ' · ' + formatTime(result.player.elapsedMs ?? result.player.timeMs);
      } catch {
        if (revision !== this._scoresRevision) return;
        list = []; status.textContent = 'La clasificación está temporalmente desconectada. Pulsa Actualizar para reintentar.';
      }
    }
    box.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div'); empty.className = 'score-empty';
      empty.textContent = scope === 'local' ? 'Aún no tienes tiempos para este nivel y dificultad.' : 'Todavía no hay tiempos publicados aquí, o no se pudo consultar la tabla.';
      box.append(empty); return;
    }
    const head = document.createElement('div');
    head.className = 'score-row head';
    head.innerHTML = '<span class="s-rank">#</span><span>JUGADOR</span><span class="s-time">TIEMPO</span><span class="s-end">FINAL</span>';
    box.appendChild(head);
    list.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'score-row';
      if (s.isMe || s.playerId === Ranking.getStatus().playerId) row.classList.add('is-me');
      const values = [s.rank || i + 1, s.nickname || s.nick || 'RIKO', formatTime(s.elapsedMs ?? s.timeMs ?? s.time * 1000), s.ending || '—'];
      ['s-rank', 's-name', 's-time', 's-end'].forEach((cls, index) => {
        const cell = document.createElement('span'); cell.className = cls; cell.textContent = values[index]; row.append(cell);
      });
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
      const card = document.createElement('button');
      card.className = 'level-card';
      const unlocked = Save.levelUnlocked(this._diffSel, i);
      const beaten = Save.levelBeaten(this._diffSel, i);
      if (!unlocked) { card.classList.add('locked'); anyLocked = true; }
      card.disabled = !unlocked;
      card.setAttribute('aria-label', L.name + (unlocked ? beaten ? ', completado' : ', disponible' : ', bloqueado'));
      if (beaten) card.classList.add('beaten');
      card.innerHTML =
        '<div class="lv-badge">' + (beaten ? '✔' : !unlocked ? '🔒' : '') + '</div>' +
        '<div class="lv-num">' + (i + 1) + '</div>' +
        '<div class="lv-name">' + L.name.toUpperCase() + '</div>';
      if (unlocked) {
        card.addEventListener('click', () => {
          Audio.resume();
          Audio.sfx('confirm');
          this._askNick((nick) => { this.hideAll(); this.hooks.onPlayLevel(this._diffSel, i, nick); });
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
    const mv = document.getElementById('opt-music-val');
    const sv = document.getElementById('opt-sfx-val');

    const opts = Save.loadOpts();
    this.musicSlider.value = opts.music;
    this.sfxSlider.value = opts.sfx;
    mv.textContent = opts.music;
    sv.textContent = opts.sfx;
    Input.loadBindings(opts.bindings, opts.bindingVersion);

    const persist = () => {
      Save.saveOpts({
        ...Save.loadOpts(),
        music: +this.musicSlider.value,
        sfx: +this.sfxSlider.value,
        bindings: Input.bindings,
        bindingVersion: BINDING_VERSION,
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

    document.getElementById('opt-fullscreen').addEventListener('click', () => {
      const app = document.getElementById('app');
      if (!document.fullscreenElement) app.requestFullscreen && app.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    });

    const visual = document.getElementById('opt-visual');
    visual.value = opts.visualMode;
    visual.addEventListener('change', () => {
      Save.saveOpts({ visualMode: visual.value, bright: visual.value !== 'night' });
      Audio.sfx('menu');
      this.hooks.applyVisual && this.hooks.applyVisual(visual.value);
    });
    const effects = document.getElementById('opt-effects'); effects.value = opts.reducedEffects ? 'reduced' : 'full';
    effects.addEventListener('change', () => {
      Save.saveOpts({ reducedEffects: effects.value === 'reduced' });
      this.hooks.applyEffects && this.hooks.applyEffects(effects.value === 'reduced');
    });
    const nickname = document.getElementById('opt-nickname'); nickname.value = opts.nick;
    nickname.addEventListener('change', () => {
      const value = nickname.value.trim().toUpperCase().slice(0, 12) || 'RIKO'; nickname.value = value;
      Save.saveOpts({ nick: value }); Ranking.setNickname(value);
    });

    document.getElementById('opt-reset-controls').addEventListener('click', () => {
      Input.resetBindings();
      persist();
      this._renderControls();
      Audio.sfx('cancel');
    });
    document.getElementById('opt-reset-controls').dataset.keyboardOnly = 'true';

    this.elOptions.querySelector('[data-act="back"]').addEventListener('click', () => {
      Audio.sfx('cancel');
      this.closeOptions();
    });

    this._persistOpts = persist;
    this.controllerSettings = createControllerSettings(document.getElementById('control-list'));
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
    const controller = Controls.getMode() === 'gamepad';
    list.classList.toggle('hidden', controller);
    document.getElementById('opt-reset-controls').classList.toggle('hidden', controller);
    this.controllerSettings?.refresh();
    if (controller) return;
    for (const action of Object.keys(CONTROL_LABELS)) {
      const row = document.createElement('div');
      row.className = 'ctl';
      const name = document.createElement('span');
      name.textContent = CONTROL_LABELS[action];
      const btn = document.createElement('button');
      btn.dataset.keyboardOnly = 'true';
      btn.disabled = Controls.getMode() === 'gamepad';
      btn.title = '';
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
    this.developerControls?.destroy();
    this.developerControls = createDeveloperControls(body, {
      onConfigure: () => { this.optionsReturn = 'menu'; this.showOptions(); },
      onPreviewEnding: (ending) => this.hooks.onPreviewEnding?.(ending),
    });
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

  showVictory(ending, { preview = false } = {}) {
    this.hideAll();
    this.elVictory.classList.remove('hidden');
    const key = ENDINGS[ending] ? ending : 'A';
    const metadata = ENDINGS[key];
    this.elVictory.dataset.ending = key;
    this.elVictory.classList.toggle('ending-preview', preview);
    document.getElementById('victory-title').textContent = metadata.title;
    document.getElementById('victory-sub').textContent = metadata.subtitle + ' · Final ' + key;
    let narration = document.getElementById('victory-narration');
    if (!narration) {
      narration = document.createElement('p'); narration.id = 'victory-narration';
      this.elVictory.append(narration);
    }
    narration.textContent = metadata.narration;
    let previewLabel = document.getElementById('victory-preview');
    if (!previewLabel) {
      previewLabel = document.createElement('span'); previewLabel.id = 'victory-preview';
      previewLabel.className = 'ending-preview-badge'; previewLabel.textContent = 'VISTA PREVIA';
      this.elVictory.querySelector('.victory-box').append(previewLabel);
    }
    previewLabel.classList.toggle('hidden', !preview);
  }

  /* ---------------- keyboard nav ---------------- */
  _refreshInputPresentation() {
    const mode = Controls.getMode();
    const signature = mode + ':' + ['jump', 'attack', 'dodge', 'interact', 'pause'].map(action => Controls.getHint(action)).join('|');
    if (this._presentedSignature === signature) return;
    this._presentedSignature = signature;
    this._presentedMode = mode;
    const hint = this.elMenu.querySelector('.hint');
    if (hint) {
      if (mode === 'gamepad') hint.textContent = 'Mando · Stick / cruceta: mover · ' + Controls.getHint('jump') + ': saltar · ' + Controls.getHint('attack') + ': atacar · ' + Controls.getHint('interact') + ': usar · ✕: confirmar · ○: volver';
      else if (mode === 'touch') hint.textContent = 'Táctil · Usa el joystick para moverte y los botones de acción en pantalla.';
      else hint.innerHTML = this._originalHint || '';
    }
    let nickHint = document.getElementById('nick-control-hint');
    if (!nickHint) {
      nickHint = document.createElement('p'); nickHint.id = 'nick-control-hint'; nickHint.className = 'option-note';
      this.elNick.querySelector('.nick-row').before(nickHint);
    }
    nickHint.textContent = mode === 'gamepad' ? 'Pulsa ✕ en EMPEZAR para usar tu apodo guardado o RIKO. No hace falta escribir para jugar.' : '';
    nickHint.classList.toggle('hidden', mode !== 'gamepad');
    const reset = document.getElementById('opt-reset-controls');
    if (reset) reset.disabled = mode === 'gamepad';
    if (!this.elOptions.classList.contains('hidden')) this._renderControls();
    if (mode !== 'gamepad') this._clearGamepadFocus();
  }

  _activeGamepadScreen() {
    return [this.elNick, this.elOptions, this.elCredits, this.elVictory, this.elLevels, this.elScores, this.elPause, this.elMenu]
      .find((el) => el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none') || null;
  }

  _gamepadTargets(screen) {
    return [...screen.querySelectorAll('button, select, input, textarea, summary, a[href], [tabindex]')].filter((el) => {
      if (el.disabled || el.type === 'hidden' || el.dataset.keyboardOnly === 'true' || el.tabIndex < 0) return false;
      if (el.closest('.hidden, [hidden], [inert]')) return false;
      const details = el.closest('details');
      if (details && !details.open && el !== details.querySelector('summary')) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && el.getClientRects().length > 0;
    });
  }

  _clearGamepadFocus() {
    this._gamepadFocus?.classList.remove('gamepad-focus');
    this._gamepadFocus = null; this._gamepadScreen = null;
  }

  _focusWithGamepad(target, screen) {
    this._gamepadFocus?.classList.remove('gamepad-focus');
    this._gamepadFocus = target; this._gamepadScreen = screen;
    target.classList.add('gamepad-focus');
    target.focus({ preventScroll: true });
    // Scroll only the panel, so large credits/options remain usable on a television.
    const panel = target.closest('.panel');
    if (panel) {
      const box = panel.getBoundingClientRect(), rect = target.getBoundingClientRect();
      if (rect.top < box.top + 14) panel.scrollTop += rect.top - box.top - 14;
      else if (rect.bottom > box.bottom - 14) panel.scrollTop += rect.bottom - box.bottom + 14;
    }
    const nav = this._visibleNav();
    if (nav.includes(target)) { this._selIndex = nav.indexOf(target); this._refreshMenuSel(); }
  }

  navigateWithGamepad(action) {
    if (Controls.getMode() !== 'gamepad') return false;
    // OPTIONS toggles gameplay pause in main.js, including options opened from pause.
    if (action === 'pause') return false;
    const screen = this._activeGamepadScreen();
    if (!screen) { this._clearGamepadFocus(); return false; }
    if (Input._capture) {
      if (action === 'cancel') { const capture = Input._capture; Input._capture = null; capture('Escape'); }
      return true;
    }
    const targets = this._gamepadTargets(screen);
    if (!targets.length) return true;
    let focused = this._gamepadFocus;
    if (this._gamepadScreen !== screen || !targets.includes(focused)) {
      focused = screen === this.elNick ? document.getElementById('nick-go') : targets.find((el) => el.classList.contains('sel')) || targets[0];
      this._focusWithGamepad(focused, screen);
    }
    if (action === 'cancel') {
      const back = screen.querySelector('[data-act="back"], #nick-cancel, #victory-menu, [data-act="resume"]');
      if (back) back.click();
      return true;
    }
    if (action === 'confirm') {
      if (focused === document.getElementById('nick-input')) document.getElementById('nick-go').click();
      else if (focused.matches('button, summary, a[href]')) focused.click();
      else focused.focus();
      return true;
    }
    if (!['up', 'down', 'left', 'right'].includes(action)) return true;
    const direction = action === 'left' || action === 'up' ? -1 : 1;
    if ((action === 'left' || action === 'right') && focused.tagName === 'SELECT') {
      const options = [...focused.options].filter((option) => !option.disabled);
      const current = options.findIndex((option) => option.value === focused.value);
      const next = options[Math.max(0, Math.min(options.length - 1, current + direction))];
      if (next && focused.value !== next.value) { focused.value = next.value; focused.dispatchEvent(new Event('change', { bubbles: true })); Audio.sfx('menu'); }
      return true;
    }
    if ((action === 'left' || action === 'right') && focused.type === 'range') {
      const min = Number(focused.min || 0), max = Number(focused.max || 100);
      const step = Math.max(1, Number(focused.step) || 1) * 5;
      const value = Math.max(min, Math.min(max, Number(focused.value) + step * direction));
      if (value !== Number(focused.value)) { focused.value = value; focused.dispatchEvent(new Event('input', { bubbles: true })); focused.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    }
    const rect = focused.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const vertical = action === 'up' || action === 'down';
    const candidates = targets.filter((el) => el !== focused).map((el) => {
      const bounds = el.getBoundingClientRect(), dx = bounds.left + bounds.width / 2 - x, dy = bounds.top + bounds.height / 2 - y;
      const primary = (vertical ? dy : dx) * direction, cross = Math.abs(vertical ? dx : dy);
      return { el, primary, score: primary + cross * 2 };
    }).filter((entry) => entry.primary > 3).sort((a, b) => a.score - b.score);
    const index = targets.indexOf(focused);
    const next = candidates[0]?.el || targets[(index + direction + targets.length) % targets.length];
    this._focusWithGamepad(next, screen); Audio.sfx('menu');
    return true;
  }

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
    if (e.defaultPrevented || Input._capture || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
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

function formatTime(ms) {
  const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + '.' + String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
}
