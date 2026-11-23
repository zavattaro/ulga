/**
 * Ulga — local persistence (localStorage, prefix `ulga.`, JSON values).
 * Adapted from Appolonia. No data ever leaves the device. When localStorage is
 * unavailable it falls back to an in-memory Map for the lifetime of the page.
 *
 * Keys (prefixed with `ulga.`):
 *   progress   {totalSessions, totalSeconds, streakDays, lastDate, completed}
 *   history    Array<{id, date:ISO, seconds}> (newest last, max 50)
 *   consent    {accepted:true, analytics:false, date, version:1}
 *   onboarded  bool
 *   premium    bool
 *   license    {code, plan, expires, id, activatedAt}
 *   settings   see DEFAULT_SETTINGS
 *
 * @module storage
 */

export const PREFIX = 'ulga.';
/** Minimum seconds for a session to count as completed. */
export const MIN_COMPLETION_SECONDS = 30;
export const HISTORY_LIMIT = 50;
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'dark',          // 'dark' | 'light' | 'auto'
  voiceVol: 1,            // 0..1
  bgVol: 0.5,             // 0..1
  bgOverride: null,       // null = sound proposed by the session, 'none' or a sound id
  sound: 'rain',          // last sound on the Dźwięki tab
  timerMinutes: 20,       // 0 = infinite
  timerBells: true,
  reminderTime: '21:30',
});

const memory = new Map();

function ls() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
function rawGet(k) {
  const s = ls();
  if (s) { try { const v = s.getItem(k); if (v !== null) return v; } catch { /* fall through */ } }
  return memory.has(k) ? memory.get(k) : null;
}
function rawSet(k, v) {
  const s = ls();
  if (s) { try { s.setItem(k, v); memory.delete(k); return; } catch { /* fall through */ } }
  memory.set(k, v);
}
function rawRemove(k) {
  memory.delete(k);
  const s = ls();
  if (s) { try { s.removeItem(k); } catch { /* ignore */ } }
}
function allPrefixedKeys() {
  const keys = new Set();
  const s = ls();
  if (s) {
    try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIX)) keys.add(k); } } catch { /* ignore */ }
  }
  for (const k of memory.keys()) if (k.startsWith(PREFIX)) keys.add(k);
  return [...keys];
}

export const store = {
  get(key, def = null) {
    const raw = rawGet(PREFIX + key);
    if (raw === null || raw === undefined) return def;
    try { return JSON.parse(raw); } catch { return def; }
  },
  set(key, val) { rawSet(PREFIX + key, JSON.stringify(val)); },
  remove(key) { rawRemove(PREFIX + key); },
};

// ---------- dates ----------
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d - 1));
}

// ---------- progress ----------
function readProgressRaw() {
  const p = store.get('progress', null) || {};
  return {
    totalSessions: Number(p.totalSessions) || 0,
    totalSeconds: Number(p.totalSeconds) || 0,
    streakDays: Number(p.streakDays) || 0,
    lastDate: typeof p.lastDate === 'string' ? p.lastDate : null,
    completed: p.completed && typeof p.completed === 'object' ? { ...p.completed } : {},
  };
}

/**
 * Record a finished session (or sound timer). Ignored when seconds < 30.
 * Streak = consecutive local days with at least one completion.
 * @returns {boolean} true if counted
 */
export function recordCompletion(sessionId, seconds, date = new Date()) {
  const secs = Math.round(Number(seconds) || 0);
  if (secs < MIN_COMPLETION_SECONDS) return false;
  const p = readProgressRaw();
  const day = localDateKey(date);
  p.totalSessions += 1;
  p.totalSeconds += secs;
  p.completed[sessionId] = (Number(p.completed[sessionId]) || 0) + 1;
  if (!p.lastDate) { p.streakDays = 1; p.lastDate = day; }
  else if (day === p.lastDate) { if (p.streakDays < 1) p.streakDays = 1; }
  else if (day > p.lastDate) {
    p.streakDays = previousDayKey(day) === p.lastDate ? p.streakDays + 1 : 1;
    p.lastDate = day;
  }
  store.set('progress', p);
  const hist = getHistory();
  hist.push({ id: sessionId, date: date.toISOString(), seconds: secs });
  store.set('history', hist.slice(-HISTORY_LIMIT));
  return true;
}

/** Current progress; streakDays is 0 when the last completion is older than yesterday. */
export function getProgress(today = new Date()) {
  const p = readProgressRaw();
  const t = localDateKey(today);
  const alive = p.lastDate && (p.lastDate === t || p.lastDate === previousDayKey(t));
  return {
    totalSessions: p.totalSessions,
    totalMinutes: Math.round(p.totalSeconds / 60),
    streakDays: alive ? p.streakDays : 0,
    lastDate: p.lastDate,
    completed: p.completed,
  };
}

export function getHistory() {
  const h = store.get('history', []);
  return Array.isArray(h) ? h : [];
}

// ---------- consent / onboarding / premium / settings ----------
export function getConsent() {
  const c = store.get('consent', null);
  return c && c.accepted === true ? c : null;
}
export function setConsent({ analytics = false } = {}) {
  const c = { accepted: true, analytics: !!analytics, date: new Date().toISOString(), version: 1 };
  store.set('consent', c);
  return c;
}
export function isOnboarded() { return store.get('onboarded', false) === true; }
export function setOnboarded(v = true) { store.set('onboarded', !!v); }
export function isPremium() { return store.get('premium', false) === true; }
export function setPremium(v = true) { store.set('premium', !!v); }

export function getSettings() {
  const s = store.get('settings', null);
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}
export function setSettings(partial = {}) {
  const next = { ...getSettings(), ...(partial || {}) };
  store.set('settings', next);
  return next;
}

// ---------- maintenance ----------
export function resetAll() { for (const k of allPrefixedKeys()) rawRemove(k); }

export function exportData() {
  const out = {};
  for (const full of allPrefixedKeys()) {
    const raw = rawGet(full);
    let v;
    try { v = JSON.parse(raw); } catch { v = raw; }
    out[full.slice(PREFIX.length)] = v;
  }
  return out;
}
