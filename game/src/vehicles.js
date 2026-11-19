// Cars: procedural models, arcade driving, traffic AI, stealing, damage.
// One builder makes every car (traffic, parked, player, police) from boxes.

import * as THREE from 'three';
import { CITY, DRIVING, CAR_MODELS } from './config.js';
import { clamp, damp } from './random.js';

export function buildCarMesh(model, opts = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: opts.color ?? model.color, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.15, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const [L, H, W] = model.body;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.7, L * 0.45), glass);
  cabin.position.set(0, 0.75 + H / 2 + 0.3, -L * 0.05);
  cabin.castShadow = true;
  group.add(body, cabin);
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-W / 2, L * 0.32], [W / 2, L * 0.32], [-W / 2, -L * 0.32], [W / 2, -L * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  // Headlights + taillights.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xcc1111, emissiveIntensity: 1.0 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.1), lightMat);
    h.position.set(sx * W * 0.6, 0.8, L / 2 + 0.02);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.1), tailMat);
    t.position.set(sx * W * 0.6, 0.8, -L / 2 - 0.02);
    group.add(t);
  }
  let lightBar = null;
  if (opts.police) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    red.position.x = -0.45;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 2 }));
    blue.position.x = 0.45;
    bar.add(red, blue);
    bar.position.y = 0.75 + H / 2 + 0.75;
    group.add(bar);
    lightBar = { red, blue, t: 0 };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.3, L * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    stripe.position.y = 0.85;
    group.add(stripe);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, wheels, lightBar, length: L, width: W };
}

