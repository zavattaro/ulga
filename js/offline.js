/**
 * Ulga — offline voice recordings (Cache Storage, shared with sw.js).
 * The service worker also stores a recording here automatically the first time
 * it is played; these helpers power "Pobierz na telefon" / "Usuń pobrane".
 * @module offline
 */
export const AUDIO_CACHE = 'ulga-audio-v1';

const hasCaches = () => typeof caches !== 'undefined' && !!caches.open;

/** Absolute URL of a session's recording (the cache key the SW uses). */
export function audioUrl(session) {
  return new URL(session.audio, globalThis.location ? location.href : 'http://localhost/').href;
}

export async function isDownloaded(session) {
  if (!hasCaches() || !session) return false;
  try {
    const c = await caches.open(AUDIO_CACHE);
    return !!(await c.match(audioUrl(session)));
  } catch { return false; }
}

/** Set of session ids whose audio is cached. */
export async function downloadedIds(sessions) {
  const out = new Set();
  if (!hasCaches()) return out;
  try {
    const c = await caches.open(AUDIO_CACHE);
    const keys = new Set((await c.keys()).map((r) => r.url));
    for (const s of sessions) if (keys.has(audioUrl(s))) out.add(s.id);
  } catch { /* ignore */ }
  return out;
}

/** Ask the browser not to evict our storage (best effort). */
export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}

/**
 * Download one recording into the cache.
 * @returns {Promise<{ok:true}|{ok:false, reason:'nocache'|'offline'|'missing'|'error'}>}
 */
export async function download(session) {
  if (!hasCaches()) return { ok: false, reason: 'nocache' };
  if (navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const res = await fetch(audioUrl(session), { cache: 'no-store' });
    if (res.status === 404) return { ok: false, reason: 'missing' };
    if (!res.ok || res.status !== 200) return { ok: false, reason: 'error' };
    const c = await caches.open(AUDIO_CACHE);
    await c.put(audioUrl(session), res);
    requestPersist();
    return { ok: true };
  } catch {
    return { ok: false, reason: navigator.onLine === false ? 'offline' : 'error' };
  }
}

export async function remove(session) {
  if (!hasCaches()) return false;
  try { return await (await caches.open(AUDIO_CACHE)).delete(audioUrl(session)); } catch { return false; }
}

export async function removeAll() {
  if (!hasCaches()) return false;
  try { return await caches.delete(AUDIO_CACHE); } catch { return false; }
}

/** Bytes used by downloaded recordings (from Content-Length or the blob size). */
export async function usedBytes() {
  if (!hasCaches()) return 0;
  let total = 0;
  try {
    const c = await caches.open(AUDIO_CACHE);
    for (const req of await c.keys()) {
      const r = await c.match(req);
      const len = Number(r && r.headers.get('content-length'));
      total += len > 0 ? len : (r ? (await r.clone().blob()).size : 0);
    }
  } catch { /* ignore */ }
  return total;
}

/** "3,4 MB" (Polish decimal comma). */
export function fmtBytes(n) {
  const mb = (Number(n) || 0) / 1048576;
  if (mb <= 0) return '0 MB';
  if (mb < 0.1) return '0,1 MB';
  return (mb < 10 ? mb.toFixed(1) : Math.round(mb).toString()).replace('.', ',') + ' MB';
}
