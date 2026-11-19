// The story: five missions from Mara's homecoming to Kaine's last stand,
// plus taxi fares and ten hidden packages for free-roam progression.
// Each mission is a list of stages; a stage completes when its check
// passes, then the next stage's onEnter runs once.
import { createCar } from './vehicles.js';
import { spawnThug, thugsAlive } from './combat.js';
import { addHeat } from './police.js';
import { sfxCash, sfxMissionComplete, sfxPhone, sfxPickup } from './audio.js';
import { pushEvent } from './events.js';

export const MISSION_TITLES = [
  'Homecoming',
  'Borrowed Wheels',
  'Dockside Deal',
  'Heat Wave',
  'The Last Stand',
];

function say(state, from, text, seconds) {
  state.phone = { from, text, timer: seconds || 5 };
  sfxPhone();
}

function distTo(state, point) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  return Math.hypot(px - point.x, py - point.y);
}

function reward(state, amount) {
  state.player.cash += amount;
  state.stats.earned += amount;
  sfxCash();
  pushEvent(state, 'cash', { amount });
}

function spawnThugRing(state, cx, cy, count, radius) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + 0.4;
    spawnThug(state, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, { alerted: true });
  }
}

const MISSIONS = [
  {
    title: 'Homecoming',
    intro: "DOC: Rook! You're back. Grab a car and meet me on Neon Row — we got work.",
    stages: [
      {
        objective: 'Get in a car',
        onEnter(state) { say(state, 'DOC', 'Any car will do, Rook. This is Solmar Bay — nobody locks anything.', 5); },
        check(state) { return !!state.player.car; },
      },
      {
        objective: 'Drive to the Neon Row meet',
        waypoint(state) { return state.city.landmarks.meet; },
        onEnter(state) { say(state, 'DOC', 'Neon Row, middle of the strip. Follow the pink marker.', 5); },
        check(state) { return distTo(state, state.city.landmarks.meet) < 80; },
      },
    ],
    reward: 300,
    outro: "DOC: Good to have you back. Kaine's crew runs this strip now — time we reminded them who built it.",
  },
  {
    title: 'Borrowed Wheels',
    intro: "DOC: Kaine's golden Comet GT is parked up in Palm Heights. Bring it to my garage — quietly.",
    stages: [
      {
        objective: 'Steal the golden Comet GT',
        waypoint(state) { return state.mission.data.comet ? { x: state.mission.data.comet.x, y: state.mission.data.comet.y, name: 'Comet GT' } : null; },
        onEnter(state) {
          const comet = createCar(3400, 800, 0, { kind: 'sports', color: '#FFC53D', isParked: true });
          comet.mission = 'comet';
          state.cars.push(comet);
          state.mission.data.comet = comet;
        },
        check(state) { return state.player.car && state.player.car.mission === 'comet'; },
      },
      {
        objective: 'Lose the cops',
        onEnter(state) {
          addHeat(state, 130);
          say(state, 'DOC', 'Alarms! Lose them first — lay low till the stars fade, or hit the Pay \'n Spray.', 6);
        },
        check(state) { return state.wanted.stars === 0; },
      },
      {
        objective: "Deliver the Comet to Doc's Garage",
        waypoint(state) { return state.city.landmarks.garage; },
        check(state) {
          return state.player.car && state.player.car.mission === 'comet'
            && distTo(state, state.city.landmarks.garage) < 90;
        },
      },
    ],
    reward: 600,
    outro: "DOC: Beautiful. Kaine's gonna miss this one — and the boys at the chop shop won't.",
  },
  {
    title: 'Dockside Deal',
    intro: "DOC: Kaine's boys are moving product through Pier 9. Hit them, take the package, bring it home.",
    stages: [
      {
        objective: 'Go to Pier 9',
        waypoint(state) { return state.city.landmarks.docks; },
        check(state) { return distTo(state, state.city.landmarks.docks) < 120; },
      },
      {
        objective: 'Clear the syndicate thugs',
        onEnter(state) {
          spawnThugRing(state, 4150, 2650, 6, 180);
          say(state, 'DOC', 'Six of them, Rook. Make it loud — I want Kaine to hear about this one.', 5);
        },
        check(state) { return thugsAlive(state) === 0; },
      },
      {
        objective: 'Grab the package',
        waypoint(state) { return { x: 4150, y: 2650, name: 'Package' }; },
        check(state) { return distTo(state, { x: 4150, y: 2650 }) < 46; },
      },
      {
        objective: 'Take the package to the Safehouse',
        waypoint(state) { return state.city.landmarks.safehouse; },
        onEnter(state) { sfxPickup(); },
        check(state) { return distTo(state, state.city.landmarks.safehouse) < 90; },
      },
    ],
    reward: 900,
    outro: "DOC: That's Kaine's whole week in one bag. He's going to come at us now — good.",
  },
  {
    title: 'Heat Wave',
    intro: "DOC: The whole department is on us. Survive the heat, then get to the Safehouse.",
    stages: [
      {
        objective: 'Survive the chase — 90 seconds',
        onEnter(state) {
          addHeat(state, 260);
          state.mission.data.timer = 90;
          say(state, 'DOC', 'Three stars and climbing. Keep moving, Rook — do NOT stop.', 5);
        },
        check(state) {
          state.mission.data.timer -= state.lastDt;
          return state.mission.data.timer <= 0;
        },
      },
      {
        objective: 'Reach the Safehouse',
        waypoint(state) { return state.city.landmarks.safehouse; },
        check(state) { return distTo(state, state.city.landmarks.safehouse) < 90; },
      },
    ],
    reward: 1200,
    outro: "DOC: They'll be writing about that chase for a month. One job left, Rook. Kaine himself.",
  },
  {
    title: 'The Last Stand',
    intro: "DOC: Kaine's holed up in his tower with every gun he owns. End it tonight.",
    stages: [
      {
        objective: 'Go to Kaine Tower',
        waypoint(state) { return state.city.landmarks.tower; },
        check(state) { return distTo(state, state.city.landmarks.tower) < 140; },
      },
      {
        objective: 'Fight through the first wave',
        onEnter(state) {
          spawnThugRing(state, 2500, 800, 5, 220);
          say(state, 'KAINE', 'You should have stayed gone, Vega. My boys will bury you.', 5);
        },
        check(state) { return thugsAlive(state) === 0; },
      },
      {
        objective: 'Fight through the second wave',
        onEnter(state) {
          spawnThugRing(state, 2500, 800, 7, 260);
          say(state, 'DOC', "He's throwing everything at you. Hold the line!", 4);
        },
        check(state) { return thugsAlive(state) === 0; },
      },
      {
        objective: "Stop Kaine's limo",
        waypoint(state) {
          const limo = state.mission.data.limo;
          return limo && !limo.dead ? { x: limo.x, y: limo.y, name: "Kaine's limo" } : null;
        },
        onEnter(state) {
          const limo = createCar(2500, 950, Math.PI / 2, { kind: 'limo', color: '#1A1A22' });
          limo.mission = 'limo';
          limo.isTraffic = true;
          limo.hp = 90;
          state.cars.push(limo);
          state.mission.data.limo = limo;
          say(state, 'KAINE', "I'm done here. Driver — GO!", 4);
        },
        check(state) {
          const limo = state.mission.data.limo;
          return !limo || limo.dead;
        },
      },
    ],
    reward: 2500,
    outro: "DOC: It's over, Rook. Solmar Bay is ours again. The city remembers who its queen is.",
  },
];

