// Ulga — aktywacja kodu licencyjnego (formularz wspólny dla paywalla i Ustawień + ekran #/activate?code=…)
import { t } from '../i18n.js';
import { activateLicense, takePendingCode } from '../license.js';
import { claimPurchase, normalizeTxn } from '../checkout.js';
import { esc, go, fmtDate, toast, announce, icon } from '../ui.js';

export function planName(plan) {
  switch (plan) {
    case 'monthly': return t('license.plan_monthly');
    case 'yearly': return t('license.plan_yearly');
    case 'lifetime': return t('license.plan_lifetime');
    default: return String(plan || '');
  }
}

/** Komunikat dla wyniku verifyLicense/activateLicense. */
export function licenseMessage(res) {
  if (res.valid) {
    return res.expires
      ? t('license.ok_until', { plan: planName(res.plan), date: fmtDate(res.expires) })
      : t('license.ok_forever', { plan: planName(res.plan) });
  }
  switch (res.reason) {
    case 'empty': return t('license.err_empty');
    case 'format': return t('license.err_format');
    case 'signature': return t('license.err_signature');
    case 'expired': return t('license.err_expired', { date: fmtDate(res.expires) });
    case 'plan': return t('license.err_plan');
    default: return t('license.err_device');
  }
}

/**
 * HTML formularza „Mam kod licencyjny”.
 * @param {{id?:string, open?:boolean, value?:string}} [o]
 */
export function licenseFormHtml({ id = 'lic', open = false, value = '' } = {}) {
  return `
    <details class="license-box" id="${id}-box"${open ? ' open' : ''}>
      <summary>${esc(t('license.have_code'))}</summary>
      <form class="license-form" id="${id}-form" novalidate>
        <label for="${id}-code">${esc(t('license.code_label'))}</label>
        <textarea id="${id}-code" name="code" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ULG-…">${esc(value)}</textarea>
        <p class="muted small">${esc(t('license.code_hint'))}</p>
        <button type="submit" class="btn block" id="${id}-submit">${esc(t('license.activate'))}</button>
        <p class="license-msg" id="${id}-msg" role="status" aria-live="polite"></p>
      </form>
    </details>`;
}

/**
 * Podpina obsługę formularza (wywołać po każdym renderze).
 * @param {HTMLElement} root
 * @param {{id?:string, onSuccess?:(res:object)=>void}} [o]
 */
export function bindLicenseForm(root, { id = 'lic', onSuccess } = {}) {
  const form = root.querySelector(`#${id}-form`);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector(`#${id}-code`);
    const msg = form.querySelector(`#${id}-msg`);
    const btn = form.querySelector(`#${id}-submit`);
    const code = input.value.trim();
    let res;
    if (!code) res = { valid: false, reason: 'empty' };
    else {
      btn.disabled = true;
      msg.textContent = t('license.checking');
      try { res = await activateLicense(code); } catch (err) { console.error(err); res = { valid: false, reason: 'device' }; }
      btn.disabled = false;
    }
    msg.textContent = licenseMessage(res);
    msg.className = 'license-msg ' + (res.valid ? 'ok' : 'err');
    if (res.valid) {
      toast(t('license.toast_ok'));
      if (onSuccess) onSuccess(res);
    } else {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  });
}

/** Komunikat dla błędu claimPurchase/requestLicense (serwis licencji). */
export function purchaseErrorText(reason) {
  switch (reason) {
    case 'badtxn': return t('purchase.err_txn_format');
    case 'offline': return t('purchase.err_offline');
    case 'pending': return t('purchase.err_pending');
    case 'notpaid': return t('purchase.err_notpaid');
    case 'notfound': return t('purchase.err_notfound');
    case 'wrong': return t('purchase.err_wrong');
    case 'busy': return t('purchase.err_busy');
    default: return t('purchase.err_server');
  }
}

