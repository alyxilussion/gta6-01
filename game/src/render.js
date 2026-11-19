// The renderer: a top-down canvas view of Solmar Bay with a smooth
// follow camera, golden-hour lighting, long building shadows, neon that
// switches on at dusk, and a painted skyline behind the title screen.
import { AVENUES, CAMERA, PALETTE, STREETS, WORLD } from './config.js';
import { DISTRICTS } from './city.js';

let viewW = 1280;
let viewH = 720;
let dpr = 1;

export function initRenderer(canvas) {
  resize(canvas);
  window.addEventListener('resize', () => resize(canvas));
}

export function resize(canvas) {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
}

export function viewSize() {
  return { w: viewW, h: viewH };
}

// Time-of-day lighting: overlay tint, shadow length, whether neon/lamps glow.
export function lightingFor(timeOfDay) {
  const t = ((timeOfDay % 24) + 24) % 24;
  if (t < 5.5 || t >= 21) return { overlay: 'rgba(12,12,42,0.42)', shadow: 4, night: 1, neon: true };
  if (t < 6.5) return { overlay: 'rgba(80,50,90,0.22)', shadow: 14, night: 0.4, neon: true };
  if (t < 16.5) return { overlay: 'rgba(255,240,200,0.04)', shadow: 6, night: 0, neon: false };
  if (t < 19) return { overlay: 'rgba(255,130,50,0.13)', shadow: 16, night: 0.1, neon: true };
  if (t < 20.5) return { overlay: 'rgba(70,30,100,0.28)', shadow: 10, night: 0.6, neon: true };
  return { overlay: 'rgba(30,20,70,0.38)', shadow: 6, night: 0.9, neon: true };
}

export function updateCamera(state, dt) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const vx = p.car ? p.car.vx : (p.vx || 0);
  const vy = p.car ? p.car.vy : (p.vy || 0);
  const cam = state.camera;
  const tx = px + vx * CAMERA.lookahead;
  const ty = py + vy * CAMERA.lookahead;
  const k = 1 - Math.exp(-CAMERA.smoothing * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const speed = Math.hypot(vx, vy);
  const targetZoom = p.car ? 1 - (1 - CAMERA.driveZoomOut) * Math.min(1, speed / 520) : 1;
  cam.zoom += (targetZoom - cam.zoom) * k;
  const hw = viewW / 2 / cam.zoom;
  const hh = viewH / 2 / cam.zoom;
  cam.x = Math.max(hw - 100, Math.min(WORLD.width - hw + 100, cam.x));
  cam.y = Math.max(hh - 100, Math.min(WORLD.height - hh + 100, cam.y));
}

