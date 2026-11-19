// Pedestrians: ordinary Solmar Bay locals walking the sidewalks, who flee
// from gunfire and crashes. They make the city feel alive — and give the
// wanted system something to protect.
import { PEDS } from './config.js';
import { resolveCircleColliders } from './city.js';
import { spawnBlood } from './effects.js';
import { pushEvent } from './events.js';

const SHIRTS = ['#E84A4A', '#4A90E8', '#F2C94C', '#7ED491', '#E87AB0', '#9A6AE8', '#E8E8E8', '#3A3A44', '#FF8A3D', '#3AD4C9'];
const SKINS = ['#F2C9A0', '#C98A5E', '#8A5A3A', '#E8B088', '#6A4632'];

let nextPedId = 1;

export function createPed(x, y, rng) {
  const id = nextPedId;
  nextPedId += 1;
  const r = rng ? () => rng.next() : Math.random;
  return {
    id,
    x, y,
    angle: rng ? rng.range(0, Math.PI * 2) : Math.random() * Math.PI * 2,
    state: 'walk', // walk | flee | down | dead
    speed: 0,
    shirt: rng ? rng.pick(SHIRTS) : SHIRTS[0],
    skin: rng ? rng.pick(SKINS) : SKINS[0],
    walkPhase: Math.random() * Math.PI * 2,
    // Each ped walks its own lane and turns at its own distance, so crowds
    // spread along the sidewalk instead of bunching on the node points.
    lane: (60 + r() * 35) * (id % 2 === 0 ? 1 : -1),
    arriveAt: 30 + r() * 45,
    targetNode: null,
    prevNode: null,
    fleeTimer: 0,
    downTimer: 0,
    deadTimer: 0,
    fleeFrom: null,
  };
}

function pickNextNode(state, ped) {
  const graph = state.city.graph;
  if (ped.targetNode === null) {
    const n = graph.nearest(ped.x, ped.y);
    ped.targetNode = n.id;
    ped.prevNode = n.id;
    return;
  }
  const node = graph.nodes[ped.targetNode];
  const links = node.links.filter((id) => id !== ped.prevNode);
  const next = links.length ? links[Math.floor(Math.random() * links.length)] : node.links[0];
  ped.prevNode = ped.targetNode;
  ped.targetNode = next;
}

export function scarePeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.state === 'dead' || ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2 + Math.random() * 2.5;
      ped.fleeFrom = { x, y };
    }
  }
}

export function stepPeds(state, dt) {
  const graph = state.city.graph;
  for (const ped of state.peds) {
    if (ped.state === 'dead') {
      ped.deadTimer += dt;
      continue;
    }
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 4;
        ped.fleeFrom = { x: state.player.x, y: state.player.y };
      }
      continue;
    }
    let tx;
    let ty;
    let speed = PEDS.walkSpeed;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.targetNode = null;
      } else {
        const dx = ped.x - ped.fleeFrom.x;
        const dy = ped.y - ped.fleeFrom.y;
        const d = Math.hypot(dx, dy) || 1;
        tx = ped.x + (dx / d) * 100;
        ty = ped.y + (dy / d) * 100;
        speed = PEDS.fleeSpeed;
      }
    }
    if (ped.state === 'walk') {
      if (ped.targetNode === null) pickNextNode(state, ped);
      const node = graph.nodes[ped.targetNode];
      // Sidewalk offset: walk beside the road, not on it, in this ped's lane.
      const dx = node.x - ped.x;
      const dy = node.y - ped.y;
      const dist = Math.hypot(dx, dy) || 1;
      tx = node.x + (-dy / dist) * ped.lane;
      ty = node.y + (dx / dist) * ped.lane;
      if (dist < ped.arriveAt) pickNextNode(state, ped);
    }
    if (tx !== undefined) {
      const dx = tx - ped.x;
      const dy = ty - ped.y;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * speed * dt;
      ped.y += (dy / d) * speed * dt;
      ped.walkPhase += dt * speed * 0.09;
      resolveCircleColliders(state.city, ped, 12);
    }
  }

  // Cars hit peds: knock them down (or worse at speed).
  for (const car of state.cars) {
    if (car.dead) continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 60) continue;
    for (const ped of state.peds) {
      if (ped.state === 'dead' || ped.state === 'down') continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < 26) {
        ped.state = speed > 320 ? 'dead' : 'down';
        ped.downTimer = 3;
        ped.deadTimer = 0;
        spawnBlood(state, ped.x, ped.y);
        scarePeds(state, ped.x, ped.y, 260);
        if (car.isPlayer) {
          pushEvent(state, 'pedHit', { fatal: ped.state === 'dead' });
        }
      }
    }
  }
}

// Keep the streets populated near the player; recycle the far ones.
export function maintainPeds(state, rng) {
  const px = state.player.x;
  const py = state.player.y;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    const d = Math.hypot(ped.x - px, ped.y - py);
    if (d > PEDS.despawnDistance || (ped.state === 'dead' && ped.deadTimer > 25)) {
      state.peds.splice(i, 1);
    }
  }
  if (state.peds.length >= PEDS.target) return;
  const graph = state.city.graph;
  const nodes = graph.nodes.filter((n) => {
    const d = Math.hypot(n.x - px, n.y - py);
    return d > 200 && d < PEDS.spawnDistance;
  });
  if (!nodes.length) return;
  const node = nodes[Math.floor(rng.next() * nodes.length)];
  const ped = createPed(
    node.x + rng.range(-120, 120),
    node.y + rng.range(-120, 120),
    rng,
  );
  state.peds.push(ped);
}
