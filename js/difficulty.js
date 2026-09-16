/* ============================================================
   difficulty.js  -  four modes.  Read by game.js / enemies.js /
   boss.js to scale the run.
     enemyHp     : +/- to each enemy's max HP (min 1)
     enemyDmg    : +/- to each enemy's contact damage (min 1)
     enemySpeed  : multiplier on enemy / boss movement + cadence
     halfEnemies : keep only every other enemy (easy)
     extraEnemies: duplicate the first N enemies of a level (hard+)
     extraItems  : +N bombilla/lata pickups per level (negative removes)
     playerHp    : Riko's max HP for the run
     meleeOff    : J and stomp deal NO damage to ENEMIES -- only parry/dodge.
                   (The FINAL BOSS is always meleeable, even here.)
     bossHpMul   : multiplier on the Farolero's HP
     orbMul      : multiplier on the number / rate of the boss's light orbs
   ============================================================ */
export const DIFFS = {
  easy: {
    key: 'easy', label: 'Fácil', color: '#6fbf73',
    blurb: 'Menos enemigos, más objetos, más vida.',
    enemyHp: -1, enemyDmg: -1, enemySpeed: 0.9, halfEnemies: true,
    extraEnemies: 0, extraItems: 3, playerHp: 4, meleeOff: false, bossHpMul: 0.7, orbMul: 0.7,
  },
  normal: {
    key: 'normal', label: 'Normal', color: '#4a90d9',
    blurb: 'La experiencia pensada por defecto.',
    enemyHp: 0, enemyDmg: 0, enemySpeed: 1, halfEnemies: false,
    extraEnemies: 0, extraItems: 0, playerHp: 3, meleeOff: false, bossHpMul: 1, orbMul: 1,
  },
  hard: {
    key: 'hard', label: 'Difícil', color: '#e08a3c',
    blurb: 'Más enemigos, más rápidos y resistentes.',
    enemyHp: 1, enemyDmg: 0, enemySpeed: 1.35, halfEnemies: false,
    extraEnemies: 2, extraItems: 0, playerHp: 3, meleeOff: false, bossHpMul: 1.3, orbMul: 1.35,
  },
  nightmare: {
    key: 'nightmare', label: 'Pesadilla', color: '#d64b3a',
    blurb: '5 corazones, pero un toque de enemigo o del jefe te los quita TODOS de golpe. '
         + 'Solo las bolitas de luz del jefe quitan 1 a la vez. El ataque no daña enemigos (sí al jefe): solo la PARADA (ilimitada) y la esquiva.',
    enemyHp: 1, enemyDmg: 1, enemySpeed: 1.55, halfEnemies: false,
    extraEnemies: 2, extraItems: -1, playerHp: 5, meleeOff: true, bossHpMul: 1.55, orbMul: 2.0,
    bossLataAssist: true,   // an occasional lata in the arena -- your only ranged hit vs regular foes doesn't apply here, but ammo helps
    instaKillTouch: true,   // any enemy/boss CONTACT drains all HP at once; only boss orbs deal the normal 1
  },
};

/** after this many deaths on Pesadilla (this save), the run gets a small mercy nerf */
export const NIGHTMARE_MERCY_DEATHS = 25;

/** small, deliberately modest easing applied on top of the base Pesadilla numbers
    once NIGHTMARE_MERCY_DEATHS is reached -- the mode keeps its identity
    (instant-kill contact, melee-off, unlimited parry), just a bit less relentless. */
export function nightmareMercyDiff(base) {
  return Object.assign({}, base, {
    enemySpeed: 1.4,
    extraEnemies: 1,
    orbMul: 1.6,
    bossHpMul: 1.4,
  });
}

export const DIFF_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

export function getDiff(key) { return DIFFS[key] || DIFFS.normal; }
