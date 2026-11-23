// Ulga — paywall (same scheme as Appolonia). Modes from js/promo.js → paywallMode:
//   promo — launch promotion active: no purchase; live — Paddle (clientToken);
//   sim — simulation only with ?dev=1; soon — no Paddle yet: "premium wkrótce" + license code
import { t } from '../i18n.js';
import { isPremium, setPremium } from '../storage.js';
import { getSession } from '../state.js';
import { loadPaymentsConfig } from '../license.js';
import { openCheckout, claimPurchase, licenseApiUrl, closeCheckout } from '../checkout.js';
import { paywallMode } from '../promo.js';
import { licenseFormHtml, bindLicenseForm, purchaseErrorText } from './activate.js';
import { esc, go, toast, announce, icon } from '../ui.js';

function checkoutError(reason) {
  if (reason === 'offline') return t('paywall.err_offline');
  if (reason === 'noprice') return t('paywall.err_noprice');
  return t('paywall.err_checkout');
}

export async function renderPaywall(app, r) {
  const nextId = r.query.next || null;
  const nextSession = nextId && nextId !== 'sounds' ? getSession(nextId) : null;
  const afterUnlock = nextSession ? `#/play/${encodeURIComponent(nextSession.id)}` : nextId === 'sounds' ? '#/sounds' : '#/home';
  const cfg = await loadPaymentsConfig();
  const mode = paywallMode(cfg);
  const canBuy = mode === 'live' || mode === 'sim';
  const dp = cfg.displayPrices || {};
  let plan = 'yearly';
  let thanks = false;
  let msg = '';
  let confirm = null; // null | 'working' | 'ok' | 'error' (licencja automatyczna)
  let confirmReason = '';
  let txnId = '';

  const plans = [
    { id: 'yearly', title: t('paywall.plan_year'), price: dp.yearly || '', per: t('paywall.per_year'), note: t('paywall.yearly_note'), tag: t('paywall.best') },
    { id: 'lifetime', title: t('paywall.plan_lifetime'), price: dp.lifetime || '', per: t('paywall.once'), note: t('paywall.lifetime_note'), tag: '' },
    { id: 'monthly', title: t('paywall.plan_month'), price: dp.monthly || '', per: t('paywall.per_month'), note: t('paywall.monthly_note'), tag: '' },
  ];

  function planHtml(p) {
    const inner = `${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
      <span class="plan-title">${esc(p.title)}</span>
      <span class="plan-price"><strong>${esc(p.price)}</strong> <span class="muted small">${esc(p.per)}</span></span>
      <span class="muted small">${esc(p.note)}</span>`;
    return canBuy
      ? `<button type="button" class="plan" data-plan="${p.id}" aria-pressed="${plan === p.id}">${inner}</button>`
      : `<div class="plan static" data-plan-info="${p.id}">${inner}</div>`;
  }

  function confirmHtml() {
    if (confirm === 'working') return `<div class="notice" role="status" id="pw-confirm"><p><strong>${esc(t('purchase.confirming'))}</strong></p><p class="small">${esc(t('purchase.confirming_hint'))}</p></div>`;
    if (confirm === 'ok') return `<div class="notice" role="status" id="pw-confirm-ok"><p><strong>${esc(t('purchase.ok'))}</strong></p></div>`;
    if (confirm === 'error') return `<div class="notice" role="alert" id="pw-confirm-err"><p><strong>${esc(t('purchase.err_title'))}</strong></p>
      <p class="small">${esc(purchaseErrorText(confirmReason))}</p><p class="small">${esc(t('purchase.err_hint'))}</p>
      ${txnId ? `<p class="small">${esc(t('purchase.txn_is', { txn: txnId }))}</p>` : ''}
      <button type="button" class="btn block" id="pw-retry">${esc(t('purchase.retry'))}</button></div>`;
    return '';
  }

  async function runClaim(txn) {
    txnId = txn; confirm = 'working'; confirmReason = ''; draw();
    announce(t('purchase.confirming'));
    const r = await claimPurchase(txn, cfg);
    if (!app.isConnected) return;
    if (r.ok) {
      confirm = 'ok'; closeCheckout(); draw();
      toast(t('license.toast_ok')); announce(t('purchase.ok'));
    } else {
      confirm = 'error'; confirmReason = r.reason; draw();
      announce(t('purchase.err_title'));
    }
  }

  function onCheckoutEvent(ev) {
    if (!ev || ev.name !== 'checkout.completed') return;
    const txn = ev.data && ev.data.transaction_id;
    if (licenseApiUrl(cfg) && txn) { runClaim(txn); return; }
    thanks = true; msg = ''; draw();
    announce(t('paywall.thanks_title'));
  }

  function draw() {
    const premium = isPremium();
    app.innerHTML = `
      <a class="back" href="${nextSession || nextId === 'sounds' ? afterUnlock.replace(/^#\/play\/.*/, '#/home') : '#/home'}">${icon('back', 'mini')} ${esc(t('common.back'))}</a>
      <h1>${esc(t('paywall.title'))}</h1>
      <p class="muted">${esc(nextSession ? t('paywall.subtitle_session', { title: nextSession.title }) : nextId === 'sounds' ? t('paywall.subtitle_sounds') : t('paywall.subtitle'))}</p>
      ${mode === 'promo' ? `<p class="notice" id="pw-promo">${esc(t('promo.paywall_banner'))}</p>` : ''}
      ${mode === 'sim' ? `<p class="notice" role="note">${esc(t('paywall.simulation'))}</p>` : ''}
      ${mode === 'soon' ? `<p class="notice" id="pw-soon" role="note"><strong>${esc(t('paywall.soon_title'))}</strong><br><span class="small">${esc(t('paywall.soon_text'))}</span></p>` : ''}
      <ul class="benefits">
        <li>${icon('check', 'mini')}${esc(t('paywall.benefit_all'))}</li>
        <li>${icon('check', 'mini')}${esc(t('paywall.benefit_sounds'))}</li>
        <li>${icon('check', 'mini')}${esc(t('paywall.benefit_offline'))}</li>
        <li>${icon('check', 'mini')}${esc(t('paywall.benefit_honest'))}</li>
      </ul>
      ${confirmHtml()}
      ${premium ? `<div class="card"><p><strong>${esc(t('paywall.already'))}</strong></p><a class="btn block" href="${afterUnlock}">${esc(t('paywall.continue'))}</a></div>` : `
      ${thanks ? `<div class="notice" role="status" id="pw-thanks"><p><strong>${esc(t('paywall.thanks_title'))}</strong></p><p class="small">${esc(t('paywall.thanks_text'))}</p></div>` : ''}
      <div class="plans" role="group" aria-label="${esc(t('paywall.choose_plan'))}">${plans.map(planHtml).join('')}</div>
      ${canBuy ? `<button type="button" class="btn block big" id="pw-start">${esc(plan === 'lifetime' ? t('paywall.cta_lifetime') : t('paywall.cta_subscribe'))}${mode === 'sim' ? ' ' + esc(t('paywall.sim_suffix')) : ''}</button>
      <p class="form-error" id="pw-msg" role="status" aria-live="polite">${esc(msg)}</p>` : ''}
      ${mode === 'promo' ? `<a class="btn block" id="pw-promo-go" href="${afterUnlock}">${esc(t('promo.go'))}</a>` : `<a class="btn ghost block" href="#/home">${esc(t('paywall.not_now'))}</a>`}
      ${licenseFormHtml({ id: 'pwlic', open: thanks || confirm === 'error' })}
      ${canBuy ? `<p class="fine center">${esc(t('paywall.renewal'))}</p>` : ''}
      <p class="fine center">${esc(t('paywall.privacy_note'))}</p>`}`;
    bindLicenseForm(app, { id: 'pwlic', onSuccess: () => setTimeout(() => go(afterUnlock), 1000) });
  }

  app.onclick = async (e) => {
    const p = e.target.closest('[data-plan]');
    if (p && canBuy) { plan = p.dataset.plan; msg = ''; draw(); app.querySelector(`[data-plan="${plan}"]`)?.focus(); return; }
    if (e.target.closest('#pw-retry')) { if (txnId) runClaim(txnId); return; }
    if (!e.target.closest('#pw-start') || !canBuy) return;
    if (mode === 'sim') { setPremium(true); toast(t('paywall.activated')); go(afterUnlock); return; }
    const btn = app.querySelector('#pw-start');
    btn.disabled = true;
    const res = await openCheckout(plan, cfg, { onEvent: onCheckoutEvent });
    if (!app.isConnected) return;
    btn.disabled = false;
    msg = res.ok ? '' : checkoutError(res.reason);
    const m = app.querySelector('#pw-msg');
    if (m) m.textContent = msg;
  };
  draw();
  return () => { app.onclick = null; };
}
