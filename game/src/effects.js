// Particles, muzzle flash, screen shake, floating score popups.
// One THREE.Points cloud for smoke/sparks; popups are DOM elements.

import * as THREE from 'three';

const MAX_PARTICLES = 400;

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    parts.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1 });
    positions[i * 3 + 1] = -1000;
  }
  let cursor = 0;
  let shake = 0;
  const popupRoot = document.getElementById('popups');

  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const p = parts[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.alive = true; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life; p.r = r; p.g = g; p.b = b;
  }

  return {
    smoke(x, y, z, n = 6) {
      for (let i = 0; i < n; i++) {
        spawn(x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5),
          (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2,
          0.8 + Math.random() * 0.8, 0.35, 0.33, 0.32);
      }
    },
    sparks(x, y, z, n = 10) {
      for (let i = 0; i < n; i++) {
        spawn(x, y, z, (Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12,
          0.3 + Math.random() * 0.4, 1.0, 0.8, 0.25);
      }
    },
    explosion(x, y, z) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 4 + Math.random() * 14;
        spawn(x, y + 1, z, Math.cos(a) * s, 3 + Math.random() * 10, Math.sin(a) * s,
          0.6 + Math.random() * 0.9, 1.0, 0.45 + Math.random() * 0.3, 0.1);
      }
      for (let i = 0; i < 20; i++) {
        spawn(x + (Math.random() - 0.5) * 3, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3,
          1.2 + Math.random(), 0.25, 0.24, 0.23);
      }
      shake = Math.min(1, shake + 0.8);
    },
    muzzle(x, y, z) {
      for (let i = 0; i < 5; i++) {
        spawn(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4,
          0.08 + Math.random() * 0.06, 1.0, 0.9, 0.4);
      }
    },
    addShake(amount) { shake = Math.min(1, shake + amount); },
    popup(text, kind = '') {
      if (!popupRoot) return;
      const el = document.createElement('div');
      el.className = 'popup ' + kind;
      el.textContent = text;
      popupRoot.appendChild(el);
      setTimeout(() => el.remove(), 1800);
    },
    update(dt) {
      shake = Math.max(0, shake - dt * 2.2);
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = parts[i];
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; positions[i * 3 + 1] = -1000; continue; }
        p.vy -= 2.5 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.1) { p.y = 0.1; p.vy = 0; }
        const f = p.life / p.maxLife;
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        colors[i * 3] = p.r * f; colors[i * 3 + 1] = p.g * f; colors[i * 3 + 2] = p.b * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    shakeOffset() {
      if (shake <= 0.01) return { x: 0, y: 0 };
      const s = shake * shake * 0.9;
      return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
    },
  };
}
