// The law: a 5-star wanted system, cop cars that chase and ram, foot
// cops who shoot and bust, and roadblocks at 3 stars and up. Heat decays
// when the player stays out of sight; the Pay 'n Spray clears it for cash.
import { COP, WANTED } from './config.js';
import { nearestRoadPoint, resolveCircleColliders } from './city.js';
import { carSpeed, createCar, stepCarPhysics } from './vehicles.js';
import { fireBullet } from './combat.js';
import { spawnSparks } from './effects.js';
import { pushEvent } from './events.js';

export function initWanted(state) {
  state.wanted = { heat: 0, stars: 0, lastSeenAt: 0, roadblockAt: -999 };
  state.footCops = [];
}

export function starsFromHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(WANTED.maxStars, 1 + Math.floor((heat - 1) / WANTED.heatPerStar));
}

export function addHeat(state, amount) {
  const w = state.wanted;
  const before = w.stars;
  w.heat = Math.min(WANTED.maxStars * WANTED.heatPerStar, w.heat + amount);
  w.stars = starsFromHeat(w.heat);
  if (w.stars > before) pushEvent(state, 'wantedUp', { stars: w.stars });
}

export function clearWanted(state) {
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  // Cops give up: cars blend back into traffic, foot cops walk off.
  for (const car of state.cars) {
    if (car.isCop && !car.dead) {
      car.isCop = false;
      car.isTraffic = true;
      car.kind = 'sedan';
      car.color = state.city.carColors[Math.floor(Math.random() * state.city.carColors.length)];
    }
  }
  state.footCops = [];
}

function nearestCopDistance(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  let best = Infinity;
  for (const car of state.cars) {
    if (!car.isCop || car.dead) continue;
    best = Math.min(best, Math.hypot(car.x - px, car.y - py));
  }
  for (const cop of state.footCops) {
    if (cop.hp > 0) best = Math.min(best, Math.hypot(cop.x - px, cop.y - py));
  }
  return best;
}

export function stepWanted(state, dt) {
  const w = state.wanted;
  if (w.stars === 0) return;
  const nearest = nearestCopDistance(state);
  if (nearest < 650) {
    w.lastSeenAt = state.time;
  } else if (state.time - w.lastSeenAt > WANTED.decayDelay) {
    w.heat = Math.max(0, w.heat - WANTED.decayRate * dt);
    const stars = starsFromHeat(w.heat);
    if (stars < w.stars) {
      w.stars = stars;
      if (stars === 0) clearWanted(state);
    }
  }
}

function spawnCopCar(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  // Spawn on a road 700-900px away, roughly ahead of the player's heading.
  const angle = Math.random() * Math.PI * 2;
  const dist = 700 + Math.random() * 200;
  const point = nearestRoadPoint(state.city, px + Math.cos(angle) * dist, py + Math.sin(angle) * dist);
  const car = createCar(point.x, point.y, Math.atan2(py - point.y, px - point.x), {
    kind: 'cop',
    color: '#1A1A22',
  });
  car.isCop = true;
  state.cars.push(car);
  return car;
}

function spawnFootCop(state) {
  const p = state.player;
  const angle = Math.random() * Math.PI * 2;
  const dist = 420 + Math.random() * 160;
  const cop = {
    x: p.x + Math.cos(angle) * dist,
    y: p.y + Math.sin(angle) * dist,
    angle: 0,
    hp: 50,
    shootTimer: 1 + Math.random(),
    bustTimer: 0,
    walkPhase: Math.random() * 6,
  };
  // Keep cops out of buildings and water.
  resolveCircleColliders(state.city, cop, 12);
  state.footCops.push(cop);
  return cop;
}

function copCarInput(state, car, dt) {
  const p = state.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  // Predict where the player will be.
  const pvx = p.car ? p.car.vx : 0;
  const pvy = p.car ? p.car.vy : 0;
  const lead = 0.45;
  const gx = tx + pvx * lead;
  const gy = ty + pvy * lead;
  const wantAngle = Math.atan2(gy - car.y, gx - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  const speed = carSpeed(car);
  const dist = Math.hypot(tx - car.x, ty - car.y);
  let throttle = 1;
  if (dist < 60 && speed > 260) throttle = 0.2; // ease off right on top of them
  const handbrake = Math.abs(diff) > 1.1 && speed > 300;
  if (speed < 12 && throttle > 0) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.0) {
      car.reverseTimer = 0.8;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    return { throttle: -0.9, steer: -steer, handbrake: false };
  }
  return { throttle, steer, handbrake };
}

