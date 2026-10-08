import { Game } from '../js/game.js';
import { Dialogue } from '../js/dialogue.js';
import { Save } from '../js/save.js';
import { LEVELS } from '../js/levels.js';
import { Input } from '../js/input.js';

const failures = [];
let checks = 0;
function check(condition, message) { checks++; if (!condition) failures.push(message); }
const silent = new Proxy({}, { get: () => () => {} });
function fixture(index, diff = 'normal', visible = true, title = LEVELS[index].name) {
  const canvas = document.createElement('canvas');
  canvas.width = 480; canvas.height = 270;
  if (visible) {
    const section = document.createElement('section');
    const heading = document.createElement('h2'); heading.textContent = title;
    section.append(heading, canvas); document.querySelector('main').append(section);
  }
  const save = { ...Save, data: null, persist() {}, loadOpts: () => ({}),
    loadMeta: () => ({ progress: {}, nightmareDeaths: 0 }), saveMeta() {},
    markLevelBeaten() {}, addScore() {} };
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'middle';
  const game = new Game(ctx, canvas, { audio: silent, save, dialogue: new Dialogue() });
  game.startAt(diff, index);
  game.state = 'playing'; game.weather = 'clear';
  game.render();
  return game;
}

try {
  for (let i = 0; i < LEVELS.length; i++) {
    const game = fixture(i);
    check(game.player.hp > 0 && game.map.w > 0, 'Carga del nivel ' + i);
    // Exercise the same render/update path in all four difficulties.
    for (const difficulty of ['easy', 'normal', 'hard', 'nightmare']) {
      const run = fixture(i, difficulty, false);
      for (let frame = 0; frame < 12; frame++) { run.update(1 / 60); run.render(); }
      check(Number.isFinite(run.player.x), 'Estado válido: ' + difficulty + '/' + i);
    }
    const lines = [...(LEVELS[i].triggers || []), ...(LEVELS[i].puzzles || [])]
      .flatMap(trigger => trigger.dialogue || []);
    for (const line of lines) {
      const d = new Dialogue(); d.start([line]); d.char = d.lines[0].text.length;
      const ctx = game.ctx;
      const draw = ctx.fillText;
      let fits = true;
      ctx.fillText = function (text, x, y, ...rest) {
        const width = this.measureText(text).width;
        const left = this.textAlign === 'right' ? x - width : x;
        if (left < 0 || left + width > 480 || y < 0 || y > 260) fits = false;
        return draw.call(this, text, x, y, ...rest);
      };
      d.render(ctx, 480, 270); ctx.fillText = draw;
      check(fits, 'Diálogo fuera de pantalla: ' + line.text);
    }
    game.render();
    const dialogueGame = fixture(i, 'normal', true, LEVELS[i].name + ' · diálogo');
    dialogueGame.dialogue.start([lines.reduce((a, b) => a.text.length > b.text.length ? a : b)]);
    dialogueGame.dialogue.char = 1000; dialogueGame.render();
  }
  const boss = fixture(4, 'nightmare', true, 'El Farolero · combate');
  boss.startBoss();
  boss.camera.x = boss.bossArena.x; boss.camera.y = boss.bossArena.y;
  boss.boss.x = boss.bossArena.x + 220; boss.boss.y = boss.bossArena.y + 90;
  boss.player.x = boss.bossArena.x + 100; boss.player.y = boss.bossArena.y + 200;
  boss.render();
  check(boss.bossActive, 'Jefe visible');
  const ending = fixture(4, 'normal', true, 'Elección del final');
  ending._startEndingChoice(); ending.render();
  for (const key of ['A', 'B', 'C']) {
    const end = fixture(4, 'normal', true, 'Final ' + key);
    end._playEnding(key); end.dialogue.char = 1000; end.render();
    check(end.dialogue.active, 'Diálogo del final ' + key);
  }
  check(LEVELS[1].puzzles.filter(p => p.type === 'lightnode').length === 3, 'Tres faroles en el bosque');
  const lighting = fixture(0, 'normal', false);
  lighting.player = null;
  lighting.lights = [{ x: lighting.camera.x + 240, y: lighting.camera.y + 135, r: 60, c: '#ffdf9a' }];
  lighting.ctx.fillStyle = '#808080'; lighting.ctx.fillRect(0, 0, 480, 270);
  lighting._renderLighting(lighting.ctx);
  const center = lighting.ctx.getImageData(240, 135, 1, 1).data;
  const edge = lighting.ctx.getImageData(20, 135, 1, 1).data;
  check(center[0] >= 128 && center[0] > edge[0], 'La luz conserva el escenario y aclara su centro');
  document.querySelector('#result').textContent = failures.length
    ? failures.join('\n') : checks + ' comprobaciones correctas. Cinco niveles, cuatro dificultades, jefe, diálogos y tres finales renderizados.';
} catch (error) {
  document.querySelector('#result').textContent = 'ERROR: ' + error.stack;
  console.error(error);
}
