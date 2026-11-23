/**
 * Ulga — pure content logic: categories, access (free/premium), 7-day program,
 * and the "Zacznij" recommendation. No DOM, no storage access (inputs are passed in),
 * so everything here is unit-testable.
 * @module program
 */

export const CATEGORIES = [
  { id: 'start', titleKey: 'cat.start' },
  { id: 'sen', titleKey: 'cat.sen' },
  { id: 'pauza', titleKey: 'cat.pauza' },
];

/** Free sounds (no premium needed). */
export const FREE_SOUNDS = ['rain', 'pink'];

/** Night = 20:00–04:59 local time. */
export function isNight(hour) { return hour >= 20 || hour < 5; }

/**
 * A session is "ready" when its recording exists (build_sessions.py writes ready:true/false).
 * Missing field = ready (older sessions.json). Not-ready sessions show "Wkrótce" and never open the player.
 */
export function isReady(session) { return !!session && session.ready !== false; }

/** Only sessions whose recording exists. */
export function readySessions(sessions) { return (sessions || []).filter(isReady); }

export function canPlay(session, premiumAccess) {
  return !!session && (session.free === true || !!premiumAccess);
}
export function canUseSound(id, premiumAccess) {
  return id === 'none' || FREE_SOUNDS.includes(id) || !!premiumAccess;
}

/** Program sessions sorted by day. */
export function programSessions(sessions) {
  return (sessions || []).filter((s) => s.category === 'start').sort((a, b) => (a.day || 0) - (b.day || 0));
}

const done = (completed, id) => (Number(completed && completed[id]) || 0) > 0;

/**
 * Status of each program day. Unlocking is "soft": every day can be opened,
 * but only the first not-yet-done READY day is the suggested one ('next').
 * Days whose recording does not exist yet are 'soon' and never block the user.
 * @returns {Array<{session, day:number, status:'done'|'next'|'later'|'soon'}>}
 */
export function programStatus(sessions, completed = {}) {
  const list = programSessions(sessions);
  let nextGiven = false;
  return list.map((s) => {
    if (done(completed, s.id)) return { session: s, day: s.day, status: 'done' };
    if (!isReady(s)) return { session: s, day: s.day, status: 'soon' };
    if (!nextGiven) { nextGiven = true; return { session: s, day: s.day, status: 'next' }; }
    return { session: s, day: s.day, status: 'later' };
  });
}

/** First not-done ready program session, or null (finished, or the rest is not recorded yet). */
export function nextProgramSession(sessions, completed = {}) {
  const n = programStatus(sessions, completed).find((x) => x.status === 'next');
  return n ? n.session : null;
}

/** Day suggested before this one, if the user tries to skip ahead (else null). */
export function suggestedBefore(session, sessions, completed = {}) {
  if (!session || session.category !== 'start') return null;
  const n = nextProgramSession(sessions, completed);
  return n && (n.day || 0) < (session.day || 0) ? n : null;
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

/**
 * Session proposed by the big "Zacznij" button. Only READY sessions are ever proposed.
 *  - first use (no completions at all) → first ready program day (day 1)
 *  - night (20–5) → a sleep session (rotates daily, prefers accessible ones)
 *  - day → next program day if the program was started and is unfinished, otherwise a short pause
 *  - nothing fits → an accessible ready session to repeat (day 1), reason 'again'
 *  - no ready session at all → session null, reason 'sounds' (home links to Dźwięki)
 * @param {{sessions:Array, completed?:Object, now?:Date, premiumAccess?:boolean}} o
 * @returns {{session:object|null, reason:'first'|'night'|'program'|'day'|'again'|'sounds'}}
 */
export function recommend({ sessions: all = [], completed = {}, now = new Date(), premiumAccess = false } = {}) {
  const sessions = readySessions(all);
  if (!sessions.length) return { session: null, reason: 'sounds' };
  const totalDone = Object.values(completed || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  const prog = programSessions(sessions);
  if (totalDone === 0 && prog.length && canPlay(prog[0], premiumAccess)) return { session: prog[0], reason: 'first' };

  const pick = (list) => {
    if (!list.length) return null;
    const ok = list.filter((s) => canPlay(s, premiumAccess));
    const pool = ok.length ? ok : list;
    const notDone = pool.filter((s) => !done(completed, s.id));
    const base = pool; // rotate across all accessible, starting point changes daily
    const i = dayOfYear(now) % base.length;
    // prefer one not done yet, starting from today's rotation index
    for (let k = 0; k < base.length; k++) {
      const s = base[(i + k) % base.length];
      if (notDone.includes(s)) return s;
    }
    return base[i];
  };

  if (isNight(now.getHours())) {
    const s = pick(sessions.filter((x) => x.category === 'sen'));
    if (s) return { session: s, reason: 'night' };
  }
  const started = programSessions(all).some((s) => done(completed, s.id));
  const next = nextProgramSession(sessions, completed);
  if (started && next && canPlay(next, premiumAccess)) return { session: next, reason: 'program' };
  const p = pick(sessions.filter((x) => x.category === 'pauza'));
  if (p) return { session: p, reason: 'day' };
  const playable = sessions.filter((s) => canPlay(s, premiumAccess));
  const again = playable.find((s) => s.category === 'start' && s.day === 1) || playable[0] || null;
  return again ? { session: again, reason: 'again' } : { session: null, reason: 'sounds' };
}

/** Greeting key by hour. */
export function greetingKey(hour) {
  if (hour >= 5 && hour < 12) return 'home.greet_morning';
  if (hour >= 12 && hour < 18) return 'home.greet_day';
  return 'home.greet_evening';
}
