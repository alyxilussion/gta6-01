// Rook on foot: camera-relative movement, sprint, jump, and a simple
// low-poly character (jacket, head, legs) that leans into the run.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, dampAngle } from './random.js';

export function createPlayer(scene) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.8 });
  const denim = new THREE.MeshStandardMaterial({ color: 0x2e4a6b, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.5), jacket);
  torso.position.y = 1.25;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin);
  head.position.y = 2.05;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, 1.1), hair);
  cap.position.y = 2.1;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.36), denim);
  legL.position.set(-0.22, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.3), jacket);
  armL.position.set(-0.58, 1.25, 0);
  const armR = armL.clone();
  armR.position.x = 0.58;
  group.add(torso, head, cap, legL, legR, armL, armR);
  scene.add(group);

  const p = {
    x: 0, y: 0, z: 300,
    vx: 0, vz: 0, vy: 0,
    heading: 0, // facing, radians; 0 = -z? we use sin/cos: forward = (sin h, cos h)
    speed: 0,
    onGround: true,
    walkPhase: 0,
    group,
  };

  return {
    state: p,
    group,
    reset(x, z) {
      p.x = x; p.z = z; p.y = 0; p.vx = 0; p.vz = 0; p.vy = 0; p.heading = Math.PI;
      group.position.set(x, 0, z);
      group.rotation.y = p.heading;
    },
    update(dt, input, camYaw, city, frozen) {
      const fwdX = Math.sin(camYaw);
      const fwdZ = Math.cos(camYaw);
      const rightX = Math.cos(camYaw);
      const rightZ = -Math.sin(camYaw);
      const iy = input.axisY();
      const ix = input.axisX();
      let mx = fwdX * iy + rightX * ix;
      let mz = fwdZ * iy + rightZ * ix;
      const len = Math.hypot(mx, mz);
      const sprint = input.sprint();
      const maxSpeed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      if (len > 0.01 && !frozen) {
        mx /= len; mz /= len;
        p.vx = mx * maxSpeed;
        p.vz = mz * maxSpeed;
        p.heading = dampAngle(p.heading, Math.atan2(mx, mz), 12, dt);
        p.walkPhase += dt * (sprint ? 13 : 9);
      } else {
        p.vx *= Math.max(0, 1 - dt * 10);
        p.vz *= Math.max(0, 1 - dt * 10);
      }
      if (input.wasPressed('Space') && p.onGround && !frozen) {
        p.vy = PLAYER.jumpSpeed;
        p.onGround = false;
      }
      p.vy -= 26 * dt;
      const ox = p.x; const oz = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
      const fixed = city.resolveCircle(p.x, p.z, PLAYER.radius);
      p.x = fixed.x; p.z = fixed.z;
      // The sea blocks on foot — except on the pier deck (x ±6, z 450–548).
      if (city.isWater(p.x, p.z) && !(Math.abs(p.x) < 6 && p.z > 450 && p.z < 548)) {
        p.x = ox; p.z = oz;
      }
      p.speed = Math.hypot(p.vx, p.vz);
      // Animate limbs.
      const swing = p.speed > 0.5 ? Math.sin(p.walkPhase) * clamp(p.speed / 12, 0.3, 1) : 0;
      legL.rotation.x = swing * 0.9;
      legR.rotation.x = -swing * 0.9;
      armL.rotation.x = -swing * 0.7;
      armR.rotation.x = swing * 0.7;
      torso.position.y = 1.25 + Math.abs(Math.sin(p.walkPhase)) * 0.06 * (p.speed > 0.5 ? 1 : 0);
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = p.heading;
    },
  };
}
