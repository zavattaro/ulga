// Ulga — small UI helpers and inline SVG icons (no icon fonts, no emoji in controls)
import { t } from './i18n.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
export function fmtMin(sec) { return t('common.min', { n: Math.max(1, Math.round((Number(sec) || 0) / 60)) }); }
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  try { return new Date(y, m - 1, d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; }
}

let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
export function announce(msg) {
  const live = document.getElementById('live');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }
}

const P = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/>',
  back15: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 3.8v3.6h3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.3" text-anchor="middle" font-size="7.2" font-family="system-ui,sans-serif" font-weight="700" fill="currentColor">15</text>',
  fwd15: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 3.8v3.6h-3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.3" text-anchor="middle" font-size="7.2" font-family="system-ui,sans-serif" font-weight="700" fill="currentColor">15</text>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  home: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  waves: '<path d="M3 9c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0 3.3-1.5 5 0M3 15c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0 3.3-1.5 5 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chart: '<path d="M5 19V11M12 19V5M19 19v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  timer: '<circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v4l2.5 2M9.5 2.8h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  bell: '<path d="M6 16.5h12l-1.4-2V10a4.6 4.6 0 0 0-9.2 0v4.5z M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  chevron: '<path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

/** Row in a session list. state: 'locked'|'done'|'next'|'' */
export function sessionRow(s, { locked = false, done = false, label = '', soon = false } = {}) {
  // soon = recording not ready yet: discreet badge, never the premium lock
  const right = soon ? `<span class="soon-badge" title="${esc(t('session.soon'))}" aria-label="${esc(t('session.soon'))}">${esc(t('session.soon_short'))}</span>`
    : locked ? `<span class="row-ico" role="img" aria-label="${esc(t('list.locked'))}">${icon('lock')}</span>`
    : done ? `<span class="row-ico ok" role="img" aria-label="${esc(t('list.done'))}">${icon('check')}</span>` : `<span class="row-ico dim">${icon('chevron')}</span>`;
  return `<a class="row${soon ? ' is-soon' : locked ? ' is-locked' : ''}" href="#/play/${encodeURIComponent(s.id)}" data-id="${esc(s.id)}"${soon ? ' data-soon="1"' : ''}>
    <span class="row-main">
      <span class="row-title">${esc(s.title)}</span>
      <span class="row-meta">${esc(fmtMin(s.durationSec))}${label ? ' · ' + esc(label) : (s.subtitle ? ' · ' + esc(s.subtitle) : '')}</span>
    </span>${right}</a>`;
}