/** HTML „Przywróć zakup” (numer transakcji txn_… → serwis licencji). */
export function restoreFormHtml({ id = 'rst', open = false } = {}) {
  return `
    <details class="license-box" id="${id}-box"${open ? ' open' : ''}>
      <summary>${esc(t('purchase.restore_h'))}</summary>
      <form class="license-form" id="${id}-form" novalidate>
        <p class="muted small">${esc(t('purchase.restore_intro'))}</p>
        <label for="${id}-txn">${esc(t('purchase.txn_label'))}</label>
        <input type="text" class="txn" id="${id}-txn" name="txn" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="txn_…">
        <button type="submit" class="btn block" id="${id}-submit">${esc(t('purchase.restore_btn'))}</button>
        <p class="license-msg" id="${id}-msg" role="status" aria-live="polite"></p>
        <p class="muted small">${esc(t('purchase.restore_privacy'))}</p>
      </form>
    </details>`;
}

/**
 * Podpina „Przywróć zakup”.
 * @param {HTMLElement} root
 * @param {{id?:string, cfg:object, onSuccess?:(res:object)=>void}} o
 */
export function bindRestoreForm(root, { id = 'rst', cfg, onSuccess } = {}) {
  const form = root.querySelector(`#${id}-form`);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector(`#${id}-txn`);
    const msg = form.querySelector(`#${id}-msg`);
    const btn = form.querySelector(`#${id}-submit`);
    const txn = normalizeTxn(input.value);
    let r;
    if (!txn) r = { ok: false, reason: 'badtxn' };
    else {
      btn.disabled = true;
      msg.className = 'license-msg';
      msg.textContent = t('purchase.confirming');
      try { r = await claimPurchase(txn, cfg, { delays: [0, 2000] }); } catch (err) { console.error(err); r = { ok: false, reason: 'server' }; }
      btn.disabled = false;
    }
    msg.textContent = r.ok ? licenseMessage(r.res) : purchaseErrorText(r.reason);
    msg.className = 'license-msg ' + (r.ok ? 'ok' : 'err');
    if (r.ok) {
      toast(t('license.toast_ok'));
      if (onSuccess) onSuccess(r.res);
    } else {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  });
}

/** Ekran #/activate?code=ULG-… (link z e-maila po zakupie). */
export async function renderActivate(app, r) {
  const pending = takePendingCode();
  const code = (r.query && r.query.code) || pending || '';
  const head = `<a class="back" href="#/settings">${icon('back', 'mini')} ${esc(t('common.back'))}</a>
    <h1>${esc(t('license.title'))}</h1>`;

  if (!code) {
    app.innerHTML = `${head}<p class="center muted">${esc(t('license.intro'))}</p>${licenseFormHtml({ id: 'act', open: true })}`;
    bindLicenseForm(app, { id: 'act', onSuccess: () => setTimeout(() => go('#/home'), 1200) });
    return;
  }

  app.innerHTML = `${head}<p class="center" role="status" aria-live="polite" id="act-status">${esc(t('license.checking'))}</p>`;
  let res;
  try { res = await activateLicense(code); } catch (e) { console.error(e); res = { valid: false, reason: 'device' }; }
  // usuń kod z paska adresu (nie zostaje w historii)
  try { history.replaceState(null, '', '#/activate'); } catch { /* ignore */ }

  if (res.valid) {
    app.innerHTML = `${head}
      <div class="card center license-result ok" role="status">
        <p><strong>${esc(licenseMessage(res))}</strong></p>
        <a class="btn block" href="#/home">${esc(t('license.go_home'))}</a>
      </div>`;
    announce(licenseMessage(res));
  } else {
    app.innerHTML = `${head}
      <div class="notice license-result err" role="alert"><p>${esc(licenseMessage(res))}</p></div>
      ${licenseFormHtml({ id: 'act', open: true, value: code })}`;
    bindLicenseForm(app, { id: 'act', onSuccess: () => setTimeout(() => go('#/home'), 1200) });
  }
}
