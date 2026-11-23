/**
 * Ulga — clock-based countdown used by the sleep timer (player) and the free
 * timer (Dźwięki). Time is read from `now()` on every tick, so a throttled tab
 * never drifts. During the last `fadeSec` seconds `onFade(factor)` is called with
 * a factor going 1 → 0; at the end `onEnd()` fires once.
 *
 * Fully injectable (now / setInterval / clearInterval) for tests with a fake clock.
 * @module timer
 */

export const SLEEP_OPTIONS = [0, 10, 20, 30, 45, 60]; // 0 = off; 'end' handled by the player
export const FREE_TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 0]; // 0 = infinite
export const DEFAULT_FADE_SEC = 30;

/**
 * @param {{seconds:number, fadeSec?:number, onTick?:(remainingSec:number)=>void,
 *   onFade?:(factor:number)=>void, onEnd?:()=>void, now?:()=>number,
 *   setInterval?:Function, clearInterval?:Function, tickMs?:number}} o
 */
export function createCountdown(o) {
  const total = Math.max(0, Number(o.seconds) || 0) * 1000;
  const fade = Math.max(0, Math.min(Number(o.fadeSec ?? DEFAULT_FADE_SEC), total / 1000)) * 1000;
  const now = o.now || (() => Date.now());
  const setI = o.setInterval || ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearI = o.clearInterval || ((id) => globalThis.clearInterval(id));
  const tickMs = o.tickMs || 500;
  let endAt = 0;
  let pausedLeft = null;
  let timer = null;
  let ended = false;
  let running = false;
  let lastFactor = 1;

  const call = (fn, ...a) => { if (typeof fn === 'function') { try { fn(...a); } catch (e) { console.error(e); } } };
  const leftMs = () => (pausedLeft !== null ? pausedLeft : Math.max(0, endAt - now()));

  function tick() {
    if (ended || !running) return;
    const left = leftMs();
    call(o.onTick, Math.ceil(left / 1000 - 1e-9));
    if (fade > 0 && left <= fade) {
      const f = Math.max(0, Math.min(1, left / fade));
      if (f !== lastFactor) { lastFactor = f; call(o.onFade, f); }
    }
    if (left <= 0) {
      ended = true; running = false;
      if (timer !== null) { clearI(timer); timer = null; }
      if (lastFactor !== 0 && fade > 0) { lastFactor = 0; call(o.onFade, 0); }
      call(o.onEnd);
    }
  }

  return {
    start() {
      if (ended || running) return;
      endAt = now() + (pausedLeft !== null ? pausedLeft : total);
      pausedLeft = null;
      running = true;
      timer = setI(tick, tickMs);
      tick();
    },
    pause() {
      if (!running || ended) return;
      pausedLeft = leftMs();
      running = false;
      if (timer !== null) { clearI(timer); timer = null; }
    },
    cancel() {
      running = false; ended = true;
      if (timer !== null) { clearI(timer); timer = null; }
    },
    tick,
    get remaining() { return Math.ceil(leftMs() / 1000 - 1e-9); },
    get running() { return running; },
    get ended() { return ended; },
    get factor() { return lastFactor; },
  };
}

/** "mm:ss" or "h:mm:ss". */
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
