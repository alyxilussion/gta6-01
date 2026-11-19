// Solmar Bay — the main loop. Builds the world, runs the fixed-step
// simulation, owns the screen state machine (title / playing / paused /
// wasted / busted) and wires the DOM menus. The game is fully playable
// from here: every system plugs into stepWorld below.
import { PLAYER, TIME, WANTED, WORLD } from './config.js';
import { generateCity, resolveCircleColliders } from './city.js';
import { makeRng } from './random.js';
import { beginFrameInput, consumePressed, initInput, keys, mouse, moveVector, wasPressed, endFrameInput } from './input.js';
import { initEffects, stepEffects } from './effects.js';
import { carSpeed, enterCar, exitCar, maintainTraffic, nearestCar, spawnParkedCars, stepCarCollisions, stepCarDamage, stepCarPhysics, stepTraffic } from './vehicles.js';
import { createPed, maintainPeds, scarePeds, stepPeds } from './pedestrians.js';
import { addHeat, clearWanted, initWanted, nearestCopCarDistance, stepPolice, stepWanted } from './police.js';
import { initCombat, playerShoot, stepBullets, stepThugs } from './combat.js';
import { currentMission, failMission, initMissions, initPackages, missionObjective, missionWaypoint, retryMission, startMission, stepMissions, stepPackages, stepTaxi, taxiWaypoint } from './missions.js';
import { initHud, updateHud } from './hud.js';
import { drawTitleBackdrop, initRenderer, render, screenToWorld, updateCamera, viewSize } from './render.js';
import { drainEvents } from './events.js';
import { hasSave, loadSave, saveGame } from './save.js';
import { setEngine, setSiren, sfxCash, toggleMute, unlockAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;

function buildState(canvas, ctx) {
  const city = generateCity(WORLD.seed);
  const rng = makeRng(WORLD.seed + 7);
  const state = {
    canvas, ctx,
    time: 0,
    timeOfDay: TIME.start,
    lastDt: STEP,
    city, rng,
    screen: 'title',
    missionStarted: false,
    player: {
      x: city.landmarks.safehouse.x,
      y: city.landmarks.safehouse.y,
      angle: 0, vx: 0, vy: 0,
      hp: PLAYER.maxHp,
      cash: 0,
      car: null,
      lastShotAt: -99,
      lastDamageAt: -99,
      hitFlash: 0,
      walkPhase: 0,
    },
    cars: [],
    peds: [],
    footCops: [],
    bullets: [],
    thugs: [],
    particles: [],
    skids: [],
    flashes: [],
    shake: 0,
    events: [],
    camera: { x: city.landmarks.safehouse.x, y: city.landmarks.safehouse.y, zoom: 1 },
    stats: { missions: 0, packages: 0, fares: 0, earned: 0, kills: 0 },
    objectiveText: '',
    waypoint: null,
    prompt: '',
    phone: null,
  };
  initEffects(state);
  initWanted(state);
  initCombat(state);
  initMissions(state);
  initPackages(state, rng);
  spawnParkedCars(state, rng);
  for (let i = 0; i < 24; i += 1) maintainPeds(state, rng);
  return state;
}

function nearestCopNearby(state, radius) {
  return nearestCopCarDistance(state) < radius;
}

function tryEnterExitCar(state) {
  const p = state.player;
  if (p.car) {
    exitCar(state, false);
    return;
  }
  const car = nearestCar(state, p.x, p.y, 72);
  if (!car) return;
  if (car.isTraffic && !car.driverFled) {
    // The driver bails and runs.
    car.driverFled = true;
    const driver = createPed(car.x + 20, car.y + 20, state.rng);
    driver.state = 'flee';
    driver.fleeTimer = 5;
    driver.fleeFrom = { x: p.x, y: p.y };
    state.peds.push(driver);
  }
  if (nearestCopNearby(state, 450)) addHeat(state, WANTED.stealHeat);
  state.stats.carsStolen = (state.stats.carsStolen || 0) + 1;
  enterCar(state, car);
}

function tryInteract(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const respray = state.city.landmarks.respray;
  const safehouse = state.city.landmarks.safehouse;
  if (p.car && state.wanted.stars > 0 && Math.hypot(px - respray.x, py - respray.y) < 90) {
    if (p.cash >= WANTED.resprayCost) {
      p.cash -= WANTED.resprayCost;
      clearWanted(state);
      sfxCash();
      state.mission.banner = 'RESPRAYED — HEAT GONE';
      state.mission.bannerTimer = 2.5;
    } else {
      state.mission.banner = `NEED $${WANTED.resprayCost} FOR A RESPRAY`;
      state.mission.bannerTimer = 2.5;
    }
    return true;
  }
  if (!p.car && Math.hypot(px - safehouse.x, py - safehouse.y) < 90) {
    if (saveGame(state)) {
      state.mission.banner = 'GAME SAVED';
      state.mission.bannerTimer = 2;
    }
    return true;
  }
  return false;
}

function updatePrompt(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const respray = state.city.landmarks.respray;
  const safehouse = state.city.landmarks.safehouse;
  if (p.car && state.wanted.stars > 0 && Math.hypot(px - respray.x, py - respray.y) < 90) {
    state.prompt = '[E] Respray — $100 (clears wanted)';
    return;
  }
  if (!p.car && Math.hypot(px - safehouse.x, py - safehouse.y) < 90) {
    state.prompt = '[E] Save game';
    return;
  }
  if (p.car) {
    state.prompt = '[E] Get out of the car';
    return;
  }
  const car = nearestCar(state, p.x, p.y, 72);
  state.prompt = car ? '[E] Get in the car' : '';
}

// One fixed simulation step. `override` (screenshot staging) replaces live input.
export function stepWorld(state, dt, override) {
  state.time += dt;
  state.timeOfDay += dt * TIME.hoursPerSecond;
  const p = state.player;

  const input = override || {
    up: !!keys.up, down: !!keys.down, left: !!keys.left, right: !!keys.right,
    handbrake: !!keys.handbrake, sprint: !!keys.sprint,
    mouseDown: mouse.down,
  };
  const enterPressed = override ? false : consumePressed('enter');

  if (p.car && !p.car.dead) {
    // Driving.
    const throttle = (input.up ? 1 : 0) + (input.down ? -1 : 0);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    stepCarPhysics(state, p.car, dt, { throttle, steer, handbrake: !!input.handbrake });
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    if (enterPressed) {
      if (!tryInteract(state)) tryEnterExitCar(state);
    }
  } else if (p.car && p.car.dead) {
    exitCar(state, true);
  } else {
    // On foot.
    const mv = override
      ? { x: (input.right ? 1 : 0) - (input.left ? 1 : 0), y: (input.down ? 1 : 0) - (input.up ? 1 : 0) }
      : moveVector();
    const sprinting = input.sprint;
    const speed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    p.vx = mv.x * speed;
    p.vy = mv.y * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (mv.x !== 0 || mv.y !== 0) p.walkPhase += dt * speed * 0.06;
    resolveCircleColliders(state.city, p, PLAYER.radius);
    // Aim at the mouse (live play only).
    if (!override) {
      const worldMouse = screenToWorld(state, mouse.x, mouse.y);
      p.angle = Math.atan2(worldMouse.y - p.y, worldMouse.x - p.x);
      if (input.mouseDown) playerShoot(state, worldMouse.x, worldMouse.y);
    }
    if (enterPressed) {
      if (!tryInteract(state)) tryEnterExitCar(state);
    }
  }

  // Health regen after a calm stretch.
  if (p.hp > 0 && p.hp < PLAYER.maxHp && state.time - p.lastDamageAt > PLAYER.regenDelay) {
    p.hp = Math.min(PLAYER.maxHp, p.hp + PLAYER.regenRate * dt);
  }
  p.hitFlash = Math.max(0, p.hitFlash - dt * 2.2);

  maintainTraffic(state);
  stepTraffic(state, dt);
  stepCarCollisions(state);
  stepCarDamage(state, dt);
  maintainPeds(state, state.rng);
  stepPeds(state, dt);
  stepWanted(state, dt);
  stepPolice(state, dt);
  stepBullets(state, dt);
  stepThugs(state, dt);
  stepMissions(state, dt);
  stepTaxi(state, dt);
  stepPackages(state);
  stepEffects(state, dt);

  // Drain the event queue: crimes become heat, kills become stats.
  for (const event of drainEvents(state)) {
    if (event.type === 'pedHit') {
      addHeat(state, event.data.fatal ? 60 : 20);
      state.stats.kills += event.data.fatal ? 1 : 0;
    } else if (event.type === 'copKilled') {
      addHeat(state, 120);
      state.stats.kills += 1;
    } else if (event.type === 'thugKilled') {
      state.stats.kills += 1;
    } else if (event.type === 'shotFired') {
      scarePeds(state, event.data.x, event.data.y, 320);
      if (nearestCopNearby(state, 500)) addHeat(state, 8);
    } else if (event.type === 'busted') {
      endRun(state, 'busted');
      return;
    } else if (event.type === 'missionComplete') {
      saveGame(state);
    }
  }

  if (p.hp <= 0 && state.screen === 'playing') {
    endRun(state, 'wasted');
    return;
  }

  updatePrompt(state);
  state.objectiveText = currentMission(state) && state.mission.active
    ? missionObjective(state)
    : state.mission.complete
      ? 'Story complete — Solmar Bay is yours'
      : '';
  if (state.taxi.phase !== 'idle') {
    state.objectiveText = state.taxi.phase === 'pickup'
      ? 'Taxi: pick up the fare'
      : `Taxi: drop the fare at ${state.taxi.dest ? state.taxi.dest.name : ''} ($${state.taxi.fare})`;
  }
  state.waypoint = missionWaypoint(state) || taxiWaypoint(state);
  updateCamera(state, dt);
}

function endRun(state, kind) {
  const p = state.player;
  if (kind === 'wasted') {
    p.cash = Math.max(0, p.cash - Math.floor(p.cash * 0.1) - 25);
  } else {
    p.cash = Math.max(0, p.cash - 100);
  }
  if (p.car) {
    p.car.isPlayer = false;
    p.car = null;
  }
  clearWanted(state);
  if (state.mission.active && !state.mission.complete) failMission(state, kind);
  state.screen = kind;
  showScreen(state);
}

function showScreen(state) {
  const title = document.getElementById('screen-title');
  const pause = document.getElementById('screen-pause');
  const over = document.getElementById('screen-over');
  if (title) title.classList.toggle('show', state.screen === 'title');
  if (pause) pause.classList.toggle('show', state.screen === 'paused');
  if (over) over.classList.toggle('show', state.screen === 'wasted' || state.screen === 'busted');
  const hud = document.getElementById('hud');
  if (hud) hud.classList.toggle('hidden', state.screen === 'title');
  if (state.screen === 'wasted' || state.screen === 'busted') {
    const title = document.getElementById('over-title');
    const sub = document.getElementById('over-sub');
    if (title) title.textContent = state.screen === 'wasted' ? 'WASTED' : 'BUSTED';
    if (sub) {
      sub.textContent = state.screen === 'wasted'
        ? 'Mara went down. The city keeps moving — so do you.'
        : 'The Solmar Bay PD has you. Bail posted, back on the street.';
    }
    const overStats = document.getElementById('over-stats');
    if (overStats) {
      overStats.textContent = `Cash $${state.player.cash.toLocaleString('en-US')} · Missions ${state.stats.missions}/5 · Packages ${state.stats.packages}/10`;
    }
  }
}

function startPlaying(state, fromSave) {
  unlockAudio();
  if (fromSave) {
    loadSave(state);
  }
  if (!state.missionStarted) {
    state.missionStarted = true;
    const index = fromSave ? state.mission.index : 0;
    if (!state.mission.complete) startMission(state, index);
  }
  state.screen = 'playing';
  showScreen(state);
}

function retryRun(state) {
  const p = state.player;
  const home = state.city.landmarks.safehouse;
  p.x = home.x;
  p.y = home.y;
  p.hp = PLAYER.maxHp;
  p.car = null;
  state.camera.x = home.x;
  state.camera.y = home.y;
  if (state.mission.failed) retryMission(state);
  state.screen = 'playing';
  showScreen(state);
}

function wireMenus(state) {
  const $ = (id) => document.getElementById(id);
  const startBtn = $('btn-start');
  const continueBtn = $('btn-continue');
  const resumeBtn = $('btn-resume');
  const saveBtn = $('btn-save');
  const retryBtn = $('btn-retry');
  const quitBtn = $('btn-quit');
  const retryMissionBtn = $('btn-retry-mission');
  const helpBtn = $('btn-help');
  const helpClose = $('btn-help-close');
  if (startBtn) startBtn.addEventListener('click', () => startPlaying(state, false));
  if (continueBtn) {
    continueBtn.classList.toggle('hidden', !hasSave());
    continueBtn.addEventListener('click', () => startPlaying(state, true));
  }
  if (resumeBtn) resumeBtn.addEventListener('click', () => {
    state.screen = 'playing';
    showScreen(state);
  });
  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (saveGame(state)) {
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => { saveBtn.textContent = 'Save game'; }, 1500);
    }
  });
  if (retryBtn) retryBtn.addEventListener('click', () => retryRun(state));
  if (retryMissionBtn) retryMissionBtn.addEventListener('click', () => {
    retryMission(state);
    state.screen = 'playing';
    showScreen(state);
  });
  if (quitBtn) quitBtn.addEventListener('click', () => {
    state.screen = 'title';
    showScreen(state);
  });
  if (helpBtn) helpBtn.addEventListener('click', () => $('screen-help').classList.add('show'));
  if (helpClose) helpClose.addEventListener('click', () => $('screen-help').classList.remove('show'));
  const muteBtn = $('btn-mute');
  if (muteBtn) muteBtn.addEventListener('click', () => {
    const muted = toggleMute();
    muteBtn.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
  });
}

