// Rendering: everything the player sees, drawn on one canvas.
// One job: draw the world + HUD + screens. Reads state, changes nothing.

import { ARENA, PALETTE, PLAYER } from './tuning.js';

function poly(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shape(ctx, kind, x, y, r, rot) {
  if (kind === 'tri') poly(ctx, x, y, r, 3, rot);
  else if (kind === 'dia') poly(ctx, x, y, r, 4, rot);
  else if (kind === 'hex') poly(ctx, x, y, r, 6, rot);
  else if (kind === 'sq') poly(ctx, x, y, r, 4, rot + Math.PI / 4);
  else if (kind === 'oct') {
    // Eight-pointed star for the boss.
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 === 0 ? r : r * 0.55;
      const a = rot + (i / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

function bar(ctx, x, y, w, h, frac, fill, bg = 'rgba(255,255,255,0.12)') {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function centerText(ctx, str, x, y, size, color, weight = 'bold') {
  ctx.font = `${weight} ${size}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function drawWorld(ctx, w) {
  const p = w.player;
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // Screen shake. The offset is a deterministic function of world time
  // (never Math.random): a frozen world must render the same pixels twice,
  // so staged screenshots are byte-identical across takes.
  ctx.save();
  if (w.shake > 0.2) {
    const sx = Math.sin(w.time * 127.1) * 0.5 + Math.sin(w.time * 311.7) * 0.5;
    const sy = Math.cos(w.time * 141.3) * 0.5 + Math.cos(w.time * 271.9) * 0.5;
    ctx.translate(sx * w.shake, sy * w.shake);
  }

  // Grid + arena border.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= ARENA.w; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.h); }
  for (let y = 0; y <= ARENA.h; y += 64) { ctx.moveTo(0, y); ctx.lineTo(ARENA.w, y); }
  ctx.stroke();
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, ARENA.w - 4, ARENA.h - 4);

  // Gems.
  for (const g of w.gems) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.life * 2);
    ctx.fillStyle = g.big ? PALETTE.bigGem : PALETTE.gem;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    const s = g.big ? 8 : 5;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // Enemy orbs.
  for (const o of w.orbs) {
    ctx.fillStyle = o.color;
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Enemies.
  for (const e of w.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = e.color;
    ctx.globalAlpha = e.hitT > 0 ? 0.55 : 1;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.kind === 'boss' ? 26 : 12;
    shape(ctx, e.shape, 0, 0, e.radius, e.angle);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // HP bar over hurt or big enemies.
    if (e.hp < e.maxHp && e.maxHp > 30) {
      bar(ctx, e.x - e.radius, e.y - e.radius - 12, e.radius * 2, 4, e.hp / e.maxHp, '#ff5d7a');
    }
  }

  // Player bullets.
  for (const b of w.bullets) {
    ctx.fillStyle = PALETTE.bullet;
    ctx.shadowColor = PALETTE.bullet;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Player ship (blink while invulnerable).
  if (p.invulnT <= 0 || Math.floor(w.time * 20) % 2 === 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(p.radius + 6, 0);
    ctx.lineTo(-p.radius, p.radius * 0.75);
    ctx.lineTo(-p.radius * 0.45, 0);
    ctx.lineTo(-p.radius, -p.radius * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath(); ctx.arc(2, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Dash cooldown ring.
    if (p.dashCd > 0) {
      const max = p.dashCdMax ?? PLAYER.dashCooldown;
      ctx.strokeStyle = 'rgba(55,246,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 9, -Math.PI / 2, -Math.PI / 2 + (1 - p.dashCd / max) * Math.PI * 2);
      ctx.stroke();
    }
  }

  // Particles.
  for (const pt of w.parts) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // Floating texts.
  for (const t of w.texts) {
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    centerText(ctx, t.str, t.x, t.y, t.size, t.color);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Damage flash.
  if (w.flashT > 0) {
    ctx.fillStyle = `rgba(255,40,70,${w.flashT * 0.5})`;
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  }

  drawHud(ctx, w);
}

function drawHud(ctx, w) {
  const p = w.player;
  ctx.textBaseline = 'alphabetic';
  // Top-left: HP + XP.
  ctx.textAlign = 'left';
  ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('HULL', 18, 26);
  bar(ctx, 70, 14, 190, 14, p.hp / p.maxHp, PALETTE.hp);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 268, 26);
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`LV ${w.level}`, 18, 52);
  bar(ctx, 70, 40, 190, 10, w.xp / w.xpNeed, PALETTE.xp);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${w.xp} / ${w.xpNeed} XP`, 268, 50);

  // Top-center: wave + boss bar.
  centerText(ctx, `WAVE ${Math.max(1, w.wave)}`, ARENA.w / 2, 26, 20, PALETTE.text);
  if (w.boss) {
    centerText(ctx, 'VOID MAW', ARENA.w / 2, 52, 13, PALETTE.boss);
    bar(ctx, ARENA.w / 2 - 160, 60, 320, 9, w.boss.hp / w.boss.maxHp, PALETTE.boss);
  }

  // Top-right: score, combo, timer, kills.
  ctx.textAlign = 'right';
  ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${w.score}`, ARENA.w - 18, 30);
  ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = w.combo > 1 ? '#ffe45e' : PALETTE.dim;
  ctx.fillText(w.combo > 1 ? `COMBO x${w.combo.toFixed(1)}` : 'COMBO x1.0', ARENA.w - 18, 50);
  ctx.fillStyle = PALETTE.dim;
  const mins = Math.floor(w.time / 60), secs = Math.floor(w.time % 60);
  ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}  •  ${w.kills} KILLS`, ARENA.w - 18, 68);

  // Wave banner.
  if (w.bannerT > 0 && w.banner) {
    ctx.globalAlpha = Math.min(1, w.bannerT);
    centerText(ctx, w.banner, ARENA.w / 2, ARENA.h / 2 - 60, 42, '#ffe45e');
    ctx.globalAlpha = 1;
  }
}

export function drawTitle(ctx, w) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  ctx.strokeStyle = PALETTE.grid;
  ctx.beginPath();
  for (let x = 0; x <= ARENA.w; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.h); }
  for (let y = 0; y <= ARENA.h; y += 64) { ctx.moveTo(0, y); ctx.lineTo(ARENA.w, y); }
  ctx.stroke();
  centerText(ctx, 'NEON SURGE', ARENA.w / 2, 190, 84, '#37f6ff');
  centerText(ctx, 'WAVE-BASED ARENA SURVIVAL', ARENA.w / 2, 248, 22, PALETTE.dim);
  centerText(ctx, 'Survive the swarm. Collect XP. Level up. Slay the VOID MAW.', ARENA.w / 2, 292, 18, PALETTE.text);
  centerText(ctx, 'WASD move  •  Mouse aim (auto-fire)  •  SPACE dash  •  P pause  •  M mute', ARENA.w / 2, 360, 17, PALETTE.dim);
  centerText(ctx, 'CLICK OR PRESS ENTER TO START', ARENA.w / 2, 440, 26, '#ffe45e');
  if (w.best > 0) centerText(ctx, `BEST SCORE  ${w.best}`, ARENA.w / 2, 500, 18, PALETTE.gem);
  centerText(ctx, 'A new boss every 5th wave — how long can you last?', ARENA.w / 2, 570, 15, PALETTE.dim);
}

export function drawPause(ctx, w) {
  drawWorld(ctx, w);
  ctx.fillStyle = 'rgba(4,7,20,0.72)';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  centerText(ctx, 'PAUSED', ARENA.w / 2, 320, 56, PALETTE.text);
  centerText(ctx, 'Press P or click to resume', ARENA.w / 2, 380, 18, PALETTE.dim);
}

export function drawLevelUp(ctx, w) {
  drawWorld(ctx, w);
  ctx.fillStyle = 'rgba(4,7,20,0.72)';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  centerText(ctx, `LEVEL ${w.level} — CHOOSE AN UPGRADE`, ARENA.w / 2, 150, 34, '#ffe45e');
  const cw = 300, ch = 170, gap = 30;
  const total = w.cards.length * cw + (w.cards.length - 1) * gap;
  let x = (ARENA.w - total) / 2;
  w.cards.forEach((card, i) => {
    const y = 250;
    ctx.fillStyle = PALETTE.card;
    ctx.strokeStyle = PALETTE.cardEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 12);
    ctx.fill(); ctx.stroke();
    centerText(ctx, `[${i + 1}]`, x + cw / 2, y + 34, 15, PALETTE.dim);
    centerText(ctx, card.name, x + cw / 2, y + 78, 21, PALETTE.player);
    centerText(ctx, card.desc, x + cw / 2, y + 118, 16, PALETTE.text);
    const stacks = w.upgrades?.counts?.[card.id] ?? 0;
    centerText(ctx, stacks > 0 ? `owned x${stacks}` : 'new', x + cw / 2, y + 148, 13, PALETTE.dim);
    x += cw + gap;
  });
  centerText(ctx, 'Click a card or press 1 / 2 / 3', ARENA.w / 2, 490, 17, PALETTE.dim);
}

export function drawOver(ctx, w) {
  drawWorld(ctx, w);
  ctx.fillStyle = 'rgba(4,7,20,0.78)';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  centerText(ctx, 'GAME OVER', ARENA.w / 2, 210, 64, PALETTE.hp);
  centerText(ctx, `SCORE  ${w.score}`, ARENA.w / 2, 300, 30, '#ffe45e');
  const mins = Math.floor(w.time / 60), secs = Math.floor(w.time % 60);
  centerText(ctx, `WAVE ${w.wave}  •  ${w.kills} KILLS  •  ${mins}:${String(secs).padStart(2, '0')} SURVIVED`, ARENA.w / 2, 350, 18, PALETTE.text);
  if (w.score >= w.best && w.score > 0) {
    centerText(ctx, 'NEW BEST SCORE!', ARENA.w / 2, 400, 22, PALETTE.gem);
  } else if (w.best > 0) {
    centerText(ctx, `BEST  ${w.best}`, ARENA.w / 2, 400, 18, PALETTE.dim);
  }
  centerText(ctx, 'Press ENTER or click to play again', ARENA.w / 2, 470, 20, PALETTE.text);
}
