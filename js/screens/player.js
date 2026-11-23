// Ulga — session player screen
import { t } from '../i18n.js';
import { getSettings, setSettings, getProgress } from '../storage.js';
import { state, getSession } from '../state.js';
import { canPlay, canUseSound, suggestedBefore, isReady, programSessions } from '../program.js';
import { hasPremiumAccess } from '../promo.js';
import { SOUNDS, hasWebAudio, setBgVolume } from '../audio.js';
import { createSessionPlayer, volumeControllable, SKIP_SEC } from '../player.js';
import { fmtClock } from '../timer.js';
import * as offline from '../offline.js';
import { esc, go, icon, toast, announce } from '../ui.js';

const SLEEP_CHOICES = [0, 10, 20, 30, 45, 60, 'end'];

/** Friendly notice for a session whose recording is not published yet (instead of the player). */
function renderSoon(app, s) {
  const first = programSessions(state.sessions).find((x) => isReady(x) && x.id !== s.id);
  app.innerHTML = `
    <div class="player soon-screen" id="soon">
      <div class="player-top">
        <a class="icon-btn ghost" href="#/home" id="p-close" aria-label="${esc(t('player.close'))}">${icon('close')}</a>
        <span class="player-cat">${esc(t('cat.' + s.category))}${s.day ? ' · ' + esc(t('list.day', { n: s.day })) : ''}</span>
        <span class="icon-btn-spacer"></span>
      </div>
      <div class="orb-wrap" aria-hidden="true"><div class="orb"></div></div>
      <h1 class="player-title">${esc(s.title)}</h1>
      <p class="soon-badge big">${esc(t('session.soon'))}</p>
      <p class="soon-text" id="soon-text">${esc(t('session.soon_text'))}</p>
      <div class="soon-actions">
        ${first ? `<a class="btn block" id="soon-try" href="#/play/${encodeURIComponent(first.id)}">${esc(t('session.soon_try', { title: first.title }))}</a>` : ''}
        <a class="btn secondary block" id="soon-sounds" href="#/sounds">${esc(t('session.soon_sounds'))}</a>
        <a class="btn ghost block" href="#/home">${esc(t('common.back_home'))}</a>
      </div>
    </div>`;
}