export function createVehicles(scene, city) {
  const cars = [];
  let carId = 0;

  function spawnCar(x, z, heading, modelIndex, opts = {}) {
    const model = CAR_MODELS[modelIndex % CAR_MODELS.length];
    const built = buildCarMesh(model, opts);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = heading;
    scene.add(built.group);
    const car = {
      id: carId++,
      x, z, heading,
      vx: 0, vz: 0,
      speed: 0,
      model,
      mesh: built.group,
      wheels: built.wheels,
      lightBar: built.lightBar,
      health: 100,
      burning: false,
      isPlayer: false,
      isCop: !!opts.police,
      isParked: !!opts.parked,
      traffic: opts.traffic || null, // {axis:'ns'|'ew', line, dir}
      dead: false,
      smokeT: 0,
      brakeLight: false,
    };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    car.dead = true;
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  // Parked cars along road edges.
  const parkedSpots = [
    [-45, -315], [45, -225], [135, -45], [-225, 45], [225, 135], [-45, 225],
    [315, 45], [-315, 225], [45, 315], [135, 225], [-225, -135], [225, -315],
  ];
  parkedSpots.forEach(([x, z], i) => {
    spawnCar(x + 6.5, z, i % 2 ? 0 : Math.PI / 2, (i * 2 + 1) % CAR_MODELS.length, { parked: true });
  });

  function nearestCar(x, z, maxD, exclude) {
    let best = null; let bd = maxD * maxD;
    for (const c of cars) {
      if (c === exclude || c.dead) continue;
      const dx = c.x - x; const dz = c.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = c; }
    }
    return best;
  }

  function trafficCountNear(x, z, r) {
    let n = 0;
    for (const c of cars) {
      if (c.traffic && !c.dead) {
        const dx = c.x - x; const dz = c.z - z;
        if (dx * dx + dz * dz < r * r) n++;
      }
    }
    return n;
  }

  function spawnTrafficNear(px, pz) {
    // Spawn a traffic car on a random road line, 80–200 units from the player.
    const lines = CITY.roadLines || [-405, -315, -225, -45, 45, 135, 225, 315, 405];
    for (let tries = 0; tries < 12; tries++) {
      const axis = Math.random() < 0.5 ? 'ns' : 'ew';
      const line = lines[Math.floor(Math.random() * lines.length)];
      if (axis === 'ns' && line === CITY.canalX) continue;
      const t = -380 + Math.random() * 760;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = 3.6;
      const x = axis === 'ns' ? line + (dir > 0 ? -lane : lane) : t;
      const z = axis === 'ns' ? t : line + (dir > 0 ? lane : -lane);
      const dx = x - px; const dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 80 * 80 || d2 > 260 * 260) continue;
      const heading = axis === 'ns' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = spawnCar(x, z, heading, Math.floor(Math.random() * CAR_MODELS.length), {
        traffic: { axis, line, dir },
      });
      car.speed = DRIVING.trafficSpeed;
      return car;
    }
    return null;
  }

  function updateTraffic(car, dt, G) {
    const t = car.traffic;
    if (!t) return;
    const speed = DRIVING.trafficSpeed;
    // Stop for a lifted bridge ahead (EW cars crossing the canal).
    let wantSpeed = speed;
    if (t.axis === 'ew' && CITY.bridges.includes(t.line)) {
      const b = G.city.bridges.find((br) => br.z === t.line);
      if (b && b.angle > 0.2) {
        const distToCanal = Math.abs(car.x - CITY.canalX);
        const approaching = (t.dir > 0 && car.x < CITY.canalX) || (t.dir < 0 && car.x > CITY.canalX);
        if (approaching && distToCanal < 45) wantSpeed = 0;
      }
    }
    // Stop for a car ahead.
    const ahead = nearestCar(car.x + Math.sin(car.heading) * 10, car.z + Math.cos(car.heading) * 10, 7, car);
    if (ahead) wantSpeed = 0;
    car.speed = damp(car.speed, wantSpeed, 3, dt);
    // Move along the line.
    if (t.axis === 'ns') {
      car.z += t.dir * car.speed * dt;
      car.x = damp(car.x, t.line + (t.dir > 0 ? -3.6 : 3.6), 4, dt);
      car.heading = damp(car.heading, t.dir > 0 ? 0 : Math.PI, 4, dt);
    } else {
      car.x += t.dir * car.speed * dt;
      car.z = damp(car.z, t.line + (t.dir > 0 ? 3.6 : -3.6), 4, dt);
      car.heading = damp(car.heading, t.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 4, dt);
    }
    // At an intersection, maybe turn; at the edge, U-turn.
    const pos = t.axis === 'ns' ? car.z : car.x;
    const lines = [-405, -315, -225, -135, -45, 45, 135, 225, 315, 405];
    const nearLine = lines.find((L) => Math.abs(pos - L) < 2);
    if (nearLine !== undefined && Math.random() < 0.012) {
      const newAxis = t.axis === 'ns' ? 'ew' : 'ns';
      if (newAxis === 'ns' && nearLine === CITY.canalX) {
        // Never turn onto the canal line.
      } else {
        t.axis = newAxis;
        t.line = nearLine;
        t.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }
    if (pos > 400 || pos < -400) t.dir *= -1;
    // Despawn far from the player.
    const dx = car.x - G.player.x; const dz = car.z - G.player.z;
    if (dx * dx + dz * dz > 320 * 320) removeCar(car);
  }

  function collideCars(car, G) {
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const dx = car.x - other.x; const dz = car.z - other.z;
      const d2 = dx * dx + dz * dz;
      const min = 4.4;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d; const nz = dz / d;
        car.x += nx * push; car.z += nz * push;
        if (!other.isPlayer) { other.x -= nx * push; other.z -= nz * push; }
        const relSpeed = Math.abs(car.speed - other.speed);
        if (relSpeed > 6) {
          car.health -= relSpeed * 0.9;
          other.health -= relSpeed * 0.7;
          if (car.isPlayer || other.isPlayer) {
            G.effects.sparks(car.x, 1, car.z, 6);
            G.audio.crash();
            G.effects.addShake(0.35);
            if (G.onCrash) G.onCrash(relSpeed);
          }
          car.speed *= 0.55;
        }
      }
    }
  }

  return {
    cars,
    spawnCar,
    removeCar,
    nearestCar,
    spawnTrafficNear,
    trafficCountNear,
    drivePlayer(car, dt, input, G) {
      // Arcade driving: velocity chases heading*speed with grip; handbrake cuts grip.
      const throttle = input.axisY();
      const steer = input.axisX();
      const handbrake = input.down('Space');
      const top = DRIVING.maxSpeed * car.model.speed;
      if (throttle > 0) car.speed += DRIVING.accel * throttle * dt;
      else if (throttle < 0) {
        if (car.speed > 1) car.speed -= DRIVING.brake * dt;
        else car.speed = Math.max(-DRIVING.reverseMax, car.speed + DRIVING.accel * 0.6 * throttle * dt);
      } else {
        car.speed -= car.speed * 0.6 * dt;
      }
      car.speed -= car.speed * DRIVING.drag * dt * 0.4;
      car.speed = clamp(car.speed, -DRIVING.reverseMax, top);
      const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1);
      car.heading += steer * DRIVING.steerRate * steerAuthority * dt * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.6 : 1);
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const grip = handbrake ? DRIVING.driftGrip : DRIVING.grip;
      car.vx = damp(car.vx, fx * car.speed, grip, dt);
      car.vz = damp(car.vz, fz * car.speed, grip, dt);
      const ox = car.x; const oz = car.z;
      car.x += car.vx * dt;
      car.z += car.vz * dt;
      const fixed = city.resolveCircle(car.x, car.z, 2.3);
      const hitWall = Math.abs(fixed.x - car.x) > 0.01 || Math.abs(fixed.z - car.z) > 0.01;
      car.x = fixed.x; car.z = fixed.z;
      if (hitWall) {
        const impact = Math.hypot(car.vx, car.vz);
        if (impact > 8) {
          car.health -= impact * 1.1;
          G.effects.sparks(car.x, 1, car.z, 8);
          G.audio.crash();
          G.effects.addShake(0.4);
          if (G.onCrash) G.onCrash(impact);
        }
        car.vx *= -0.25; car.vz *= -0.25;
        car.speed *= 0.4;
      }
      // Water check: driving into the sea/canal wrecks the car.
      if (city.isWater(car.x, car.z)) {
        car.health = 0;
        if (G.onCrash) G.onCrash(30);
      }
      collideCars(car, G);
      // Visuals.
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = car.speed * dt / 0.42;
      for (const w of car.wheels) w.rotation.x += spin;
      // Engine hum + smoke when damaged.
      if (Math.random() < dt * 6) G.audio.engine(clamp(Math.abs(car.speed) / top, 0.1, 1));
      if (car.health < 30 && car.health > 0) {
        car.smokeT -= dt;
        if (car.smokeT <= 0) {
          car.smokeT = 0.12;
          G.effects.smoke(car.x + Math.sin(car.heading) * 1.5, 1.4, car.z + Math.cos(car.heading) * 1.5, 2);
        }
      }
      if (car.health <= 0 && !car.burning) {
        car.burning = true;
        G.effects.explosion(car.x, 1, car.z);
        G.audio.explosion();
        if (G.onCarExploded) G.onCarExploded(car);
      }
    },
    update(dt, G) {
      // Keep traffic populated near the player.
      if (trafficCountNear(G.player.x, G.player.z, 260) < 9) spawnTrafficNear(G.player.x, G.player.z);
      for (const car of [...cars]) {
        if (car.dead) continue;
        if (car.traffic) {
          updateTraffic(car, dt, G);
          car.mesh.position.set(car.x, 0, car.z);
          car.mesh.rotation.y = car.heading;
          const spin = car.speed * dt / 0.42;
          for (const w of car.wheels) w.rotation.x += spin;
          collideCars(car, G);
        }
        if (car.lightBar) {
          car.lightBar.t += dt * 6;
          const on = Math.sin(car.lightBar.t) > 0;
          car.lightBar.red.material.emissiveIntensity = on ? 3 : 0.2;
          car.lightBar.blue.material.emissiveIntensity = on ? 0.2 : 3;
        }
        if (car.health <= 0 && !car.burning && !car.isPlayer) {
          car.burning = true;
          G.effects.explosion(car.x, 1, car.z);
          G.audio.explosion();
          if (G.onCarExploded) G.onCarExploded(car);
        }
      }
    },
  };
}
