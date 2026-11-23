// Ulga — Dźwięki: background sound + free timer (5–60 min or no limit) with optional bell
import { t } from '../i18n.js';
import { getSettings, setSettings, recordCompletion } from '../storage.js';
import { canUseSound } from '../program.js';
import { hasPremiumAccess } from '../promo.js';
import { SOUNDS, playBackground, stopBackground, setBgVolume, setBgDuck, playBell, unlockAudio, hasWebAudio } from '../audio.js';
import { createCountdown, FREE_TIMER_OPTIONS, fmtClock } from '../timer.js';
import { esc, go, icon, toast, announce } from '../ui.js';

export function renderSounds(app) {
  const access = hasPremiumAccess();
  const st = getSettings();
  let sound = canUseSound(st.sound, access) ? st.sound : 'rain';
  let minutes = FREE_TIMER_OPTIONS.includes(st.timerMinutes) ? st.timerMinutes : 20;
  let bells = st.timerBells !== false;
  let running = false;
  let countdown = null;
  let startedAt = 0;
  let elapsedTimer = null;

  app.innerHTML = `
    <h1>${esc(t('sounds.title'))}</h1>
    <p class="muted">${esc(t('sounds.lead'))}</p>
    <div class="sound-grid" role="group" aria-label="${esc(t('sounds.choose'))}">
      ${SOUNDS.map((id) => {
        const locked = !canUseSound(id, access);
        return `<button type="button" class="sound-tile s-${id}${locked ? ' locked' : ''}" data-sound="${id}" aria-pressed="${sound === id}">
          <span class="sound-name">${esc(t('sound.' + id))}</span>
          <span class="sound-desc">${locked ? icon('lock', 'mini') + ' ' + esc(t('list.premium')) : esc(t('sound.' + id + '_desc'))}</span>
        </button>`;
      }).join('')}
    </div>
    ${hasWebAudio() ? '' : `<p class="error-box">${esc(t('player.no_webaudio'))}</p>`}

    <h2>${esc(t('sounds.timer'))}</h2>
    <div class="chips nums" role="group" aria-label="${esc(t('sounds.timer'))}" id="t-min">
      ${FREE_TIMER_OPTIONS.map((m) => `<button type="button" class="chip num" data-min="${m}" aria-pressed="${minutes === m}" aria-label="${esc(m === 0 ? t('sounds.infinite') : t('common.min', { n: m }))}">${m === 0 ? '∞' : m}</button>`).join('')}
    </div>
    <label class="setting-row">
      <span>${icon('bell', 'mini')} ${esc(t('sounds.bells'))}</span>
      <input type="checkbox" role="switch" class="switch" id="t-bells" ${bells ? 'checked' : ''}>
    </label>
    <label class="slider"><span>${esc(t('player.vol_bg'))}</span><input type="range" id="t-vol" min="0" max="1" step="0.05" value="${st.bgVol}"></label>

    <div class="timer-face" id="t-face" aria-live="off">
      <span class="timer-time" id="t-time">${minutes ? fmtClock(minutes * 60) : '∞'}</span>
      <span class="timer-state muted" id="t-state">${esc(t('sounds.ready'))}</span>
    </div>
    <button type="button" class="btn block big" id="t-go">${esc(t('sounds.start'))}</button>`;

  const $ = (q) => app.querySelector(q);
  setBgVolume(st.bgVol);

  function stopAll(finished) {
    const secs = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    running = false;
    if (countdown) { countdown.cancel(); countdown = null; }
    clearInterval(elapsedTimer); elapsedTimer = null;
    stopBackground(finished ? 0.5 : 1.5);
    setTimeout(() => setBgDuck(1, 0.1), 1600);
    if (finished && bells) playBell('triple');
    if (secs >= 30) recordCompletion('timer', secs);
    startedAt = 0;
    draw();
    if (finished) { $('#t-state').textContent = t('sounds.finished'); announce(t('sounds.finished')); }
  }

  function draw() {
    $('#t-go').textContent = running ? t('sounds.stop') : t('sounds.start');
    $('#t-go').classList.toggle('secondary', running);
    if (!running) {
      $('#t-time').textContent = minutes ? fmtClock(minutes * 60) : '∞';
      $('#t-state').textContent = t('sounds.ready');
    }
    app.querySelectorAll('[data-min]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.min) === minutes)));
    app.querySelectorAll('[data-sound]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sound === sound)));
    $('#t-face').classList.toggle('on', running);
  }

  function start() {
    unlockAudio();
    running = true;
    startedAt = Date.now();
    setBgDuck(1, 0.1);
    if (bells) playBell('soft');
    setTimeout(() => { if (running) playBackground(sound); }, bells ? 1200 : 0);
    if (minutes) {
      countdown = createCountdown({
        seconds: minutes * 60,
        fadeSec: Math.min(30, minutes * 60 / 4),
        onTick: (r) => { $('#t-time').textContent = fmtClock(r); },
        onFade: (f) => setBgDuck(f, 0.4),
        onEnd: () => stopAll(true),
      });
      countdown.start();
      $('#t-state').textContent = t('sounds.running');
    } else {
      $('#t-state').textContent = t('sounds.running_inf');
      elapsedTimer = setInterval(() => { $('#t-time').textContent = fmtClock((Date.now() - startedAt) / 1000); }, 500);
      $('#t-time').textContent = '0:00';
    }
    draw();
  }

  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sound) {
      const id = b.dataset.sound;
      if (!canUseSound(id, access)) { toast(t('sounds.locked_toast')); go('#/paywall?next=sounds'); return; }
      sound = id; setSettings({ sound: id });
      if (running) playBackground(id);
      else { unlockAudio(); playBackground(id); clearTimeout(app._preview); app._preview = setTimeout(() => { if (!running) stopBackground(1.5); }, 4000); }
      draw();
    } else if (b.dataset.min !== undefined) {
      if (running) { toast(t('sounds.stop_first')); return; }
      minutes = Number(b.dataset.min); setSettings({ timerMinutes: minutes }); draw();
    } else if (b.id === 't-go') {
      clearTimeout(app._preview);
      if (running) stopAll(false); else start();
    }
  };
  $('#t-bells').addEventListener('change', (e) => { bells = e.target.checked; setSettings({ timerBells: bells }); });
  $('#t-vol').addEventListener('input', (e) => { setBgVolume(e.target.value); setSettings({ bgVol: Number(e.target.value) }); });

  return () => {
    clearTimeout(app._preview);
    app.onclick = null;
    if (running) stopAll(false);
    else stopBackground(0.5);
  };
}
