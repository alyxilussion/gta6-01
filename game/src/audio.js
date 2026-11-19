// Sound, synthesized live with WebAudio — no audio files, no network.
// Engine hum, siren wail, gunshots, pickups and mission jingles are all
// oscillators and filtered noise. Starts on the first user gesture.
let ctx = null;
let master = null;
let muted = false;
let engineNodes = null;
let sirenNodes = null;

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  ensureCtx();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

function noiseBuffer(duration) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function blip(freq, duration, type, volume, slideTo) {
  if (!ensureCtx()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noiseBurst(duration, filterFreq, volume) {
  if (!ensureCtx()) return;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(t);
}

export function sfxShoot() {
  noiseBurst(0.12, 1800, 0.35);
  blip(160, 0.08, 'square', 0.12, 60);
}

export function sfxHit() {
  blip(220, 0.06, 'triangle', 0.2, 140);
}

export function sfxPickup() {
  blip(660, 0.09, 'sine', 0.25);
  setTimeout(() => blip(990, 0.12, 'sine', 0.25), 70);
}

export function sfxCash() {
  blip(880, 0.08, 'sine', 0.22);
  setTimeout(() => blip(1174, 0.1, 'sine', 0.22), 80);
  setTimeout(() => blip(1568, 0.16, 'sine', 0.2), 160);
}

export function sfxMissionComplete() {
  const notes = [523, 659, 784, 1046];
  notes.forEach((n, i) => setTimeout(() => blip(n, 0.22, 'triangle', 0.25), i * 110));
}

export function sfxWasted() {
  const notes = [392, 330, 262, 196];
  notes.forEach((n, i) => setTimeout(() => blip(n, 0.3, 'sawtooth', 0.18), i * 160));
}

export function sfxPhone() {
  blip(1200, 0.12, 'sine', 0.2);
  setTimeout(() => blip(1200, 0.12, 'sine', 0.2), 200);
}

export function sfxCrash(intensity) {
  noiseBurst(0.25, 500, Math.min(0.5, 0.15 + intensity * 0.3));
}

export function sfxExplosion() {
  noiseBurst(0.7, 220, 0.6);
  blip(90, 0.5, 'sine', 0.4, 35);
}

// Continuous engine hum: one sawtooth + lowpass, pitch follows speed.
export function setEngine(speedRatio, running) {
  if (!ensureCtx()) return;
  if (!running || speedRatio <= 0.02) {
    if (engineNodes) {
      try { engineNodes.osc.stop(); } catch { /* already stopped */ }
      engineNodes = null;
    }
    return;
  }
  if (!engineNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    engineNodes = { osc, gain };
  }
  engineNodes.osc.frequency.value = 55 + speedRatio * 140;
  engineNodes.gain.gain.value = 0.04 + speedRatio * 0.05;
}

// Two-tone siren while any cop is near.
export function setSiren(active) {
  if (!ensureCtx()) return;
  if (!active) {
    if (sirenNodes) {
      try { sirenNodes.osc.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    }
    return;
  }
  if (sirenNodes) return;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 0.9;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.frequency.value = 880;
  lfo.start();
  sirenNodes = { osc, lfo };
}
