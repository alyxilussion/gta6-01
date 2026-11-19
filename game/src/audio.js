// WebAudio sound: synthesised SFX + two procedural radio stations with named
// tracks. No audio files, no network. Starts on the first user gesture.

import { RADIO } from './config.js';

function noteHz(semi) {
  return 220 * Math.pow(2, semi / 12);
}

// Chord loops per station: [root semitone, pattern of scale steps].
const STATION_MUSIC = {
  cayfm: { tempo: 96, bass: [0, 0, -4, 5], lead: [0, 3, 7, 10, 7, 3, 5, 7], wave: 'triangle' },
  solar: { tempo: 122, bass: [0, 0, 3, -2], lead: [0, 5, 7, 12, 10, 7, 5, 3], wave: 'sawtooth' },
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let stationIndex = 0;
  let trackIndex = 0;
  let stepTimer = 0;
  let step = 0;
  let started = false;
  let muted = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
    started = true;
  }

  function tone({ freq, dur, type = 'sine', vol = 0.5, when = 0, slide = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise({ dur, vol = 0.4, when = 0, low = 400 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = low;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0);
  }

  function musicStep() {
    if (!ctx || muted) return;
    const st = RADIO[stationIndex];
    const m = STATION_MUSIC[st.id];
    const beat = 60 / m.tempo / 2;
    const t0 = ctx.currentTime;
    const bassNote = m.bass[step % m.bass.length];
    const leadNote = m.lead[step % m.lead.length];
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.value = noteHz(bassNote - 12);
    g1.gain.setValueAtTime(0.5, t0);
    g1.gain.exponentialRampToValueAtTime(0.001, t0 + beat * 1.8);
    o1.connect(g1); g1.connect(musicGain);
    o1.start(t0); o1.stop(t0 + beat * 2);
    if (step % 2 === 0) {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = m.wave;
      o2.frequency.value = noteHz(leadNote);
      g2.gain.setValueAtTime(0.16, t0);
      g2.gain.exponentialRampToValueAtTime(0.001, t0 + beat * 1.4);
      o2.connect(g2); g2.connect(musicGain);
      o2.start(t0); o2.stop(t0 + beat * 1.5);
    }
    step++;
    if (step % 64 === 0) trackIndex = (trackIndex + 1) % st.tracks.length;
  }

  return {
    ensure,
    get started() { return started; },
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    station() { return RADIO[stationIndex]; },
    track() { return RADIO[stationIndex].tracks[trackIndex]; },
    nextStation() {
      stationIndex = (stationIndex + 1) % RADIO.length;
      trackIndex = 0; step = 0;
      return RADIO[stationIndex];
    },
    update(dt, playing) {
      if (!ctx || !playing) return;
      const m = STATION_MUSIC[RADIO[stationIndex].id];
      const beat = 60 / m.tempo / 2;
      stepTimer += dt;
      if (stepTimer >= beat) { stepTimer -= beat; musicStep(); }
    },
    shoot() { tone({ freq: 220, dur: 0.12, type: 'square', vol: 0.25, slide: -140 }); noise({ dur: 0.08, vol: 0.25, low: 3000 }); },
    crash() { noise({ dur: 0.3, vol: 0.5, low: 800 }); tone({ freq: 90, dur: 0.25, type: 'sawtooth', vol: 0.3, slide: -50 }); },
    explosion() { noise({ dur: 0.9, vol: 0.7, low: 500 }); tone({ freq: 60, dur: 0.8, type: 'sine', vol: 0.6, slide: -30 }); },
    pickup() { tone({ freq: 660, dur: 0.1, vol: 0.3 }); tone({ freq: 990, dur: 0.16, vol: 0.3, when: 0.09 }); },
    cash() { tone({ freq: 880, dur: 0.09, vol: 0.3 }); tone({ freq: 1174, dur: 0.09, vol: 0.3, when: 0.08 }); tone({ freq: 1568, dur: 0.18, vol: 0.3, when: 0.16 }); },
    siren() { tone({ freq: 700, dur: 0.35, type: 'triangle', vol: 0.12, slide: 300 }); tone({ freq: 1000, dur: 0.35, type: 'triangle', vol: 0.12, slide: -300, when: 0.35 }); },
    phone() { tone({ freq: 1200, dur: 0.12, vol: 0.25 }); tone({ freq: 1200, dur: 0.12, vol: 0.25, when: 0.25 }); },
    denied() { tone({ freq: 160, dur: 0.2, type: 'square', vol: 0.2 }); },
    engine(rpm01) {
      if (!ctx || muted) return;
      // A short engine hum, called sparsely by the driving code.
      tone({ freq: 55 + rpm01 * 90, dur: 0.09, type: 'sawtooth', vol: 0.05 });
    },
  };
}
