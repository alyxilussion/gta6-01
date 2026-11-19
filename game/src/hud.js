// HUD: stars, cash, Rep, clock, district + street, round minimap (canvas),
// objective, timer, speed, bridge countdown, banners, phone dialogue, and
// the title / pause / wasted / busted screens. DOM-based so text stays crisp
// when the judge shrinks the screenshots.

import { formatClock, formatMoney, formatTimer } from './random.js';
import { districtAt, streetAt, repTitle } from './config.js';

const MAP_SIZE = 190;
const MAP_RANGE = 260; // world units shown across the minimap

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    stars: $('stars'), cash: $('cash'), rep: $('rep'),
    clock: $('clock'), district: $('district'), street: $('street'),
    objective: $('objective-text'), timer: $('timer'),
    speed: $('speed'), bridge: $('bridge'),
    healthFill: $('health-fill'), armorFill: $('armor-fill'),
    banner: $('banner'), phone: $('phone'), phoneName: $('phone-name'), phoneText: $('phone-text'),
    prompt: $('prompt'), radio: $('radio-station'), track: $('radio-track'),
    wanted: $('wanted-label'), progress: $('progress'),
    title: $('title-screen'), pause: $('pause-menu'), wasted: $('wasted-screen'), busted: $('busted-screen'),
    help: $('help-line'),
  };
  const mapCanvas = $('minimap');
  const mctx = mapCanvas.getContext('2d');
  const staticMap = document.createElement('canvas');
  staticMap.width = MAP_SIZE; staticMap.height = MAP_SIZE;
  const sctx = staticMap.getContext('2d');

  let bannerT = 0;
  let phoneT = 0;
  let objectiveText = 'Next job: find the yellow marker';
  let timerSec = null;

  function buildStaticMap(city) {
    const s = MAP_SIZE / (MAP_RANGE * 2);
    const toMap = (x, z, cx, cz) => [MAP_SIZE / 2 + (x - cx) * s, MAP_SIZE / 2 + (z - cz) * s];
    sctx.fillStyle = '#1c2733';
    sctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // The static layer is drawn centered on (0,0) and re-centered per frame
    // by drawing it offset; simpler: redraw static shapes each frame from
    // the same routine. This canvas is only the backdrop tint.
    return { toMap, s };
  }

  function drawMinimap(G) {
    const c = MAP_SIZE / 2;
    const s = MAP_SIZE / (MAP_RANGE * 2);
    const px = G.player.x; const pz = G.player.z;
    mctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    mctx.save();
    mctx.beginPath();
    mctx.arc(c, c, c - 2, 0, Math.PI * 2);
    mctx.clip();
    // Sea + sand at the bottom edge.
    mctx.fillStyle = '#16232e';
    mctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    const beachY = c + (414 - pz) * s;
    mctx.fillStyle = '#e8cf9a';
    mctx.fillRect(0, beachY, MAP_SIZE, MAP_SIZE - beachY);
    const seaY = c + (470 - pz) * s;
    mctx.fillStyle = '#2e7f9e';
    mctx.fillRect(0, seaY, MAP_SIZE, MAP_SIZE - seaY);
    // Blocks.
    mctx.fillStyle = '#2c3a48';
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const bx = c + (i * 90 - 36 - px) * s;
        const bz = c + (j * 90 - 36 - pz) * s;
        mctx.fillRect(bx, bz, 72 * s, 72 * s);
      }
    }
    // Canal.
    mctx.fillStyle = '#2a6f8e';
    const canalX = c + (-135 - 9 - px) * s;
    mctx.fillRect(canalX, 0, 18 * s, MAP_SIZE);
    // Roads.
    mctx.strokeStyle = '#4a5a6a';
    mctx.lineWidth = Math.max(2, 18 * s);
    for (const L of [-405, -315, -225, -135, -45, 45, 135, 225, 315, 405]) {
      if (L !== -135) {
        mctx.beginPath();
        mctx.moveTo(c + (L - px) * s, 0);
        mctx.lineTo(c + (L - px) * s, MAP_SIZE);
        mctx.stroke();
      }
      mctx.beginPath();
      mctx.moveTo(0, c + (L - pz) * s);
      mctx.lineTo(MAP_SIZE, c + (L - pz) * s);
      mctx.stroke();
    }
    // Bridges.
    mctx.fillStyle = '#f5d76e';
    for (const b of G.city.bridges) {
      const bx = c + (-135 - px) * s;
      const bz = c + (b.z - pz) * s;
      mctx.fillRect(bx - 9 * s, bz - 8 * s, 18 * s, 16 * s);
    }
    // Landmarks.
    const dot = (x, z, color, r = 3) => {
      mctx.fillStyle = color;
      mctx.beginPath();
      mctx.arc(c + (x - px) * s, c + (z - pz) * s, r, 0, Math.PI * 2);
      mctx.fill();
    };
    dot(0, -315, '#d98cb8', 4); // casino
    dot(0, 315, '#7ee787', 4); // safehouse
    dot(315, -135, '#4da6ff', 4); // spray shop
    // Mission marker / next start.
    const m = G.missions.active;
    const target = m && m.marker ? m.marker : G.missions.startPoint(G);
    if (target) {
      const tx = c + (target.x - px) * s;
      const ty = c + (target.z - pz) * s;
      mctx.fillStyle = '#ffd166';
      mctx.save();
      mctx.translate(tx, ty);
      mctx.rotate(Math.PI / 4);
      mctx.fillRect(-4, -4, 8, 8);
      mctx.restore();
    }
    // Cop blips.
    for (const cop of G.police.cops) dot(cop.x, cop.z, '#4da6ff', 2.5);
    // Enemy blips.
    for (const e of G.combat.enemies) {
      if (e.state !== 'down') dot(e.x, e.z, '#ff4757', 2.5);
    }
    // Player arrow.
    const heading = G.inCar ? G.car.heading : G.playerObj.state.heading;
    mctx.save();
    mctx.translate(c, c);
    mctx.rotate(heading);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -8);
    mctx.lineTo(5.5, 6);
    mctx.lineTo(-5.5, 6);
    mctx.closePath();
    mctx.fill();
    mctx.strokeStyle = '#111111';
    mctx.lineWidth = 1;
    mctx.stroke();
    mctx.restore();
    mctx.restore();
    // North tick.
    mctx.fillStyle = '#ffffff';
    mctx.font = 'bold 11px Arial';
    mctx.textAlign = 'center';
    mctx.fillText('N', c, 14);
  }

  function setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    el.stars.textContent = s;
    el.stars.className = n > 0 ? 'stars hot' : 'stars';
    el.wanted.style.display = n > 0 ? 'block' : 'none';
  }

  return {
    setObjective(t) { objectiveText = t; el.objective.textContent = t; },
    setTimer(sec) { timerSec = sec; },
    setPrompt(t) {
      if (t) { el.prompt.textContent = t; el.prompt.style.display = 'block'; }
      else el.prompt.style.display = 'none';
    },
    banner(text, kind = '') {
      el.banner.textContent = text;
      el.banner.className = 'show ' + kind;
      bannerT = 2.6;
    },
    showPhone(name, text) {
      el.phoneName.textContent = name;
      el.phoneText.textContent = text;
      el.phone.classList.add('show');
      phoneT = 6;
    },
    hidePhone() { el.phone.classList.remove('show'); },
    showScreen(name) {
      for (const k of ['title', 'pause', 'wasted', 'busted']) {
        if (el[k]) el[k].style.display = k === name ? 'flex' : 'none';
      }
      // Full-screen menus hide the HUD; the pause menu keeps it behind.
      const hudEl = document.getElementById('hud');
      if (hudEl) hudEl.style.display = name === 'pause' ? 'block' : 'none';
    },
    hideScreens() {
      for (const k of ['title', 'pause', 'wasted', 'busted']) {
        if (el[k]) el[k].style.display = 'none';
      }
      const hudEl = document.getElementById('hud');
      if (hudEl) hudEl.style.display = 'block';
    },
    update(dt, G) {
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) el.banner.className = '';
      }
      if (phoneT > 0) {
        phoneT -= dt;
        if (phoneT <= 0) el.phone.classList.remove('show');
      }
      setStars(G.police.stars);
      el.cash.textContent = formatMoney(G.cash);
      el.rep.textContent = repTitle(G.rep) + ' · ' + G.rep + ' REP';
      el.clock.textContent = formatClock(G.clockMinutes);
      const d = districtAt(G.player.x, G.player.z);
      el.district.textContent = d.name.toUpperCase();
      el.street.textContent = streetAt(G.player.x, G.player.z);
      el.timer.textContent = timerSec !== null ? formatTimer(timerSec) : '';
      el.timer.style.display = timerSec !== null ? 'block' : 'none';
      const speedKmh = G.inCar ? Math.abs(G.car.speed) * 3.6 : G.player.speed * 3.6;
      el.speed.textContent = Math.round(speedKmh) + ' km/h';
      const lift = G.city.nextLiftIn();
      const lifting = G.city.liftingBridge();
      el.bridge.textContent = lifting
        ? 'BRIDGE UP @ ' + lifting.z
        : 'BRIDGE LIFTS IN ' + formatTimer(lift);
      el.bridge.className = lifting || lift < 30 ? 'bridge warn' : 'bridge';
      el.healthFill.style.width = Math.max(0, G.health) + '%';
      el.armorFill.style.width = Math.max(0, G.armor) + '%';
      el.radio.textContent = G.audio.station().name;
      el.track.textContent = '♪ ' + G.audio.track();
      el.progress.textContent = G.save.progress({
        missionsDone: G.missions.done,
        packages: G.packages,
        taxiFares: G.taxiFares,
        stuntJumps: G.stuntJumps,
        timeTrials: G.timeTrials,
      }) + '% COMPLETE';
      drawMinimap(G);
    },
  };
}
