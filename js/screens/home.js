// Ulga — home: one big "Zacznij" button + short lists by category
import { t } from '../i18n.js';
import { getProgress } from '../storage.js';
import { state } from '../state.js';
import { CATEGORIES, recommend, programStatus, canPlay, isReady, greetingKey } from '../program.js';
import { hasPremiumAccess, isPromoActive, promoEnd, promoLabelKey } from '../promo.js';
import { esc, fmtMin, icon, sessionRow, fmtDate } from '../ui.js';

export function renderHome(app) {
  const now = new Date();
  const prog = getProgress(now);
  const access = hasPremiumAccess(now);
  const rec = recommend({ sessions: state.sessions, completed: prog.completed, now, premiumAccess: access });
  const s = rec.session;
  const done = (id) => (Number(prog.completed[id]) || 0) > 0;

  const sections = CATEGORIES.map((c) => {
    let rows;
    if (c.id === 'start') {
      rows = programStatus(state.sessions, prog.completed).map(({ session, day, status }) =>
        sessionRow(session, {
          soon: !isReady(session),
          locked: !canPlay(session, access),
          done: status === 'done',
          label: t('list.day', { n: day }) + (status === 'next' ? ' · ' + t('list.next') : ''),
        })).join('');
    } else {
      rows = state.sessions.filter((x) => x.category === c.id)
        .map((x) => sessionRow(x, { soon: !isReady(x), locked: !canPlay(x, access), done: done(x.id) })).join('');
    }
    if (!rows) return '';
    return `<section class="cat" id="cat-${c.id}"><h2>${esc(t(c.titleKey))}</h2><div class="rows">${rows}</div></section>`;
  }).join('');

  const promo = isPromoActive(now) ? `<p class="pill" id="promo-badge">${esc(t(promoLabelKey(), { date: fmtDate(new Date(promoEnd()).toISOString()) }))}</p>` : '';

  app.innerHTML = `
    <header class="home-head">
      <p class="greet">${icon('moon', 'greet-ico')}<span>${esc(t(greetingKey(now.getHours())))}</span></p>
      ${prog.streakDays > 1 ? `<p class="streak">${esc(t('home.streak', { n: prog.streakDays }))}</p>` : ''}
    </header>
    <h1 class="sr-only">${esc(t('home.title'))}</h1>
    ${promo}
    ${s ? `
    <div class="hero">
      <a class="start-btn" id="start" href="#/play/${encodeURIComponent(s.id)}" aria-describedby="start-what">
        <span class="start-glow" aria-hidden="true"></span>
        <span class="start-label">${esc(t('home.start'))}</span>
      </a>
      <p class="start-what" id="start-what">
        <span class="start-reason">${esc(t('home.reason_' + rec.reason))}</span>
        <strong>${esc(s.title)}</strong>
        <span class="muted">${esc(fmtMin(s.durationSec))}${!canPlay(s, access) ? ' · ' + esc(t('list.premium')) : ''}</span>
      </p>
    </div>` : `
    <div class="hero">
      <a class="start-btn" id="start" href="#/sounds" aria-describedby="start-what">
        <span class="start-glow" aria-hidden="true"></span>
        <span class="start-label">${esc(t('home.start'))}</span>
      </a>
      <p class="start-what" id="start-what">
        <span class="start-reason">${esc(t('home.reason_sounds'))}</span>
        <strong>${esc(t('nav.sounds'))}</strong>
      </p>
    </div>`}
    ${state.sessions.some((x) => !isReady(x)) ? `<p class="soft-note" id="soon-note">${esc(t('home.soon_note'))}</p>` : ''}
    ${sections}
    <p class="fine center home-foot">${esc(t('ai.notice'))}</p>`;
}
