// NEON SURGE — tuning: every number the game balances on lives here.
// One job: constants. No logic, no imports.

export const ARENA = { w: 1280, h: 720 };

export const PALETTE = {
  bg: '#070b1a',
  grid: 'rgba(90,140,255,0.07)',
  border: '#1c2f66',
  player: '#37f6ff',
  playerCore: '#eafcff',
  bullet: '#ffe45e',
  gem: '#7dff6a',
  bigGem: '#ff9df5',
  text: '#dfe9ff',
  dim: '#8fa3d9',
  hp: '#ff5d7a',
  xp: '#7dff6a',
  boss: '#ff4d6d',
  card: '#101a3a',
  cardEdge: '#2c4a9e',
};

export const PLAYER = {
  radius: 14,
  speed: 265,
  hp: 100,
  fireInterval: 0.34, // seconds between shots
  bulletSpeed: 540,
  bulletDamage: 12,
  bulletRadius: 5,
  bulletRange: 640,
  dashSpeed: 3.1, // multiplier while dashing
  dashTime: 0.22,
  dashCooldown: 2.6,
  invulnAfterDash: 0.35,
  invulnAfterHit: 0.7,
  magnetRadius: 90,
  gemValue: 1,
  bigGemValue: 5,
};

// Enemy kinds: shape, colour, stats. hp/speed/damage scale with the wave.
export const ENEMIES = {
  chaser:   { shape: 'tri',    color: '#ff5d7a', radius: 14, hp: 22,  speed: 92,  damage: 10, score: 10, gem: 1 },
  shooter:  { shape: 'dia',    color: '#c58cff', radius: 13, hp: 18,  speed: 72,  damage: 8,  score: 15, gem: 1 },
  splitter: { shape: 'hex',    color: '#ffb347', radius: 18, hp: 34,  speed: 66,  damage: 12, score: 20, gem: 1 },
  mini:     { shape: 'tri',    color: '#ff8fa3', radius: 8,   hp: 7,   speed: 155, damage: 6,  score: 5,  gem: 0 },
  tank:     { shape: 'sq',     color: '#5ea8ff', radius: 25,  hp: 95,  speed: 46,  damage: 18, score: 40, gem: 5 },
  boss:     { shape: 'oct',    color: '#ff4d6d', radius: 48,  hp: 620, speed: 42,  damage: 24, score: 500, gem: 5 },
};

// Which kinds appear from which wave, and how many spawn per wave.
export const WAVE_PLAN = [
  { chaser: 6 },
  { chaser: 7, shooter: 3 },
  { chaser: 7, shooter: 4, splitter: 3 },
  { chaser: 8, shooter: 5, splitter: 4, tank: 2 },
];
export const BOSS_EVERY = 5; // a boss arrives every 5th wave
export const WAVE_BREATHER = 4; // seconds between waves
export const HP_SCALE_PER_WAVE = 0.09;
export const SPEED_SCALE_PER_WAVE = 0.02;
export const MAX_SPEED_SCALE = 1.35;

// Level-ups: XP needed for level L (1-based) is round(8 * 1.35^(L-1)).
export const xpForLevel = (level) => Math.round(8 * Math.pow(1.35, level - 1));

// Upgrade cards. max = stack cap. apply() mutates the player's upgrade state.
export const UPGRADES = [
  { id: 'dmg',    name: 'OVERCHARGE', desc: '+25% bullet damage', max: 5,
    apply: (u) => { u.damageMul *= 1.25; } },
  { id: 'rate',   name: 'RAPID CYCLER', desc: '+20% fire rate', max: 5,
    apply: (u) => { u.fireMul *= 0.8; } },
  { id: 'multi',  name: 'SPLIT CANNON', desc: '+1 projectile per shot', max: 3,
    apply: (u) => { u.shots += 1; } },
  { id: 'pierce', name: 'LANCE ROUNDS', desc: 'Bullets pierce +1 enemy', max: 3,
    apply: (u) => { u.pierce += 1; } },
  { id: 'speed',  name: 'ION THRUSTERS', desc: '+12% move speed', max: 5,
    apply: (u) => { u.speedMul *= 1.12; } },
  { id: 'vital',  name: 'AEGIS CORE', desc: '+25 max HP and heal 25', max: 5,
    apply: (u, p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'magnet', name: 'TRACTOR WEB', desc: '+60% gem magnet radius', max: 4,
    apply: (u) => { u.magnetMul *= 1.6; } },
  { id: 'dash',   name: 'PHASE DASH', desc: '-25% dash cooldown', max: 4,
    apply: (u) => { u.dashMul *= 0.75; } },
];

export const COMBO_WINDOW = 2.5; // seconds between kills to keep the chain
export const COMBO_STEP = 0.1; // +10% score per chained kill
export const COMBO_MAX = 3.0; // +200% cap
export const SHOOTER_RANGE = 270; // distance a shooter keeps from the player
export const SHOOTER_INTERVAL = 2.3; // seconds between aimed orbs
export const BOSS_BURST_INTERVAL = 3.1;
export const BOSS_BURST_COUNT = 12;
export const BOSS_SPAWN_INTERVAL = 5.0; // seconds between boss chaser spawns
