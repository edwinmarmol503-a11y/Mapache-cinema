/* ============================================================
   levels.js  -  tilemap + data-driven level definitions.

   DESIGN RULES (no softlocks):
   - Continuous ground line on every horizontal level.
   - Small pits are 2 tiles wide  -> trivially jumpable.
   - "Wide" gaps (needing a bridge/platform) are marked and the
     lever / rope anchor that solves them sits ON THE GROUND
     right before the gap.
   - Every REQUIRED interactable (lever, magnet node, rope anchor,
     required light node, sequence buttons, gate doors) is on the
     ground corridor. Elevated stuff is always OPTIONAL (memories).
   - `blocks` only used well above the corridor or as arena walls.

   Legend: '#' solid · '=' one-way platform · '^' spike (hazard).
   Tile size = 16.
   ============================================================ */

export const TS = 16;

export class TileMap {
  constructor(rows, ts = TS) {
    this.ts = ts;
    this.w = Math.max(...rows.map((r) => r.length));
    this.rows = rows.map((r) => r.padEnd(this.w, '.'));
    this.h = this.rows.length;
    this.pixelW = this.w * ts;
    this.pixelH = this.h * ts;
  }
  tile(tx, ty) {
    if (ty < 0) return '.';
    if (tx < 0 || tx >= this.w) return '#';
    if (ty >= this.h) return '.';
    return this.rows[ty][tx];
  }
  isSolidTile(tx, ty) { return this.tile(tx, ty) === '#'; }
  isOneWayTile(tx, ty) { return this.tile(tx, ty) === '='; }
  isHazardTile(tx, ty) { return this.tile(tx, ty) === '^'; }
}

function buildMap(def) {
  const { W, H, groundY } = def;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('.'));

  if (groundY != null) {
    for (let y = groundY; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = '#';
  }
  for (const [px, len] of def.pits || []) {
    for (let x = px; x < px + len; x++) for (let y = groundY; y < H; y++) if (g[y]) g[y][x] = '.';
  }
  for (const [x, y, w, h] of def.blocks || []) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (g[y + j] && x + i < W && x + i >= 0) g[y + j][x + i] = '#';
  }
  for (const [x, y, len, solid] of def.platforms || []) {
    for (let i = 0; i < len; i++) if (g[y] && x + i < W && x + i >= 0) g[y][x + i] = solid ? '#' : '=';
  }
  for (const [x, y, len] of def.spikes || []) {
    for (let i = 0; i < len; i++) if (g[y] && x + i < W) g[y][x + i] = '^';
  }
  return g.map((r) => r.join(''));
}

/* tower (level 5): zig-zag ladder, +2 rows / step, big horizontal overlap.
   First platform is only 2 rows above the ground. */
function towerPlatforms() {
  const a = [];
  for (let i = 0; i < 23; i++) {
    const y = 62 - i * 2;              // 62 .. 18  (last one merges with the arena floor)
    const x = i % 2 ? 14 : 6;          // t6-15  /  t14-23  (overlap t14-15)
    a.push([x, y, 10]);
  }
  return a;
}

/* =========================================================
   LEVEL DEFINITIONS
   ========================================================= */
