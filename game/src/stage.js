// Staging: deterministic screenshot scenes for ?shot=.
// One job: drive the game to a photogenic moment with an autopilot, then
// freeze it. Every choice comes from the world's seeded rng, so the same
// seed stages the same frame every time.

import { ARENA } from './tuning.js';

const STEPS = 60; // fixed steps per simulated second

// A synthetic input the autopilot steers: aim + movement + dash.
function makeDrive() {
  const drive = {
    mouse: { x: ARENA.w / 2, y: ARENA.h / 2, down: false },
    vec: { x: 0, y: 0 },
    dashQueued: false,
  };
  drive.input = {
    mouse: drive.mouse,
    moveVec: () => drive.vec,
    hit: (k) => {
      if (k === ' ' && drive.dashQueued) { drive.dashQueued = false; return true; }
      return false;
    },
    held: () => false,
    flush: () => {},
  };
  return drive;
}

// Autopilot: move toward the nearest gem (or the arena centre), aim at the
// nearest enemy, dash when a crowd closes in. Pure function of world state.
function autopilot(w, drive) {
  const p = w.player;
  let best = null, bestD = Infinity;
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) { drive.mouse.x = best.x; drive.mouse.y = best.y; }
  let tx = ARENA.w / 2, ty = ARENA.h / 2, gd = Infinity;
  for (const g of w.gems) {
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d < gd) { gd = d; tx = g.x; ty = g.y; }
  }
  const dx = tx - p.x, dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  drive.vec = { x: dx / len, y: dy / len };
  let close = 0;
  for (const e of w.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 150) close++;
  if (close >= 3 && p.dashCd <= 0) drive.dashQueued = true;
}

// Run the world forward `seconds` of play with the autopilot steering.
function runFor(w, sim, drive, seconds) {
  const n = Math.round(seconds * STEPS);
  for (let i = 0; i < n; i++) {
    if (w.screen !== 'play') break;
    autopilot(w, drive);
    sim.step(1 / STEPS, drive.input);
  }
}

// Stage a scene, then freeze the world for the screenshot.
export function stageShot(w, sim, shot) {
  const drive = makeDrive();
  if (shot === 'start') {
    // Title screen: nothing to run.
    return;
  }
  if (shot === 'play') {
    sim.start();
    // Run until the fight is busy — wave 2 with several enemies on screen —
    // or 30 s at most. A fixed 13 s lands in the breather after wave 1,
    // when the arena is empty and the cover shows nothing.
    for (let i = 0; i < 40 * STEPS; i++) {
      // A level-up mid-run opens the card screen: pick a card and keep
      // playing, so the cover freezes on the action, not on the cards.
      if (w.screen === 'levelup') { sim.chooseCard(0); continue; }
      if (w.screen !== 'play') break;
      if (w.wave >= 2 && w.enemies.length >= 5 && w.gems.length >= 1 && w.time > 10) break;
      autopilot(w, drive);
      sim.step(1 / STEPS, drive.input);
    }
    return;
  }
  if (shot === 'upgrade') {
    sim.start();
    // Play until the first level-up opens, or 40 s at most.
    for (let i = 0; i < 40 * STEPS; i++) {
      if (w.screen === 'levelup') return;
      if (w.screen !== 'play') break;
      autopilot(w, drive);
      sim.step(1 / STEPS, drive.input);
    }
    // Fallback: force a level-up so the card screen still shows.
    if (w.screen === 'play') sim.grantXp(999);
    return;
  }
  if (shot === 'end') {
    sim.start();
    runFor(w, sim, drive, 8);
    // Then stand still under a ring of chasers until the ship dies.
    // HP is set to 1 so the first contact ends the run (a higher HP lets
    // the auto-fire clear the ring during the invulnerability window).
    if (w.screen === 'play') {
      const p = w.player;
      p.hp = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        w.enemies.push({
          kind: 'chaser', x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 60,
          vx: 0, vy: 0, radius: 14, hp: 22, maxHp: 22, speed: 92, damage: 10,
          score: 10, gem: 1, color: '#ff5d7a', shape: 'tri', angle: a,
          fireT: 2, burstT: 3, spawnT: 5, wobble: 0, hitT: 0,
        });
      }
      for (let i = 0; i < 10 * STEPS; i++) {
        if (w.screen === 'over') break;
        sim.step(1 / STEPS, drive.input);
      }
    }
  }
}
