// The HUD: wanted stars, cash, health, speed, clock, street name,
// objective banner, phone calls, context prompts — and the round minimap
// that shows the roads, the player, the waypoint and the cops.
import { districtAt, streetNameAt } from './city.js';
import { carSpeed } from './vehicles.js';

let el = {};
let minimapCtx = null;

export function initHud() {
  const ids = ['stars', 'cash', 'health-fill', 'health-text', 'speed', 'clock', 'street',
    'objective', 'banner', 'phone', 'phone-from', 'phone-text', 'prompt', 'vignette',
    'wanted-flash', 'stats-line'];
  for (const id of ids) el[id] = document.getElementById(`hud-${id}`);
  const minimap = document.getElementById('minimap');
  minimapCtx = minimap ? minimap.getContext('2d') : null;
}

function formatClock(timeOfDay) {
  const h = Math.floor(timeOfDay) % 24;
  const m = Math.floor((timeOfDay % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawMinimap(state) {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const S = 180;
  const range = 1500; // world px across the minimap
  const scale = S / range;
  const px = state.player.car ? state.player.car.x : state.player.x;
  const py = state.player.car ? state.player.car.y : state.player.y;
  const toMap = (x, y) => [(x - px) * scale + S / 2, (y - py) * scale + S / 2];

  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.clip();
  // Ground: light enough to read at a glance.
  ctx.fillStyle = '#6E6A55';
  ctx.fillRect(0, 0, S, S);
  // Ocean.
  if (px - range / 2 < 240) {
    const [ox] = toMap(240, 0);
    ctx.fillStyle = '#1B7F8E';
    ctx.fillRect(0, 0, Math.max(0, ox), S);
    ctx.fillStyle = '#F2D8A7';
    const [bx] = toMap(480, 0);
    ctx.fillRect(Math.max(0, ox), 0, Math.max(0, bx - ox), S);
  }
  // Roads.
  ctx.strokeStyle = '#D8D8C4';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (const road of state.city.roads) {
    const [x1, y1] = toMap(road.x1, road.y1);
    const [x2, y2] = toMap(road.x2, road.y2);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Buildings as blocks.
  ctx.fillStyle = '#8A8570';
  for (const b of state.city.buildings) {
    const [x, y] = toMap(b.x, b.y);
    const w = b.w * scale;
    const h = b.h * scale;
    if (x > -20 && y > -20 && x < S + 20 && y < S + 20) ctx.fillRect(x, y, Math.max(2, w), Math.max(2, h));
  }
  // Waypoint blip (pulsing magenta).
  const wp = state.waypoint;
  if (wp) {
    const [x, y] = toMap(wp.x, wp.y);
    const pulse = 5 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = '#FF2E88';
    ctx.beginPath();
    ctx.arc(Math.max(6, Math.min(S - 6, x)), Math.max(6, Math.min(S - 6, y)), pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Cop blips flash red/blue.
  const copColor = Math.floor(state.time * 4) % 2 === 0 ? '#FF3B30' : '#3B82FF';
  ctx.fillStyle = copColor;
  for (const car of state.cars) {
    if (!car.isCop || car.dead) continue;
    const [x, y] = toMap(car.x, car.y);
    if (x < 0 || y < 0 || x > S || y > S) continue;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Safehouse + respray markers.
  ctx.fillStyle = '#7ED491';
  for (const key of ['safehouse', 'respray']) {
    const lm = state.city.landmarks[key];
    const [x, y] = toMap(lm.x, lm.y);
    if (x < 4 || y < 4 || x > S - 4 || y > S - 4) continue;
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  // Player arrow, large enough to find at a glance.
  const angle = state.player.car ? state.player.car.angle : state.player.angle;
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, -7);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#23232E';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Rim.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
}

export function updateHud(state) {
  const p = state.player;
  const stars = state.wanted.stars;
  if (el.stars) {
    el.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    el.stars.classList.toggle('hot', stars >= 3);
  }
  if (el.cash) el.cash.textContent = `$${p.cash.toLocaleString('en-US')}`;
  if (el['health-fill']) el['health-fill'].style.width = `${Math.max(0, p.hp)}%`;
  if (el['health-text']) el['health-text'].textContent = `${Math.ceil(p.hp)}`;
  if (el.speed) {
    const kmh = p.car ? Math.round(carSpeed(p.car) * 0.22) : 0;
    el.speed.textContent = p.car ? `${kmh} km/h` : '';
  }
  if (el.clock) el.clock.textContent = formatClock(state.timeOfDay);
  if (el.street) {
    const d = districtAt(p.x, p.y);
    el.street.textContent = `${streetNameAt(p.x, p.y)} · ${d.name}`;
  }
  if (el.objective) el.objective.textContent = state.objectiveText || '';
  if (el.banner) {
    if (state.mission.banner) {
      el.banner.textContent = state.mission.banner;
      el.banner.classList.add('show');
    } else {
      el.banner.classList.remove('show');
    }
  }
  if (el.phone) {
    if (state.phone) {
      el.phone.classList.add('show');
      if (el['phone-from']) el['phone-from'].textContent = state.phone.from;
      if (el['phone-text']) el['phone-text'].textContent = state.phone.text;
    } else {
      el.phone.classList.remove('show');
    }
  }
  if (el.prompt) {
    el.prompt.textContent = state.prompt || '';
    el.prompt.classList.toggle('show', !!state.prompt);
  }
  if (el.vignette) {
    el.vignette.style.opacity = p.hitFlash > 0 ? String(Math.min(0.7, p.hitFlash)) : '0';
    if (p.hp <= 25) el.vignette.style.opacity = '0.45';
  }
  if (el['wanted-flash']) {
    el['wanted-flash'].classList.toggle('show', stars > 0 && Math.floor(state.time * 2) % 2 === 0);
  }
  if (el['stats-line']) {
    el['stats-line'].textContent = `Missions ${state.stats.missions}/5 · Packages ${state.stats.packages}/10 · Fares ${state.stats.fares}`;
  }
  drawMinimap(state);
}