export const LEVELS = [
  /* ---------------------------------------------------------
     1. LOS TEJADOS  (tutorial)
     --------------------------------------------------------- */
  {
    key: 'roofs',
    name: 'Los Tejados',
    music: 'roofs',
    darkness: 0.46,
    def: {
      W: 116, H: 20, groundY: 15,
      pits: [[26, 2], [48, 2], [72, 2], [96, 2]],
      platforms: [
        [12, 13, 4], [30, 13, 3], [40, 12, 3], [56, 13, 4],
        [61, 13, 3], [63, 11, 3], [66, 9, 3], [82, 13, 3], [104, 12, 4],
      ],
      spikes: [[38, 14, 2], [88, 14, 2]],
    },
    spawn: { tx: 3, ty: 13 },
    exit: { tx: 112, ty: 14 },
    checkpoints: [{ tx: 46, ty: 14 }, { tx: 84, ty: 14 }],
    lights: [
      // every lantern sits exactly one tile above real ground/platform --
      // no more "lamp floating in the void"
      { tx: 8, ty: 14, r: 40, c: '#ffcf8a' }, { tx: 31, ty: 12, r: 40, c: '#ffcf8a' },
      { tx: 66, ty: 8, r: 44, c: '#ffcf8a' }, { tx: 83, ty: 12, r: 40, c: '#ffcf8a' },
      { tx: 100, ty: 14, r: 48, c: '#ffcf8a' },
    ],
    items: [
      { type: 'llave', tx: 14, ty: 14 },
      { type: 'bombilla', tx: 24, ty: 14 },
      { type: 'bombilla', tx: 78, ty: 14 },
      { type: 'lata', tx: 57, ty: 12 },
    ],
    enemies: [
      { type: 'sombra', tx: 20, ty: 14 },
      { type: 'sombra', tx: 44, ty: 14 },
      { type: 'sombra', tx: 60, ty: 14 },
      { type: 'sombra', tx: 90, ty: 14 },
    ],
    puzzles: [
      { type: 'lightnode', id: 'ln_g1', tx: 26, ty: 14, memory: true },
      { type: 'lightnode', id: 'ln_roof', tx: 67, ty: 8, memory: true,
        dialogue: [{ speaker: 'Riko', text: 'Otra luz. Y dentro, un recuerdo que no es mío.' }] },
      { type: 'door', id: 'd_gate', tx: 100, ty: 0, tall: 15, locked: true, needs: 'llave' },
      { type: 'door', id: 'd_exit1', tx: 110, ty: 0, tall: 15, requires: ['_clear'] },
    ],
    memories: [{ tx: 30, ty: 11 }],
    triggers: [
      { tx: 0, ty: 0, w: 7, h: 20, dialogue: [
        { speaker: 'Riko', text: 'Lumera. Mi ciudad. Cada luz, un recuerdo encendido.' },
        { speaker: 'Riko', text: 'Toqué una esfera en un contenedor… y ahora se apagan una a una.' },
        { text: 'Mueve con A/D o Flechas. Salta con Espacio. En el aire, salta otra vez: doble salto (más corto).' },
      ] },
      { tx: 34, ty: 8, w: 3, h: 12, dialogue: [
        { text: 'Ataca con J. Esquiva con Shift. Cae sobre un enemigo para pisarle la cabeza (le quita 1 vida, a ti nada).' },
        { speaker: 'Riko', text: 'Y si algo va a golpearme... una PARADA perfecta con L. Solo tengo tres.' },
      ] },
      { tx: 52, ty: 8, w: 3, h: 12, dialogue: [
        { text: 'Enciende TODOS los pedestales con la BOMBILLA (Q/R para elegir, E para usar). Llevarla en mano ilumina a tu alrededor.' },
        { speaker: 'Riko', text: 'Y no puedo irme hasta acabar con todos los enemigos. Lo llevo arriba: enemigos y faroles.' },
      ] },
      { tx: 90, ty: 8, w: 3, h: 12, dialogue: [
        { speaker: 'Riko', text: 'Un portón de hierro, del suelo al cielo. La llave oxidada. (E, junto a la base)' },
      ] },
    ],
    intro: [{ text: 'LOS TEJADOS' }],
  },

  /* ---------------------------------------------------------
     2. EL BOSQUE AZUL
     --------------------------------------------------------- */
  {
    key: 'forest',
    name: 'El Bosque Azul',
    music: 'forest',
    darkness: 0.56,
    def: {
      W: 128, H: 22, groundY: 17,
      pits: [[22, 2], [44, 2], [70, 2], [100, 2]],
      platforms: [
        [10, 15, 4], [16, 13, 3], [30, 15, 4], [52, 15, 4],
        [58, 13, 3], [76, 15, 4], [92, 15, 3], [110, 15, 4], [116, 13, 3],
      ],
    },
    spawn: { tx: 3, ty: 15 },
    exit: { tx: 124, ty: 15 },
    checkpoints: [{ tx: 50, ty: 16 }, { tx: 90, ty: 16 }],
    lights: [
      { tx: 6, ty: 16, r: 42, c: '#7fd0ff' }, { tx: 40, ty: 16, r: 40, c: '#7fd0ff' },
      { tx: 86, ty: 16, r: 44, c: '#7fd0ff' }, { tx: 117, ty: 12, r: 46, c: '#7fd0ff' },
    ],
    items: [
      { type: 'bombilla', tx: 11, ty: 15 },
      { type: 'bombilla', tx: 53, ty: 15 },
      { type: 'bombilla', tx: 99, ty: 15 },
      { type: 'lata', tx: 77, ty: 15 },
    ],
    enemies: [
      { type: 'cuervo', tx: 26, ty: 11 },
      { type: 'sombra', tx: 46, ty: 16 },
      { type: 'cuervo', tx: 66, ty: 10 },
      { type: 'sombra', tx: 88, ty: 16 },
      { type: 'cuervo', tx: 112, ty: 10 },
    ],
    puzzles: [
      { type: 'lightnode', id: 'ln_f1', tx: 40, ty: 16, memory: true, dialogue: [
        { speaker: 'Riko', text: 'La luz me muestra un sendero que el bosque ya olvidó.' },
        { text: 'LAS LUCES CONTIENEN RECUERDOS. Enciende los tres para poder salir.' },
      ] },
      { type: 'lightnode', id: 'ln_f2', tx: 86, ty: 16, memory: true },
      { type: 'lightnode', id: 'ln_f3', tx: 104, ty: 16, memory: true },
      { type: 'door', id: 'd_exit2', tx: 122, ty: 0, tall: 17, requires: ['_clear'] },
    ],
    memories: [{ tx: 58, ty: 12 }],
    triggers: [
      { tx: 0, ty: 0, w: 7, h: 22, dialogue: [
        { speaker: 'Riko', text: 'El Bosque Azul. Sin sus faroles, ni los árboles recuerdan su forma.' },
        { text: 'Enciende los dos pedestales con la BOMBILLA para abrir la salida.' },
      ] },
      { tx: 62, ty: 4, w: 3, h: 18, dialogue: [{ speaker: 'Riko', text: 'Alguien recoge las luces. Las guarda. Todas.' }] },
    ],
    intro: [{ text: 'EL BOSQUE AZUL' }],
  },

  /* ---------------------------------------------------------
     3. LAS ALCANTARILLAS  (puzzle-focused)
     --------------------------------------------------------- */
  {
    key: 'sewers',
    name: 'Las Alcantarillas',
    music: 'sewers',
    darkness: 0.56,
    def: {
      W: 124, H: 22, groundY: 17,
      pits: [[64, 17]],                     // 17 wide -> uncrossable; the lever platform is the ONLY way
      platforms: [
        [18, 15, 3], [34, 15, 4], [44, 13, 3], [52, 15, 4],
        [86, 15, 4], [100, 15, 4], [108, 13, 3],
      ],
      blocks: [[58, 5, 2, 5]],               // high pipe (decoration)
    },
    spawn: { tx: 3, ty: 15 },
    exit: { tx: 120, ty: 15 },
    checkpoints: [{ tx: 40, ty: 16 }, { tx: 88, ty: 16 }],
    lights: [
      { tx: 6, ty: 16, r: 40, c: '#63d6c2' }, { tx: 45, ty: 12, r: 40, c: '#63d6c2' },
      { tx: 88, ty: 14, r: 42, c: '#63d6c2' },
    ],
    items: [
      { type: 'iman', tx: 10, ty: 15 },
      { type: 'bombilla', tx: 45, ty: 12 },
      { type: 'bombilla', tx: 90, ty: 15 },
      { type: 'lata', tx: 83, ty: 14 },
    ],
    enemies: [
      { type: 'devorador', tx: 26, ty: 16 },
      { type: 'guardian', tx: 52, ty: 16 },
      { type: 'devorador', tx: 84, ty: 16 },
      { type: 'guardian', tx: 104, ty: 16 },
    ],
    puzzles: [
      /* A) crate rests on a shelf; magnet node (ground) drops it on the button -> door */
      { type: 'crate', tag: 'box1', metal: true, tx: 19, ty: 14 },
      { type: 'button', id: 'bx1', tx: 24, ty: 16, momentary: false },
      { type: 'magnet', id: 'm1', tx: 28, ty: 16, crate: 'box1', snapTx: 24, snapTy: 16 },
      { type: 'door', id: 'd_s1', tx: 32, ty: 15, tall: 2, requires: ['bx1'] },

      /* B) an ever-running ferry -- the ONLY way across the 17-tile gap.
         It rests overlapping the left edge (just walk on) and carries you to
         the far ground; you can't fall off the front while over the pit. */
      { type: 'platform', id: 'pf_s1', tx: 60, ty: 17, len: 6, toTx: 79, toTy: 17, speed: 56, ferry: true },

      /* light nodes (ground) -- must all be lit to clear the zone */
      { type: 'lightnode', id: 'ln_s1', tx: 48, ty: 16, memory: true, dialogue: [
        { speaker: 'Riko', text: 'Hasta aquí abajo hay faroles apagados. Todos deben arder.' },
      ] },
      { type: 'lightnode', id: 'ln_s2', tx: 95, ty: 16, memory: true },

      /* C) 3-button sequence (all on the ground) -> door */
      { type: 'button', id: 'sq_a', tx: 100, ty: 16 },
      { type: 'button', id: 'sq_b', tx: 106, ty: 16 },
      { type: 'button', id: 'sq_c', tx: 112, ty: 16 },
      { type: 'sequence', id: 'seq1', order: ['sq_a', 'sq_b', 'sq_c'] },
      { type: 'door', id: 'd_s2', tx: 115, ty: 15, tall: 2, requires: ['seq1'] },
      { type: 'door', id: 'd_exit3', tx: 118, ty: 0, tall: 17, requires: ['_clear'] },
    ],
    memories: [{ tx: 44, ty: 11 }, { tx: 60, ty: 11 }],
    triggers: [
      { tx: 0, ty: 0, w: 7, h: 22, dialogue: [
        { speaker: 'Riko', text: 'Las alcantarillas. Tuberías, agua, máquinas viejas que aún zumban.' },
        { text: 'Usa el IMÁN (E) junto al pedestal: la caja metálica caerá sobre el botón.' },
      ] },
      { tx: 54, ty: 4, w: 3, h: 12, dialogue: [{ text: 'El vacío es infranqueable. Sube a la plataforma flotante: te cruza sola.' }] },
      { tx: 96, ty: 4, w: 3, h: 12, dialogue: [
        { speaker: 'Riko', text: 'Tres botones, de izquierda a derecha. Pisa el último al final.' },
      ] },
    ],
    intro: [{ text: 'LAS ALCANTARILLAS' }],
  },

  /* ---------------------------------------------------------
     4. EL DISTRITO ABANDONADO
     --------------------------------------------------------- */
  {
    key: 'district',
    name: 'El Distrito Abandonado',
    music: 'district',
    darkness: 0.58,
    rain: true,
    def: {
      W: 132, H: 22, groundY: 17,
      pits: [[27, 11], [81, 11]],           // 11 wide -> uncrossable; the ROPE bridge is the only way
      platforms: [
        [12, 15, 4], [20, 13, 3], [44, 15, 4], [54, 13, 3], [62, 15, 4],
        [96, 15, 4], [104, 13, 3], [114, 15, 3], [122, 13, 3],
      ],
      blocks: [[47, 3, 3, 9], [101, 2, 3, 10]],
      spikes: [[68, 16, 2]],
    },
    spawn: { tx: 3, ty: 15 },
    exit: { tx: 128, ty: 15 },
    checkpoints: [{ tx: 40, ty: 16 }, { tx: 94, ty: 16 }],
    lights: [
      { tx: 6, ty: 16, r: 38, c: '#ff9a5c' }, { tx: 55, ty: 12, r: 32, c: '#ff9a5c' },
      { tx: 97, ty: 14, r: 40, c: '#ff9a5c' }, { tx: 124, ty: 12, r: 44, c: '#ff9a5c' },
    ],
    items: [
      { type: 'cuerda', tx: 13, ty: 15 },
      { type: 'bombilla', tx: 63, ty: 15 },
      { type: 'bombilla', tx: 110, ty: 15 },
      { type: 'cuerda', tx: 73, ty: 15 },
    ],
    enemies: [
      { type: 'sombra', tx: 18, ty: 16 },
      { type: 'cuervo', tx: 38, ty: 9 },
      { type: 'devorador', tx: 60, ty: 16 },
      { type: 'guardian', tx: 96, ty: 16 },
      { type: 'cuervo', tx: 112, ty: 9 },
      { type: 'sombra', tx: 120, ty: 16 },
    ],
    puzzles: [
      { type: 'rope', id: 'rp1', tx: 25, ty: 16, len: 15, horizontal: true },
      { type: 'lightnode', id: 'ln_d1', tx: 66, ty: 16, memory: true, dialogue: [
        { speaker: '???', text: 'No lo hago por crueldad. Cada luz perdida es un nombre que nadie recordará.' },
        { speaker: 'Riko', text: 'El Farolero. Guardaba los recuerdos para salvarlos…' },
        { speaker: 'Riko', text: 'Pero lo guardó todo. Y Lumera dejó de avanzar.' },
      ] },
      { type: 'rope', id: 'rp2', tx: 79, ty: 16, len: 15, horizontal: true },
      { type: 'lightnode', id: 'ln_d2', tx: 118, ty: 16, memory: true },
      { type: 'door', id: 'd_exit4', tx: 126, ty: 0, tall: 17, requires: ['_clear'] },
    ],
    memories: [{ tx: 24, ty: 12 }, { tx: 105, ty: 11 }],
    triggers: [
      { tx: 0, ty: 0, w: 7, h: 22, dialogue: [
        { speaker: 'Riko', text: 'El distrito abandonado. Llueve sobre calles que ya nadie nombra.' },
        { text: 'La CUERDA (E en el anclaje) tiende un puente sobre los vacíos.' },
      ] },
      { tx: 47, ty: 0, w: 3, h: 12, dialogue: [{ speaker: 'Riko', text: 'Carteles en blanco. Las tiendas olvidaron lo que vendían.' }] },
    ],
    intro: [{ text: 'EL DISTRITO ABANDONADO' }],
  },

  /* ---------------------------------------------------------
     5. LA TORRE DEL FAROLERO  (vertical climb + boss)
     --------------------------------------------------------- */
  {
    key: 'tower',
    name: 'La Torre del Farolero',
    music: 'tower',
    darkness: 0.52,
    def: {
      W: 30, H: 66, groundY: 64,
      blocks: [[0, 0, 3, 66], [27, 0, 3, 66], [3, 18, 24, 1]],   // arena floor (1 thick -> no ceiling over the climb)
      platforms: towerPlatforms(),
    },
    spawn: { tx: 6, ty: 62 },
    exit: null,
    checkpoints: [{ tx: 14, ty: 40 }, { tx: 6, ty: 22 }],
    lights: [
      { tx: 6, ty: 60, r: 44, c: '#ffcf8a' }, { tx: 18, ty: 44, r: 40, c: '#ffcf8a' },
      { tx: 8, ty: 26, r: 40, c: '#ffcf8a' },
      /* arena is lit by four wall lanterns */
      { tx: 5, ty: 15, r: 54, c: '#ffe08a' }, { tx: 24, ty: 15, r: 54, c: '#ffe08a' },
      { tx: 10, ty: 7, r: 60, c: '#ffe08a' }, { tx: 19, ty: 7, r: 60, c: '#ffe08a' },
    ],
    items: [
      { type: 'bombilla', tx: 16, ty: 51 },
      { type: 'bombilla', tx: 8, ty: 39 },
      { type: 'lata', tx: 16, ty: 33 },
    ],
    enemies: [
      { type: 'cuervo', tx: 14, ty: 50 },
      { type: 'sombra', tx: 8, ty: 43 },
      { type: 'cuervo', tx: 16, ty: 31 },
      { type: 'sombra', tx: 10, ty: 23 },
    ],
    puzzles: [],
    memories: [{ tx: 16, ty: 58 }, { tx: 6, ty: 30 }],
    triggers: [
      { tx: 0, ty: 58, w: 30, h: 8, dialogue: [
        { speaker: 'Riko', text: 'La Torre. Aquí termina la noche... de un modo u otro.' },
        { text: 'Sube. Lleva una BOMBILLA en mano para ver en la oscuridad.' },
      ] },
      { tx: 3, ty: 16, w: 24, h: 3, event: 'bossIntro', dialogue: [
        { speaker: 'El Farolero', text: 'Pequeño Riko. Trepaste toda la noche para llegar a mí.' },
        { speaker: 'El Farolero', text: 'Miré cómo Lumera olvidaba. No pude soportarlo. Así que lo guardé todo.' },
        { speaker: 'El Farolero', text: 'Nada se perdería jamás. Nada cambiaría jamás.' },
        { speaker: 'Riko', text: 'Y nada podría vivir. Solo puedo alcanzarlo cuando baje: entonces, golpeo o caigo sobre él.' },
      ] },
    ],
    intro: [{ text: 'LA TORRE DEL FAROLERO' }],
    boss: true,
    bossArena: { tx: 3, ty: 4, w: 24, h: 14 },
    bossSpawn: { tx: 18, ty: 9 },
  },
];

export function buildTileMap(levelDef) {
  return new TileMap(buildMap(levelDef.def));
}
