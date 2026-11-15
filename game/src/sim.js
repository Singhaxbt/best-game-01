// Simulation: the world, its rules, and one fixed step of it.
// One job: advance the game state. No drawing, no DOM, no wall clock —
// every random choice comes from the seeded rng, so a seed replays exactly.

import {
  ARENA, PALETTE, PLAYER, ENEMIES, WAVE_PLAN, BOSS_EVERY, WAVE_BREATHER,
  HP_SCALE_PER_WAVE, SPEED_SCALE_PER_WAVE, MAX_SPEED_SCALE,
  xpForLevel, UPGRADES, COMBO_WINDOW, COMBO_STEP, COMBO_MAX,
  SHOOTER_RANGE, SHOOTER_INTERVAL, BOSS_BURST_INTERVAL, BOSS_BURST_COUNT,
  BOSS_SPAWN_INTERVAL,
} from './tuning.js';

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const HEAL_CARD = {
  id: 'heal', name: 'FIELD REPAIR', desc: 'Restore 40 HP', max: 99,
  apply: (u, p) => { p.hp = Math.min(p.maxHp, p.hp + 40); },
};

export function createSim(rng, sfx) {
  const w = {
    screen: 'title', // title | play | pause | levelup | over
    time: 0, wave: 0, waveState: 'breather', breatherT: 0,
    spawnQueue: [], spawnT: 0, spawnInterval: 0.7,
    player: null, upgrades: null,
    bullets: [], orbs: [], enemies: [], gems: [], parts: [], texts: [],
    xp: 0, level: 1, xpNeed: xpForLevel(1),
    score: 0, kills: 0, combo: 1, comboChain: 0, comboT: 0,
    pendingLevels: 0, cards: [],
    boss: null, shake: 0, flashT: 0, banner: '', bannerT: 0,
    best: 0, muted: false,
  };

  function freshPlayer() {
    return {
      x: ARENA.w / 2, y: ARENA.h / 2, vx: 0, vy: 0,
      kx: 0, ky: 0, // knockback velocity (decays on its own)
      angle: -Math.PI / 2, hp: PLAYER.hp, maxHp: PLAYER.hp,
      radius: PLAYER.radius, fireT: 0, dashT: 0, dashCd: 0, invulnT: 0,
    };
  }

  function freshUpgrades() {
    return {
      damageMul: 1, fireMul: 1, shots: 1, pierce: 0,
      speedMul: 1, magnetMul: 1, dashMul: 1, counts: {},
    };
  }

  function reset() {
    w.screen = 'play';
    w.time = 0; w.wave = 0; w.waveState = 'breather'; w.breatherT = 1.2;
    w.spawnQueue = []; w.spawnT = 0;
    w.player = freshPlayer();
    w.upgrades = freshUpgrades();
    w.bullets = []; w.orbs = []; w.enemies = []; w.gems = [];
    w.parts = []; w.texts = [];
    w.xp = 0; w.level = 1; w.xpNeed = xpForLevel(1);
    w.score = 0; w.kills = 0; w.combo = 1; w.comboChain = 0; w.comboT = 0;
    w.pendingLevels = 0; w.cards = [];
    w.boss = null; w.shake = 0; w.flashT = 0; w.banner = ''; w.bannerT = 0;
  }

  // --- spawning ------------------------------------------------------------
  function edgePoint() {
    // A point just outside the arena, at least 320 from the player.
    for (let tries = 0; tries < 12; tries++) {
      const side = rng.int(0, 4);
      const m = 40;
      let x, y;
      if (side === 0) { x = rng.range(0, ARENA.w); y = -m; }
      else if (side === 1) { x = ARENA.w + m; y = rng.range(0, ARENA.h); }
      else if (side === 2) { x = rng.range(0, ARENA.w); y = ARENA.h + m; }
      else { x = -m; y = rng.range(0, ARENA.h); }
      if (dist(x, y, w.player.x, w.player.y) > 320) return { x, y };
    }
    return { x: -40, y: rng.range(0, ARENA.h) };
  }

  function waveComp(n) {
    const plan = WAVE_PLAN[Math.min(n - 1, WAVE_PLAN.length - 1)];
    const comp = { ...plan };
    if (n > WAVE_PLAN.length) {
      comp.chaser = (comp.chaser ?? 0) + (n - WAVE_PLAN.length);
      comp.shooter = (comp.shooter ?? 0) + Math.floor((n - WAVE_PLAN.length) / 2);
    }
    return comp;
  }

  function startWave(n) {
    w.wave = n;
    w.waveState = 'spawning';
    const comp = waveComp(n);
    w.spawnQueue = [];
    for (const [kind, count] of Object.entries(comp)) {
      for (let i = 0; i < count; i++) w.spawnQueue.push(kind);
    }
    // Shuffle the queue so kinds arrive mixed.
    for (let i = w.spawnQueue.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [w.spawnQueue[i], w.spawnQueue[j]] = [w.spawnQueue[j], w.spawnQueue[i]];
    }
    if (n % BOSS_EVERY === 0) {
      w.spawnQueue.push('boss');
      w.banner = `WAVE ${n} — VOID MAW AWAKENS`;
      sfx.boss();
    } else {
      w.banner = `WAVE ${n}`;
      sfx.wave();
    }
    w.bannerT = 2.2;
    w.spawnT = 0.4;
    w.spawnInterval = Math.max(0.35, 0.75 - n * 0.03);
  }

  function spawnEnemy(kind) {
    const def = ENEMIES[kind];
    const hpScale = 1 + HP_SCALE_PER_WAVE * (w.wave - 1);
    const spScale = Math.min(MAX_SPEED_SCALE, 1 + SPEED_SCALE_PER_WAVE * (w.wave - 1));
    const p = edgePoint();
    const e = {
      kind, x: p.x, y: p.y, vx: 0, vy: 0,
      radius: def.radius, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      speed: def.speed * spScale, damage: def.damage,
      score: def.score, gem: def.gem, color: def.color, shape: def.shape,
      angle: rng.angle(), fireT: rng.range(0.5, SHOOTER_INTERVAL),
      burstT: BOSS_BURST_INTERVAL, spawnT: BOSS_SPAWN_INTERVAL,
      wobble: rng.range(0, TAU), hitT: 0,
    };
    if (kind === 'boss') {
      e.x = ARENA.w / 2; e.y = -70;
      e.hp = (def.hp + 220 * (w.wave / BOSS_EVERY - 1)) * hpScale;
      e.maxHp = e.hp;
      w.boss = e;
    }
    w.enemies.push(e);
    return e;
  }

  // --- combat --------------------------------------------------------------
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rng.angle();
      const s = rng.range(speed * 0.3, speed);
      w.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rng.range(0.3, 0.7), maxLife: 0.7, size: rng.range(2, 5), color,
      });
    }
  }

  function addText(x, y, str, color, size = 14) {
    if (w.texts.length > 48) w.texts.shift();
    w.texts.push({ x, y, str, color, size, life: 0.9, maxLife: 0.9 });
  }

  function fireBullet() {
    const p = w.player, u = w.upgrades;
    const n = u.shots;
    const spread = 0.1;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread;
      const a = p.angle + off;
      w.bullets.push({
        x: p.x + Math.cos(a) * (p.radius + 6),
        y: p.y + Math.sin(a) * (p.radius + 6),
        vx: Math.cos(a) * PLAYER.bulletSpeed,
        vy: Math.sin(a) * PLAYER.bulletSpeed,
        damage: PLAYER.bulletDamage * u.damageMul,
        pierce: u.pierce, radius: PLAYER.bulletRadius, travelled: 0,
      });
    }
    sfx.shoot();
  }

  function fireOrb(e) {
    const p = w.player;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    w.orbs.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * 190, vy: Math.sin(a) * 190,
      damage: e.damage, radius: 6, travelled: 0, color: e.color,
    });
  }

  function bossBurst(e) {
    const base = rng.angle();
    for (let i = 0; i < BOSS_BURST_COUNT; i++) {
      const a = base + (i / BOSS_BURST_COUNT) * TAU;
      w.orbs.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
        damage: e.damage, radius: 7, travelled: 0, color: ENEMIES.boss.color,
      });
    }
    sfx.boss();
  }

  function killEnemy(e, idx) {
    const gain = Math.round(e.score * w.combo);
    w.score += gain;
    w.kills += 1;
    w.comboChain += 1;
    w.comboT = COMBO_WINDOW;
    w.combo = Math.min(1 + (w.comboChain - 1) * COMBO_STEP, COMBO_MAX);
    addText(e.x, e.y - e.radius - 6, `+${gain}`, '#ffe45e', 15);
    burst(e.x, e.y, e.color, e.kind === 'boss' ? 40 : 12, 260);
    w.shake = Math.max(w.shake, e.kind === 'boss' ? 14 : 5);
    sfx.boom();
    if (e.gem > 0) {
      const n = e.gem === 5 ? 5 : 1;
      for (let i = 0; i < n; i++) {
        w.gems.push({
          x: e.x + rng.range(-14, 14), y: e.y + rng.range(-14, 14),
          vx: rng.range(-40, 40), vy: rng.range(-40, 40),
          value: e.gem === 5 ? PLAYER.bigGemValue : PLAYER.gemValue,
          big: e.gem === 5, life: 14,
        });
      }
    }
    if (e.kind === 'splitter') {
      for (let i = 0; i < 2; i++) {
        const m = spawnEnemy('mini');
        m.x = e.x + (i === 0 ? -14 : 14); m.y = e.y;
      }
    }
    if (e.kind === 'boss') w.boss = null;
    w.enemies.splice(idx, 1);
  }

  function damageEnemy(e, idx, dmg) {
    e.hp -= dmg;
    e.hitT = 0.08;
    addText(e.x + rng.range(-8, 8), e.y - e.radius - 2, `${Math.round(dmg)}`, '#ffffff', 11);
    burst(e.x, e.y, '#ffffff', 2, 120);
    if (e.hp <= 0) killEnemy(e, idx);
    else sfx.hit();
  }

  function hurtPlayer(dmg, fromX, fromY) {
    const p = w.player;
    if (p.invulnT > 0 || w.screen !== 'play') return;
    p.hp -= dmg;
    p.invulnT = PLAYER.invulnAfterHit;
    w.flashT = 0.25;
    w.shake = Math.max(w.shake, 9);
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    p.kx += Math.cos(a) * 320; p.ky += Math.sin(a) * 320;
    sfx.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      burst(p.x, p.y, PALETTE.player, 50, 380);
      w.shake = 18;
      sfx.over();
      w.screen = 'over';
      try {
        const prev = parseInt(localStorage.getItem('neon-surge-best') ?? '0', 10) || 0;
        if (w.score > prev) localStorage.setItem('neon-surge-best', String(w.score));
        w.best = Math.max(prev, w.score);
      } catch { /* storage unavailable: best stays session-local */ }
    }
  }

  // --- XP / levels ---------------------------------------------------------
  function grantXp(n) {
    w.xp += n;
    while (w.xp >= w.xpNeed) {
      w.xp -= w.xpNeed;
      w.level += 1;
      w.xpNeed = xpForLevel(w.level);
      w.pendingLevels += 1;
    }
    if (w.pendingLevels > 0 && w.screen === 'play') openLevelUp();
  }

  function rollCards() {
    const u = w.upgrades;
    const pool = UPGRADES.filter((c) => (u.counts[c.id] ?? 0) < c.max);
    const picks = [];
    while (picks.length < 3 && pool.length > 0) {
      const i = rng.int(0, pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    while (picks.length < 3) picks.push(HEAL_CARD);
    return picks;
  }

  function openLevelUp() {
    w.cards = rollCards();
    w.screen = 'levelup';
    sfx.level();
  }

  function chooseCard(i) {
    const card = w.cards[i];
    if (!card) return;
    card.apply(w.upgrades, w.player);
    if (card.id !== 'heal') w.upgrades.counts[card.id] = (w.upgrades.counts[card.id] ?? 0) + 1;
    w.pendingLevels -= 1;
    if (w.pendingLevels > 0) {
      w.cards = rollCards();
    } else {
      w.cards = [];
      w.screen = 'play';
    }
  }

  // --- the fixed step ------------------------------------------------------
  function step(dt, input) {
    if (w.screen !== 'play') return;
    w.time += dt;
    const p = w.player, u = w.upgrades;

    // Timers.
    if (w.comboT > 0) { w.comboT -= dt; if (w.comboT <= 0) { w.comboChain = 0; w.combo = 1; } }
    if (w.bannerT > 0) w.bannerT -= dt;
    if (w.flashT > 0) w.flashT -= dt;
    if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 26);
    if (p.invulnT > 0) p.invulnT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;

    // Waves.
    if (w.waveState === 'breather') {
      w.breatherT -= dt;
      if (w.breatherT <= 0) startWave(w.wave + 1);
    } else {
      if (w.spawnQueue.length > 0) {
        w.spawnT -= dt;
        if (w.spawnT <= 0) {
          spawnEnemy(w.spawnQueue.shift());
          w.spawnT = w.spawnInterval;
        }
      } else if (w.enemies.length === 0) {
        const bonus = 50 * w.wave;
        w.score += bonus;
        addText(p.x, p.y - 30, `WAVE CLEAR +${bonus}`, '#7dff6a', 17);
        w.waveState = 'breather';
        w.breatherT = WAVE_BREATHER;
      }
    }

    // Movement: velocity is rebuilt from the move keys each step; knockback
    // rides on its own decaying vector so it never amplifies movement.
    const mv = input.moveVec();
    const speed = PLAYER.speed * u.speedMul * (p.dashT > 0 ? PLAYER.dashSpeed : 1);
    p.kx *= 0.86; p.ky *= 0.86;
    p.vx = mv.x * speed + p.kx;
    p.vy = mv.y * speed + p.ky;
    p.x = clamp(p.x + p.vx * dt, p.radius, ARENA.w - p.radius);
    p.y = clamp(p.y + p.vy * dt, p.radius, ARENA.h - p.radius);
    const aim = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);
    if (dist(input.mouse.x, input.mouse.y, p.x, p.y) > 4) p.angle = aim;
    if (input.hit(' ') && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = PLAYER.dashTime;
      p.dashCd = PLAYER.dashCooldown * u.dashMul;
      p.dashCdMax = p.dashCd; // the ring in render.js draws against this
      p.invulnT = Math.max(p.invulnT, PLAYER.invulnAfterDash);
      burst(p.x, p.y, PALETTE.player, 8, 180);
      sfx.dash();
    }
    if (p.dashT > 0) p.dashT -= dt;

    // Auto-fire toward the aim.
    p.fireT -= dt;
    if (p.fireT <= 0) {
      fireBullet();
      p.fireT = PLAYER.fireInterval * u.fireMul;
    }

    // Enemies.
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      const e = w.enemies[i];
      if (e.hitT > 0) e.hitT -= dt;
      const d = dist(p.x, p.y, e.x, e.y);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.wobble += dt * 2;
      if (e.kind === 'shooter') {
        // Keep range, strafe, fire aimed orbs.
        const want = d > SHOOTER_RANGE + 30 ? 1 : d < SHOOTER_RANGE - 30 ? -1 : 0;
        const strafe = Math.sin(e.wobble) * 0.5;
        e.x += (Math.cos(a) * want + Math.cos(a + Math.PI / 2) * strafe) * e.speed * dt;
        e.y += (Math.sin(a) * want + Math.sin(a + Math.PI / 2) * strafe) * e.speed * dt;
        e.fireT -= dt;
        if (e.fireT <= 0 && d < 520) { fireOrb(e); e.fireT = SHOOTER_INTERVAL; }
      } else if (e.kind === 'boss') {
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
        e.angle += dt * 0.8;
        e.burstT -= dt;
        if (e.burstT <= 0) { bossBurst(e); e.burstT = BOSS_BURST_INTERVAL; }
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.spawnT = BOSS_SPAWN_INTERVAL;
          for (let k = 0; k < 2; k++) {
            const m = spawnEnemy('chaser');
            m.x = e.x + rng.range(-50, 50); m.y = e.y + rng.range(-50, 50);
          }
        }
      } else {
        // Chasers, minis, splitters, tanks: hunt with a wobble.
        const wob = Math.sin(e.wobble) * 0.35;
        e.x += (Math.cos(a + wob) * e.speed) * dt;
        e.y += (Math.sin(a + wob) * e.speed) * dt;
        e.angle = a;
      }
      // Contact damage.
      if (d < e.radius + p.radius + 2) {
        hurtPlayer(e.damage, e.x, e.y);
        // Shove the enemy back so it does not stick to the player.
        e.x -= Math.cos(a) * 26; e.y -= Math.sin(a) * 26;
      }
    }

    // Player bullets.
    for (let i = w.bullets.length - 1; i >= 0; i--) {
      const b = w.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.travelled += PLAYER.bulletSpeed * dt;
      let dead = b.travelled > PLAYER.bulletRange
        || b.x < -20 || b.x > ARENA.w + 20 || b.y < -20 || b.y > ARENA.h + 20;
      if (!dead) {
        for (let j = w.enemies.length - 1; j >= 0; j--) {
          const e = w.enemies[j];
          if (dist(b.x, b.y, e.x, e.y) < e.radius + b.radius) {
            damageEnemy(e, j, b.damage);
            if (b.pierce > 0) { b.pierce -= 1; }
            else { dead = true; }
            break;
          }
        }
      }
      if (dead) w.bullets.splice(i, 1);
    }

    // Enemy orbs.
    for (let i = w.orbs.length - 1; i >= 0; i--) {
      const o = w.orbs[i];
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.travelled += 190 * dt;
      let dead = o.travelled > 900 || o.x < -20 || o.x > ARENA.w + 20 || o.y < -20 || o.y > ARENA.h + 20;
      if (!dead && dist(o.x, o.y, p.x, p.y) < o.radius + p.radius) {
        hurtPlayer(o.damage, o.x - o.vx, o.y - o.vy);
        dead = true;
      }
      if (dead) w.orbs.splice(i, 1);
    }

    // Gems: drift, magnetise, collect.
    const magnetR = PLAYER.magnetRadius * u.magnetMul;
    for (let i = w.gems.length - 1; i >= 0; i--) {
      const g = w.gems[i];
      g.life -= dt;
      const d = dist(g.x, g.y, p.x, p.y);
      if (d < magnetR) {
        const a = Math.atan2(p.y - g.y, p.x - g.x);
        const pull = 620 * (1 - d / (magnetR + 1));
        g.vx += Math.cos(a) * pull * dt * 4;
        g.vy += Math.sin(a) * pull * dt * 4;
      }
      g.vx *= 0.92; g.vy *= 0.92;
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (d < p.radius + 12) {
        grantXp(g.value);
        addText(p.x, p.y - 22, `+${g.value} XP`, PALETTE.gem, 12);
        sfx.gem();
        w.gems.splice(i, 1);
      } else if (g.life <= 0) {
        w.gems.splice(i, 1);
      }
    }

    // Particles + floating texts.
    for (let i = w.parts.length - 1; i >= 0; i--) {
      const pt = w.parts[i];
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.94; pt.vy *= 0.94;
      if (pt.life <= 0) w.parts.splice(i, 1);
    }
    for (let i = w.texts.length - 1; i >= 0; i--) {
      const t = w.texts[i];
      t.life -= dt; t.y -= 26 * dt;
      if (t.life <= 0) w.texts.splice(i, 1);
    }
  }

  function start() {
    try {
      w.best = parseInt(localStorage.getItem('neon-surge-best') ?? '0', 10) || 0;
    } catch { w.best = 0; }
    reset();
  }

  return { state: w, reset, start, step, chooseCard, grantXp };
}
