/**
 * Ulga — Web Audio: one shared AudioContext, the synthesized singing-bowl bell
 * (from Appolonia js/audio.js) and real-time synthesized background sounds
 * (no audio files): rain, pink noise, brown noise, waves, drone, night forest.
 *
 * Without Web Audio (node, very old browsers) everything is a silent no-op.
 * @module audio
 */

export const SOUNDS = ['rain', 'pink', 'brown', 'waves', 'drone', 'forest'];

let ctx = null;
let master = null;   // → destination
let bgBus = null;    // background volume (user slider × fades)
let bellBus = null;

function getCtor() {
  try { return globalThis.AudioContext || globalThis.webkitAudioContext || null; } catch { return null; }
}

export function ensureCtx() {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    bgBus = ctx.createGain();
    bgBus.gain.value = 0.5;
    bgBus.connect(master);
    bellBus = ctx.createGain();
    bellBus.gain.value = 0.6;
    bellBus.connect(master);
  } catch { ctx = null; }
  return ctx;
}

/** Create/resume the context. Call from a user gesture. */
export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return false;
  try { if (c.state === 'suspended' && c.resume) c.resume().catch(() => {}); } catch { /* ignore */ }
  return true;
}

// ---------------- bell (Appolonia) ----------------
const PARTIALS = [
  { r: 1, g: 1.0, d: 1.0 },
  { r: 2.76, g: 0.5, d: 0.8 },
  { r: 5.4, g: 0.25, d: 0.6 },
  { r: 8.93, g: 0.12, d: 0.45 },
];
function strike(t0, f0, vol, decay) {
  for (const p of PARTIALS) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0 * p.r * (1 + (Math.random() - 0.5) * 0.002), t0);
    const d = decay * p.d;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol * p.g), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(bellBus);
    osc.start(t0); osc.stop(t0 + d + 0.05);
  }
}
/** 'soft' (low, quiet), 'single', 'triple'. Never throws. */
export function playBell(kind = 'soft') {
  try {
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
    const t = c.currentTime + 0.03;
    if (kind === 'triple') for (let i = 0; i < 3; i++) strike(t + i * 1.8, 330, 0.3, 5);
    else if (kind === 'single') strike(t, 330, 0.3, 5);
    else strike(t, 220, 0.2, 6);
    return true;
  } catch { return false; }
}

// ---------------- noise buffers ----------------
const buffers = {};
function noiseBuffer(kind, seconds = 8) {
  if (buffers[kind]) return buffers[kind];
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet's refined pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else { // brown
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // crossfade the loop seam (50 ms) to avoid a click
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    d[i] = d[i] * a + d[n - fade + i] * (1 - a);
  }
  buffers[kind] = { buf, loopEnd: (n - fade) / sr };
  return buffers[kind];
}

function loopSource(kind) {
  const { buf, loopEnd } = noiseBuffer(kind);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = loopEnd;
  return src;
}

// ---------------- sound graphs ----------------
/**
 * Each builder connects to `out` and returns {nodes:[], start(), stop(t), schedule?(until)}
 * schedule() is called by the look-ahead scheduler for random events (drops, crickets).
 */
