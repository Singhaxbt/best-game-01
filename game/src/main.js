// NEON SURGE — entry point. Boots the canvas, runs the fixed-step loop,
// and owns the screen state machine (title / play / pause / level-up / over).
// The sim owns the rules; the renderer owns the pixels; this file wires them.

import { ARENA } from './tuning.js';
import { makeRng, seedFromUrl } from './rng.js';
import { makeInput } from './input.js';
import { makeSfx } from './sfx.js';
import { createSim } from './sim.js';
import { drawWorld, drawTitle, drawPause, drawLevelUp, drawOver } from './render.js';
import { stageShot } from './stage.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
canvas.width = ARENA.w;
canvas.height = ARENA.h;
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const shot = params.get('shot'); // start | play | upgrade | end (screenshots)
const seed = seedFromUrl();
const rng = makeRng(seed);
const sfx = makeSfx();
const input = makeInput(canvas);
const sim = createSim(rng, sfx);
const w = sim.state;

// Best score for the title screen (0 in staged shots, so re-takes match).
try { w.best = parseInt(localStorage.getItem('neon-surge-best') ?? '0', 10) || 0; } catch { w.best = 0; }
if (shot) w.best = 0;

if (shot) {
  stageShot(w, sim, shot);
} else {
  w.screen = 'title';
}

function draw() {
  if (w.screen === 'title') drawTitle(ctx, w);
  else if (w.screen === 'pause') drawPause(ctx, w);
  else if (w.screen === 'levelup') drawLevelUp(ctx, w);
  else if (w.screen === 'over') drawOver(ctx, w);
  else drawWorld(ctx, w);
}

// --- screen transitions ----------------------------------------------------
function startGame() {
  sfx.unlock();
  sim.start();
  input.flush();
}

function onPress() {
  sfx.unlock();
  if (w.screen === 'title' || w.screen === 'over') startGame();
  else if (w.screen === 'pause') { w.screen = 'play'; input.flush(); }
}

canvas.addEventListener('mousedown', (e) => {
  if (w.screen === 'levelup') {
    // Click a card: find which one the click landed on.
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);
    const cw = 300, ch = 170, gap = 30;
    const total = w.cards.length * cw + (w.cards.length - 1) * gap;
    let x = (ARENA.w - total) / 2;
    for (let i = 0; i < w.cards.length; i++) {
      if (mx >= x && mx <= x + cw && my >= 250 && my <= 250 + ch) {
        sim.chooseCard(i);
        input.flush();
        return;
      }
      x += cw + gap;
    }
    return;
  }
  onPress();
});

// --- fixed-step loop -------------------------------------------------------
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  if (!shot) {
    // Keyboard shortcuts, by screen.
    if (input.hit('Enter') || input.hit('r') || input.hit('R')) onPress();
    if (input.hit('p') || input.hit('P') || input.hit('Escape')) {
      if (w.screen === 'play') { w.screen = 'pause'; input.flush(); }
      else if (w.screen === 'pause') { w.screen = 'play'; input.flush(); }
    }
    if (input.hit('m') || input.hit('M')) sfx.toggleMute();
    if (w.screen === 'levelup') {
      if (input.hit('1')) sim.chooseCard(0);
      if (input.hit('2')) sim.chooseCard(1);
      if (input.hit('3')) sim.chooseCard(2);
    }

    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      sim.step(STEP, input);
      acc -= STEP;
      n++;
    }
    if (n === 5) acc = 0; // drop backlog rather than spiral after a hitch
  }

  draw();
  requestAnimationFrame(frame);
}

draw();
requestAnimationFrame(frame);

// Test hook: the play-test drives the game through this handle.
window.__surge = {
  world: w,
  start: startGame,
  choose: (i) => sim.chooseCard(i),
  grant: (n) => sim.grantXp(n),
  seed,
};
