// Ulga — core: brand, routing, tab bar, service worker
import { loadLocale, t } from './i18n.js';
import { isOnboarded, getConsent, getSettings } from './storage.js';
import { esc, icon, toast } from './ui.js';
import { state, applyTheme } from './state.js';
import { renderWelcome } from './screens/welcome.js';
import { renderHome } from './screens/home.js';
import { renderPlayer } from './screens/player.js';
import { renderSounds } from './screens/sounds.js';
import { renderProgress } from './screens/progress.js';
import { renderSettings } from './screens/settings.js';
import { renderPaywall } from './screens/paywall.js';
import { renderActivate } from './screens/activate.js';
import { loadPaymentsConfig, checkLicenseOnLoad, setPendingCode, peekPendingCode } from './license.js';

const routes = {
  welcome: renderWelcome,
  home: renderHome,
  play: renderPlayer,
  sounds: renderSounds,
  progress: renderProgress,
  settings: renderSettings,
  paywall: renderPaywall,
  activate: renderActivate,
};
const TAB_ROUTES = ['home', 'sounds', 'progress', 'settings', 'paywall', 'activate'];
let cleanup = null;

export function parseHash(hash = location.hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  return { name: parts[0] || 'home', param: parts[1] || null, query: Object.fromEntries(new URLSearchParams(qs)) };
}

function applyBrand(brand) {
  if (!brand || !brand.colors) return;
  const map = { bg: '--bg', bg2: '--bg2', surface: '--surface', surface2: '--surface2', primary: '--primary', onPrimary: '--on-primary', accent: '--accent', text: '--text', muted: '--muted' };
  const decl = (cols) => Object.entries(map).filter(([k]) => cols && cols[k]).map(([k, v]) => `${v}:${cols[k]};`).join('');
  let css = `:root{${decl(brand.colors)}${brand.fontStack ? `--font:${brand.fontStack};` : ''}}`;
  if (brand.colorsLight) {
    css += `:root[data-theme="light"]{${decl(brand.colorsLight)}}`;
    css += `@media (prefers-color-scheme: light){:root[data-theme="auto"]{${decl(brand.colorsLight)}}}`;
  }
  let el = document.getElementById('brand-vars');
  if (!el) { el = document.createElement('style'); el.id = 'brand-vars'; document.head.appendChild(el); }
  el.textContent = css;
}

function renderTabbar(active) {
  const bar = document.getElementById('tabbar');
  const tabs = [
    ['home', 'home', t('nav.home')],
    ['sounds', 'waves', t('nav.sounds')],
    ['progress', 'chart', t('nav.progress')],
    ['settings', 'gear', t('nav.settings')],
  ];
  const current = active === 'paywall' ? 'home' : active === 'activate' ? 'settings' : active;
  bar.setAttribute('aria-label', t('nav.label'));
  bar.innerHTML = tabs.map(([id, ic, label]) =>
    `<a href="#/${id}" data-tab="${id}"${id === current ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span></a>`).join('');
}

async function route() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.warn(e); } }
  cleanup = null;
  const r = parseHash();
  if (r.name === 'activate' && r.query.code) setPendingCode(r.query.code);
  const ready = isOnboarded() && getConsent();
  if (!ready) {
    if (r.name !== 'welcome') { location.replace('#/welcome'); return; }
  } else if (r.name === 'welcome') { location.replace('#/home'); return; }
  if (!routes[r.name]) { location.replace('#/home'); return; }
  if (ready && r.name !== 'activate' && peekPendingCode()) { location.replace('#/activate'); return; }

  const app = document.getElementById('app');
  const bar = document.getElementById('tabbar');
  const withTabs = TAB_ROUTES.includes(r.name);
  bar.hidden = !withTabs;
  document.body.classList.toggle('has-tabbar', withTabs);
  document.body.dataset.route = r.name;
  if (withTabs) renderTabbar(r.name);
  try {
    cleanup = (await routes[r.name](app, r)) || null;
  } catch (e) {
    console.error('[route]', e);
    app.innerHTML = `<div class="empty"><p>${esc(t('common.error'))}</p><a class="btn" href="#/home">${esc(t('common.back_home'))}</a></div>`;
  }
  const h1 = app.querySelector('h1');
  const name = state.brand?.appName || 'Ulga';
  document.title = h1 && r.name !== 'home' ? `${h1.textContent} — ${name}` : (state.brand?.fullName || name);
  window.scrollTo(0, 0);
  if (h1 && r.name !== 'play') { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
}

async function boot() {
  const [brand, content] = await Promise.all([
    fetch('config/brand.json').then((r) => r.json()).catch(() => null),
    fetch('content/sessions.json', { cache: 'no-cache' }).then((r) => r.json()).catch((e) => { console.error('[content]', e); return { sessions: [] }; }),
    loadLocale('pl'),
    loadPaymentsConfig(),
  ]);
  state.brand = brand;
  state.sessions = content.sessions || [];
  applyBrand(brand);
  applyTheme(getSettings().theme);
  if (globalThis.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme(getSettings().theme));
  const skip = document.getElementById('skip-link');
  if (skip) skip.textContent = t('common.skip');
  const lic = checkLicenseOnLoad();
  window.addEventListener('hashchange', route);
  await route();
  if (lic.expired) toast(t('license.expired_notice'));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e));
  }
}

boot();
