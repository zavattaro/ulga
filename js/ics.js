/**
 * Ulga — daily reminder as an .ics calendar file (no server, works on iOS and Android).
 * One recurring VEVENT (RRULE:FREQ=DAILY) in floating local time with a VALARM
 * at the start time. Lines use CRLF and are folded at 75 octets (RFC 5545).
 * @module ics
 */

/** Escape TEXT values (RFC 5545 §3.3.11). */
export function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line to ≤75 octets per physical line (UTF-8 aware). */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curLen = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curLen + n > limit) {
      out.push(cur);
      cur = ''; curLen = 0; limit = 74; // continuation lines start with a space
    }
    cur += ch; curLen += n;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

const pad = (n) => String(n).padStart(2, '0');
function stampUtc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Parse "HH:MM" → {h, m}; falls back to 21:30. */
export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return { h: 21, m: 30 };
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mi = Math.min(59, Math.max(0, Number(m[2])));
  return { h, m: mi };
}

/**
 * Build the .ics text.
 * @param {{time?:string, title:string, description?:string, url?:string, now?:Date, uid?:string}} o
 * @returns {string}
 */
export function buildDailyIcs(o) {
  const now = o.now || new Date();
  const { h, m } = parseTime(o.time);
  // first occurrence: today if the time is still ahead, otherwise tomorrow
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (first.getTime() <= now.getTime()) first.setDate(first.getDate() + 1);
  const start = `${first.getFullYear()}${pad(first.getMonth() + 1)}${pad(first.getDate())}T${pad(h)}${pad(m)}00`;
  const endD = new Date(first.getTime() + 10 * 60000);
  const end = `${endD.getFullYear()}${pad(endD.getMonth() + 1)}${pad(endD.getDate())}T${pad(endD.getHours())}${pad(endD.getMinutes())}00`;
  const uid = o.uid || `ulga-daily-${start}@ulga.app`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ulga//Przypomnienie//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stampUtc(now)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${icsEscape(o.title)}`,
    ...(o.description ? [`DESCRIPTION:${icsEscape(o.description)}`] : []),
    ...(o.url ? [`URL:${o.url}`] : []),
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(o.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Trigger a download of the .ics in the browser. */
export function downloadIcs(text, filename = 'ulga-przypomnienie.ics') {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
