// Cars: arcade driving physics, traffic that follows the road graph,
// parked cars to steal, and damage with smoke, fire and explosions.
import { CAR, TRAFFIC } from './config.js';
import { resolveCircleColliders } from './city.js';
import { addShake, spawnExplosion, spawnSmoke, spawnSparks, addSkid } from './effects.js';
import { sfxCrash, sfxExplosion } from './audio.js';

let nextId = 1;

const KINDS = {
  sedan: { length: 46, width: 22, maxSpeed: 520, accel: 420 },
  taxi: { length: 46, width: 22, maxSpeed: 540, accel: 440 },
  sports: { length: 48, width: 22, maxSpeed: 620, accel: 520 },
  truck: { length: 62, width: 26, maxSpeed: 420, accel: 320 },
  limo: { length: 68, width: 23, maxSpeed: 500, accel: 380 },
  cop: { length: 48, width: 23, maxSpeed: 600, accel: 500 },
};

export function createCar(x, y, angle, opts = {}) {
  const kind = opts.kind || 'sedan';
  const spec = KINDS[kind];
  const id = nextId;
  nextId += 1;
  return {
    id,
    kind,
    x, y, angle,
    vx: 0, vy: 0,
    length: spec.length,
    width: spec.width,
    maxSpeed: spec.maxSpeed,
    accel: spec.accel,
    color: opts.color || '#E84A4A',
    hp: CAR.maxHp,
    isPlayer: !!opts.isPlayer,
    isCop: kind === 'cop',
    isTraffic: !!opts.isTraffic,
    isParked: !!opts.isParked,
    isTaxi: kind === 'taxi',
    mission: opts.mission || null, // mission tag, e.g. 'comet' — never despawned
    targetNode: null,
    prevNode: null,
    driverFled: false,
    dead: false,
    smokeTimer: 0,
    reverseTimer: 0,
    stuckTimer: 0,
  };
}

// One physics step for a car under an input { throttle -1..1, steer -1..1, handbrake }.
export function stepCarPhysics(state, car, dt, input) {
  if (car.dead) return;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const forwardSpeed = car.vx * fx + car.vy * fy;

  // Steering: full lock only matters with speed; reversing flips it.
  const speedFactor = Math.max(-1, Math.min(1, forwardSpeed / 140));
  car.angle += input.steer * CAR.turnRate * speedFactor * dt * (forwardSpeed < -5 ? -1 : 1);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  if (input.throttle > 0) {
    car.vx += nfx * car.accel * input.throttle * dt;
    car.vy += nfy * car.accel * input.throttle * dt;
  } else if (input.throttle < 0) {
    if (forwardSpeed > 30) {
      car.vx -= nfx * CAR.brake * dt;
      car.vy -= nfy * CAR.brake * dt;
    } else {
      car.vx += nfx * car.accel * 0.55 * input.throttle * dt;
      car.vy += nfy * car.accel * 0.55 * input.throttle * dt;
    }
  }

  // Grip: kill lateral velocity, less so with the handbrake (drift).
  const fvx = car.vx * nfx + car.vy * nfy;
  let lvx = car.vx - nfx * fvx;
  let lvy = car.vy - nfy * fvx;
  const grip = input.handbrake ? CAR.driftGrip : CAR.grip;
  const keep = Math.exp(-grip * dt);
  lvx *= keep;
  lvy *= keep;
  car.vx = nfx * fvx + lvx;
  car.vy = nfy * fvx + lvy;

  // Drag and speed cap.
  const drag = Math.exp(-0.25 * dt);
  car.vx *= drag;
  car.vy *= drag;
  const speed = Math.hypot(car.vx, car.vy);
  const max = input.throttle < 0 && forwardSpeed < 0 ? CAR.reverseMax : car.maxSpeed;
  if (speed > max) {
    car.vx = (car.vx / speed) * max;
    car.vy = (car.vy / speed) * max;
  }

  const ox = car.x;
  const oy = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Skid marks while drifting or handbrake-turning.
  const lateral = Math.abs(lvx) + Math.abs(lvy);
  if ((input.handbrake && speed > 150) || lateral > 120) {
    addSkid(state, car.x - nfx * 14, car.y - nfy * 14, car.angle);
  }

  // Building collision at the nose and tail circles.
  let crashed = false;
  for (const s of [1, -1]) {
    const probe = { x: car.x + nfx * s * (car.length / 2 - 6), y: car.y + nfy * s * (car.length / 2 - 6) };
    if (resolveCircleColliders(state.city, probe, car.width / 2 + 2)) {
      const impact = Math.hypot(car.vx, car.vy);
      car.x = probe.x - nfx * s * (car.length / 2 - 6);
      car.y = probe.y - nfy * s * (car.length / 2 - 6);
      // Bounce back along the velocity, damped.
      car.vx *= -0.35;
      car.vy *= -0.35;
      if (impact > 180) {
        crashed = true;
        damageCar(state, car, impact / 45, 'crash');
        spawnSparks(state, probe.x, probe.y, '#FFC53D', 6, 160);
        if (car.isPlayer) {
          addShake(state, Math.min(8, impact / 60));
          sfxCrash(impact / 500);
        }
      }
    }
  }
  void crashed;
  void ox; void oy;
}