const builders = {
  pink(out) {
    const s = loopSource('pink');
    const g = ctx.createGain(); g.gain.value = 0.55;
    s.connect(g); g.connect(out);
    return { stopAll: [s], start: () => s.start() };
  },
  brown(out) {
    const s = loopSource('brown');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.8;
    s.connect(lp); lp.connect(g); g.connect(out);
    return { stopAll: [s], start: () => s.start() };
  },
  rain(out) {
    const s = loopSource('pink');
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = 0.42;
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
    const dropBus = ctx.createGain(); dropBus.gain.value = 0.5; dropBus.connect(out);
    const white = noiseBuffer('white').buf;
    let next = 0;
    return {
      stopAll: [s],
      start: () => { s.start(); next = ctx.currentTime + 0.1; },
      schedule(until) {
        while (next < until) {
          // one drop: very short noise burst through a resonant band-pass
          const src = ctx.createBufferSource();
          src.buffer = white;
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
          bp.frequency.value = 1800 + Math.random() * 4200; bp.Q.value = 6 + Math.random() * 10;
          const eg = ctx.createGain();
          const peak = 0.15 + Math.random() * 0.5;
          const dur = 0.015 + Math.random() * 0.04;
          eg.gain.setValueAtTime(0.0001, next);
          eg.gain.linearRampToValueAtTime(peak, next + 0.002);
          eg.gain.exponentialRampToValueAtTime(0.0001, next + dur);
          src.connect(bp); bp.connect(eg); eg.connect(dropBus);
          src.start(next, Math.random() * 5, dur + 0.02);
          next += 0.02 + Math.random() * 0.16;
        }
      },
    };
  },
  waves(out) {
    const s = loopSource('brown');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.45;
    // slow swell: LFO (~9 s period) on gain and filter frequency
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.38;
    const lfoF = ctx.createGain(); lfoF.gain.value = 450;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    lfo.connect(lfoF); lfoF.connect(lp.frequency);
    // a second, slower, detuned LFO so waves are not identical
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.047;
    const lfo2g = ctx.createGain(); lfo2g.gain.value = 0.12;
    lfo2.connect(lfo2g); lfo2g.connect(g.gain);
    const hiss = loopSource('pink');
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const hg = ctx.createGain(); hg.gain.value = 0.0;
    const lfoH = ctx.createGain(); lfoH.gain.value = 0.07;
    lfo.connect(lfoH); lfoH.connect(hg.gain);
    hiss.connect(hp); hp.connect(hg); hg.connect(out);
    s.connect(lp); lp.connect(g); g.connect(out);
    return { stopAll: [s, lfo, lfo2, hiss], start: () => { s.start(); lfo.start(); lfo2.start(); hiss.start(); } };
  },
  drone(out) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.16;
    lp.connect(g); g.connect(out);
    const freqs = [55, 82.41, 110, 164.81, 220.5];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
      const og = ctx.createGain(); og.gain.value = [0.9, 0.5, 0.6, 0.25, 0.18][i];
      o.connect(og); og.connect(lp);
      return o;
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(lp.frequency);
    return { stopAll: [...oscs, lfo], start: () => { oscs.forEach((o) => o.start()); lfo.start(); } };
  },
  forest(out) {
    // soft wind bed
    const s = loopSource('brown');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450;
    const g = ctx.createGain(); g.gain.value = 0.35;
    s.connect(lp); lp.connect(g); g.connect(out);
    const crickets = ctx.createGain(); crickets.gain.value = 0.05; crickets.connect(out);
    const voices = [
      { f: 4300, period: 0.9, next: 0, pan: -0.4 },
      { f: 4700, period: 1.25, next: 0, pan: 0.5 },
      { f: 3900, period: 1.6, next: 0, pan: 0.1 },
    ];
    return {
      stopAll: [s],
      start: () => { s.start(); voices.forEach((v, i) => { v.next = ctx.currentTime + 0.3 + i * 0.37; }); },
      schedule(until) {
        for (const v of voices) {
          while (v.next < until) {
            // a chirp = 3–4 short pulses at ~28 Hz
            const pulses = 3 + (Math.random() < 0.5 ? 1 : 0);
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = v.f * (1 + (Math.random() - 0.5) * 0.01);
            const eg = ctx.createGain(); eg.gain.value = 0;
            let node = eg;
            if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = v.pan; eg.connect(p); node = p; }
            node.connect(crickets);
            o.connect(eg);
            const t0 = v.next;
            for (let k = 0; k < pulses; k++) {
              const t = t0 + k * 0.036;
              eg.gain.setValueAtTime(0, t);
              eg.gain.linearRampToValueAtTime(1, t + 0.006);
              eg.gain.linearRampToValueAtTime(0, t + 0.024);
            }
            o.start(t0); o.stop(t0 + pulses * 0.036 + 0.05);
            // rhythm with small jitter, occasional rest
            v.next += v.period * (0.9 + Math.random() * 0.2) + (Math.random() < 0.12 ? 2 + Math.random() * 3 : 0);
          }
        }
      },
    };
  },
};

// ---------------- background player ----------------
let current = null;        // {id, graph, gain}
let schedTimer = null;
let userBgVol = 0.5;
let duck = 1;              // fade factor (sleep timer, end of session)

function applyBgGain(rampSec = 0.3) {
  if (!ctx || !bgBus) return;
  const v = Math.max(0, Math.min(1, userBgVol * duck));
  const t = ctx.currentTime;
  try {
    bgBus.gain.cancelScheduledValues(t);
    bgBus.gain.setValueAtTime(bgBus.gain.value, t);
    bgBus.gain.linearRampToValueAtTime(v * v, t + rampSec); // perceptual (squared) curve
  } catch { /* ignore */ }
}

function runScheduler() {
  if (schedTimer) return;
  schedTimer = setInterval(() => {
    if (current && current.graph.schedule && ctx) current.graph.schedule(ctx.currentTime + 1.5);
  }, 250);
}

/** Start a background sound (crossfades from the previous one). 'none'/null stops. */
export function playBackground(id) {
  if (!id || id === 'none' || !builders[id]) { stopBackground(1.5); return false; }
  if (current && current.id === id) return true;
  const c = ensureCtx();
  if (!c) return false;
  unlockAudio();
  stopBackground(1.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.linearRampToValueAtTime(1, c.currentTime + 2);
  g.connect(bgBus);
  const graph = builders[id](g);
  graph.start();
  if (graph.schedule) graph.schedule(c.currentTime + 1.5);
  current = { id, graph, gain: g };
  applyBgGain(0.05);
  runScheduler();
  return true;
}

/** Fade out and stop the current background sound. */
export function stopBackground(fadeSec = 1) {
  if (!current || !ctx) { current = null; return; }
  const { graph, gain } = current;
  current = null;
  const t = ctx.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
  } catch { /* ignore */ }
  setTimeout(() => {
    for (const n of graph.stopAll || []) { try { n.stop(); } catch { /* ignore */ } }
    try { gain.disconnect(); } catch { /* ignore */ }
  }, fadeSec * 1000 + 100);
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
}

export function currentBackground() { return current ? current.id : null; }
export function setBgVolume(v) { userBgVol = Math.max(0, Math.min(1, Number(v) || 0)); applyBgGain(); }
/** Fade factor 0..1 applied on top of the user volume (sleep timer, end fades). */
export function setBgDuck(f, rampSec = 0.4) { duck = Math.max(0, Math.min(1, Number(f))); applyBgGain(rampSec); }
export function hasWebAudio() { return !!getCtor(); }
