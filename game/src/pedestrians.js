// Pedestrians: walk the sidewalks, pause, flee from danger, and dive out of
// the way of speeding cars. Simple low-poly walkers, 3 meshes each.

import * as THREE from 'three';
import { clamp } from './random.js';

const SHIRT_COLORS = [0xe8e0d0, 0xd94f4f, 0x4f7fd9, 0x6f9e5a, 0xffd166, 0xd98cb8, 0x7ee7e2, 0xc98a5a];

export function createPedestrians(scene, city) {
  const peds = [];
  let pedId = 0;

  function buildPed(color) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2e3540, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.42), shirt);
    torso.position.y = 1.15;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    head.position.y = 1.9;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.4), pants);
    legs.position.y = 0.4;
    group.add(torso, head, legs);
    return { group, torso, legs };
  }

  function randomSidewalkPoint(px, pz) {
    // A point on a sidewalk near a random block, 30–180 units from the player.
    for (let tries = 0; tries < 10; tries++) {
      const bx = (Math.floor(Math.random() * 9) - 4) * 90;
      const bz = (Math.floor(Math.random() * 9) - 4) * 90;
      const edge = Math.floor(Math.random() * 4);
      let x = bx; let z = bz;
      if (edge === 0) { x += (Math.random() - 0.5) * 70; z -= 38; }
      if (edge === 1) { x += (Math.random() - 0.5) * 70; z += 38; }
      if (edge === 2) { x -= 38; z += (Math.random() - 0.5) * 70; }
      if (edge === 3) { x += 38; z += (Math.random() - 0.5) * 70; }
      if (Math.abs(x + 135) < 14) continue; // not in the canal
      const dx = x - px; const dz = z - pz;
      if (dx * dx + dz * dz < 30 * 30) continue;
      return { x, z };
    }
    return { x: px + 60, z: pz };
  }

  function spawn(px, pz) {
    const pt = randomSidewalkPoint(px, pz);
    const built = buildPed(SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)]);
    built.group.position.set(pt.x, 0, pt.z);
    scene.add(built.group);
    const ped = {
      id: pedId++,
      x: pt.x, z: pt.z,
      heading: Math.random() * Math.PI * 2,
      speed: 0,
      state: 'walk', // walk | idle | flee | down
      target: randomSidewalkPoint(pt.x, pt.z),
      idleT: 0,
      fleeT: 0,
      mesh: built.group,
      legs: built.legs,
      phase: Math.random() * 6,
      dead: false,
    };
    peds.push(ped);
    return ped;
  }

  function scare(x, z, radius) {
    for (const p of peds) {
      if (p.state === 'down') continue;
      const dx = p.x - x; const dz = p.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        p.state = 'flee';
        p.fleeT = 3 + Math.random() * 2;
        p.heading = Math.atan2(dx, dz);
      }
    }
  }

  function hitCheck(x, z, radius) {
    // A car ploughing through peds: returns the peds hit this frame.
    const hit = [];
    for (const p of peds) {
      if (p.state === 'down') continue;
      const dx = p.x - x; const dz = p.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        p.state = 'down';
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.3;
        hit.push(p);
      }
    }
    return hit;
  }

  return {
    peds,
    spawn,
    scare,
    hitCheck,
    update(dt, G) {
      if (peds.length < 16) spawn(G.player.x, G.player.z);
      for (const p of [...peds]) {
        if (p.dead) continue;
        const dx = p.x - G.player.x; const dz = p.z - G.player.z;
        if (dx * dx + dz * dz > 300 * 300) {
          scene.remove(p.mesh);
          p.dead = true;
          peds.splice(peds.indexOf(p), 1);
          continue;
        }
        if (p.state === 'down') continue;
        if (p.state === 'flee') {
          p.fleeT -= dt;
          p.speed = 9;
          p.x += Math.sin(p.heading) * p.speed * dt;
          p.z += Math.cos(p.heading) * p.speed * dt;
          if (p.fleeT <= 0) { p.state = 'walk'; p.target = randomSidewalkPoint(p.x, p.z); }
        } else if (p.state === 'idle') {
          p.idleT -= dt;
          p.speed = 0;
          if (p.idleT <= 0) { p.state = 'walk'; p.target = randomSidewalkPoint(p.x, p.z); }
        } else {
          const tx = p.target.x - p.x; const tz = p.target.z - p.z;
          const d = Math.hypot(tx, tz);
          if (d < 2) {
            p.state = Math.random() < 0.4 ? 'idle' : 'walk';
            p.idleT = 2 + Math.random() * 4;
            if (p.state === 'walk') p.target = randomSidewalkPoint(p.x, p.z);
          } else {
            p.heading = Math.atan2(tx, tz);
            p.speed = 2.6;
            p.x += Math.sin(p.heading) * p.speed * dt;
            p.z += Math.cos(p.heading) * p.speed * dt;
          }
        }
        const fixed = city.resolveCircle(p.x, p.z, 0.8);
        p.x = fixed.x; p.z = fixed.z;
        // Dodge an approaching fast car.
        const car = G.vehicles.nearestCar(p.x, p.z, 9, null);
        if (car && Math.abs(car.speed) > 12 && p.state !== 'flee') {
          const cx = p.x - car.x; const cz = p.z - car.z;
          p.state = 'flee';
          p.fleeT = 1.5;
          p.heading = Math.atan2(cx, cz);
        }
        p.phase += dt * (4 + p.speed);
        p.legs.rotation.x = p.speed > 0.3 ? Math.sin(p.phase) * 0.5 : 0;
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.heading;
      }
    },
  };
}
