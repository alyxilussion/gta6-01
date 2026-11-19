// Meridian Cay — boot, game loop, state machine, and the wiring between
// every system. The shared game object G is what all modules read.

import * as THREE from 'three';
import { CITY, DAY_MINUTES, SAVE_KEY } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createEffects } from './effects.js';
import { createSave } from './save.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createCamera } from './camera.js';
import { createHud } from './hud.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Shadows re-render only when the player has moved (or every 2 sim-seconds):
// re-rendering a 1024px shadow map every frame is the single biggest cost
// on software renderers, and the sun itself never moves.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 12, 24);

const input = createInput(canvas);
const audio = createAudio();
const city = createCity(scene);
const effects = createEffects(scene);
const save = createSave();
const playerObj = createPlayer(scene);
const vehicles = createVehicles(scene, city);
const peds = createPedestrians(scene, city);
const police = createPolice(scene, city, vehicles);
const combat = createCombat(scene);
const missions = createMissions();
const cam = createCamera(camera);
const hud = createHud();

const G = {
  scene, camera, renderer,
  input, audio, city, effects, save,
  playerObj,
  player: playerObj.state,
  vehicles, peds, police, combat, missions, cam, hud,
  state: 'title',
  cash: 250, rep: 0, health: 100, armor: 0,
  clockMinutes: DAY_MINUTES,
  taxiFares: 0, stuntJumps: 0, timeTrials: 0,
  packages: [],
  car: null,
  inCar: false,
  shotOrbit: false,
  trial: null,
  damagePlayer(amount) {
    const absorbed = Math.min(this.armor, amount * 0.6);
    this.armor -= absorbed;
    this.health -= (amount - absorbed);
    effects.addShake(0.3);
    if (this.health <= 0) this.health = 0;
  },
  onCrash() { /* effects already played by vehicles */ },
  onCarExploded(car) {
    peds.scare(car.x, car.z, 40);
    if (car === this.car) {
      this.exitCar(true);
      this.damagePlayer(30);
      hud.banner('YOUR RIDE BLEW UP', 'bad');
    }
    vehicles.removeCar(car);
  },
  onBusted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    hud.showScreen('busted');
    this.cash = Math.max(0, this.cash - 150);
    police.clearHeat();
    if (this.inCar) this.exitCar(false);
  },
  onEnemyDown() { /* missions count the living */ },
  onMissionComplete(def) {
    if (missions.done.length >= 8) {
      this.cash += 1000;
      hud.banner('LEGEND OF THE CAY — ALL 8 MISSIONS DONE', 'good');
    }
  },
  saveGame(auto) {
    const ok = save.write({
      cash: this.cash, rep: this.rep,
      missionsDone: missions.done, packages: this.packages,
      taxiFares: this.taxiFares, stuntJumps: this.stuntJumps,
      timeTrials: this.timeTrials,
      playerX: this.player.x, playerZ: this.player.z,
      health: this.health, armor: this.armor,
    });
    if (ok && !auto) {
      hud.banner('GAME SAVED', 'good');
      audio.pickup();
    }
    return ok;
  },
  enterCar(car) {
    if (car.isCop) return false;
    if (car.traffic) {
      // The driver flees; stealing in traffic is a crime.
      const d = peds.spawn(car.x, car.z);
      d.state = 'flee';
      d.heading = Math.atan2(car.x - this.player.x, car.z - this.player.z);
      police.addHeat(20, this);
      car.traffic = null;
    } else if (car.isParked) {
      const nearCop = police.cops.some((c) => Math.hypot(c.x - car.x, c.z - car.z) < 50);
      if (nearCop) police.addHeat(10, this);
      car.isParked = false;
    }
    this.car = car;
    car.isPlayer = true;
    this.inCar = true;
    playerObj.group.visible = false;
    audio.pickup();
    return true;
  },
  exitCar(wrecked) {
    if (!this.car) return;
    const car = this.car;
    car.isPlayer = false;
    if (!wrecked) car.speed *= 0.2;
    const side = car.heading + Math.PI / 2;
    const x = car.x + Math.sin(side) * 3;
    const z = car.z + Math.cos(side) * 3;
    const fixed = city.resolveCircle(x, z, 1.1);
    playerObj.reset(fixed.x, fixed.z);
    playerObj.group.visible = true;
    this.car = null;
    this.inCar = false;
  },
};

// ---- hidden packages (12, fixed spots) ----
const PACKAGE_SPOTS = [
  [0, 542], [-380, 420], [380, 420], [-315, -360], [315, 360],
  [-180, 135], [180, -135], [-45, 0], [225, -360], [-360, 135],
  [90, 135], [-90, -135],
];
const packageMeshes = [];
{
  const geo = new THREE.OctahedronGeometry(1.1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb347, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 });
  PACKAGE_SPOTS.forEach(([x, z], i) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 2, z);
    scene.add(m);
    packageMeshes.push({ mesh: m, x, z, id: i, taken: false });
  });
}