export async function renderPlayer(app, r) {
  const s = getSession(r.param);
  if (!s) { location.replace('#/home'); return; }
  if (!isReady(s)) { renderSoon(app, s); return; }
  const access = hasPremiumAccess();
  if (!canPlay(s, access)) { location.replace(`#/paywall?next=${encodeURIComponent(s.id)}`); return; }

  const st = getSettings();
  const bgInitial = st.bgOverride === null || st.bgOverride === undefined ? (s.bg || 'none') : st.bgOverride;
  let bg = canUseSound(bgInitial, access) ? bgInitial : 'none';
  const canVol = volumeControllable();
  const before = suggestedBefore(s, state.sessions, getProgress().completed);
  let sleepMode = 0;
  let downloaded = await offline.isDownloaded(s);
  let busy = false;

  app.innerHTML = `
    <div class="player">
      <div class="player-top">
        <a class="icon-btn ghost" href="#/home" id="p-close" aria-label="${esc(t('player.close'))}">${icon('close')}</a>
        <span class="player-cat">${esc(t('cat.' + s.category))}${s.day ? ' · ' + esc(t('list.day', { n: s.day })) : ''}</span>
        <span class="icon-btn-spacer"></span>
      </div>
      <div class="orb-wrap" aria-hidden="true"><div class="orb" id="p-orb"></div></div>
      <h1 class="player-title">${esc(s.title)}</h1>
      ${s.subtitle ? `<p class="player-sub">${esc(s.subtitle)}</p>` : ''}
      ${before ? `<p class="soft-note" id="p-before">${esc(t('player.suggest_before', { n: before.day }))} <a href="#/play/${encodeURIComponent(before.id)}">${esc(t('player.go_day', { n: before.day }))}</a></p>` : ''}
      <p class="error-box" id="p-error" role="alert" hidden></p>

      <div class="progress">
        <input type="range" id="p-seek" min="0" max="${Math.round(s.durationSec)}" step="1" value="0" aria-label="${esc(t('player.position'))}">
        <div class="times"><span id="p-cur">0:00</span><span id="p-left">-${fmtClock(s.durationSec)}</span></div>
      </div>
      <div class="controls">
        <button type="button" class="icon-btn" id="p-back" aria-label="${esc(t('player.back15'))}">${icon('back15')}</button>
        <button type="button" class="play-btn" id="p-play" aria-label="${esc(t('player.play'))}">${icon('play', 'i-play')}${icon('pause', 'i-pause')}</button>
        <button type="button" class="icon-btn" id="p-fwd" aria-label="${esc(t('player.fwd15'))}">${icon('fwd15')}</button>
      </div>
      <p class="sleep-left" id="p-sleep-left" aria-live="polite"></p>

      <details class="panel" id="p-panel">
        <summary>${esc(t('player.options'))}</summary>
        <h2 class="panel-h">${esc(t('player.bg'))}</h2>
        <div class="chips" role="group" aria-label="${esc(t('player.bg'))}" id="p-bg">
          ${['none', ...SOUNDS].map((id) => {
            const locked = !canUseSound(id, access);
            return `<button type="button" class="chip${locked ? ' locked' : ''}" data-bg="${id}" aria-pressed="${bg === id}">${locked ? icon('lock', 'mini') : ''}${esc(t('sound.' + id))}</button>`;
          }).join('')}
        </div>
        ${hasWebAudio() ? '' : `<p class="fine">${esc(t('player.no_webaudio'))}</p>`}
        <div class="sliders">
          ${canVol ? `<label class="slider"><span>${esc(t('player.vol_voice'))}</span><input type="range" id="p-vv" min="0" max="1" step="0.05" value="${st.voiceVol}"></label>` : `<p class="fine">${esc(t('player.ios_volume'))}</p>`}
          <label class="slider"><span>${esc(t('player.vol_bg'))}</span><input type="range" id="p-bv" min="0" max="1" step="0.05" value="${st.bgVol}"></label>
        </div>
        <h2 class="panel-h">${esc(t('player.sleep'))}</h2>
        <div class="chips" role="group" aria-label="${esc(t('player.sleep'))}" id="p-sleep">
          ${SLEEP_CHOICES.map((m) => `<button type="button" class="chip" data-sleep="${m}" aria-pressed="${sleepMode === m}">${esc(m === 0 ? t('player.sleep_off') : m === 'end' ? t('player.sleep_end') : t('common.min', { n: m }))}</button>`).join('')}
        </div>
        <h2 class="panel-h">${esc(t('player.offline'))}</h2>
        <div id="p-dl"></div>
      </details>

      <p class="fine center">${esc(t('ai.notice'))}<br>${esc(t('mdr.short'))}</p>
    </div>`;

  const $ = (sel) => app.querySelector(sel);
  const playBtn = $('#p-play');
  const seek = $('#p-seek');
  let seeking = false;

  function showError(reason) {
    const el = $('#p-error');
    el.hidden = false;
    el.textContent = reason === 'offline' ? t('player.err_offline') : t('player.err_missing');
  }

  const player = createSessionPlayer(s, {
    bg: bg === 'none' ? null : bg,
    voiceVol: st.voiceVol,
    bgVol: st.bgVol,
    appName: state.brand?.appName,
    onState: (x) => {
      const playing = x === 'playing' || x === 'loading';
      playBtn.classList.toggle('is-playing', playing);
      playBtn.setAttribute('aria-label', playing ? t('player.pause') : t('player.play'));
      $('#p-orb').classList.toggle('breathing', x === 'playing');
      app.querySelector('.player').dataset.state = x;
    },
    onTime: (cur, dur) => {
      if (!seeking) { seek.max = String(Math.max(1, Math.round(dur))); seek.value = String(Math.round(cur)); }
      $('#p-cur').textContent = fmtClock(cur);
      $('#p-left').textContent = '-' + fmtClock(Math.max(0, dur - cur));
    },
    onError: showError,
    onEnd: ({ counted, bySleepTimer }) => {
      const msg = bySleepTimer ? t('player.sleep_done') : t('player.finished');
      announce(msg);
      const el = $('#p-sleep-left');
      if (el) el.textContent = msg;
      if (counted) toast(t('player.saved'));
    },
    onSleepTick: (rem) => {
      const el = $('#p-sleep-left');
      if (el) el.textContent = rem == null ? (sleepMode === 'end' ? t('player.sleep_at_end') : '') : t('player.sleep_left', { time: fmtClock(rem) });
    },
  });

  function drawDl() {
    const box = $('#p-dl');
    if (!box) return;
    if (!('caches' in window)) { box.innerHTML = `<p class="fine">${esc(t('player.dl_unsupported'))}</p>`; return; }
    box.innerHTML = downloaded
      ? `<p class="dl-state">${icon('check', 'mini')} ${esc(t('player.dl_done'))}</p><button type="button" class="btn ghost small" id="p-dl-rm">${esc(t('player.dl_remove'))}</button>`
      : `<button type="button" class="btn secondary block" id="p-dl-go"${busy ? ' disabled' : ''}>${icon('download')} ${esc(busy ? t('player.dl_busy') : t('player.dl', { size: offline.fmtBytes(s.bytes) }))}</button>`;
  }
  drawDl();

  playBtn.addEventListener('click', () => player.toggle());
  $('#p-back').addEventListener('click', () => player.skip(-SKIP_SEC));
  $('#p-fwd').addEventListener('click', () => player.skip(SKIP_SEC));
  seek.addEventListener('input', () => { seeking = true; $('#p-cur').textContent = fmtClock(Number(seek.value)); });
  seek.addEventListener('change', () => { seeking = false; player.seekTo(Number(seek.value)); });
  $('#p-vv')?.addEventListener('input', (e) => { player.setVoiceVolume(e.target.value); setSettings({ voiceVol: Number(e.target.value) }); });
  $('#p-bv').addEventListener('input', (e) => {
    setSettings({ bgVol: Number(e.target.value) });
    setBgVolume(e.target.value);
  });

  app.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.bg) {
      const id = b.dataset.bg;
      if (!canUseSound(id, access)) { toast(t('sounds.locked_toast')); go('#/paywall?next=sounds'); return; }
      bg = id;
      setSettings({ bgOverride: id });
      player.setBackground(id);
      app.querySelectorAll('[data-bg]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.bg === id)));
    } else if (b.dataset.sleep !== undefined) {
      sleepMode = b.dataset.sleep === 'end' ? 'end' : Number(b.dataset.sleep);
      player.setSleepTimer(sleepMode);
      app.querySelectorAll('[data-sleep]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sleep === String(sleepMode))));
      if (sleepMode === 'end') $('#p-sleep-left').textContent = t('player.sleep_at_end');
    } else if (b.id === 'p-dl-go') {
      busy = true; drawDl();
      const res = await offline.download(s);
      busy = false;
      if (res.ok) { downloaded = true; toast(t('player.dl_ok')); }
      else toast(res.reason === 'offline' ? t('player.dl_err_offline') : res.reason === 'missing' ? t('player.err_missing') : t('player.dl_err'));
      if (app.isConnected) drawDl();
    } else if (b.id === 'p-dl-rm') {
      await offline.remove(s);
      downloaded = false; toast(t('player.dl_removed'));
      drawDl();
    }
  };

  const onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); player.toggle(); }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    document.removeEventListener('keydown', onKey);
    app.onclick = null;
    player.destroy();
  };
}