export function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

export function damageCar(state, car, amount, cause) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.vx *= 0.2;
    car.vy *= 0.2;
    spawnExplosion(state, car.x, car.y);
    sfxExplosion();
    if (car.isPlayer) {
      // The player's car blew up under them — they bail out, hurt.
      state.player.hp = Math.max(1, state.player.hp - 25);
      exitCar(state, true);
    }
  }
}

export function enterCar(state, car) {
  state.player.car = car;
  car.isPlayer = true;
  car.isParked = false;
  car.isTraffic = false;
  state.player.x = car.x;
  state.player.y = car.y;
}

export function exitCar(state, wrecked) {
  const car = state.player.car;
  if (!car) return;
  car.isPlayer = false;
  state.player.car = null;
  const side = Math.random() < 0.5 ? 1 : -1;
  state.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * side * 26;
  state.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * side * 26;
  state.player.angle = car.angle;
  if (!wrecked && !car.dead) {
    car.vx *= 0.3;
    car.vy *= 0.3;
  }
}

// Traffic: follow the road graph, right-hand lane, stop for cars ahead.
function trafficInput(state, car, dt) {
  const graph = state.city.graph;
  if (car.targetNode === null) {
    car.targetNode = graph.nearest(car.x, car.y).id;
    car.prevNode = car.targetNode;
  }
  const node = graph.nodes[car.targetNode];
  // Lane offset: right-hand side of the direction of travel.
  const dx = node.x - car.x;
  const dy = node.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const tx = node.x + -uy * 26;
  const ty = node.y + ux * 26;
  if (dist < 46) {
    const links = node.links.filter((id) => id !== car.prevNode);
    const next = links.length ? links[Math.floor(Math.random() * links.length)] : node.links[0];
    car.prevNode = car.targetNode;
    car.targetNode = next;
    return { throttle: 0.5, steer: 0, handbrake: false };
  }
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  // Stop for a car right ahead.
  let blocked = false;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * fx + oy * fy;
    const side = Math.abs(ox * -fy + oy * fx);
    if (ahead > 0 && ahead < 62 && side < 26) { blocked = true; break; }
  }
  const speed = carSpeed(car);
  const throttle = blocked ? (speed > 40 ? -1 : 0) : speed < TRAFFIC.speed ? 0.7 : 0.1;
  // Unstick: reverse briefly if barely moving while trying to drive.
  if (speed < 12 && throttle > 0) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.2) {
      car.reverseTimer = 0.7;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    return { throttle: -0.8, steer: -steer, handbrake: false };
  }
  return { throttle, steer, handbrake: false };
}

export function stepTraffic(state, dt) {
  for (const car of state.cars) {
    if (!car.isTraffic || car.dead) continue;
    stepCarPhysics(state, car, dt, trafficInput(state, car, dt));
  }
}

