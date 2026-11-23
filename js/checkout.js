/**
 * Ulga — checkout Paddle (Paddle.js v2, overlay).
 *
 * Skrypt https://cdn.paddle.com/paddle/v2/paddle.js ładowany jest DYNAMICZNIE dopiero
 * po kliknięciu „Kup”, i tylko gdy w config/payments.json jest clientToken — to jedyny
 * wyjątek od zasady „bez CDN” (patrz docs/decisoes.md). Aplikacja nie zbiera żadnych
 * danych: e-mail i płatność podaje się wyłącznie w oknie Paddle.
 *
 * Gdy config.licenseApi jest ustawiony, po „checkout.completed” licencja włącza się
 * automatycznie (claimPurchase → serwis licencji → activateLicense). Patrz docs.
 *
 * @module checkout
 */
import { activateLicense, licenseStatus } from './license.js';
import { store, isPremium } from './storage.js';

/** Identyfikator aplikacji w serwisie licencji. */
export const APP_ID = 'ulga';
export const PADDLE_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';

let loading = null;
let initialized = false;
let onEvent = null;

function loadScript() {
  if (globalThis.Paddle) return Promise.resolve(globalThis.Paddle);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PADDLE_SRC;
      s.async = true;
      s.onload = () => (globalThis.Paddle ? resolve(globalThis.Paddle) : reject(new Error('no-paddle')));
      s.onerror = () => { loading = null; s.remove(); reject(new Error('load-failed')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * Otwiera overlay Paddle dla planu.
 * @param {'monthly'|'yearly'|'lifetime'} plan
 * @param {object} cfg config/payments.json
 * @param {{onEvent?:(ev:object)=>void}} [opts] np. ev.name === 'checkout.completed'
 * @returns {Promise<{ok:true}|{ok:false, reason:'offline'|'noprice'|'load'|'error'}>}
 */
export async function openCheckout(plan, cfg, opts = {}) {
  const priceId = cfg && cfg.prices && cfg.prices[plan];
  if (!priceId) return { ok: false, reason: 'noprice' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  onEvent = opts.onEvent || null;
  let Paddle;
  try { Paddle = await loadScript(); } catch { return { ok: false, reason: navigator.onLine === false ? 'offline' : 'load' }; }
  try {
    if (!initialized) {
      if (cfg.environment === 'sandbox') Paddle.Environment.set('sandbox');
      Paddle.Initialize({
        token: cfg.clientToken.trim(),
        eventCallback: (ev) => {
          // zapisz transakcję od razu — gdyby aplikacja została zamknięta w trakcie potwierdzania
          if (ev && ev.name === 'checkout.completed' && ev.data && ev.data.transaction_id) rememberTxn(ev.data.transaction_id);
          if (onEvent) onEvent(ev);
        },
      });
      initialized = true;
    }
    const settings = { displayMode: 'overlay', locale: 'pl' };
    if (cfg.successUrl) settings.successUrl = cfg.successUrl;
    Paddle.Checkout.open({ items: [{ priceId, quantity: 1 }], settings });
    return { ok: true };
  } catch (e) {
    console.error('[checkout]', e);
    return { ok: false, reason: 'error' };
  }
}

/** Zamyka overlay Paddle (po automatycznej aktywacji). */
export function closeCheckout() {
  try { globalThis.Paddle?.Checkout?.close?.(); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Licencja automatyczna (serwis licencji = Cloudflare Worker, config.licenseApi).
// Po „checkout.completed” zapisujemy transaction_id i pytamy serwis o kod
// (GET {licenseApi}/license?app=…&txn=…). Serwis niczego nie przechowuje; aplikacja
// wysyła tylko identyfikator transakcji. Pusty licenseApi = stary tryb (kod ręczny).
// ---------------------------------------------------------------------------
const PURCHASE_KEY = 'purchase'; // { txn, sub, pending, renewTriedAt }
/** Odstępy (ms) przed kolejnymi próbami — transakcja może potrzebować kilku sekund na „completed”. */
export const RETRY_DELAYS = [0, 2000, 3000, 5000, 8000];
const RENEW_BEFORE_DAYS = 10;
const RENEW_EVERY_MS = 12 * 3600 * 1000;
const TXN_RE = /^txn_[a-z0-9]{8,64}$/i;
const SUB_RE = /^sub_[a-z0-9]{8,64}$/i;

/** URL serwisu licencji z configu ('' = wyłączony). Tylko https (lub localhost do testów). */
export function licenseApiUrl(cfg) {
  const u = cfg && typeof cfg.licenseApi === 'string' ? cfg.licenseApi.trim().replace(/\/+$/, '') : '';
  return /^https:\/\/[^\s/]+/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u) ? u : '';
}

/** Normalizuje numer transakcji wpisany ręcznie (spacje, wielkość liter). Zwraca '' gdy niepoprawny. */
export function normalizeTxn(s) {
  const v = String(s ?? '').replace(/\s+/g, '').toLowerCase();
  return TXN_RE.test(v) ? v : '';
}

export function getPurchase() { const p = store.get(PURCHASE_KEY, null); return p && typeof p === 'object' ? p : null; }
function savePurchase(patch) { store.set(PURCHASE_KEY, { ...(getPurchase() || {}), ...patch }); }

/** Zapamiętuje transakcję od razu po zakupie (zanim zapytamy serwis). */
export function rememberTxn(txn) {
  const v = normalizeTxn(txn);
  if (v) savePurchase({ txn: v, pending: true });
  return v;
}

/**
 * Jedno zapytanie do serwisu licencji.
 * @returns {Promise<{ok:true, code:string, plan:string, expires:string|null, sub:string|null}
 *   | {ok:false, reason:'off'|'offline'|'pending'|'notpaid'|'notfound'|'wrong'|'inactive'|'busy'|'server', retry:boolean}>}
 */
export async function requestLicense(cfg, { txn, sub } = {}) {
  const api = licenseApiUrl(cfg);
  if (!api) return { ok: false, reason: 'off', retry: false };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline', retry: true };
  const qs = new URLSearchParams({ app: APP_ID });
  if (txn) qs.set('txn', txn); else if (sub) qs.set('sub', sub);
  let r, j = null;
  try {
    r = await fetch(`${api}/license?${qs}`, { method: 'GET', cache: 'no-store', credentials: 'omit' });
    j = await r.json().catch(() => null);
  } catch {
    return { ok: false, reason: 'offline', retry: true };
  }
  if (r.ok && j && typeof j.code === 'string') return { ok: true, code: j.code, plan: j.plan, expires: j.expires ?? null, sub: j.sub || null };
  const err = j && j.error;
  if (r.status === 409 || err === 'pending') return { ok: false, reason: 'pending', retry: true };
  if (r.status === 402 || err === 'not_paid') return { ok: false, reason: 'notpaid', retry: false };
  if (r.status === 404 || err === 'not_found') return { ok: false, reason: 'notfound', retry: true };
  if (err === 'wrong_app') return { ok: false, reason: 'wrong', retry: false };
  if (err === 'inactive') return { ok: false, reason: 'inactive', retry: false };
  if (r.status === 429) return { ok: false, reason: 'busy', retry: false };
  return { ok: false, reason: 'server', retry: r.status >= 500 };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Pobiera kod dla transakcji (do 5 prób) i aktywuje licencję na urządzeniu.
 * @param {string} txn
 * @param {object} cfg config/payments.json
 * @param {{delays?:number[], onAttempt?:(n:number)=>void}} [opts]
 * @returns {Promise<{ok:true, res:object}|{ok:false, reason:string}>}
 */
export async function claimPurchase(txn, cfg, opts = {}) {
  const id = rememberTxn(txn);
  if (!id) return { ok: false, reason: 'badtxn' };
  const delays = opts.delays || RETRY_DELAYS;
  let last = { ok: false, reason: 'server' };
  for (let n = 0; n < delays.length; n++) {
    if (delays[n]) await sleep(delays[n]);
    if (opts.onAttempt) opts.onAttempt(n + 1);
    last = await requestLicense(cfg, { txn: id });
    if (last.ok || !last.retry) break;
  }
  if (!last.ok) {
    if (!last.retry) savePurchase({ pending: false });
    return { ok: false, reason: last.reason };
  }
  const res = await activateLicense(last.code, { publicKeyJwk: cfg.publicKeyJwk });
  if (!res.valid) return { ok: false, reason: 'invalid' };
  savePurchase({ txn: id, sub: last.sub && SUB_RE.test(last.sub) ? last.sub : null, pending: false });
  return { ok: true, res };
}

/**
 * Przy starcie: (1) dokończ zakup przerwany w trakcie potwierdzania, (2) po cichu odnów
 * subskrypcję, gdy licencja wygasa w ciągu 10 dni (lub już wygasła) i znamy sub_….
 * Nigdy nie rzuca. @returns {Promise<{renewed:boolean, claimed:boolean}>}
 */
export async function autoLicenseOnLoad(cfg, now = new Date()) {
  const out = { renewed: false, claimed: false };
  try {
    if (!licenseApiUrl(cfg)) return out;
    const p = getPurchase();
    if (!p) return out;
    if (p.pending && p.txn && !isPremium()) {
      const r = await claimPurchase(p.txn, cfg, { delays: [0, 3000] });
      out.claimed = r.ok;
      return out;
    }
    const st = licenseStatus(now);
    if (!p.sub || !st.plan || st.plan === 'lifetime' || !st.expires) return out;
    const left = Date.parse(st.expires) - now.getTime();
    if (left > RENEW_BEFORE_DAYS * 86400000) return out;
    if (p.renewTriedAt && now.getTime() - Date.parse(p.renewTriedAt) < RENEW_EVERY_MS) return out;
    savePurchase({ renewTriedAt: now.toISOString() });
    const r = await requestLicense(cfg, { sub: p.sub });
    if (!r.ok || !r.expires || Date.parse(r.expires) <= Date.parse(st.expires)) return out;
    const res = await activateLicense(r.code, { publicKeyJwk: cfg.publicKeyJwk, now });
    out.renewed = !!res.valid;
  } catch (e) {
    console.warn('[license] auto', e);
  }
  return out;
}