function main() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const state = buildState(canvas, ctx);
  window.__solmar = state;
  initRenderer(canvas);
  initInput(canvas);
  initHud();
  wireMenus(state);

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    // Screenshot mode: stage the scene, then play live from it.
    state.screen = stageShot(state, shot, stepWorld);
    state.missionStarted = true;
    showScreen(state);
  } else {
    showScreen(state);
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    beginFrameInput();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (wasPressed('mute')) toggleMute();
    if (wasPressed('pause')) {
      if (state.screen === 'playing') {
        state.screen = 'paused';
        showScreen(state);
      } else if (state.screen === 'paused') {
        state.screen = 'playing';
        showScreen(state);
      }
    }
    if (state.screen === 'title' && wasPressed('confirm')) {
      startPlaying(state, hasSave());
    }
    if ((state.screen === 'wasted' || state.screen === 'busted') && (wasPressed('confirm') || wasPressed('restart'))) {
      retryRun(state);
    }
    if (state.screen === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        stepWorld(state, STEP, null);
        acc -= STEP;
        steps += 1;
        if (state.screen !== 'playing') break;
      }
      if (steps === 5) acc = 0;
      const p = state.player;
      setEngine(p.car ? carSpeed(p.car) / 560 : 0, !!p.car);
      setSiren(state.wanted.stars > 0 && nearestCopCarDistance(state) < 750);
      updateHud(state);
    } else {
      setEngine(0, false);
      setSiren(false);
    }
    if (state.screen === 'title') {
      const { w, h } = viewSize();
      ctx.setTransform(dprScale(), 0, 0, dprScale(), 0, 0);
      drawTitleBackdrop(ctx, w, h, state.time);
      state.time += dt;
    } else {
      render(state);
      if (state.screen !== 'playing') updateHud(state);
    }
    endFrameInput();
  }
  requestAnimationFrame(frame);
}

function dprScale() {
  return Math.min(2, window.devicePixelRatio || 1);
}

main();
