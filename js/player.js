/**
 * Ulga — session player engine.
 *  - voice: an <audio> element (AAC .m4a with silences already inside)
 *  - background: synthesized in real time by audio.js (Web Audio)
 *  - sleep timer (10–60 min or "end of session") with a 30 s fade
 *  - fade-out of the background at the end of sleep sessions
 *  - Media Session API (lock-screen controls, title, ±15 s)
 *  - listened-time tracking → recordCompletion()
 * @module player
 */
import { playBackground, stopBackground, setBgVolume, setBgDuck, unlockAudio, playBell } from './audio.js';
import { createCountdown, DEFAULT_FADE_SEC } from './timer.js';
import { recordCompletion } from './storage.js';

export const SKIP_SEC = 15;
export const SLEEP_END_FADE_SEC = 45;

/** iOS ignores HTMLMediaElement.volume: detect whether we can control it. */
export function volumeControllable() {
  try {
    const a = document.createElement('audio');
    a.volume = 0.5;
    return Math.abs(a.volume - 0.5) < 0.01;
  } catch { return false; }
}

/**
 * @param {object} session item from content/sessions.json
 * @param {{bg?:string|null, voiceVol?:number, bgVol?:number, artwork?:string,
 *   onState?:(s:'idle'|'loading'|'playing'|'paused'|'ended'|'error')=>void,
 *   onTime?:(cur:number, dur:number)=>void, onError?:(reason:'offline'|'missing')=>void,
 *   onEnd?:(info:{counted:boolean, seconds:number, bySleepTimer:boolean})=>void,
 *   onSleepTick?:(remainingSec:number|null)=>void, appName?:string}} opts
 */
