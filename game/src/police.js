// The MCPA — Meridian Cay Port Authority. Wanted stars from heat, cop cars
// that chase and ram, foot cops, roadblocks at 3+ stars, the Skyhook
// helicopter at 4+, and the Sunset Auto Body respray that clears heat.

import * as THREE from 'three';
import { WANTED, CAR_MODELS } from './config.js';
import { clamp, damp, dampAngle, angleDiff } from './random.js';
import { buildCarMesh } from './vehicles.js';

export function createPolice(scene, city, vehicles) {
  const cops = []; // cop cars
  const footCops = [];
  const roadblocks = [];
  let heli = null;
  let heat = 0;
  let stars = 0;
  let hiddenT = 0;
  let sirenT = 0;
  let sprayCooldown = 0;
  let spawnT = 0; // cop-car spawn timer: steady pressure, no dry spells
  let footT = 0;

  function starsFor(h) {
    let s = 0;
    for (let i = 1; i <= 5; i++) if (h >= WANTED.starHeat[i]) s = i;
    return s;
  }

  function spawnCopCar(px, pz, heading) {
    const model = CAR_MODELS[0];
    const built = buildCarMesh(model, { police: true, color: 0xf2f5f7 });
    built.group.position.set(px, 0, pz);
    built.group.rotation.y = heading;
    scene.add(built.group);
    const cop = {
      x: px, z: pz, heading, speed: 0,
      mesh: built.group, wheels: built.wheels, lightBar: built.lightBar,
      health: 100, stuckT: 0, dead: false,
    };
    cops.push(cop);
    return cop;
  }

  function spawnFootCop(px, pz) {
    const group = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.45), uniform);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    head.position.y = 1.95;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.18, 10), uniform);
    cap.position.y = 2.2;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.4), uniform);
    legs.position.y = 0.4;
    group.add(torso, head, cap, legs);
    group.position.set(px, 0, pz);
    scene.add(group);
    const cop = { x: px, z: pz, heading: 0, mesh: group, dead: false };
    footCops.push(cop);
    return cop;
  }

  function spawnHeli(px, pz) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.5, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5.5), bodyMat);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5), darkMat);
    tail.position.set(0, 0.3, -4.5);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), darkMat);
    rotor.position.y = 1.1;
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4), darkMat);
    skidL.position.set(-1, -1, 0);
    const skidR = skidL.clone();
    skidR.position.x = 1;
    group.add(body, tail, rotor, skidL, skidR);
    // Searchlight cone.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6, 42, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -21;
    cone.rotation.x = Math.PI;
    group.add(cone);
    group.position.set(px, 42, pz);
    scene.add(group);
    heli = { mesh: group, rotor, angle: 0, x: px, z: pz };
    return heli;
  }

  function clearRoadblocks() {
    for (const rb of roadblocks) {
      for (const c of rb.cars) {
        scene.remove(c.mesh);
        const i = cops.indexOf(c);
        if (i >= 0) cops.splice(i, 1);
      }
    }
    roadblocks.length = 0;
  }

  function spawnRoadblock(px, pz, heading) {
    // Two cop cars parked across the road ahead of the player.
    const fx = Math.sin(heading); const fz = Math.cos(heading);
    const cx = px + fx * 55; const cz = pz + fz * 55;
    const across = heading + Math.PI / 2;
    const cars = [];
    for (const off of [-4.5, 4.5]) {
      const x = cx + Math.sin(across) * off;
      const z = cz + Math.cos(across) * off;
      const fixed = city.resolveCircle(x, z, 2.3);
      const cop = spawnCopCar(fixed.x, fixed.z, across);
      cop.roadblock = true;
      cars.push(cop);
    }
    roadblocks.push({ x: cx, z: cz, cars });
  }

  function removeCop(cop) {
    scene.remove(cop.mesh);
    cop.dead = true;
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
  }

  return {
    get heat() { return heat; },
    get stars() { return stars; },
    get heliActive() { return !!heli; },
    cops,
    footCops,
    // Spawn a cop car at an exact spot (screenshot scenes + tests).
    spawnCopCarAt(x, z, heading) { return spawnCopCar(x, z, heading); },
    // Place a roadblock 55 units ahead of a spot (screenshot scenes).
    spawnRoadblockAt(x, z, heading) { spawnRoadblock(x, z, heading); },
    addHeat(amount, G) {
      if (amount <= 0) return;
      const before = stars;
      heat = Math.min(400, heat + amount);
      stars = starsFor(heat);
      if (stars > before && G) {
        G.hud.banner(stars + ' STAR' + (stars > 1 ? 'S' : '') + ' — MCPA ON YOU', 'bad');
        G.audio.siren();
      }
    },
    clearHeat() {
      heat = 0; stars = 0; hiddenT = 0;
      for (const c of [...cops]) removeCop(c);
      for (const f of [...footCops]) { scene.remove(f.mesh); f.dead = true; }
      footCops.length = 0;
      clearRoadblocks();
      if (heli) { scene.remove(heli.mesh); heli = null; }
    },
    spray(G) {
      if (sprayCooldown > 0) { G.audio.denied(); return false; }
      if (G.cash < WANTED.sprayCost) { G.audio.denied(); return false; }
      G.cash -= WANTED.sprayCost;
      sprayCooldown = WANTED.sprayCooldownSec;
      this.clearHeat();
      G.effects.popup('RESPRAY -$' + WANTED.sprayCost + ' — HEAT CLEARED', 'good');
      G.audio.cash();
      return true;
    },
    update(dt, G) {
      sprayCooldown = Math.max(0, sprayCooldown - dt);
      const px = G.player.x; const pz = G.player.z;
      const playerSpeed = G.inCar ? Math.abs(G.car.speed) : G.player.speed;
      // Heat decay while hidden (no cop within 55 units, no heli).
      const nearestCop = cops.reduce((m, c) => Math.min(m, Math.hypot(c.x - px, c.z - pz)), 1e9);
      const hidden = stars > 0 && nearestCop > 55 && !heli && footCops.every((f) => Math.hypot(f.x - px, f.z - pz) > 40);
      if (hidden) {
        hiddenT += dt;
        heat = Math.max(0, heat - WANTED.decayPerSec * dt);
        const s = starsFor(heat);
        if (s < stars) { stars = s; if (s === 0) this.clearHeat(); }
      } else {
        hiddenT = 0;
      }
      // Spawn pressure: cop cars up to stars count + 1, foot cops at 1-2 stars.
      if (stars >= 1) {
        const wantCars = Math.min(6, stars + 1);
        const chasing = cops.filter((c) => !c.roadblock).length;
        spawnT -= dt;
        if (chasing < wantCars && spawnT <= 0) {
          spawnT = 1.1;
          const a = Math.random() * Math.PI * 2;
          const d = 90 + Math.random() * 60;
          const x = px + Math.sin(a) * d;
          const z = pz + Math.cos(a) * d;
          const fixed = city.resolveCircle(x, z, 2.3);
          spawnCopCar(fixed.x, fixed.z, Math.atan2(px - fixed.x, pz - fixed.z));
        }
        footT -= dt;
        if (stars <= 2 && footCops.length < 3 && footT <= 0) {
          footT = 1.6;
          const a = Math.random() * Math.PI * 2;
          spawnFootCop(px + Math.sin(a) * 45, pz + Math.cos(a) * 45);
        }
        if (stars >= 3 && roadblocks.length === 0 && Math.random() < dt * 0.25 && G.inCar) {
          spawnRoadblock(px, pz, G.car.heading);
        }
        if (stars >= 4 && !heli) spawnHeli(px + 30, pz - 30);
        if (stars < 4 && heli) { scene.remove(heli.mesh); heli = null; }
        sirenT -= dt;
        if (sirenT <= 0) { sirenT = 1.4; G.audio.siren(); }
      }
      // Cop car AI: steer toward the player, ram; roadblock cars stay put.
      for (const cop of [...cops]) {
        if (cop.dead) continue;
        if (cop.lightBar) {
          cop.lightBar.t = (cop.lightBar.t || 0) + dt * 7;
          const on = Math.sin(cop.lightBar.t) > 0;
          cop.lightBar.red.material.emissiveIntensity = on ? 3 : 0.2;
          cop.lightBar.blue.material.emissiveIntensity = on ? 0.2 : 3;
        }
        if (cop.roadblock) continue;
        const dx = px - cop.x; const dz = pz - cop.z;
        const dist = Math.hypot(dx, dz);
        const wantHeading = Math.atan2(dx, dz);
        cop.heading = dampAngle(cop.heading, wantHeading, 2.6, dt);
        const top = 34 + stars * 3;
        cop.speed = damp(cop.speed, Math.abs(angleDiff(cop.heading, wantHeading)) < 0.6 ? top : top * 0.45, 2, dt);
        const ox = cop.x; const oz = cop.z;
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
        const fixed = city.resolveCircle(cop.x, cop.z, 2.3);
        if (Math.abs(fixed.x - cop.x) > 0.01 || Math.abs(fixed.z - cop.z) > 0.01) {
          cop.stuckT += dt;
          cop.speed *= 0.4;
          if (cop.stuckT > 1.2) {
            cop.heading += Math.PI / 2;
            cop.stuckT = 0;
          }
        } else {
          cop.stuckT = 0;
        }
        cop.x = fixed.x; cop.z = fixed.z;
        // Ram the player's car.
        if (G.inCar && dist < 5.5) {
          const push = 6;
          G.car.vx += (dx / (dist || 1)) * push;
          G.car.vz += (dz / (dist || 1)) * push;
          G.car.health -= 2.5 * dt * 10 * 0.12;
          if (Math.random() < dt * 2) {
            G.effects.sparks(G.car.x, 1, G.car.z, 4);
            G.audio.crash();
          }
        }
        // Bust: on foot, slow, cop close.
        if (!G.inCar && dist < WANTED.bustRange && playerSpeed < 3 && stars > 0) {
          if (G.onBusted) G.onBusted();
        }
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = cop.heading;
        const spin = cop.speed * dt / 0.42;
        for (const w of cop.wheels) w.rotation.x += spin;
        if (dist > 340) removeCop(cop);
      }
      // Foot cops chase on foot and tackle.
      for (const f of [...footCops]) {
        if (f.dead) continue;
        const dx = px - f.x; const dz = pz - f.z;
        const dist = Math.hypot(dx, dz);
        f.heading = Math.atan2(dx, dz);
        const sp = 10.5;
        f.x += Math.sin(f.heading) * sp * dt;
        f.z += Math.cos(f.heading) * sp * dt;
        const fixed = city.resolveCircle(f.x, f.z, 0.9);
        f.x = fixed.x; f.z = fixed.z;
        f.mesh.position.set(f.x, 0, f.z);
        f.mesh.rotation.y = f.heading;
        if (!G.inCar && dist < WANTED.bustRange && playerSpeed < 3 && stars > 0) {
          if (G.onBusted) G.onBusted();
        }
        if (dist > 200) {
          scene.remove(f.mesh);
          f.dead = true;
          footCops.splice(footCops.indexOf(f), 1);
        }
      }
      // Helicopter circles the player with its searchlight.
      if (heli) {
        heli.angle += dt * 0.5;
        heli.x = px + Math.sin(heli.angle) * 45;
        heli.z = pz + Math.cos(heli.angle) * 45;
        heli.mesh.position.set(heli.x, 42, heli.z);
        heli.mesh.rotation.y = Math.atan2(px - heli.x, pz - heli.z);
        heli.rotor.rotation.y += dt * 22;
      }
    },
  };
}
