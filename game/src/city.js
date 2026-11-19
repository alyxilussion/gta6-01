// Solmar Bay — the city itself. A seeded road grid with five districts,
// buildings, palms, neon signs and the road graph traffic drives on.
// The layout is deterministic: the same seed always builds the same city.
import { AVENUES, COASTAL_ROAD_X, PALETTE, STREETS, WORLD } from './config.js';
import { makeRng } from './random.js';

// District palettes: [name, building colors, ground color]
export const DISTRICTS = [
  { name: 'Marina', x0: 480, x1: 1000, y0: 0, y1: 3600, colors: ['#F5E6C8', '#E8D5B0', '#D9E8E0'], ground: '#EDE3C8' },
  { name: 'Downtown', x0: 1900, x1: 3100, y0: 300, y1: 1700, colors: ['#7E7A94', '#6E6A84', '#9A93AD', '#5D5A72'], ground: '#B8B2A4' },
  { name: 'Neon Row', x0: 1300, x1: 3100, y0: 1700, y1: 2300, colors: ['#3A2B52', '#4A2E4E', '#2E3A52', '#52302E'], ground: '#A99E88' },
  { name: 'Viejo Sol', x0: 700, x1: 1900, y0: 1700, y1: 2900, colors: ['#E8A87C', '#D98E6A', '#C98A5E', '#E8C87C'], ground: '#D8C9A3' },
  { name: 'Palm Heights', x0: 3100, x1: 4300, y0: 300, y1: 1700, colors: ['#E8DCC0', '#D8C8A0', '#C8D8B0'], ground: '#C4D6A0' },
  { name: 'The Docks', x0: 3700, x1: 4800, y0: 2300, y1: 3600, colors: ['#8A8F98', '#7A6A5A', '#6A7A8A', '#9A8A6A'], ground: '#B0A894' },
];

const CAR_COLORS = ['#E84A4A', '#4A90E8', '#F2C94C', '#7ED491', '#E8E8E8', '#3A3A44', '#E87AB0', '#7AB0E8', '#C98A3A', '#9A6AE8'];

// Street names, for the HUD's "you are here" line and mission text.
const AVENUE_NAMES = ['Ocean Drive', 'Palma Ave', 'Solano Blvd', 'Marina Ave', 'Neon Blvd', 'Kaine St', 'Harbor Ave'];
const STREET_NAMES = ['Coral St', 'Flamingo St', 'Neon Row', 'Tiburon St', 'Sierra St'];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[3];
}

export function streetNameAt(x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < AVENUES.length; i += 1) {
    const d = Math.abs(x - AVENUES[i]);
    if (d < bestD) { bestD = d; best = AVENUE_NAMES[i]; }
  }
  for (let i = 0; i < STREETS.length; i += 1) {
    const d = Math.abs(y - STREETS[i]);
    if (d < bestD) { bestD = d; best = STREET_NAMES[i]; }
  }
  const dc = Math.abs(x - COASTAL_ROAD_X);
  if (dc < bestD) best = 'Ocean Drive';
  return best;
}

function isOnRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) < WORLD.roadWidthV / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) < WORLD.roadWidthH / 2) return true;
  if (Math.abs(x - COASTAL_ROAD_X) < 50) return true;
  return false;
}

