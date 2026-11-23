// Ulga — Postępy: minutes, sessions, streak, 7-day program, recent history
import { t } from '../i18n.js';
import { getProgress, getHistory } from '../storage.js';
import { state, getSession } from '../state.js';
import { programStatus } from '../program.js';
import { esc, icon, fmtDate } from '../ui.js';

export function renderProgress(app) {
  const p = getProgress();
  const prog = programStatus(state.sessions, p.completed);
  const doneDays = prog.filter((x) => x.status === 'done').length;
  const hist = getHistory().slice(-8).reverse();
  const name = (id) => (id === 'timer' ? t('progress.timer') : (getSession(id)?.title || id));

  app.innerHTML = `
    <h1>${esc(t('progress.title'))}</h1>
    <div class="stats">
      <div class="stat"><span class="stat-n" id="st-min">${p.totalMinutes}</span><span class="stat-l">${esc(t('progress.minutes'))}</span></div>
      <div class="stat"><span class="stat-n" id="st-ses">${p.totalSessions}</span><span class="stat-l">${esc(t('progress.sessions'))}</span></div>
      <div class="stat"><span class="stat-n" id="st-streak">${p.streakDays}</span><span class="stat-l">${esc(t('progress.streak'))}</span></div>
    </div>

    <h2>${esc(t('cat.start'))}</h2>
    <div class="card">
      <div class="days" role="list" aria-label="${esc(t('progress.program_aria', { n: doneDays, total: prog.length }))}">
        ${prog.map(({ session, day, status }) => `<a role="listitem" href="#/play/${encodeURIComponent(session.id)}" class="day d-${status}" title="${esc(session.title)}" aria-label="${esc(t('list.day', { n: day }) + ': ' + session.title + (status === 'done' ? ', ' + t('list.done') : status === 'soon' ? ', ' + t('session.soon') : ''))}">${status === 'done' ? icon('check', 'mini') : day}</a>`).join('')}
      </div>
      <p class="muted small">${esc(doneDays >= prog.length && prog.length ? t('progress.program_done') : t('progress.program_count', { n: doneDays, total: prog.length }))}</p>
    </div>

    <h2>${esc(t('progress.recent'))}</h2>
    ${hist.length ? `<ul class="hist">${hist.map((h) => `<li><span>${esc(name(h.id))}</span><span class="muted small">${esc(fmtDate(h.date.slice(0, 10)))} · ${esc(t('common.min', { n: Math.max(1, Math.round(h.seconds / 60)) }))}</span></li>`).join('')}</ul>`
      : `<p class="muted">${esc(t('progress.empty'))}</p>`}
    <p class="fine">${esc(t('progress.local'))}</p>`;
}
