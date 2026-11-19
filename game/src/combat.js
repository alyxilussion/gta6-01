// Combat: the player's shots (hitscan toward the camera's aim), enemy
// shooters for missions, health/armor, and death handling.

import * as THREE from 'three';
import { clamp } from './random.js';

export function createCombat(scene) {
  const enemies = [];
  const tracers = [];
  let enemyId = 0;

  function buildEnemy() {
    const group = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xa06a42, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.45), jacket);
    torso.position.y = 1.2;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skin);
    head.position.y = 1.95;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.4), pants);
    legs.position.y = 0.4;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), pants);
    gun.position.set(0.4, 1.35, 0.4);
    group.add(torso, head, legs, gun);
    return group;
  }

  function spawnEnemy(x, z, opts = {}) {
    const mesh = buildEnemy();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const e = {
      id: enemyId++,
      x, z,
      heading: Math.random() * Math.PI * 2,
      health: opts.health || 60,
      mesh,
      shootT: 1 + Math.random() * 2,
      state: 'guard', // guard | chase | down
      speed: 6.5,
      dead: false,
      tag: opts.tag || '',
    };
    enemies.push(e);
    return e;
  }

  function clearEnemies(tag) {
    for (const e of [...enemies]) {
      if (!tag || e.tag === tag) {
        scene.remove(e.mesh);
        e.dead = true;
        enemies.splice(enemies.indexOf(e), 1);
      }
    }
  }

  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, t: 0.09 });
  }

  return {
    enemies,
    spawnEnemy,
    clearEnemies,
    // Player fires from the camera toward the aim point. Returns what was hit.
    playerShoot(G, origin, dir) {
      const maxD = 120;
      let bestD = maxD;
      let hitEnemy = null;
      let hitCop = null;
      for (const e of enemies) {
        if (e.state === 'down') continue;
        const ex = e.x - origin.x; const ez = e.z - origin.z;
        const along = ex * dir.x + ez * dir.z;
        if (along < 0 || along > bestD) continue;
        const perp = Math.abs(ex * dir.z - ez * dir.x);
        if (perp < 1.4) { bestD = along; hitEnemy = e; hitCop = null; }
      }
      // Cop cars are big targets too.
      for (const c of G.police.cops) {
        if (c.dead) continue;
        const ex = c.x - origin.x; const ez = c.z - origin.z;
        const along = ex * dir.x + ez * dir.z;
        if (along < 0 || along > bestD) continue;
        const perp = Math.abs(ex * dir.z - ez * dir.x);
        if (perp < 2.2) { bestD = along; hitEnemy = null; hitCop = c; }
      }
      const end = {
        x: origin.x + dir.x * bestD,
        y: origin.y + dir.y * bestD,
        z: origin.z + dir.z * bestD,
      };
      tracer(origin, end);
      G.effects.muzzle(origin.x, origin.y, origin.z);
      G.audio.shoot();
      if (hitEnemy) {
        hitEnemy.health -= 34;
        G.effects.sparks(hitEnemy.x, 1.4, hitEnemy.z, 6);
        if (hitEnemy.health <= 0 && hitEnemy.state !== 'down') {
          hitEnemy.state = 'down';
          hitEnemy.mesh.rotation.x = -Math.PI / 2;
          hitEnemy.mesh.position.y = 0.3;
          G.effects.popup('TARGET DOWN', 'good');
          if (G.onEnemyDown) G.onEnemyDown(hitEnemy);
        }
      }
      if (hitCop) {
        hitCop.health -= 25;
        G.effects.sparks(hitCop.x, 1, hitCop.z, 6);
        G.police.addHeat(20, G);
      }
      return { hitEnemy, hitCop, dist: bestD };
    },
    update(dt, G) {
      for (const t of [...tracers]) {
        t.t -= dt;
        if (t.t <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          tracers.splice(tracers.indexOf(t), 1);
        }
      }
      const px = G.player.x; const pz = G.player.z;
      for (const e of enemies) {
        if (e.state === 'down' || e.dead) continue;
        const dx = px - e.x; const dz = pz - e.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 55) {
          e.state = 'chase';
          e.heading = Math.atan2(dx, dz);
          if (dist > 14) {
            e.x += Math.sin(e.heading) * e.speed * dt;
            e.z += Math.cos(e.heading) * e.speed * dt;
            const fixed = G.city.resolveCircle(e.x, e.z, 0.9);
            e.x = fixed.x; e.z = fixed.z;
          }
          e.shootT -= dt;
          if (e.shootT <= 0 && dist < 45) {
            e.shootT = 1.1 + Math.random() * 0.9;
            const from = { x: e.x, y: 1.5, z: e.z };
            const to = { x: px + (Math.random() - 0.5) * 2, y: 1.2, z: pz + (Math.random() - 0.5) * 2 };
            tracer(from, to);
            G.audio.shoot();
            if (Math.random() < 0.4 && !G.inCar) {
              G.damagePlayer(9);
            } else if (Math.random() < 0.25 && G.inCar) {
              G.car.health -= 6;
            }
          }
        }
        e.mesh.position.set(e.x, 0, e.z);
        e.mesh.rotation.y = e.heading;
      }
    },
  };
}