// ---- stunt jump ramps (3) ----
const RAMPS = [
  { x: -225, z: 315, dir: 0, cooldown: 0 },
  { x: 225, z: -225, dir: Math.PI / 2, cooldown: 0 },
  { x: 0, z: 405, dir: Math.PI, cooldown: 0 },
];
{
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: 0.7 });
  for (const r of RAMPS) {
    const geo = new THREE.BoxGeometry(8, 0.6, 12);
    const m = new THREE.Mesh(geo, rampMat);
    m.position.set(r.x, 1.1, r.z);
    m.rotation.x = -0.28;
    m.rotation.y = r.dir;
    m.castShadow = true;
    scene.add(m);
  }
}

const TRIAL_START = { x: -360, z: 420 };
const TRIAL_FINISH = { x: 360, z: 420 };

// ---- title / menu wiring ----
const savedData = save.load();
const continueBtn = document.getElementById('btn-continue');
if (!savedData && continueBtn) continueBtn.style.display = 'none';

function startNewGame() {
  save.clear();
  G.cash = 250; G.rep = 0; G.health = 100; G.armor = 0;
  G.taxiFares = 0; G.stuntJumps = 0; G.timeTrials = 0;
  G.packages = [];
  missions.setDone([]);
  packageMeshes.forEach((p) => { p.taken = false; p.mesh.visible = true; });
  playerObj.reset(0, 300);
  cam.snap(0, 0, 300, Math.PI);
  beginPlay();
}

function continueGame() {
  const d = save.load();
  if (!d) { startNewGame(); return; }
  G.cash = d.cash; G.rep = d.rep; G.health = d.health; G.armor = d.armor;
  G.taxiFares = d.taxiFares; G.stuntJumps = d.stuntJumps; G.timeTrials = d.timeTrials;
  G.packages = [...d.packages];
  missions.setDone(d.missionsDone);
  packageMeshes.forEach((p) => {
    p.taken = G.packages.includes(p.id);
    p.mesh.visible = !p.taken;
  });
  playerObj.reset(d.playerX, d.playerZ);
  cam.snap(d.playerX, 0, d.playerZ, Math.PI);
  beginPlay();
  hud.banner('WELCOME BACK, ROOK', 'good');
}

function beginPlay() {
  G.state = 'play';
  G.shotOrbit = false;
  hud.hideScreens();
  audio.ensure();
  hud.setObjective(missions.nextMissionIndex() >= 0
    ? 'Next job: find the yellow marker'
    : 'All missions done — free roam the Cay');
}

