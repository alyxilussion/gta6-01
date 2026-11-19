// Meridian Cay, built procedurally from one seed: road grid, canal with three
// scheduled drawbridges, instanced buildings/palms/lamps, beach + sea, golden
// hour sky, landmarks (casino, safehouse, spray shop, pier) and colliders.

import * as THREE from 'three';
import { CITY, PALETTE, districtAt } from './config.js';
import { makeRng as rngFactory, clamp } from './random.js';

const LINES = [-405, -315, -225, -135, -45, 45, 135, 225, 315, 405];

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4152';
  g.fillRect(0, 0, 128, 256);
  const r = rngFactory(77);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 18) {
      const lit = r.chance(0.45);
      g.fillStyle = lit ? (r.chance(0.7) ? '#ffd166' : '#ffe9b0') : '#1d2333';
      g.fillRect(x, y, 11, 12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(text, sub, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = fg; g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = fg;
  g.font = '900 64px Impact, Arial Black, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 62 : 80);
  if (sub) {
    g.font = '700 30px Arial, sans-serif';
    g.fillText(sub, 256, 122);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Merge many flat quads (x0,z0,x1,z1 at height y) into one geometry.
function quadMesh(quads, color, y = 0.02) {
  const pos = [];
  const idx = [];
  const norm = [];
  let v = 0;
  for (const [x0, z0, x1, z1] of quads) {
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    norm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    // Winding must face UP: (v0,v2,v1) has normal +Y. The naive (v0,v1,v2)
    // order faces down and is backface-culled from above — roads invisible.
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    v += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  mesh.receiveShadow = true;
  return mesh;
}

export function createCity(scene) {
  const rng = rngFactory(CITY.seed);
  const colliders = []; // {x0,z0,x1,z1}
  const buildings = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky dome (gradient shader), sun sprite, fog ----
  const skyGeo = new THREE.SphereGeometry(1600, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.75)), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  scene.fog = new THREE.Fog(PALETTE.fog, 220, 1100);

  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 128; sunCanvas.height = 128;
  const sg = sunCanvas.getContext('2d');
  const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,190,100,0.9)');
  grad.addColorStop(1, 'rgba(255,150,60,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sunCanvas);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
  sun.position.set(-900, 260, -700);
  sun.scale.set(420, 420, 1);
  group.add(sun);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sunLight.position.set(-300, 420, -260);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -160;
  sunLight.shadow.camera.right = 160;
  sunLight.shadow.camera.top = 160;
  sunLight.shadow.camera.bottom = -160;
  sunLight.shadow.camera.near = 50;
  sunLight.shadow.camera.far = 1200;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // ---- ground, roads, sidewalks, dashes ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  const roadQuads = [];
  const dashQuads = [];
  for (const L of LINES) {
    if (L !== CITY.canalX) roadQuads.push([L - 9, -414, L + 9, 414]); // NS road
    roadQuads.push([-414, L - 9, 414, L + 9]); // EW road
  }
  // Canal road is water, not asphalt; bridges carry the EW roads over it.
  group.add(quadMesh(roadQuads, PALETTE.asphalt, 0.02));
  for (const L of LINES) {
    for (let t = -390; t < 390; t += 24) {
      if (L !== CITY.canalX) dashQuads.push([L - 0.5, t, L + 0.5, t + 10]);
      dashQuads.push([t, L - 0.5, t + 10, L + 0.5]);
    }
  }
  group.add(quadMesh(dashQuads, PALETTE.roadLine, 0.04));

  const walkQuads = [];
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const cx = i * CITY.pitch; const cz = j * CITY.pitch;
      walkQuads.push([cx - 39, cz - 39, cx + 39, cz + 39]);
    }
  }
  group.add(quadMesh(walkQuads, PALETTE.sidewalk, 0.015));

  // ---- beach, sea, pier ----
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 60),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, 442);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 800),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.06, 880);
  group.add(sea);
  // Pier: deck + posts + a small hut at the end.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.9 });
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 90), pierMat);
  pierDeck.position.set(0, 1.2, 500);
  pierDeck.castShadow = true;
  group.add(pierDeck);
  for (let z = 470; z <= 540; z += 14) {
    for (const px of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), pierMat);
      post.position.set(px, 0, z);
      group.add(post);
    }
  }
  const hut = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshStandardMaterial({ color: 0xd98cb8, roughness: 0.8 }));
  hut.position.set(0, 4, 542);
  hut.castShadow = true;
  group.add(hut);

  // ---- canal ----
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 828),
    new THREE.MeshStandardMaterial({ color: PALETTE.canalWater, roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.94 }),
  );
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(CITY.canalX, 0.05, 0);
  group.add(canal);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.9 });
  for (const wx of [CITY.canalX - 9.6, CITY.canalX + 9.6]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 828), wallMat);
    wall.position.set(wx, 0.5, 0);
    group.add(wall);
  }
  // Canal walls block crossing except at bridges.
  colliders.push({ x0: CITY.canalX - 10, z0: -414, x1: CITY.canalX + 10, z1: 414, canal: true });

  // ---- drawbridges ----
  const bridges = [];
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.7, metalness: 0.3 });
  const railMat = new THREE.MeshStandardMaterial({ color: PALETTE.roadLine, roughness: 0.6 });
  for (const bz of CITY.bridges) {
    const pivot = new THREE.Group();
    pivot.position.set(CITY.canalX - 10, 0.4, bz);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(21, 1, 17), deckMat);
    deck.position.set(10.5, 0, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    pivot.add(deck);
    for (const rz of [-8, 8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(21, 1.1, 0.4), railMat);
      rail.position.set(10.5, 0.9, rz);
      pivot.add(rail);
    }
    group.add(pivot);
    bridges.push({ z: bz, pivot, angle: 0, lifting: false, liftT: 0 });
  }
  let bridgeClock = 45; // first lift 45s in
  let nextBridge = 0;

  // ---- buildings (instanced) ----
  const winTex = windowTexture();
  const bMat = new THREE.MeshStandardMaterial({
    map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.85,
  });
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0); // origin at base
  const placements = [];
  const roofPlacements = [];
  const special = new Set(['0,-4', '0,4', '4,-2']); // casino, safehouse, spray shop blocks
  const parks = new Set(['-2,2', '2,-3', '-3,0']);
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const key = i + ',' + j;
      if (special.has(key) || parks.has(key)) continue;
      const cx = i * CITY.pitch; const cz = j * CITY.pitch;
      const d = districtAt(cx, cz);
      const count = d.style === 'suburb' ? rng.int(2, 4) : rng.int(1, 2);
      for (let k = 0; k < count; k++) {
        const w = rng.range(16, 30);
        const dep = rng.range(16, 30);
        const h = d.style === 'neon' ? rng.range(18, 46) : d.style === 'suburb' ? rng.range(6, 12) : d.style === 'industrial' ? rng.range(8, 16) : rng.range(10, 30);
        const ox = (k % 2 === 0 ? -1 : 1) * rng.range(4, 14);
        const oz = (k < 2 ? -1 : 1) * rng.range(4, 14);
        const x = cx + ox; const z = cz + oz;
        const tint = new THREE.Color(d.tint).offsetHSL(0, 0, rng.range(-0.06, 0.08));
        placements.push({ x, z, w, h, dep, tint });
        roofPlacements.push({ x, z, w: w + 1, h: 0.6, dep: dep + 1, y: h });
        colliders.push({ x0: x - w / 2, z0: z - dep / 2, x1: x + w / 2, z1: z + dep / 2 });
        buildings.push({ x, z, w, h, dep, district: d.id });
      }
    }
  }
  const bMesh = new THREE.InstancedMesh(bGeo, bMat, placements.length);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const s3 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  placements.forEach((b, idx) => {
    p3.set(b.x, 0, b.z);
    s3.set(b.w, b.h, b.dep);
    m4.compose(p3, q0, s3);
    bMesh.setMatrixAt(idx, m4);
    bMesh.setColorAt(idx, b.tint);
  });
  bMesh.castShadow = true;
  bMesh.receiveShadow = true;
  group.add(bMesh);
  const roofMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.95 }),
    roofPlacements.length,
  );
  roofPlacements.forEach((b, idx) => {
    p3.set(b.x, b.y, b.z);
    s3.set(b.w, b.h, b.dep);
    m4.compose(p3, q0, s3);
    roofMesh.setMatrixAt(idx, m4);
  });
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // ---- palms (instanced trunks + fronds) ----
  const palmSpots = [];
  for (let i = 0; i < 130; i++) {
    const bx = rng.int(-4, 4) * CITY.pitch;
    const bz = rng.int(-4, 4) * CITY.pitch;
    const edge = rng.pick([0, 1, 2, 3]);
    let x = bx; let z = bz;
    if (edge === 0) { x += rng.range(-36, 36); z -= 38; }
    if (edge === 1) { x += rng.range(-36, 36); z += 38; }
    if (edge === 2) { x -= 38; z += rng.range(-36, 36); }
    if (edge === 3) { x += 38; z += rng.range(-36, 36); }
    if (Math.abs(x - CITY.canalX) < 14) continue;
    palmSpots.push({ x, z, s: rng.range(0.8, 1.4) });
  }
  for (let x = -380; x <= 380; x += 26) palmSpots.push({ x: x + rng.range(-6, 6), z: 424, s: rng.range(1.0, 1.5) });
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.35, 0.5, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }),
    palmSpots.length,
  );
  const frondGeo = new THREE.ConeGeometry(1.1, 5.5, 4);
  frondGeo.translate(0, 2.4, 0);
  frondGeo.scale(1, 1, 0.18);
  const frondMesh = new THREE.InstancedMesh(
    frondGeo,
    new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9, side: THREE.DoubleSide }),
    palmSpots.length * 6,
  );
  const eul = new THREE.Euler();
  palmSpots.forEach((p, idx) => {
    q0.identity(); // q0 is shared with the frond loop below — a trunk must
    p3.set(p.x, 3.5 * p.s, p.z); // never inherit the previous palm's tilt.
    s3.set(p.s, p.s, p.s);
    m4.compose(p3, q0, s3);
    trunkMesh.setMatrixAt(idx, m4);
    for (let f = 0; f < 6; f++) {
      eul.set(0.9 + rng.range(-0.15, 0.15), (f / 6) * Math.PI * 2 + rng.range(-0.2, 0.2), 0, 'YXZ');
      q0.setFromEuler(eul);
      p3.set(p.x, 7 * p.s, p.z);
      s3.set(p.s, p.s, p.s);
      m4.compose(p3, q0, s3);
      frondMesh.setMatrixAt(idx * 6 + f, m4);
    }
  });
  q0.identity();
  trunkMesh.castShadow = true;
  frondMesh.castShadow = true;
  group.add(trunkMesh);
  group.add(frondMesh);

  // ---- street lamps (instanced) ----
  const lampSpots = [];
  for (const L of LINES) {
    for (let t = -360; t <= 360; t += 90) {
      if (L === CITY.canalX) continue;
      lampSpots.push({ x: L + 11, z: t });
      lampSpots.push({ x: t, z: L + 11 });
    }
  }
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.22, 7, 5),
    new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.7, metalness: 0.4 }),
    lampSpots.length,
  );
  const headMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.55, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd166, emissiveIntensity: 1.6 }),
    lampSpots.length,
  );
  lampSpots.forEach((p, idx) => {
    p3.set(p.x, 3.5, p.z); s3.set(1, 1, 1);
    m4.compose(p3, q0, s3);
    poleMesh.setMatrixAt(idx, m4);
    p3.set(p.x, 7.1, p.z);
    m4.compose(p3, q0, s3);
    headMesh.setMatrixAt(idx, m4);
  });
  group.add(poleMesh);
  group.add(headMesh);

  // ---- containers in the Foundry ----
  const contColors = [0xc94f4f, 0x4f7fc9, 0x6f9e5a, 0xd9a44f];
  const contMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(6, 2.6, 2.4),
    new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2 }),
    36,
  );
  for (let i = 0; i < 36; i++) {
    const bx = rng.int(3, 4) * CITY.pitch + rng.range(-24, 24);
    const bz = rng.int(-4, -1) * CITY.pitch + rng.range(-24, 24);
    eul.set(0, rng.pick([0, Math.PI / 2]), 0);
    q0.setFromEuler(eul);
    p3.set(bx, 1.3 + (i % 3 === 0 ? 2.6 : 0), bz);
    s3.set(1, 1, 1);
    m4.compose(p3, q0, s3);
    contMesh.setMatrixAt(i, m4);
    contMesh.setColorAt(i, new THREE.Color(contColors[i % 4]));
    if (i % 3 !== 0) colliders.push({ x0: bx - 3, z0: bz - 1.5, x1: bx + 3, z1: bz + 1.5 });
  }
  q0.identity();
  contMesh.castShadow = true;
  group.add(contMesh);

  // ---- landmarks ----
  function landmarkBuilding(x, z, w, h, dep, color, signText, signSub, signColor) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    if (signText) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.9, 34), Math.min(w * 0.28, 10)),
        new THREE.MeshBasicMaterial({ map: signTexture(signText, signSub, signColor, '#14101e'), transparent: false }),
      );
      sign.position.set(x, h * 0.72, z - dep / 2 - 0.3);
      sign.rotation.y = Math.PI;
      group.add(sign);
      const sign2 = sign.clone();
      sign2.position.z = z + dep / 2 + 0.3;
      sign2.rotation.y = 0;
      group.add(sign2);
    }
    colliders.push({ x0: x - w / 2, z0: z - dep / 2, x1: x + w / 2, z1: z + dep / 2 });
    return b;
  }
  // Solarium Casino — the heist target, north-center.
  landmarkBuilding(0, -315, 56, 30, 44, 0x5a2d5e, 'SOLARIUM', 'CASINO • MERIDIAN CAY', '#ffd166');
  // Safehouse — Palmetto Rows.
  landmarkBuilding(0, 315, 22, 9, 18, 0xe8e0d0, 'SAFEHOUSE', 'ROOK\'S PLACE', '#7ee787');
  // Sunset Auto Body — spray shop, Foundry.
  landmarkBuilding(315, -135, 26, 10, 22, 0x4da6ff, 'SUNSET AUTO', 'RESPRAY • NO QUESTIONS', '#ffffff');
  // Billboards on the Strip.
  const bb1 = new THREE.Mesh(new THREE.PlaneGeometry(24, 8),
    new THREE.MeshBasicMaterial({ map: signTexture('CAY FM 88.5', 'SUNSET DRIVE ALL DAY', '#7ee7e2', '#101418') }));
  bb1.position.set(-90, 26, -225);
  group.add(bb1);
  const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(24, 8),
    new THREE.MeshBasicMaterial({ map: signTexture('SOLAR 101', 'NIGHT PULSE', '#ff9ad5', '#101418') }));
  bb2.position.set(90, 24, -135);
  bb2.rotation.y = Math.PI / 2;
  group.add(bb2);

  // ---- collision helpers ----
  function resolveCircle(x, z, r) {
    // Map bounds. South edge reaches the pier end (z 548); the sea itself
    // is blocked by the water check in player.js, not by this clamp.
    x = clamp(x, -460, 460);
    z = clamp(z, -460, 548);
    for (const c of colliders) {
      if (c.canal) {
        // The canal blocks crossing except on a lowered bridge deck.
        const onBridge = bridges.some((b) => b.angle < 0.25 && Math.abs(z - b.z) < 9);
        if (onBridge) continue;
        if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) {
          const pushL = (x + r) - c.x0;
          const pushR = c.x1 - (x - r);
          x = pushL < pushR ? c.x0 - r : c.x1 + r;
        }
        continue;
      }
      const nx = clamp(x, c.x0, c.x1);
      const nz = clamp(z, c.z0, c.z1);
      const dx = x - nx; const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Center inside the box: push out along the smallest penetration.
          const pl = x - c.x0 + r; const pr = c.x1 - x + r;
          const pt = z - c.z0 + r; const pb = c.z1 - z + r;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.x0 - r;
          else if (m === pr) x = c.x1 + r;
          else if (m === pt) z = c.z0 - r;
          else z = c.z1 + r;
        }
      }
    }
    return { x, z };
  }

  function isWater(x, z) {
    if (z > CITY.waterZ) return true;
    if (Math.abs(x - CITY.canalX) < 9 && z > -414 && z < 414) {
      return !bridges.some((b) => b.angle < 0.25 && Math.abs(z - b.z) < 9);
    }
    return false;
  }

  return {
    group,
    colliders,
    buildings,
    roadLines: LINES,
    landmarks: {
      casino: { x: 0, z: -315 },
      safehouse: { x: 0, z: 315 },
      sprayShop: { x: 315, z: -135 },
      pier: { x: 0, z: 500 },
      harborMeet: { x: -315, z: -45 },
    },
    bridges,
    resolveCircle,
    isWater,
    sunLight,
    nextLiftIn() { return Math.max(0, bridgeClock); },
    liftingBridge() { return bridges.find((b) => b.lifting) || null; },
    update(dt, focusX, focusZ) {
      // Bridge schedule: one bridge lifts every bridgeCycleSec, stays up 30s.
      bridgeClock -= dt;
      if (bridgeClock <= 0) {
        const b = bridges[nextBridge % bridges.length];
        b.lifting = true;
        b.liftT = 0;
        nextBridge++;
        bridgeClock = CITY.bridgeCycleSec;
      }
      for (const b of bridges) {
        if (!b.lifting) {
          b.angle = Math.max(0, b.angle - dt * 0.25);
        } else {
          b.liftT += dt;
          const up = Math.min(1, b.liftT / 8);
          const down = b.liftT > CITY.bridgeLiftSec ? Math.min(1, (b.liftT - CITY.bridgeLiftSec) / 8) : 0;
          b.angle = (up - down) * 1.1;
          if (down >= 1) { b.lifting = false; b.angle = 0; }
        }
        b.pivot.rotation.z = -b.angle;
      }
      // Shadow camera follows the player for crisp shadows.
      sunLight.position.set(focusX - 300, 420, focusZ - 260);
      sunLight.target.position.set(focusX, 0, focusZ);
      sunLight.target.updateMatrixWorld();
    },
  };
}