// Car-vs-car: push overlapping cars apart, damage both by impact.
export function stepCarCollisions(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = 30;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
      const rel = Math.abs((a.vx - b.vx) * ux + (a.vy - b.vy) * uy);
      if (rel > 120) {
        damageCar(state, a, rel / 60, 'crash');
        damageCar(state, b, rel / 60, 'crash');
        spawnSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, '#FFC53D', 5, 140);
        if (a.isPlayer || b.isPlayer) {
          addShake(state, Math.min(6, rel / 70));
          sfxCrash(rel / 600);
        }
      }
      // Exchange some velocity so the hit feels physical.
      const swap = 0.4;
      const avx = a.vx;
      const avy = a.vy;
      a.vx += (b.vx - a.vx) * swap;
      a.vy += (b.vy - a.vy) * swap;
      b.vx += (avx - b.vx) * swap;
      b.vy += (avy - b.vy) * swap;
    }
  }
}

// Smoke from damaged cars, and burn-out.
export function stepCarDamage(state, dt) {
  for (const car of state.cars) {
    if (car.dead || car.hp > 45) continue;
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = car.hp < 20 ? 0.12 : 0.3;
      spawnSmoke(state, car.x, car.y, 1);
      if (car.hp < 20 && Math.random() < 0.3) {
        damageCar(state, car, 1, 'fire');
      }
    }
  }
}

export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of state.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

// Keep traffic topped up: spawn at graph nodes near (not on top of) the player.
export function maintainTraffic(state) {
  const px = state.player.x;
  const py = state.player.y;
  let count = 0;
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.isTraffic && !car.dead) {
      count += 1;
      const d = Math.hypot(car.x - px, car.y - py);
      if (d > TRAFFIC.despawnDistance) state.cars.splice(i, 1);
    }
  }
  if (count >= TRAFFIC.targetCars) return;
  const graph = state.city.graph;
  const nodes = graph.nodes.filter((n) => {
    const d = Math.hypot(n.x - px, n.y - py);
    return d > TRAFFIC.spawnDistance * 0.6 && d < TRAFFIC.spawnDistance * 1.4;
  });
  if (!nodes.length) return;
  const node = nodes[Math.floor(Math.random() * nodes.length)];
  const link = graph.nodes[node.links[Math.floor(Math.random() * node.links.length)]];
  const angle = Math.atan2(link.y - node.y, link.x - node.x);
  const kind = Math.random() < 0.12 ? 'taxi' : Math.random() < 0.1 ? 'truck' : Math.random() < 0.08 ? 'sports' : 'sedan';
  const color = kind === 'taxi' ? '#F2C94C' : state.city.carColors[Math.floor(Math.random() * state.city.carColors.length)];
  const car = createCar(node.x, node.y, angle, { kind, color, isTraffic: true });
  car.targetNode = link.id;
  car.prevNode = node.id;
  state.cars.push(car);
}

// Parked cars along road edges, seeded so the same spots fill every run.
export function spawnParkedCars(state, rng) {
  const spots = [];
  const graph = state.city.graph;
  for (const node of graph.nodes) {
    for (const linkId of node.links) {
      const other = graph.nodes[linkId];
      if (other.id < node.id) continue;
      const mx = (node.x + other.x) / 2;
      const my = (node.y + other.y) / 2;
      const angle = Math.atan2(other.y - node.y, other.x - node.x);
      spots.push({ x: mx, y: my, angle });
    }
  }
  // Shuffle deterministically, take the first N.
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (let i = 0; i < Math.min(TRAFFIC.targetParked, spots.length); i += 1) {
    const s = spots[i];
    const side = rng.chance(0.5) ? 1 : -1;
    const px = Math.cos(s.angle + Math.PI / 2) * side * 40;
    const py = Math.sin(s.angle + Math.PI / 2) * side * 40;
    const kind = rng.chance(0.1) ? 'sports' : rng.chance(0.08) ? 'truck' : 'sedan';
    const color = state.city.carColors[Math.floor(rng.next() * state.city.carColors.length)];
    state.cars.push(createCar(s.x + px, s.y + py, s.angle, { kind, color, isParked: true }));
  }
}