// Road-graph nodes: every intersection of avenues and streets, plus the
// coastal road's junctions. Traffic and peds walk this graph.
function buildRoadGraph() {
  const nodes = [];
  const index = new Map();
  const key = (x, y) => `${x},${y}`;
  const xs = [COASTAL_ROAD_X, ...AVENUES];
  for (const x of xs) {
    for (const y of STREETS) {
      const id = nodes.length;
      nodes.push({ id, x, y, links: [] });
      index.set(key(x, y), id);
    }
  }
  // Link neighbours along each road line.
  const byX = new Map();
  const byY = new Map();
  for (const n of nodes) {
    if (!byX.has(n.x)) byX.set(n.x, []);
    if (!byY.has(n.y)) byY.set(n.y, []);
    byX.get(n.x).push(n);
    byY.get(n.y).push(n);
  }
  const link = (a, b) => {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
  };
  for (const list of byX.values()) {
    list.sort((a, b) => a.y - b.y);
    for (let i = 0; i + 1 < list.length; i += 1) link(list[i], list[i + 1]);
  }
  for (const list of byY.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < list.length; i += 1) link(list[i], list[i + 1]);
  }
  return { nodes, nearest(x, y) {
    let best = nodes[0];
    let bd = Infinity;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  } };
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const lamps = [];
  const neonSigns = [];
  const containers = [];
  const colliders = [];

  // Block bounds: the spaces between roads.
  const xEdges = [WORLD.beachEdge, ...AVENUES.map((x) => x - WORLD.roadWidthV / 2), WORLD.width];
  const xStarts = [WORLD.beachEdge, ...AVENUES.map((x) => x + WORLD.roadWidthV / 2)];
  const yEdges = [0, ...STREETS.map((y) => y - WORLD.roadWidthH / 2), WORLD.height];
  const yStarts = [0, ...STREETS.map((y) => y + WORLD.roadWidthH / 2)];

  for (let bx = 0; bx + 1 < xEdges.length; bx += 1) {
    for (let by = 0; by + 1 < yEdges.length; by += 1) {
      const x0 = xStarts[bx] + 14;
      const x1 = xEdges[bx + 1] - 14;
      const y0 = yStarts[by] + 14;
      const y1 = yEdges[by + 1] - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const roll = rng.next();
      if (district.name === 'The Docks' && roll < 0.55) {
        // Container yard: rows of shipping containers.
        for (let ix = 0; ix < 3; ix += 1) {
          for (let iy = 0; iy < 2; iy += 1) {
            const cw = 90;
            const ch = 34;
            const px = x0 + 20 + ix * 120 + rng.range(-6, 6);
            const py = y0 + 24 + iy * 70 + rng.range(-6, 6);
            if (px + cw > x1 || py + ch > y1) continue;
            const color = rng.pick(['#C94F3D', '#3D7AC9', '#4FA35A', '#C9A13D', '#7A5AC9']);
            containers.push({ x: px, y: py, w: cw, h: ch, color });
            colliders.push({ x: px, y: py, w: cw, h: ch });
          }
        }
        continue;
      }
      if (roll < 0.12) {
        // Park or plaza: grass, palms, no buildings.
        const count = rng.int(3, 7);
        for (let i = 0; i < count; i += 1) {
          palms.push({ x: rng.range(x0 + 10, x1 - 10), y: rng.range(y0 + 10, y1 - 10), s: rng.range(0.8, 1.3) });
        }
        continue;
      }
      // Buildings: split the block into 1-4 footprints.
      const cols = x1 - x0 > 260 ? 2 : 1;
      const rows = y1 - y0 > 240 ? 2 : 1;
      for (let ix = 0; ix < cols; ix += 1) {
        for (let iy = 0; iy < rows; iy += 1) {
          if (rng.chance(0.18)) continue; // empty lot / parking
          const cellW = (x1 - x0) / cols;
          const cellH = (y1 - y0) / rows;
          const bw = cellW * rng.range(0.55, 0.82);
          const bh = cellH * rng.range(0.55, 0.82);
          const px = x0 + ix * cellW + (cellW - bw) / 2;
          const py = y0 + iy * cellH + (cellH - bh) / 2;
          const downtown = district.name === 'Downtown';
          const height = downtown ? rng.int(3, 9) : rng.int(1, 3);
          const color = rng.pick(district.colors);
          const roof = rng.chance(0.4) ? 'ac' : rng.chance(0.12) ? 'helipad' : 'plain';
          buildings.push({ x: px, y: py, w: bw, h: bh, height, color, roof, district: district.name });
          colliders.push({ x: px, y: py, w: bw, h: bh });
          if (district.name === 'Neon Row' && rng.chance(0.7)) {
            neonSigns.push({
              x: px + bw / 2,
              y: py + bh + 6,
              w: rng.range(40, 90),
              color: rng.pick([PALETTE.magenta, PALETTE.coral, PALETTE.gold, '#3AE8C9', '#8A5CFF']),
              text: rng.pick(['BAR', 'CLUB', 'HOTEL', 'NEON', 'DISCO', 'TACOS', '24H', 'LIVE']),
            });
          }
        }
      }
    }
  }

  // Palms along the beach and Ocean Drive.
  for (let y = 60; y < WORLD.height; y += rng.range(90, 170)) {
    palms.push({ x: rng.range(300, 460), y, s: rng.range(0.9, 1.4) });
    if (rng.chance(0.6)) palms.push({ x: rng.range(500, 640), y: y + rng.range(-30, 30), s: rng.range(0.8, 1.2) });
  }
  // Street lamps along every road, staggered.
  for (const ax of AVENUES) {
    for (let y = 120; y < WORLD.height; y += 260) lamps.push({ x: ax + WORLD.roadWidthV / 2 + 8, y });
  }
  for (const sy of STREETS) {
    for (let x = 620; x < WORLD.width; x += 260) lamps.push({ x, y: sy + WORLD.roadWidthH / 2 + 8 });
  }

  const graph = buildRoadGraph();
  return {
    seed,
    buildings,
    palms,
    lamps,
    neonSigns,
    containers,
    colliders,
    graph,
    // Road segments for the minimap and renderer: avenues, streets, coastal road.
    roads: [
      ...AVENUES.map((x) => ({ x1: x, y1: 0, x2: x, y2: WORLD.height, vertical: true })),
      ...STREETS.map((y) => ({ x1: WORLD.beachEdge, y1: y, x2: WORLD.width, y2: y, vertical: false })),
      { x1: COASTAL_ROAD_X, y1: 0, x2: COASTAL_ROAD_X, y2: WORLD.height, vertical: true },
    ],
    carColors: CAR_COLORS,
    isOnRoad,
    isWater(x) { return x < WORLD.oceanEdge; },
    isBeach(x) { return x >= WORLD.oceanEdge && x < WORLD.beachEdge; },
    // Landmarks the missions and HUD point at.
    landmarks: {
      safehouse: { x: 980, y: 2620, name: 'Safehouse' },
      garage: { x: 1560, y: 2560, name: "Doc's Garage" },
      respray: { x: 2500, y: 2960, name: "Pay 'n Spray" },
      meet: { x: 2200, y: 1700, name: 'Neon Row meet' },
      docks: { x: 4150, y: 2650, name: 'Pier 9' },
      tower: { x: 2500, y: 800, name: 'Kaine Tower' },
      beach: { x: 420, y: 1400, name: 'Solmar Beach' },
      taxiRank: { x: 1300, y: 1100, name: 'Taxi rank' },
    },
  };
}