export function initMissions(state) {
  state.mission = {
    index: 0,
    stage: 0,
    data: {},
    active: true,
    complete: false,
    stageDirty: true,
    banner: null,
    bannerTimer: 0,
  };
  state.phone = null;
  state.taxi = { phase: 'idle', ped: null, dest: null, fare: 0 };
}

export function currentMission(state) {
  return MISSIONS[state.mission.index] || null;
}

export function missionObjective(state) {
  const m = currentMission(state);
  if (!m || !state.mission.active) return state.mission.complete ? 'Story complete — Solmar Bay is yours' : '';
  const stage = m.stages[state.mission.stage];
  if (!stage) return '';
  if (state.mission.index === 3 && state.mission.stage === 0 && state.mission.data.timer !== undefined) {
    return `Survive the chase — ${Math.max(0, Math.ceil(state.mission.data.timer))}s`;
  }
  return stage.objective;
}

export function missionWaypoint(state) {
  const m = currentMission(state);
  if (!m || !state.mission.active) return null;
  const stage = m.stages[state.mission.stage];
  if (!stage || !stage.waypoint) return null;
  return stage.waypoint(state);
}

function showBanner(state, text, seconds) {
  state.mission.banner = text;
  state.mission.bannerTimer = seconds || 3;
}

export function startMission(state, index) {
  state.mission.index = index;
  state.mission.stage = 0;
  state.mission.data = {};
  state.mission.active = true;
  state.mission.stageDirty = true;
  const m = MISSIONS[index];
  if (m) {
    say(state, 'DOC', m.intro.replace(/^DOC: /, ''), 6);
    showBanner(state, m.title.toUpperCase(), 3);
  }
}

export function failMission(state, reason) {
  // Clear mission entities, restart the same mission from stage 0.
  state.thugs = [];
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    if (state.cars[i].mission) state.cars.splice(i, 1);
  }
  state.mission.active = false;
  state.mission.failed = reason || 'failed';
  showBanner(state, 'MISSION FAILED', 3);
}

export function retryMission(state) {
  state.mission.failed = null;
  startMission(state, state.mission.index);
}

