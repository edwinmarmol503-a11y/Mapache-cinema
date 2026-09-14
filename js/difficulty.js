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
    key: 'easy', label: 'Facil', color: '#6fbf73',
    blurb: 'Menos enemigos, mas objetos, mas vida.',
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
    key: 'hard', label: 'Dificil', color: '#e08a3c',
    blurb: 'Mas enemigos, mas rapidos y resistentes.',
    enemyHp: 1, enemyDmg: 0, enemySpeed: 1.35, halfEnemies: false,
    extraEnemies: 2, extraItems: 0, playerHp: 3, meleeOff: false, bossHpMul: 1.3, orbMul: 1.35,
  },
  nightmare: {
    key: 'nightmare', label: 'Pesadilla', color: '#d64b3a',
    blurb: 'El ataque no dana enemigos (si al jefe): solo la PARADA (ilimitada) y la esquiva.',
    enemyHp: 1, enemyDmg: 1, enemySpeed: 1.55, halfEnemies: false,
    extraEnemies: 2, extraItems: -1, playerHp: 2, meleeOff: true, bossHpMul: 1.55, orbMul: 2.0,
    bossLataAssist: true,   // an occasional lata in the arena -- your only ranged hit vs regular foes doesn't apply here, but ammo helps
  },
};

export const DIFF_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

export function getDiff(key) { return DIFFS[key] || DIFFS.normal; }