document.getElementById('btn-play').addEventListener('click', () => { audio.ensure(); startNewGame(); });
if (continueBtn) continueBtn.addEventListener('click', () => { audio.ensure(); continueGame(); });
document.getElementById('btn-help').addEventListener('click', () => {
  const h = document.getElementById('help-panel');
  h.style.display = h.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('btn-resume').addEventListener('click', () => {
  G.state = 'play';
  hud.hideScreens();
});
document.getElementById('btn-restart').addEventListener('click', () => window.location.reload());
document.getElementById('btn-quit-title').addEventListener('click', () => {
  G.state = 'title';
  hud.showScreen('title');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && G.state === 'title') { audio.ensure(); savedData ? continueGame() : startNewGame(); }
  if (e.code === 'Enter' && (G.state === 'wasted' || G.state === 'busted')) respawn();
});

function respawn() {
  G.health = 100;
  G.armor = 0;
  police.clearHeat();
  combat.clearEnemies();
  if (G.inCar) G.exitCar(false);
  playerObj.reset(0, 300);
  cam.snap(0, 0, 300, Math.PI);
  G.state = 'play';
  hud.hideScreens();
  hud.banner('BACK ON YOUR FEET, ROOK', '');
}

function respawnTimer(dt) {
  respawnT += dt;
  if (respawnT > 3.5) respawn();
}
let respawnT = 0;
let fireCooldown = 0;
let bridgeWasLifting = false;
let shadowAt = { x: 0, z: 300 };
let shadowAge = 0;

// ---- context prompt + interactions ----
function contextAction() {
  const px = G.player.x; const pz = G.player.z;
  const L = city.landmarks;
  if (G.inCar) {
    const dSpray = Math.hypot(G.car.x - L.sprayShop.x, G.car.z - L.sprayShop.z);
    if (dSpray < 14 && police.stars > 0) return { label: 'F — RESPRAY $100 (CLEAR HEAT)', run: () => police.spray(G) };
    return { label: 'E — EXIT CAR', run: null };
  }
  const nearCar = vehicles.nearestCar(px, pz, 5.5, null);
  if (nearCar && !nearCar.isCop) return { label: 'E — ENTER ' + nearCar.model.name.toUpperCase(), run: null };
  const dSave = Math.hypot(px - L.safehouse.x, pz - L.safehouse.z);
  if (dSave < 12) return { label: 'F — SAVE GAME', run: () => G.saveGame(false) };
  const start = missions.startPoint(G);
  if (start && !missions.active) {
    const d = Math.hypot(px - start.x, pz - start.z);
    if (d < 10) {
      const idx = missions.nextMissionIndex();
      return { label: 'F — START MISSION: ' + (idx >= 0 ? MISSIONS_NAME(idx) : ''), run: () => missions.startMission(idx, G) };
    }
  }
  if (missions.active && missions.active.marker) {
    const m = missions.active.marker;
    const d = Math.hypot(px - m.x, pz - m.z);
    if (d < 8) return { label: m.label.toUpperCase(), run: null };
  }
  const dTrial = Math.hypot(px - TRIAL_START.x, pz - TRIAL_START.z);
  if (dTrial < 10 && !G.trial && G.inCar) return { label: 'F — BEACH SPRINT TRIAL (60s)', run: () => startTrial() };
  return null;
}

function MISSIONS_NAME(i) {
  const names = ['FIRST GEAR', 'BORROWED WHEELS', 'COLD TRAIL', 'FARE PLAY', 'FOUNDRY FIRE', 'BRIDGE RUN', 'VAULT TRUCK', 'THE SOLARIUM JOB'];
  return names[i] || '';
}

function startTrial() {
  G.trial = { timer: 60, target: TRIAL_FINISH };
  hud.banner('BEACH SPRINT — REACH THE EAST END IN 60s', '');
  hud.setObjective('Beach Sprint: reach the east end of Coral Beach');
}

// ---- main loop ----
const clock = new THREE.Clock();
const STEP = 1 / 60;
let acc = 0;
let orbitAngle = 0;
let frames = 0;

function step(dt) {
  frames++;
  G.frames = frames;
  G.clockMinutes += dt * 0.5;
  if (G.state === 'title') {
    orbitAngle += dt * 0.05;
    const r = 380;
    camera.position.set(Math.sin(orbitAngle) * r, 150, Math.cos(orbitAngle) * r);
    camera.lookAt(0, 0, 0);
    city.update(dt, 0, 0);
    shadowAge += dt;
    if (shadowAge > 2) { renderer.shadowMap.needsUpdate = true; shadowAge = 0; }
    vehicles.update(dt, G);
    peds.update(dt, G);
    effects.update(dt);
    hud.update(dt, G);
    input.endFrame(); // every branch must clear presses, or they fire on resume
    return;
  }
  if (G.state === 'wasted' || G.state === 'busted') {
    respawnTimer(dt);
    effects.update(dt);
    input.endFrame();
    return;
  }
  if (G.state === 'pause') { input.endFrame(); return; }

  // --- play ---
  fireCooldown = Math.max(0, fireCooldown - dt);
  const camYaw = cam.yaw;
  if (G.inCar && G.car) {
    vehicles.drivePlayer(G.car, dt, input, G);
    G.player.x = G.car.x;
    G.player.z = G.car.z;
    G.player.speed = Math.abs(G.car.speed);
    // Hit peds while driving fast.
    if (Math.abs(G.car.speed) > 8) {
      const hit = peds.hitCheck(G.car.x, G.car.z, 3.2);
      if (hit.length > 0) {
        police.addHeat(30 * hit.length, G);
        peds.scare(G.car.x, G.car.z, 45);
        hud.banner('PEDESTRIAN DOWN', 'bad');
        effects.addShake(0.4);
        audio.crash();
      }
    }
    // Stunt ramps.
    for (const r of RAMPS) {
      r.cooldown = Math.max(0, r.cooldown - dt);
      const d = Math.hypot(G.car.x - r.x, G.car.z - r.z);
      if (d < 7 && Math.abs(G.car.speed) > 25 && r.cooldown <= 0) {
        r.cooldown = 30;
        G.stuntJumps++;
        G.cash += 100;
        effects.popup('STUNT JUMP +$100', 'good');
        effects.addShake(0.5);
        audio.cash();
      }
    }
    // Beach sprint trial.
    if (G.trial) {
      G.trial.timer -= dt;
      hud.setTimer(G.trial.timer);
      const d = Math.hypot(G.car.x - G.trial.target.x, G.car.z - G.trial.target.z);
      if (d < 12) {
        G.timeTrials++;
        G.cash += 150;
        hud.banner('SPRINT WON +$150', 'good');
        audio.cash();
        G.trial = null;
        hud.setTimer(null);
        hud.setObjective('Next job: find the yellow marker');
      } else if (G.trial.timer <= 0) {
        G.trial = null;
        hud.setTimer(null);
        hud.banner('SPRINT FAILED', 'bad');
      }
    }
  } else {
    playerObj.update(dt, input, camYaw, city, false);
    // Shooting on foot.
    if (input.mouseDown && fireCooldown <= 0) {
      fireCooldown = 0.18;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = { x: G.player.x, y: 1.5, z: G.player.z };
      combat.playerShoot(G, origin, { x: dir.x, y: dir.y, z: dir.z });
      police.addHeat(4, G);
    }
  }

  // Enter / exit car.
  if (input.wasPressed('e')) {
    if (G.inCar) {
      G.exitCar(false);
    } else {
      const car = vehicles.nearestCar(G.player.x, G.player.z, 5.5, null);
      if (car && !car.isCop) G.enterCar(car);
      else if (car && car.isCop) audio.denied();
    }
  }
  // Interact.
  const action = contextAction();
  hud.setPrompt(action ? action.label : null);
  if (input.wasPressed('f') && action && action.run) action.run();

  // Packages.
  for (const p of packageMeshes) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 1.5;
    p.mesh.position.y = 2 + Math.sin(frames * 0.05 + p.id) * 0.4;
    const d = Math.hypot(G.player.x - p.x, G.player.z - p.z);
    if (d < 4) {
      p.taken = true;
      p.mesh.visible = false;
      G.packages.push(p.id);
      G.cash += 50;
      effects.popup('HIDDEN PACKAGE +$50 (' + G.packages.length + '/12)', 'good');
      audio.pickup();
    }
  }

  // Pause / radio / mute.
  if (input.wasPressed('Escape') || input.wasPressed('p')) {
    G.state = 'pause';
    hud.showScreen('pause');
  }
  if (input.wasPressed('r')) {
    const st = audio.nextStation();
    hud.banner('RADIO: ' + st.name, '');
  }
  if (input.wasPressed('m')) audio.toggleMute();

  // Camera orbit with mouse drag.
  cam.addOrbit(input.consumeLook());

  // Systems.
  city.update(dt, G.player.x, G.player.z);
  shadowAge += dt;
  if (shadowAge > 2 || Math.hypot(G.player.x - shadowAt.x, G.player.z - shadowAt.z) > 8) {
    renderer.shadowMap.needsUpdate = true;
    shadowAt = { x: G.player.x, z: G.player.z };
    shadowAge = 0;
  }
  const lifting = city.liftingBridge();
  if (lifting && !bridgeWasLifting) {
    hud.banner('DRAWBRIDGE RISING — CANAL CROSSING CLOSED', 'bad');
  }
  bridgeWasLifting = !!lifting;
  vehicles.update(dt, G);
  peds.update(dt, G);
  police.update(dt, G);
  combat.update(dt, G);
  missions.update(dt, G);
  effects.update(dt);
  audio.update(dt, true);

  // Camera follow.
  const target = G.inCar && G.car
    ? { x: G.car.x, y: 1, z: G.car.z }
    : { x: G.player.x, y: G.player.y, z: G.player.z };
  const heading = G.inCar && G.car ? G.car.heading : playerObj.state.heading;
  const speed = G.inCar && G.car ? Math.abs(G.car.speed) : playerObj.state.speed;
  cam.update(dt, target, heading, speed, G.inCar, effects);

  // Wasted check.
  if (G.health <= 0 && G.state === 'play') {
    G.state = 'wasted';
    respawnT = 0;
    hud.showScreen('wasted');
    G.cash = Math.max(0, G.cash - 100);
    police.clearHeat();
    if (G.inCar) G.exitCar(false);
  }

  hud.update(dt, G);
  input.endFrame();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.25, clock.getDelta());
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 12) {
    step(STEP);
    acc -= STEP;
    n++;
  }
  if (n === 12) acc = 0;
  renderer.render(scene, camera);
  // Screenshot readiness is counted in SIM frames (50 ≈ 0.83s of game
  // time), not wall time: wall time varies wildly between a real GPU and
  // SwiftShader, but 50 frames always shows the same scene — the chase car
  // still fast, the timer-spawned cops still far away.
  if (SHOT && !window.__shotReady && frames >= 50) window.__shotReady = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- boot ----
playerObj.reset(0, 300);
cam.snap(0, 0, 300, Math.PI);
for (let i = 0; i < 8; i++) vehicles.spawnTrafficNear(0, 300);
for (let i = 0; i < 10; i++) peds.spawn(0, 300);
if (SHOT) {
  applyShot(SHOT, G);
} else {
  hud.showScreen('title');
}
window.__game = G;
window.__shotReady = false;
animate();
