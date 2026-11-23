/**
 * Ulga — checkout Paddle (Paddle.js v2, overlay).
 *
 * Skrypt https://cdn.paddle.com/paddle/v2/paddle.js ładowany jest DYNAMICZNIE dopiero
 * po kliknięciu „Kup”, i tylko gdy w config/payments.json jest clientToken — to jedyny
 * wyjątek od zasady „bez CDN” (patrz docs/decisoes.md). Aplikacja nie zbiera żadnych
 * danych: e-mail i płatność podaje się wyłącznie w oknie Paddle.
 *
 * @module checkout
 */
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
      Paddle.Initialize({ token: cfg.clientToken.trim(), eventCallback: (ev) => { if (onEvent) onEvent(ev); } });
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
