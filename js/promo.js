/**
 * Ulga — opcjonalna promocja startowa i dostęp do treści premium.
 *
 * config/payments.json → "promoFreeUntil": ISO z offsetem (np. "2027-01-31T23:59:59+01:00").
 * Dopóki teraz <= promoFreeUntil, wszystkie sesje są dostępne. Promocja jest WYLICZANA
 * z daty (nic nie zapisujemy, nie wołamy setPremium), więc kończy się sama.
 *
 * Tryby paywalla (paywallMode):
 *   'promo' — trwa promocja: bez przycisków zakupu
 *   'live'  — jest clientToken → Paddle
 *   'sim'   — brak clientToken + ?dev=1 w URL → symulacja (tylko do testów)
 *   'soon'  — brak clientToken (wersja publiczna) → „premium wkrótce” + „Mam kod licencyjny”
 *
 * @module promo
 */
import { isPremium } from './storage.js';

let current = null;

/** Ustawia konfigurację płatności używaną domyślnie (wołane przez license.loadPaymentsConfig). */
export function setPromoConfig(cfg) { current = cfg && typeof cfg === 'object' ? cfg : null; }

/** @returns {number|null} koniec promocji (ms od epoki) albo null. */
export function promoEnd(cfg = current) {
  const s = cfg && cfg.promoFreeUntil;
  if (typeof s !== 'string' || !s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** Czy promocja trwa? @param {Date} [now] @param {object} [cfg] */
export function isPromoActive(now = new Date(), cfg = current) {
  const end = promoEnd(cfg);
  return end !== null && now.getTime() <= end;
}

/** Klucz etykiety promocji (np. "promo.advent"). */
export function promoLabelKey(cfg = current) {
  return (cfg && typeof cfg.promoLabelKey === 'string' && cfg.promoLabelKey) || 'promo.launch';
}

/** Dostęp do sesji premium: wykupione premium ALBO trwająca promocja. */
export function hasPremiumAccess(now = new Date(), cfg = current) {
  return isPremium() || isPromoActive(now, cfg);
}

/** Tryb deweloperski (?dev=1 w adresie lub w hashu) — odblokowuje symulowany zakup. */
export function isDevMode(loc = globalThis.location) {
  if (!loc) return false;
  try {
    if (new URLSearchParams(loc.search || '').get('dev') === '1') return true;
    const qs = String(loc.hash || '').split('?')[1] || '';
    return new URLSearchParams(qs).get('dev') === '1';
  } catch { return false; }
}

/** @returns {'promo'|'live'|'sim'|'soon'} */
export function paywallMode(cfg = current, { now = new Date(), dev = isDevMode() } = {}) {
  if (isPromoActive(now, cfg)) return 'promo';
  if (cfg && typeof cfg.clientToken === 'string' && cfg.clientToken.trim()) return 'live';
  return dev ? 'sim' : 'soon';
}
