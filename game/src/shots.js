// Screenshot scenes behind ?shot=chase|city|mission|title. Each one sets
// up a real game state, then plays the real rules forward for a fixed
// number of steps with scripted input — so the frame is what the game
// genuinely looks like, not a composite. The cover shot is the chase:
// wanted stars, cop cars, minimap and objective all in one frame.
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';

function placeCopChase(state) {
  const p = state.player;
  // Three cop cars in pursuit, staggered behind the player with a real gap,
  // so the frame reads as a chase, not a pile-up.
  const offsets = [[-230, -50], [-330, 70], [-440, -30]];
  for (const [dx, dy] of offsets) {
    const car = createCar(p.x + dx, p.y + dy, 0, { kind: 'cop', color: '#1A1A22' });
    car.isCop = true;
    car.vx = 400;
    state.cars.push(car);
  }
  // A roadblock waiting ahead, just inside the frame.
  for (const dy of [-36, 36]) {
    const car = createCar(3600, 1700 + dy, Math.PI / 2, { kind: 'cop', color: '#1A1A22' });
    car.isCop = true;
    car.roadblock = true;
    state.cars.push(car);
  }
  state.wanted.roadblockAt = 0; // don't spawn a second one during staging
}

// Clear traffic from a corridor so the staged chase has open road ahead.
function clearCorridor(state, x0, x1, y0, y1) {
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.isTraffic && car.x > x0 && car.x < x1 && car.y > y0 && car.y < y1) {
      state.cars.splice(i, 1);
    }
  }
}

const SCENES = {
  chase: {
    timeOfDay: 18.15,
    steps: 120,
    setup(state) {
      const car = createCar(1500, 1700, 0, { kind: 'sports', color: '#E84A4A' });
      car.vx = 430;
      state.cars.push(car);
      state.player.car = car;
      car.isPlayer = true;
      state.player.x = car.x;
      state.player.y = car.y;
      state.player.cash = 1240;
      clearCorridor(state, 1500, 3600, 1620, 1780);
      startMission(state, 3); // Heat Wave: the chase mission
      placeCopChase(state);
    },
    input() {
      return { up: true, down: false, left: false, right: false, handbrake: false, mouseDown: false };
    },
    finish(state) {
      state.mission.data.timer = 47; // show the survival clock mid-countdown
      state.mission.banner = 'HEAT WAVE';
      state.mission.bannerTimer = 3;
      state.camera.x = state.player.car.x;
      state.camera.y = state.player.car.y;
    },
  },
  city: {
    timeOfDay: 17.6,
    steps: 120,
    setup(state) {
      state.player.x = 600;
      state.player.y = 1100;
      state.player.angle = Math.PI / 2;
      state.player.cash = 350;
      startMission(state, 0);
      state.mission.stage = 1; // "Drive to the Neon Row meet"
      state.mission.stageDirty = true;
    },
    input() {
      return { up: false, down: true, left: false, right: false, handbrake: false, mouseDown: false };
    },
    finish(state) {
      state.player.angle = Math.PI / 2;
    },
  },
  mission: {
    timeOfDay: 18.4,
    steps: 90,
    setup(state) {
      state.player.x = 4020;
      state.player.y = 2500;
      state.player.angle = 0.6;
      startMission(state, 2); // Dockside Deal
      state.mission.stage = 1; // "Clear the syndicate thugs"
      state.mission.stageDirty = true;
    },
    input() {
      return { up: false, down: false, left: false, right: false, handbrake: false, mouseDown: false };
    },
    finish(state) {
      // Aim at the nearest living thug.
      let best = null;
      let bd = Infinity;
      for (const thug of state.thugs) {
        if (thug.hp <= 0) continue;
        const d = Math.hypot(thug.x - state.player.x, thug.y - state.player.y);
        if (d < bd) { bd = d; best = thug; }
      }
      if (best) state.player.angle = Math.atan2(best.y - state.player.y, best.x - state.player.x);
      // One thug already down, for the story of the frame.
      const down = state.thugs.find((t) => t !== best && t.hp > 0);
      if (down) down.hp = 0;
      state.mission.banner = 'DOCKSIDE DEAL';
      state.mission.bannerTimer = 3;
      state.player.cash = 900;
    },
  },
  title: {
    timeOfDay: 18.3,
    steps: 0,
    setup() {},
    input() { return null; },
    finish() {},
  },
};

export function shotNames() {
  return Object.keys(SCENES);
}

// Stage a scene: run setup, simulate `steps` fixed steps through the real
// step function main.js passes in, then run the finish hook.
export function stageShot(state, name, stepWorld) {
  const scene = SCENES[name] || SCENES.chase;
  state.timeOfDay = scene.timeOfDay;
  scene.setup(state);
  const dt = 1 / 60;
  for (let i = 0; i < scene.steps; i += 1) {
    stepWorld(state, dt, scene.input());
  }
  scene.finish(state);
  return name === 'title' ? 'title' : 'playing';
}
