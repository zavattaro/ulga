/**
 * Ulga — licencje premium weryfikowane OFFLINE (ECDSA P-256 + SHA-256, WebCrypto).
 *
 * Kod: "ULG-" + base64url(JSON payload) + "." + base64url(podpis r||s, 64 bajty).
 * payload = { p: 'monthly'|'yearly'|'lifetime', e: ISO|null, h: 8 hex sha256(e-mail), i: id }
 * Podpis obejmuje bajty ASCII części base64url payloadu. Klucz publiczny: config/payments.json.
 * Kody wystawia scripts/license.py (klucz prywatny nigdy nie trafia do aplikacji).
 * Nic nie jest wysyłane z urządzenia — licencja zapisywana jest tylko w localStorage.
 *
 * @module license
 */
import { store, setPremium, isPremium } from './storage.js';
import { setPromoConfig } from './promo.js';

export const PLANS = ['monthly', 'yearly', 'lifetime'];
const LICENSE_KEY = 'license';
const PENDING_KEY = 'pendingLicense';

let configPromise = null;

/** Wczytuje (raz) config/payments.json. Nigdy nie rzuca — zwraca {} przy błędzie. */
export function loadPaymentsConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const r = await fetch('config/payments.json');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const cfg = await r.json();
        setPromoConfig(cfg);
        return cfg;
      } catch (e) {
        console.warn('[payments] config', e);
        return {};
      }
    })();
  }
  return configPromise;
}

/** Tylko do testów: podmienia konfigurację. */
export function _setPaymentsConfig(cfg) { setPromoConfig(cfg || {}); configPromise = Promise.resolve(cfg || {}); }

/** Prawdziwe płatności włączone? (jest clientToken) */
export function isLiveMode(cfg) { return !!(cfg && typeof cfg.clientToken === 'string' && cfg.clientToken.trim()); }

function b64uToBytes(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('b64');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Usuwa spacje/nowe linie, akceptuje kod z prefiksem ULG- lub bez. */
export function normalizeCode(code) {
  let c = String(code ?? '').replace(/\s+/g, '');
  try { if (/%[0-9A-Fa-f]{2}/.test(c)) c = decodeURIComponent(c); } catch { /* ignore */ }
  if (/^ULG-/i.test(c)) c = c.slice(4);
  return c;
}

/**
 * Weryfikuje kod licencyjny.
 * @param {string} code
 * @param {JsonWebKey} publicKeyJwk
 * @param {Date} [now=new Date()]
 * @returns {Promise<{valid:boolean, plan:string|null, expires:string|null, reason:string|null, id?:string}>}
 *   reason: 'format' | 'signature' | 'expired' | 'plan' | 'nokey' | 'unsupported' | null
 */
export async function verifyLicense(code, publicKeyJwk, now = new Date()) {
  const fail = (reason, extra = {}) => ({ valid: false, plan: null, expires: null, reason, ...extra });
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return fail('unsupported');
  if (!publicKeyJwk || publicKeyJwk.kty !== 'EC' || !publicKeyJwk.x || !publicKeyJwk.y) return fail('nokey');

  const c = normalizeCode(code);
  const parts = c.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return fail('format');
  let payload, sig;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64uToBytes(parts[0])));
    sig = b64uToBytes(parts[1]);
  } catch { return fail('format'); }
  if (!payload || typeof payload !== 'object' || sig.length !== 64) return fail('format');

  let ok = false;
  try {
    const key = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: publicKeyJwk.x, y: publicKeyJwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(parts[0]));
  } catch (e) {
    console.warn('[license] verify', e);
    return fail('nokey');
  }
  if (!ok) return fail('signature');

  const plan = payload.p;
  const expires = payload.e == null ? null : String(payload.e);
  if (!PLANS.includes(plan)) return fail('plan', { expires });
  if (expires !== null) {
    const t = Date.parse(expires);
    if (Number.isNaN(t)) return fail('format');
    if (now.getTime() > t) return fail('expired', { plan, expires });
  }
  return { valid: true, plan, expires, reason: null, id: typeof payload.i === 'string' ? payload.i : undefined };
}

/**
 * Weryfikuje i aktywuje licencję na tym urządzeniu (localStorage + setPremium(true)).
 * @param {string} code
 * @param {{publicKeyJwk?:JsonWebKey, now?:Date}} [opts]
 * @returns {Promise<{valid:boolean, plan:string|null, expires:string|null, reason:string|null}>}
 */
export async function activateLicense(code, opts = {}) {
  const now = opts.now || new Date();
  const jwk = opts.publicKeyJwk || (await loadPaymentsConfig()).publicKeyJwk;
  const res = await verifyLicense(code, jwk, now);
  if (res.valid) {
    store.set(LICENSE_KEY, {
      code: 'ULG-' + normalizeCode(code),
      plan: res.plan,
      expires: res.expires,
      id: res.id || null,
      activatedAt: now.toISOString(),
    });
    setPremium(true);
  }
  return res;
}

/**
 * Stan zapisanej licencji (synchronicznie, bez ponownej weryfikacji podpisu).
 * @param {Date} [now=new Date()]
 * @returns {{active:boolean, plan:string|null, expires:string|null, expired:boolean, code:string|null}}
 */
export function licenseStatus(now = new Date()) {
  const l = store.get(LICENSE_KEY, null);
  if (!l || typeof l !== 'object' || !l.plan) return { active: false, plan: null, expires: null, expired: false, code: null };
  const expired = l.expires != null && now.getTime() > Date.parse(l.expires);
  return { active: !expired, plan: l.plan, expires: l.expires ?? null, expired, code: l.code || null };
}

/** Usuwa licencję z urządzenia. */
export function removeLicense() { store.remove(LICENSE_KEY); }

/**
 * Przy starcie aplikacji: wygasła licencja → setPremium(false).
 * @returns {{expired:boolean, plan?:string}} expired=true gdy właśnie wyłączono premium.
 */
export function checkLicenseOnLoad(now = new Date()) {
  const st = licenseStatus(now);
  if (!st.plan || !st.expired) return { expired: false };
  const l = store.get(LICENSE_KEY, {});
  if (l.expiredHandled) return { expired: false }; // już obsłużone — nie ruszamy flagi premium ponownie
  store.set(LICENSE_KEY, { ...l, expiredHandled: true });
  if (!isPremium()) return { expired: false };
  setPremium(false);
  return { expired: true, plan: st.plan };
}

/** Kod z linku #/activate?code=… zapamiętany do czasu ukończenia wprowadzenia/zgody. */
export function setPendingCode(code) { if (code) store.set(PENDING_KEY, String(code)); }
export function takePendingCode() { const c = store.get(PENDING_KEY, null); store.remove(PENDING_KEY); return c; }
export function peekPendingCode() { return store.get(PENDING_KEY, null); }