export function stepMissions(state, dt) {
  state.lastDt = dt;
  const m = state.mission;
  if (m.bannerTimer > 0) {
    m.bannerTimer -= dt;
    if (m.bannerTimer <= 0) m.banner = null;
  }
  if (state.phone) {
    state.phone.timer -= dt;
    if (state.phone.timer <= 0) state.phone = null;
  }
  if (!m.active || m.complete) return;
  const mission = MISSIONS[m.index];
  if (!mission) return;
  // Recovery: if the Comet was destroyed before delivery, Doc sources another.
  if (m.index === 1 && m.data.comet && m.data.comet.dead && m.stage <= 2) {
    const old = m.data.comet;
    state.cars.splice(state.cars.indexOf(old), 1);
    const comet = createCar(3400, 800, 0, { kind: 'sports', color: '#FFC53D', isParked: true });
    comet.mission = 'comet';
    state.cars.push(comet);
    m.data.comet = comet;
    if (m.stage === 2) { m.stage = 0; m.stageDirty = true; }
    say(state, 'DOC', 'You wrecked the Comet?! I found another one — same spot, Palm Heights.', 5);
  }
  const stage = mission.stages[m.stage];
  if (!stage) return;
  if (m.stageDirty) {
    m.stageDirty = false;
    if (stage.onEnter) stage.onEnter(state);
  }
  if (stage.check(state)) {
    m.stage += 1;
    m.stageDirty = true;
    if (m.stage >= mission.stages.length) {
      // Mission complete.
      reward(state, mission.reward);
      sfxMissionComplete();
      showBanner(state, `MISSION COMPLETE — $${mission.reward}`, 4);
      say(state, 'DOC', mission.outro.replace(/^DOC: /, ''), 6);
      state.stats.missions += 1;
      if (m.index + 1 < MISSIONS.length) {
        startMission(state, m.index + 1);
      } else {
        m.active = false;
        m.complete = true;
        showBanner(state, 'STORY COMPLETE — SOLMAR BAY IS YOURS', 6);
      }
      pushEvent(state, 'missionComplete', { index: m.index });
    }
  }
}

// ---- Taxi fares: drive a taxi, pick up fares, get paid. ----
export function stepTaxi(state, dt) {
  void dt;
  const p = state.player;
  const taxi = state.taxi;
  if (!p.car || !p.car.isTaxi) {
    if (taxi.phase !== 'idle') {
      taxi.phase = 'idle';
      taxi.ped = null;
      taxi.dest = null;
    }
    return;
  }
  if (taxi.phase === 'idle') {
    // A fare is waiting near the taxi rank or a random landmark.
    const landmarks = Object.values(state.city.landmarks);
    const spot = landmarks[Math.floor(Math.random() * landmarks.length)];
    taxi.dest = null;
    taxi.pickup = { x: spot.x + 40, y: spot.y + 40, name: 'Fare' };
    taxi.phase = 'pickup';
    say(state, 'DISPATCH', 'Fare waiting. Pick them up — pink marker.', 4);
  } else if (taxi.phase === 'pickup') {
    if (distTo(state, taxi.pickup) < 60) {
      const landmarks = Object.values(state.city.landmarks);
      const dest = landmarks[Math.floor(Math.random() * landmarks.length)];
      taxi.dest = dest;
      taxi.fare = 40 + Math.floor(Math.random() * 110);
      taxi.phase = 'dropoff';
      say(state, 'FARE', `Take me to ${dest.name}, please. I'll pay $${taxi.fare}.`, 4);
    }
  } else if (taxi.phase === 'dropoff') {
    if (distTo(state, taxi.dest) < 70) {
      reward(state, taxi.fare);
      state.stats.fares += 1;
      say(state, 'FARE', 'Thanks! Keep the change.', 3);
      taxi.phase = 'idle';
      taxi.dest = null;
      taxi.pickup = null;
    }
  }
}

export function taxiWaypoint(state) {
  const taxi = state.taxi;
  if (taxi.phase === 'pickup') return taxi.pickup;
  if (taxi.phase === 'dropoff') return taxi.dest;
  return null;
}

// ---- Hidden packages: ten glowing pickups across the city. ----
export function initPackages(state, rng) {
  state.packages = [];
  const spots = [
    [420, 700], [420, 2100], [980, 500], [1560, 1400], [2200, 500],
    [2900, 2000], [3400, 1100], [4000, 1700], [4400, 2900], [1300, 3200],
  ];
  for (const [x, y] of spots) {
    state.packages.push({ x: x + rng.range(-30, 30), y: y + rng.range(-30, 30), taken: false });
  }
}

export function stepPackages(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (const pkg of state.packages) {
    if (pkg.taken) continue;
    if (Math.hypot(px - pkg.x, py - pkg.y) < 44) {
      pkg.taken = true;
      reward(state, 100);
      state.stats.packages += 1;
      sfxPickup();
      showBanner(state, `HIDDEN PACKAGE ${state.stats.packages}/10 — +$100`, 2.5);
    }
  }
}