function spawnRoadblock(state) {
  const p = state.player;
  if (!p.car) return;
  const heading = p.car.angle;
  const bx = p.car.x + Math.cos(heading) * 520;
  const by = p.car.y + Math.sin(heading) * 520;
  const point = nearestRoadPoint(state.city, bx, by);
  // Two cop cars parked across the road, perpendicular to it.
  const roadAngle = Math.abs(point.x - p.car.x) > Math.abs(point.y - p.car.y)
    ? Math.atan2(0, 1)
    : Math.atan2(1, 0);
  const perp = roadAngle + Math.PI / 2;
  for (const offset of [-34, 34]) {
    const car = createCar(
      point.x + Math.cos(perp) * offset,
      point.y + Math.sin(perp) * offset,
      perp,
      { kind: 'cop', color: '#1A1A22' },
    );
    car.isCop = true;
    car.roadblock = true;
    state.cars.push(car);
  }
  state.wanted.roadblockAt = state.time;
  pushEvent(state, 'roadblock', { x: point.x, y: point.y });
}

export function stepPolice(state, dt) {
  const stars = state.wanted.stars;
  if (stars === 0) return;
  const p = state.player;

  // Maintain the chase force.
  let copCars = 0;
  for (const car of state.cars) {
    if (car.isCop && !car.dead && !car.roadblock) copCars += 1;
  }
  const targetCars = Math.min(stars, 5);
  if (copCars < targetCars) spawnCopCar(state);
  // Foot cops only matter on foot.
  if (!p.car && stars >= 2) {
    const alive = state.footCops.filter((c) => c.hp > 0).length;
    if (alive < stars - 1) spawnFootCop(state);
  }
  // Roadblocks at 3+ stars, at most one every 25 seconds.
  if (stars >= 3 && p.car && state.time - state.wanted.roadblockAt > 25) {
    spawnRoadblock(state);
  }

  // Cop cars chase.
  for (const car of state.cars) {
    if (!car.isCop || car.dead || car.roadblock) continue;
    stepCarPhysics(state, car, dt, copCarInput(state, car, dt));
    // Ramming the player's car hurts it.
    if (p.car && !p.car.dead) {
      const d = Math.hypot(car.x - p.car.x, car.y - p.car.y);
      if (d < 30) {
        const rel = Math.abs(carSpeed(car) - carSpeed(p.car));
        if (rel > 150) {
          spawnSparks(state, (car.x + p.car.x) / 2, (car.y + p.car.y) / 2, '#FFC53D', 4, 140);
        }
      }
    }
    // A cop car far behind a fast player respawns closer (keeps pressure on).
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    if (Math.hypot(car.x - px, car.y - py) > 1600) {
      const point = nearestRoadPoint(state.city, px + (Math.random() - 0.5) * 1400, py + (Math.random() - 0.5) * 1400);
      car.x = point.x;
      car.y = point.y;
      car.angle = Math.atan2(py - point.y, px - point.x);
      car.vx = 0;
      car.vy = 0;
    }
  }

  // Foot cops chase and shoot; bust the player when adjacent and slow.
  const playerSpeed = p.car ? carSpeed(p.car) : 0;
  for (const cop of state.footCops) {
    if (cop.hp <= 0) continue;
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    if (dist > 40) {
      const speed = COP.footSpeed;
      cop.x += (dx / dist) * speed * dt;
      cop.y += (dy / dist) * speed * dt;
      cop.walkPhase += dt * 10;
    }
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0 && dist < COP.shootRange && !p.car) {
      cop.shootTimer = 0.7 + Math.random() * 0.5;
      fireBullet(state, cop.x + Math.cos(cop.angle) * 16, cop.y + Math.sin(cop.angle) * 16,
        cop.angle + (Math.random() - 0.5) * 0.3, { fromCop: true, damage: COP.shootDamage, speed: 700 });
    }
    // Bust: adjacent, player on foot and barely moving.
    if (!p.car && dist < COP.bustRadius && playerSpeed < 60) {
      cop.bustTimer += dt;
      if (cop.bustTimer > COP.bustTime) {
        pushEvent(state, 'busted', {});
        return;
      }
    } else {
      cop.bustTimer = 0;
    }
  }
  // Remove dead foot cops after a while.
  for (let i = state.footCops.length - 1; i >= 0; i -= 1) {
    if (state.footCops[i].hp <= 0) {
      state.footCops[i].deadTimer = (state.footCops[i].deadTimer || 0) + dt;
      if (state.footCops[i].deadTimer > 20) state.footCops.splice(i, 1);
    }
  }
}

export function nearestCopCarDistance(state) {
  return nearestCopDistance(state);
}
