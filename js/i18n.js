// Ulga — i18n: płaski słownik "sekcja.klucz": "tekst"
let dict = {};
let currentLang = 'pl';

export async function loadLocale(lang = 'pl') {
  currentLang = lang;
  try {
    const res = await fetch(`locales/${lang}.json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    dict = await res.json();
  } catch (e) {
    console.warn('[i18n] locale load failed', e);
    dict = {};
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  return dict;
}

export function t(key, vars = {}) {
  const raw = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  return String(raw).replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m);
}

export function getLang() { return currentLang; }
// Do testów: wstrzyknięcie słownika
export function _setDict(d) { dict = d || {}; }