export function createSessionPlayer(session, opts = {}) {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.setAttribute('playsinline', '');
  audio.src = session.audio;
  audio.dataset.session = session.id;
  audio.id = 'voice';
  audio.hidden = true;
  document.body.appendChild(audio);

  const isSleep = session.category === 'sen';
  let bg = opts.bg === undefined ? (session.bg || null) : opts.bg;
  let voiceVol = opts.voiceVol ?? 1;
  let state = 'idle';
  let listened = 0;
  let lastT = 0;
  let recorded = false;
  let sleep = null;          // countdown
  let sleepMode = 0;         // 0 | minutes | 'end'
  let destroyed = false;
  let endFadeTimer = null;
  let errorReason = null;

  const call = (fn, ...a) => { if (!destroyed && typeof fn === 'function') { try { fn(...a); } catch (e) { console.error(e); } } };
  const setState = (s) => { state = s; call(opts.onState, s); updateMediaSession(); };
  const duration = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : session.durationSec || 0);

  setBgVolume(opts.bgVol ?? 0.5);
  try { audio.volume = voiceVol; } catch { /* iOS */ }

  /**
   * Natural end: if at least half of the recording was actually heard, the whole
   * session length counts (seeking past a long silence is fine). Otherwise (and for
   * the sleep timer) only the time really listened counts.
   */
  function record(bySleepTimer = false, natural = false) {
    if (recorded) return false;
    const media = duration();
    const credit = natural && media > 0 && listened >= media * 0.5 ? Math.max(listened, session.durationSec || media) : listened;
    const counted = recordCompletion(session.id, credit);
    if (counted) recorded = true;
    call(opts.onEnd, { counted, seconds: Math.round(credit), bySleepTimer });
    return counted;
  }

  // ---- audio element events ----
  audio.addEventListener('timeupdate', () => {
    const t = audio.currentTime;
    const d = t - lastT;
    if (!audio.paused && d > 0 && d < 1.5) listened += d;
    lastT = t;
    call(opts.onTime, t, duration());
    updatePosition();
  });
  audio.addEventListener('seeked', () => { lastT = audio.currentTime; });
  audio.addEventListener('loadedmetadata', () => call(opts.onTime, audio.currentTime, duration()));
  audio.addEventListener('waiting', () => { if (state === 'playing') call(opts.onState, 'loading'); });
  audio.addEventListener('playing', () => setState('playing'));
  audio.addEventListener('pause', () => { if (state === 'playing' || state === 'loading') setState('paused'); });
  audio.addEventListener('error', () => fail());
  audio.addEventListener('ended', () => {
    setState('ended');
    if (sleepMode === 'end') { finishSleep(true); return; }
    if (isSleep) {
      setBgDuck(0, SLEEP_END_FADE_SEC);
      endFadeTimer = setTimeout(() => stopBackground(0.5), SLEEP_END_FADE_SEC * 1000);
    } else {
      playBell('soft');
      setBgDuck(0, 6);
      endFadeTimer = setTimeout(() => stopBackground(0.5), 6000);
    }
    record(false, true);
  });

  function fail() {
    if (destroyed || errorReason) return;
    errorReason = navigator.onLine === false ? 'offline' : 'missing';
    setState('error');
    call(opts.onError, errorReason);
  }

  // ---- controls ----
  async function play() {
    if (destroyed) return;
    unlockAudio();
    if (errorReason) { call(opts.onError, errorReason); return; }
    if (state === 'ended') { audio.currentTime = 0; lastT = 0; recorded = false; }
    if (endFadeTimer) { clearTimeout(endFadeTimer); endFadeTimer = null; }
    setBgDuck(sleep ? sleep.factor : 1, 0.6);
    if (bg) playBackground(bg);
    setState('loading');
    try {
      await audio.play();
      if (sleep && !sleep.running && !sleep.ended) sleep.start();
    } catch (e) {
      if (e && e.name === 'NotAllowedError') { setState('paused'); return; }
      if (e && e.name === 'AbortError') return;
      fail();
    }
  }
  function pause() {
    audio.pause();
    setBgDuck(0, 0.8);
    if (sleep) sleep.pause();
    if (state !== 'error') setState('paused');
  }
  function toggle() { if (state === 'playing' || state === 'loading') pause(); else play(); }
  function seekTo(sec) {
    const d = duration();
    const t = Math.max(0, Math.min(d ? d - 0.25 : sec, Number(sec) || 0));
    try { audio.currentTime = t; } catch { /* not seekable yet */ }
    lastT = t;
    call(opts.onTime, t, d);
    updatePosition();
  }
  const skip = (delta) => seekTo((audio.currentTime || 0) + delta);

  // ---- sleep timer ----
  function finishSleep(natural = false) {
    audio.pause();
    stopBackground(1);
    if (sleep) { sleep.cancel(); }
    sleep = null; sleepMode = 0;
    call(opts.onSleepTick, null);
    setState('ended');
    record(true, natural);
  }
  function setSleepTimer(mode) {
    if (sleep) { sleep.cancel(); sleep = null; }
    sleepMode = mode || 0;
    try { audio.volume = voiceVol; } catch { /* ignore */ }
    if (state === 'playing') setBgDuck(1, 0.5);
    if (!sleepMode || sleepMode === 'end') { call(opts.onSleepTick, null); return; }
    sleep = createCountdown({
      seconds: sleepMode * 60,
      fadeSec: DEFAULT_FADE_SEC,
      onTick: (r) => call(opts.onSleepTick, r),
      onFade: (f) => { try { audio.volume = voiceVol * f; } catch { /* iOS: stops at end */ } setBgDuck(f, 0.4); },
      onEnd: () => finishSleep(false),
    });
    if (state === 'playing' || state === 'loading') sleep.start();
    else call(opts.onSleepTick, sleepMode * 60);
  }

  // ---- volumes / background ----
  function setVoiceVolume(v) { voiceVol = Math.max(0, Math.min(1, Number(v))); try { audio.volume = voiceVol * (sleep ? sleep.factor : 1); } catch { /* ignore */ } }
  function setBackground(id) {
    bg = id && id !== 'none' ? id : null;
    if (!bg) stopBackground(1);
    else if (state === 'playing' || state === 'loading') playBackground(bg);
  }

  // ---- Media Session ----
  const ms = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
  function updateMediaSession() {
    if (!ms) return;
    try {
      ms.playbackState = state === 'playing' || state === 'loading' ? 'playing' : (state === 'paused' ? 'paused' : 'none');
    } catch { /* ignore */ }
  }
  function updatePosition() {
    if (!ms || !ms.setPositionState) return;
    const d = duration();
    if (!d) return;
    try { ms.setPositionState({ duration: d, playbackRate: 1, position: Math.min(d, audio.currentTime || 0) }); } catch { /* ignore */ }
  }
  if (ms) {
    try {
      if (typeof MediaMetadata !== 'undefined') {
        ms.metadata = new MediaMetadata({
          title: session.title,
          artist: opts.appName || 'Ulga',
          album: session.subtitle || '',
          artwork: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        });
      }
      const h = {
        play: () => play(),
        pause: () => pause(),
        stop: () => pause(),
        seekbackward: (d) => skip(-((d && d.seekOffset) || SKIP_SEC)),
        seekforward: (d) => skip((d && d.seekOffset) || SKIP_SEC),
        seekto: (d) => { if (d && typeof d.seekTime === 'number') seekTo(d.seekTime); },
      };
      for (const [k, fn] of Object.entries(h)) { try { ms.setActionHandler(k, fn); } catch { /* unsupported action */ } }
    } catch { /* ignore */ }
  }

  function destroy() {
    if (destroyed) return;
    // a session left in the middle still counts if long enough
    if (!recorded && listened >= 60 && state !== 'ended') recordCompletion(session.id, listened);
    destroyed = true;
    if (sleep) sleep.cancel();
    if (endFadeTimer) clearTimeout(endFadeTimer);
    audio.pause();
    audio.removeAttribute('src');
    try { audio.load(); } catch { /* ignore */ }
    audio.remove();
    stopBackground(0.8);
    setBgDuck(1, 0.1);
    if (ms) {
      for (const k of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto']) { try { ms.setActionHandler(k, null); } catch { /* ignore */ } }
      try { ms.metadata = null; ms.playbackState = 'none'; } catch { /* ignore */ }
    }
  }

  return {
    play, pause, toggle, seekTo, skip, setSleepTimer, setVoiceVolume, setBackground, destroy,
    get state() { return state; },
    get currentTime() { return audio.currentTime || 0; },
    get duration() { return duration(); },
    get listened() { return listened; },
    get sleepMode() { return sleepMode; },
    get background() { return bg; },
    get error() { return errorReason; },
    audio,
  };
}
