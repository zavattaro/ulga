// Ulga — Ustawienia: theme, reminder (.ics), downloads, premium/license, privacy & data
import { t } from '../i18n.js';
import { getSettings, setSettings, isPremium, setPremium, getConsent, resetAll, exportData as dumpData } from '../storage.js';
import { APP_VERSION, applyTheme, state } from '../state.js';
import { loadPaymentsConfig, licenseStatus, removeLicense } from '../license.js';
import { paywallMode, hasPremiumAccess } from '../promo.js';
import { canPlay, isReady } from '../program.js';
import { buildDailyIcs, downloadIcs } from '../ics.js';
import * as offline from '../offline.js';
import { licenseFormHtml, bindLicenseForm, planName } from './activate.js';
import { esc, go, toast, fmtDate, icon } from '../ui.js';

export function exportData() {
  const payload = { app: 'Ulga', version: APP_VERSION, exportedAt: new Date().toISOString(), data: dumpData() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ulga-moje-dane-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return payload;
}

export async function renderSettings(app) {
  let confirming = false;
  let dlBusy = false;
  const cfg = await loadPaymentsConfig();
  let used = await offline.usedBytes();

  function draw() {
    const st = getSettings();
    const premium = isPremium();
    const lic = licenseStatus();
    const mode = paywallMode(cfg);
    const consent = getConsent();
    let premiumText;
    if (premium && lic.active) premiumText = lic.expires ? t('settings.license_until', { plan: planName(lic.plan), date: fmtDate(lic.expires) }) : t('settings.license_forever', { plan: planName(lic.plan) });
    else if (premium) premiumText = t('settings.premium_active');
    else if (lic.expired) premiumText = t('settings.license_expired', { date: fmtDate(lic.expires) });
    else premiumText = mode === 'promo' ? t('settings.premium_promo') : t('settings.premium_inactive');

    app.innerHTML = `
      <h1>${esc(t('settings.title'))}</h1>

      <h2>${esc(t('settings.look_h'))}</h2>
      <div class="card">
        <div class="seg" role="group" aria-label="${esc(t('settings.theme'))}">
          ${['dark', 'light', 'auto'].map((v) => `<button type="button" data-theme-set="${v}" aria-pressed="${st.theme === v}">${esc(t('settings.theme_' + v))}</button>`).join('')}
        </div>
      </div>

      <h2>${esc(t('settings.reminder_h'))}</h2>
      <div class="card">
        <p class="small muted">${esc(t('settings.reminder_text'))}</p>
        <div class="inline">
          <label for="s-time">${esc(t('settings.reminder_time'))}</label>
          <input type="time" id="s-time" value="${esc(st.reminderTime)}" step="300">
        </div>
        <button type="button" class="btn secondary block" id="s-ics">${icon('calendar')} ${esc(t('settings.reminder_btn'))}</button>
      </div>

      <h2>${esc(t('settings.offline_h'))}</h2>
      <div class="card">
        <p class="small"><span id="s-used">${esc(t('settings.offline_used', { size: offline.fmtBytes(used) }))}</span></p>
        <p class="small muted">${esc(t('settings.offline_text'))}</p>
        <button type="button" class="btn secondary block" id="s-dl-all"${dlBusy ? ' disabled' : ''}>${icon('download')} ${esc(dlBusy ? t('player.dl_busy') : t('settings.offline_all'))}</button>
        <div class="gap"></div>
        <button type="button" class="btn ghost block" id="s-dl-rm">${esc(t('settings.offline_remove'))}</button>
      </div>

      <h2>${esc(t('settings.premium_h'))}</h2>
      <div class="card">
        <p><strong id="s-premium">${esc(premiumText)}</strong></p>
        ${premium && lic.active && lic.code ? `<details class="license-code"><summary>${esc(t('settings.license_show'))}</summary><p class="muted small">${esc(t('settings.license_code_hint'))}</p><code class="code-box">${esc(lic.code)}</code></details>` : ''}
        ${premium ? `<button type="button" class="btn ghost block" id="s-free">${esc(lic.active ? t('settings.license_remove') : t('settings.restore_free'))}</button>`
          : `<a class="btn block" href="#/paywall">${esc(t('settings.see_premium'))}</a>`}
        ${licenseFormHtml({ id: 'slic' })}
      </div>

      <h2>${esc(t('settings.privacy_h'))}</h2>
      <div class="card">
        <p class="small muted">${esc(t('settings.privacy_text'))}</p>
        <p class="small muted">${esc(t('settings.consent_date', { date: fmtDate(consent && consent.date) }))}</p>
        <div class="link-list">
          <a href="legal/privacy.html">${esc(t('settings.privacy_policy'))} ${icon('chevron', 'mini')}</a>
          <a href="legal/terms.html">${esc(t('settings.terms'))} ${icon('chevron', 'mini')}</a>
        </div>
        <button type="button" class="btn ghost block" id="s-export">${esc(t('settings.export'))}</button>
        ${confirming ? `
          <div class="notice" role="alertdialog" aria-labelledby="del-h">
            <p id="del-h"><strong>${esc(t('settings.delete_confirm_title'))}</strong></p>
            <p class="small">${esc(t('settings.delete_confirm_text'))}</p>
            <div class="btn-row">
              <button type="button" class="btn ghost" id="s-del-cancel">${esc(t('common.cancel'))}</button>
              <button type="button" class="btn danger" id="s-del-yes">${esc(t('settings.delete_confirm_yes'))}</button>
            </div>
          </div>` : `<button type="button" class="btn ghost danger-text block" id="s-delete">${esc(t('settings.delete_all'))}</button>`}
      </div>

      <h2>${esc(t('settings.about_h'))}</h2>
      <div class="card">
        <p class="small" id="s-ai">${esc(t('ai.notice'))}</p>
        <p class="small">${esc(t('mdr.notice'))}</p>
        <p class="small muted">${esc(t('settings.crisis'))}</p>
        <p class="small muted">${esc(t('settings.version', { v: APP_VERSION }))}</p>
      </div>`;
    bindLicenseForm(app, { id: 'slic', onSuccess: () => setTimeout(draw, 1200) });
  }

  app.onchange = (e) => {
    if (e.target.id === 's-time') { setSettings({ reminderTime: e.target.value || '21:30' }); toast(t('settings.saved')); }
  };

  app.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.themeSet) { setSettings({ theme: b.dataset.themeSet }); applyTheme(b.dataset.themeSet); draw(); app.querySelector(`[data-theme-set="${b.dataset.themeSet}"]`)?.focus(); return; }
    switch (b.id) {
      case 's-ics': {
        const time = app.querySelector('#s-time').value || getSettings().reminderTime;
        setSettings({ reminderTime: time });
        const url = location.href.split('#')[0] + '#/home';
        downloadIcs(buildDailyIcs({ time, title: t('ics.title'), description: t('ics.description'), url }));
        toast(t('settings.reminder_done'));
        break;
      }
      case 's-dl-all': {
        dlBusy = true; draw();
        const access = hasPremiumAccess();
        let ok = 0; let fail = 0;
        for (const s of state.sessions.filter((x) => isReady(x) && canPlay(x, access))) {
          if (await offline.isDownloaded(s)) { ok++; continue; }
          const r = await offline.download(s);
          if (r.ok) ok++; else fail++;
          if (r.reason === 'offline') break;
        }
        dlBusy = false; used = await offline.usedBytes();
        if (app.isConnected) { draw(); toast(fail ? t('settings.offline_partial', { n: ok, f: fail }) : t('settings.offline_all_done', { n: ok })); }
        break;
      }
      case 's-dl-rm':
        await offline.removeAll(); used = 0; draw(); toast(t('player.dl_removed')); break;
      case 's-free':
        if (licenseStatus().active && !window.confirm(t('settings.license_remove_confirm'))) break;
        removeLicense(); setPremium(false); toast(t('settings.free_restored')); draw(); break;
      case 's-export': exportData(); toast(t('settings.exported')); break;
      case 's-delete': confirming = true; draw(); app.querySelector('#s-del-cancel')?.focus(); break;
      case 's-del-cancel': confirming = false; draw(); break;
      case 's-del-yes':
        resetAll(); await offline.removeAll(); applyTheme('dark'); go('#/welcome'); break;
      default: break;
    }
  };

  draw();
  return () => { app.onclick = null; app.onchange = null; };
}
