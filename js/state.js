// Ulga — shared app state (content loaded from content/sessions.json)
export const APP_VERSION = '0.1.0';

export const state = {
  brand: null,
  sessions: [],
};

export function getSession(id) { return state.sessions.find((s) => s.id === id) || null; }

/** Apply 'dark' | 'light' | 'auto' to <html data-theme>. */
export function applyTheme(theme) {
  const v = ['dark', 'light', 'auto'].includes(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = v;
  const light = v === 'light' || (v === 'auto' && globalThis.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  const c = state.brand && (light ? state.brand.colorsLight : state.brand.colors);
  if (meta && c && c.bg) meta.setAttribute('content', c.bg);
}
