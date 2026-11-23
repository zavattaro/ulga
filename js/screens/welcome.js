// Ulga — one-screen onboarding + RODO consent (no analytics at all)
import { t } from '../i18n.js';
import { setOnboarded, setConsent } from '../storage.js';
import { esc, go } from '../ui.js';

export function renderWelcome(app) {
  app.innerHTML = `
    <section class="welcome">
      <img class="welcome-logo" src="icons/icon-192.png" alt="" width="88" height="88">
      <h1>${esc(t('welcome.title'))}</h1>
      <p class="lead">${esc(t('welcome.lead'))}</p>
      <ul class="welcome-list">
        <li>${esc(t('welcome.point_audio'))}</li>
        <li>${esc(t('welcome.point_sleep'))}</li>
        <li>${esc(t('welcome.point_private'))}</li>
      </ul>
      <p class="fine">${esc(t('ai.notice'))}<br>${esc(t('mdr.notice'))}</p>
      <form id="welcome-form" novalidate>
        <label class="check">
          <input type="checkbox" id="w-accept" required>
          <span>${esc(t('welcome.accept_prefix'))} <a href="legal/terms.html">${esc(t('welcome.terms'))}</a> ${esc(t('welcome.and'))} <a href="legal/privacy.html">${esc(t('welcome.privacy'))}</a>.</span>
        </label>
        <p class="fine">${esc(t('welcome.no_tracking'))}</p>
        <button type="submit" class="btn block big" id="w-start">${esc(t('welcome.start'))}</button>
        <p class="form-error" id="w-error" role="alert"></p>
      </form>
    </section>`;
  const cb = app.querySelector('#w-accept');
  const btn = app.querySelector('#w-start');
  const err = app.querySelector('#w-error');
  btn.classList.add('is-dim');
  cb.addEventListener('change', () => { btn.classList.toggle('is-dim', !cb.checked); if (cb.checked) err.textContent = ''; });
  app.querySelector('#welcome-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!cb.checked) { err.textContent = t('welcome.must_accept'); cb.focus(); return; }
    setConsent({ analytics: false });
    setOnboarded(true);
    go('#/home');
  });
}