export function screenToWorld(state, sx, sy) {
  const cam = state.camera;
  return {
    x: (sx - viewW / 2) / cam.zoom + cam.x,
    y: (sy - viewH / 2) / cam.zoom + cam.y,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inView(cam, x, y, margin) {
  const hw = viewW / 2 / cam.zoom + margin;
  const hh = viewH / 2 / cam.zoom + margin;
  return x > cam.x - hw && x < cam.x + hw && y > cam.y - hh && y < cam.y + hh;
}

function drawCarShape(ctx, car, time, night) {
  const L = car.length;
  const W = car.width;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 7);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#14141A';
  for (const [wx, wy] of [[-L / 2 + 8, -W / 2 - 2], [-L / 2 + 8, W / 2 - 4], [L / 2 - 14, -W / 2 - 2], [L / 2 - 14, W / 2 - 4]]) {
    ctx.fillRect(wx, wy, 10, 6);
  }
  // Body.
  ctx.fillStyle = car.dead ? '#2A2A30' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Cop livery: white doors.
  if (car.isCop && !car.dead) {
    ctx.fillStyle = '#E8E8E8';
    ctx.fillRect(-6, -W / 2 + 1, 14, W - 2);
  }
  // Windshield + rear window.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, L / 2 - 17, -W / 2 + 4, 9, W - 8, 2);
  ctx.fill();
  roundRect(ctx, -L / 2 + 7, -W / 2 + 4, 8, W - 8, 2);
  ctx.fill();
  // Roof.
  ctx.fillStyle = car.dead ? '#22222A' : car.color;
  roundRect(ctx, -8, -W / 2 + 3, 18, W - 6, 3);
  ctx.fill();
  // Taxi sign / spoiler / limo sunroof.
  if (car.isTaxi) {
    ctx.fillStyle = '#FFF3B0';
    ctx.fillRect(-4, -4, 9, 8);
    ctx.fillStyle = '#23232E';
    ctx.font = 'bold 6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0.5, 2);
  }
  if (car.kind === 'sports') {
    ctx.fillStyle = '#14141A';
    ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 4, W - 4);
  }
  if (car.kind === 'limo') {
    ctx.fillStyle = 'rgba(20,30,45,0.7)';
    ctx.fillRect(-20, -W / 2 + 5, 10, W - 10);
  }
  // Headlights at night.
  if (night > 0.3 && !car.dead) {
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 4);
    ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 4);
  }
  // Cop light bar, alternating red/blue.
  if (car.isCop && !car.dead) {
    const phase = Math.floor(time * 5) % 2 === 0;
    ctx.fillStyle = phase ? '#FF3B30' : '#3B82FF';
    ctx.fillRect(-3, -W / 2 + 2, 7, 5);
    ctx.fillStyle = phase ? '#3B82FF' : '#FF3B30';
    ctx.fillRect(-3, W / 2 - 7, 7, 5);
  }
  // Damage: scorch marks when hurt.
  if (car.hp < 45 && !car.dead) {
    ctx.fillStyle = 'rgba(20,20,20,0.45)';
    roundRect(ctx, -L / 2 + 2, -W / 2 + 2, L * 0.4, W - 4, 4);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, skin, walkPhase, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (opts.down) {
    // Lying down: a still ellipse.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 7, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 12, Math.sin(angle) * 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(walkPhase) * 1.5;
  // Legs.
  ctx.fillStyle = '#23232E';
  ctx.beginPath();
  ctx.arc(-3 + bob * 0.4, 5, 3.4, 0, Math.PI * 2);
  ctx.arc(3 - bob * 0.4, 5, 3.4, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * 2, Math.sin(angle) * 2 - 1, 5.5, 0, Math.PI * 2);
  ctx.fill();
  if (opts.hat) {
    ctx.fillStyle = '#1E3A8A';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 2, Math.sin(angle) * 2 - 2, 6, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  if (opts.gun) {
    ctx.strokeStyle = '#14141A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
    ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPalm(ctx, x, y, s, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(2, 3);
  ctx.lineTo(6, 8);
  ctx.stroke();
  ctx.strokeStyle = '#6A4A2A';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(2, -6);
  ctx.stroke();
  const sway = Math.sin(time * 0.7 + x * 0.01) * 0.08;
  ctx.strokeStyle = '#2E7D4F';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + sway;
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.quadraticCurveTo(2 + Math.cos(a) * 10, -6 + Math.sin(a) * 10 - 3, 2 + Math.cos(a) * 15, -6 + Math.sin(a) * 15 + 4);
    ctx.stroke();
  }
  ctx.restore();
}

export function render(state) {
  const canvas = state.canvas;
  const ctx = state.ctx;
  const cam = state.camera;
  const city = state.city;
  const time = state.time;
  const light = lightingFor(state.timeOfDay);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.oceanDeep;
  ctx.fillRect(0, 0, viewW, viewH);

  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(viewW / 2 + shakeX, viewH / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // Ocean with slow wave lines.
  const oceanGrad = ctx.createLinearGradient(0, 0, WORLD.oceanEdge, 0);
  oceanGrad.addColorStop(0, '#0F5A66');
  oceanGrad.addColorStop(1, '#2AA5B5');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(cam.x - viewW, 0, WORLD.oceanEdge + viewW, WORLD.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let y = 40; y < WORLD.height; y += 130) {
    const wobble = Math.sin(time * 0.6 + y * 0.05) * 8;
    ctx.beginPath();
    ctx.moveTo(30 + wobble, y);
    ctx.lineTo(210 + wobble, y + 14);
    ctx.stroke();
  }
  // Beach sand.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.oceanEdge, 0, WORLD.beachEdge - WORLD.oceanEdge, WORLD.height);
  ctx.fillStyle = 'rgba(180,150,90,0.35)';
  for (let y = 90; y < WORLD.height; y += 210) {
    ctx.beginPath();
    ctx.ellipse(330, y, 60, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Boardwalk strip.
  ctx.fillStyle = '#C9A876';
  ctx.fillRect(WORLD.beachEdge - 8, 0, 26, WORLD.height);

  // Ground: district tints, so each part of the city has its own colour.
  ctx.fillStyle = '#B8B2A4';
  ctx.fillRect(WORLD.beachEdge, 0, WORLD.width - WORLD.beachEdge, WORLD.height);
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }

  // Blocks (sidewalk slabs between roads).
  ctx.fillStyle = PALETTE.sidewalk;
  const xB = [WORLD.beachEdge];
  for (const ax of AVENUES) xB.push(ax - WORLD.roadWidthV / 2, ax + WORLD.roadWidthV / 2);
  xB.push(WORLD.width);
  const yB = [0];
  for (const sy of STREETS) yB.push(sy - WORLD.roadWidthH / 2, sy + WORLD.roadWidthH / 2);
  yB.push(WORLD.height);
  for (let i = 0; i + 1 < xB.length; i += 2) {
    for (let j = 0; j + 1 < yB.length; j += 2) {
      ctx.fillRect(xB[i] + 3, yB[j] + 3, xB[i + 1] - xB[i] - 6, yB[j + 1] - yB[j] - 6);
    }
  }
  // Roads.
  for (const road of city.roads) {
    ctx.fillStyle = PALETTE.asphalt;
    if (road.vertical) {
      ctx.fillRect(road.x1 - 60, 0, 120, WORLD.height);
    } else {
      ctx.fillRect(WORLD.beachEdge, road.y1 - 55, WORLD.width - WORLD.beachEdge, 110);
    }
  }
  // Centre dashes.
  ctx.strokeStyle = 'rgba(255,220,120,0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (const road of city.roads) {
    ctx.beginPath();
    ctx.moveTo(road.x1, road.y1);
    ctx.lineTo(road.x2, road.y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections in view.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const node of city.graph.nodes) {
    if (!inView(cam, node.x, node.y, 80)) continue;
    for (let i = -2; i <= 2; i += 1) {
      ctx.fillRect(node.x - 52 + i * 22, node.y - 68, 10, 16);
      ctx.fillRect(node.x - 52 + i * 22, node.y + 52, 10, 16);
    }
  }

  // Skid marks.
  for (const s of state.skids) {
    if (!inView(cam, s.x, s.y, 20)) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillStyle = `rgba(20,20,24,${Math.min(0.55, s.life / 6 * 0.55)})`;
    ctx.fillRect(-9, -2, 18, 4);
    ctx.restore();
  }

  // Buildings with height: shadow, side faces, roof, rooftop detail.
  for (const b of city.buildings) {
    if (!inView(cam, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
    const sh = b.height * light.shadow;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + sh * 0.7, b.y + sh * 0.5, b.w, b.h);
    // South + east faces (fake extrusion).
    ctx.fillStyle = shade(b.color, -28);
    ctx.fillRect(b.x, b.y + b.h, b.w, b.height * 3);
    ctx.fillStyle = shade(b.color, -16);
    ctx.fillRect(b.x + b.w, b.y, b.height * 3, b.h);
    // Roof.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // Rooftop detail.
    if (b.roof === 'ac') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, 14, 10);
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, 14, 10);
    } else if (b.roof === 'helipad') {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `bold ${Math.min(b.w, b.h) * 0.3}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', b.x + b.w / 2, b.y + b.h / 2);
    }
    // Windows on tall buildings: rows of lit dots at night.
    if (b.height >= 4) {
      ctx.fillStyle = light.night > 0.4 ? 'rgba(255,220,120,0.85)' : 'rgba(255,255,255,0.35)';
      for (let wx = b.x + 10; wx < b.x + b.w - 6; wx += 16) {
        for (let wy = b.y + 10; wy < b.y + b.h - 6; wy += 16) {
          if ((wx * 7 + wy * 13) % 5 < 3) ctx.fillRect(wx, wy, 5, 5);
        }
      }
    }
  }

  // Containers.
  for (const c of city.containers) {
    if (!inView(cam, c.x, c.y, 60)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(c.x + 4, c.y + 5, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(c.x + (c.w / 4) * i, c.y);
      ctx.lineTo(c.x + (c.w / 4) * i, c.y + c.h);
      ctx.stroke();
    }
  }

  // Landmark pads: safehouse, garage, respray.
  drawLandmarkPad(ctx, city.landmarks.safehouse, '#7ED491', 'SAFEHOUSE', time);
  drawLandmarkPad(ctx, city.landmarks.garage, '#FFC53D', 'GARAGE', time);
  drawLandmarkPad(ctx, city.landmarks.respray, '#3AE8C9', "PAY 'N SPRAY", time);

  // Waypoint beam + ring.
  const wp = state.waypoint;
  if (wp) {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    const grad = ctx.createLinearGradient(wp.x, wp.y - 320, wp.x, wp.y);
    grad.addColorStop(0, 'rgba(255,46,136,0)');
    grad.addColorStop(1, 'rgba(255,46,136,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(wp.x - 14, wp.y - 320, 28, 320);
    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(wp.x, wp.y, 46 * pulse, 20 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,46,136,0.25)';
    ctx.beginPath();
    ctx.ellipse(wp.x, wp.y, 46 * pulse, 20 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hidden packages.
  for (const pkg of state.packages) {
    if (pkg.taken || !inView(cam, pkg.x, pkg.y, 40)) continue;
    const pulse = 1 + Math.sin(time * 5 + pkg.x) * 0.2;
    ctx.save();
    ctx.translate(pkg.x, pkg.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.gold;
    ctx.shadowColor = PALETTE.gold;
    ctx.shadowBlur = 18;
    const s = 10 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  // Palms.
  for (const palm of city.palms) {
    if (inView(cam, palm.x, palm.y, 30)) drawPalm(ctx, palm.x, palm.y, palm.s, time);
  }

  // Neon signs (glow at dusk/night, plain boards by day).
  for (const sign of city.neonSigns) {
    if (!inView(cam, sign.x, sign.y, 60)) continue;
    ctx.save();
    ctx.translate(sign.x, sign.y);
    ctx.fillStyle = '#1A1A22';
    ctx.fillRect(-sign.w / 2, -9, sign.w, 18);
    if (light.neon) {
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = sign.color;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sign.text, 0, 0);
    ctx.restore();
  }
  ctx.shadowBlur = 0;

  // Lamps.
  ctx.fillStyle = '#3A3A44';
  for (const lamp of city.lamps) {
    if (inView(cam, lamp.x, lamp.y, 20)) ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
  }

  // Cars.
  for (const car of state.cars) {
    if (inView(cam, car.x, car.y, 80)) drawCarShape(ctx, car, time, light.night);
  }

  // Peds, thugs, foot cops.
  for (const ped of state.peds) {
    if (!inView(cam, ped.x, ped.y, 30)) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase,
      { down: ped.state === 'down' || ped.state === 'dead' });
  }
  for (const thug of state.thugs) {
    if (!inView(cam, thug.x, thug.y, 30)) continue;
    drawPerson(ctx, thug.x, thug.y, thug.angle, thug.shirt, '#C98A5E', time * 6,
      { down: thug.hp <= 0, gun: thug.hp > 0 });
  }
  for (const cop of state.footCops) {
    if (!inView(cam, cop.x, cop.y, 30)) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1E3A8A', '#E8B088', cop.walkPhase,
      { down: cop.hp <= 0, gun: cop.hp > 0, hat: cop.hp > 0 });
  }

  // The player (on foot only — in a car, the car is the player).
  const p = state.player;
  if (!p.car && p.hp > 0) {
    drawPerson(ctx, p.x, p.y, p.angle, PALETTE.coral, '#E8B088', p.walkPhase || 0, { gun: true });
    // Aim line, subtle.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
    ctx.lineTo(p.x + Math.cos(p.angle) * 60, p.y + Math.sin(p.angle) * 60);
    ctx.stroke();
  }

  // Bullets as tracers.
  ctx.strokeStyle = 'rgba(255,230,140,0.9)';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Particles.
  for (const part of state.particles) {
    const a = Math.max(0, part.life / part.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = part.color;
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Flashes.
  for (const f of state.flashes) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Time-of-day tint.
  ctx.fillStyle = light.overlay;
  ctx.fillRect(0, 0, viewW, viewH);

  // Lamp + neon glows punch through the dark (additive).
  if (light.night > 0.3) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    for (const lamp of city.lamps) {
      if (!inView(cam, lamp.x, lamp.y, 60)) continue;
      const g = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 70);
      g.addColorStop(0, 'rgba(255,220,130,0.20)');
      g.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 70, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Vignette.
  const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.45, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,5,20,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawLandmarkPad(ctx, lm, color, label, time) {
  const pulse = 0.6 + Math.sin(time * 2.5) * 0.15;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.arc(lm.x, lm.y, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle = color;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, lm.x, lm.y - 54);
}

// Darken a hex color by `amount` (negative) for building side faces.
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

// The title screen's painted backdrop: sunset sky, sun, skyline, palms,
// ocean band. Drawn on the main canvas behind the title DOM.
export function drawTitleBackdrop(ctx, w, h, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2B1B4E');
  sky.addColorStop(0.45, '#B83A6B');
  sky.addColorStop(0.7, '#FF6B4A');
  sky.addColorStop(0.85, '#FFC53D');
  sky.addColorStop(1, '#F2D8A7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Sun.
  const sunY = h * 0.62;
  const sunG = ctx.createRadialGradient(w * 0.68, sunY, 10, w * 0.68, sunY, 190);
  sunG.addColorStop(0, 'rgba(255,230,150,0.95)');
  sunG.addColorStop(0.35, 'rgba(255,197,61,0.75)');
  sunG.addColorStop(1, 'rgba(255,197,61,0)');
  ctx.fillStyle = sunG;
  ctx.beginPath();
  ctx.arc(w * 0.68, sunY, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF3C4';
  ctx.beginPath();
  ctx.arc(w * 0.68, sunY, 52, 0, Math.PI * 2);
  ctx.fill();
  // Skyline silhouettes (seeded, stable).
  let seed = 42;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.fillStyle = '#241640';
  let x = 0;
  while (x < w) {
    const bw = 46 + rnd() * 90;
    const bh = h * (0.16 + rnd() * 0.3);
    ctx.fillRect(x, h * 0.78 - bh, bw, bh + h * 0.22);
    // Lit windows.
    ctx.fillStyle = 'rgba(255,220,120,0.8)';
    for (let wy = h * 0.78 - bh + 12; wy < h * 0.76; wy += 18) {
      for (let wx = x + 8; wx < x + bw - 8; wx += 16) {
        if (rnd() < 0.35) ctx.fillRect(wx, wy, 5, 7);
      }
    }
    ctx.fillStyle = '#241640';
    x += bw + 6;
  }
  // Ocean band.
  const sea = ctx.createLinearGradient(0, h * 0.86, 0, h);
  sea.addColorStop(0, '#E84393');
  sea.addColorStop(1, '#2B1B4E');
  ctx.fillStyle = sea;
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i += 1) {
    const y = h * (0.88 + i * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + Math.sin(time * 0.5 + i) * 3);
    ctx.stroke();
  }
  // Palm silhouettes.
  ctx.fillStyle = '#1A1030';
  for (const px of [w * 0.08, w * 0.16, w * 0.9]) {
    ctx.save();
    ctx.translate(px, h * 0.88);
    ctx.fillRect(-3, -70, 6, 70);
    ctx.strokeStyle = '#1A1030';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, -70);
      ctx.quadraticCurveTo(Math.cos(a) * 26, -70 + Math.sin(a) * 20 - 12, Math.cos(a) * 44, -70 + Math.sin(a) * 26 + 10);
      ctx.stroke();
    }
    ctx.restore();
  }
}
