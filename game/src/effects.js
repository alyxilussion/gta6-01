// Particles, skid marks, muzzle flashes and explosions — the juice that
// makes a crash feel like a crash. All state lives in arrays on the game
// state object; the renderer draws them, this module spawns and steps them.
export function initEffects(state) {
  state.particles = [];
  state.skids = [];
  state.flashes = [];
  state.shake = 0;
}

export function addShake(state, amount) {
  state.shake = Math.min(18, state.shake + amount);
}

export function spawnSparks(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.35 + Math.random() * 0.4,
      maxLife: 0.75,
      size: 2 + Math.random() * 2.5,
      color,
      drag: 3,
      gravity: 0,
    });
  }
}

export function spawnSmoke(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      vx: (Math.random() - 0.5) * 24,
      vy: -20 - Math.random() * 30,
      life: 0.8 + Math.random() * 0.8,
      maxLife: 1.6,
      size: 6 + Math.random() * 8,
      color: 'rgba(60,60,66,0.55)',
      drag: 0.6,
      gravity: 0,
    });
  }
}

export function spawnExplosion(state, x, y) {
  addShake(state, 12);
  for (let i = 0; i < 26; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 260;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.4 + Math.random() * 0.5,
      maxLife: 0.9,
      size: 3 + Math.random() * 6,
      color: ['#FFC53D', '#FF6B4A', '#FF2E2E'][i % 3],
      drag: 2.2,
      gravity: 0,
    });
  }
  spawnSmoke(state, x, y, 10);
  state.flashes.push({ x, y, radius: 90, life: 0.18, maxLife: 0.18, color: 'rgba(255,197,61,0.85)' });
}

export function spawnMuzzle(state, x, y, angle) {
  state.flashes.push({ x, y, angle, radius: 16, life: 0.05, maxLife: 0.05, color: 'rgba(255,220,120,0.9)' });
}

export function spawnBlood(state, x, y) {
  spawnSparks(state, x, y, '#C93A3A', 8, 130);
}

export function addSkid(state, x, y, angle) {
  const last = state.skids[state.skids.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < 6) return;
  state.skids.push({ x, y, angle, life: 6 });
  if (state.skids.length > 400) state.skids.splice(0, state.skids.length - 400);
}

export function stepEffects(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    const drag = Math.max(0, 1 - p.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = state.skids.length - 1; i >= 0; i -= 1) {
    state.skids[i].life -= dt;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }
  for (let i = state.flashes.length - 1; i >= 0; i -= 1) {
    state.flashes[i].life -= dt;
    if (state.flashes[i].life <= 0) state.flashes.splice(i, 1);
  }
  state.shake = Math.max(0, state.shake - 30 * dt);
}