// Circle-vs-rect collision: push a circle out of every rect it overlaps.
// Returns true when a push happened. Used by the player, cars and peds.
export function resolveCircleColliders(city, body, radius) {
  let hit = false;
  for (const r of city.colliders) {
    const nx = Math.max(r.x, Math.min(body.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(body.y, r.y + r.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x = nx + (dx / d) * radius;
        body.y = ny + (dy / d) * radius;
      } else {
        body.x = r.x - radius;
      }
      hit = true;
    }
  }
  // World bounds and the water line.
  const m = radius + 4;
  if (body.x < WORLD.oceanEdge + m) { body.x = WORLD.oceanEdge + m; hit = true; }
  if (body.x > WORLD.width - m) { body.x = WORLD.width - m; hit = true; }
  if (body.y < m) { body.y = m; hit = true; }
  if (body.y > WORLD.height - m) { body.y = WORLD.height - m; hit = true; }
  return hit;
}

// Nearest point on any road to (x, y) — where traffic and cops spawn.
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bd = Infinity;
  const consider = (px, py) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) { bd = d; best = { x: px, y: py }; }
  };
  for (const ax of AVENUES) consider(ax, y);
  for (const sy of STREETS) consider(x, sy);
  consider(COASTAL_ROAD_X, y);
  return best;
}
